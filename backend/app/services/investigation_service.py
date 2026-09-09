import os
import time
import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Tuple, List
from fastapi import HTTPException

from app.schemas.investigation import (
    DetectionEvidence,
    PersistenceEvidence,
    IndustrialContextEvidence,
    Sentinel2Evidence,
    FusionResult,
    RiskResult,
    Provenance,
    InvestigationResponse
)
from app.services.firms_ingestion_service import load_stored_observations
from app.services.osm_service import fetch_hotspot_osm_context
from app.services.satellite_service import get_satellite_provider
from app.services.satellite_classifier import get_satellite_classifier
from app.services.evidence_fusion_service import get_evidence_fusion_service, EvidenceFusionService
from app.services.risk_service import calculate_risk_score
from app.ml.classifier import classify_thermal_event

logger = logging.getLogger("investigation_service")

# In-memory bounded cache for investigation responses: observation_id -> (timestamp, response_dict)
_investigation_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
CACHE_TTL_SECONDS = int(os.getenv("INVESTIGATION_CACHE_TTL_SECONDS", "300"))
MAX_CACHE_ENTRIES = 256


class InvestigationService:
    """
    Canonical Investigation Service for SIH Problem Statement 26162.
    Coordinates concurrent, resilient evidence harvesting across NASA FIRMS,
    OpenStreetMap, and Copernicus Sentinel-2, performing Phase 6E multi-source fusion.
    """

    def __init__(self, cache_ttl: int = CACHE_TTL_SECONDS):
        self.cache_ttl = cache_ttl

    def _get_from_cache(self, observation_id: str) -> Optional[InvestigationResponse]:
        if observation_id in _investigation_cache:
            ts, data = _investigation_cache[observation_id]
            if time.time() - ts < self.cache_ttl:
                logger.info(f"Serving cached investigation for observation {observation_id} (age: {int(time.time() - ts)}s)")
                return InvestigationResponse(**data)
        return None

    def _save_to_cache(self, observation_id: str, response: InvestigationResponse) -> None:
        if len(_investigation_cache) > MAX_CACHE_ENTRIES:
            # Evict oldest entry
            oldest_key = min(_investigation_cache.keys(), key=lambda k: _investigation_cache[k][0])
            _investigation_cache.pop(oldest_key, None)
        _investigation_cache[observation_id] = (time.time(), response.model_dump())

    def clear_cache(self) -> None:
        _investigation_cache.clear()

    async def investigate_observation(
        self,
        observation_id: str,
        force_refresh: bool = False
    ) -> InvestigationResponse:
        """
        Executes a canonical investigation for a FIRMS active fire observation ID.
        Resilient to partial dependency failures (OSM timeout, Copernicus CDSE failure).
        """
        if not observation_id or not isinstance(observation_id, str):
            raise HTTPException(status_code=400, detail="Invalid observation ID provided.")

        clean_id = observation_id.strip()
        if not clean_id:
            raise HTTPException(status_code=400, detail="Observation ID cannot be empty.")

        # 1. Check Cache
        if not force_refresh:
            cached = self._get_from_cache(clean_id)
            if cached:
                return cached

        # 2. Locate FIRMS Observation
        all_obs = load_stored_observations()
        target_obs = next((obs for obs in all_obs if obs.get("observation_id") == clean_id), None)

        if not target_obs:
            raise HTTPException(status_code=404, detail=f"Observation with ID '{clean_id}' not found.")

        lat = float(target_obs.get("latitude", 0.0))
        lon = float(target_obs.get("longitude", 0.0))
        timestamp = target_obs.get("acquired_at")
        frp = float(target_obs.get("frp", 0.0))
        brightness = float(target_obs.get("brightness", 320.0))
        confidence = str(target_obs.get("confidence", "nominal"))
        satellite_name = target_obs.get("satellite") or target_obs.get("sensor") or "VIIRS/MODIS"

        system_warnings: List[str] = []

        # 3. Concurrent Evidence Collection with Fault Isolation
        async def fetch_osm():
            try:
                return await asyncio.wait_for(fetch_hotspot_osm_context(lat=lat, lon=lon), timeout=5.0)
            except asyncio.TimeoutError:
                logger.warning(f"OSM context fetch timed out for ({lat}, {lon})")
                return {"available": False, "error": "TIMEOUT", "distance_km": None, "features": []}
            except Exception as e:
                logger.warning(f"OSM context fetch error for ({lat}, {lon}): {e}")
                return {"available": False, "error": str(e), "distance_km": None, "features": []}

        async def fetch_satellite():
            try:
                provider = get_satellite_provider()
                return await asyncio.wait_for(
                    provider.fetch_satellite_image(lat=lat, lon=lon, timestamp=timestamp, observation_id=clean_id),
                    timeout=8.0
                )
            except asyncio.TimeoutError:
                logger.warning(f"Satellite retrieval timed out for observation {clean_id}")
                return {"available": False, "status": "TIMEOUT", "image_available": False, "error": "TIMEOUT"}
            except Exception as e:
                logger.warning(f"Satellite retrieval error for observation {clean_id}: {e}")
                return {"available": False, "status": "RETRIEVAL_FAILED", "image_available": False, "error": str(e)}

        osm_res, sat_res = await asyncio.gather(fetch_osm(), fetch_satellite())

        # Check OSM dependency health
        if isinstance(osm_res, dict) and osm_res.get("error"):
            system_warnings.append(f"OpenStreetMap industrial context service degraded ({osm_res.get('error')}); proceeding with thermal and satellite evidence.")
            osm_context = {"distance_km": None, "features": [], "nearby_facility": None, "context_classification": "UNKNOWN"}
        else:
            osm_context = osm_res if isinstance(osm_res, dict) else {}

        # Check Satellite dependency health
        if isinstance(sat_res, dict) and sat_res.get("error"):
            system_warnings.append(f"Copernicus Sentinel-2 service degraded ({sat_res.get('error')}); proceeding with thermal and geospatial evidence.")
            sat_data = {"available": False, "image_available": False, "status": "DEGRADED", "is_synthetic": False}
        else:
            sat_data = sat_res if isinstance(sat_res, dict) else {}

        # 4. Persistence Context
        persistence_score = float(target_obs.get("persistence_score", 0.0))
        obs_count = int(target_obs.get("observation_count", 1))
        duration_hours = float(target_obs.get("duration_hours", 0.0))
        pers_data = {
            "score": persistence_score,
            "observation_count": obs_count,
            "duration_hours": duration_hours,
            "time_window_hours": float(target_obs.get("time_window_hours", 24.0)),
            "classification": "PERSISTENT" if persistence_score >= 60.0 else ("SUSPICIOUS" if persistence_score >= 30.0 else "TEMPORARY")
        }

        # 5. Sentinel-2 CNN Inference
        sat_cv_res: Dict[str, Any] = {}
        if sat_data.get("available") and sat_data.get("image_path"):
            img_path = sat_data.get("image_path")
            try:
                from app.ml.satellite_model.inference import get_inference_engine
                engine = get_inference_engine()
                npz_candidate = img_path.replace(".png", ".npz")
                if os.path.exists(npz_candidate):
                    pred = engine.predict(npz_candidate)
                    sat_cv_res = {
                        "classification": pred["predicted_class"],
                        "confidence": pred["confidence"],
                        "class_probabilities": pred["class_probabilities"],
                        "model": "MultispectralCNN-Phase6C",
                        "is_calibrated": False
                    }
                else:
                    classifier = get_satellite_classifier()
                    res = classifier.classify_image(img_path, metadata={
                        "industrial_distance_km": osm_context.get("distance_km"),
                        "persistence_score": persistence_score,
                        "frp": frp
                    })
                    sat_cv_res = {
                        "classification": res.get("classification", "UNKNOWN"),
                        "confidence": res.get("confidence", 0.0),
                        "class_probabilities": res.get("class_probabilities", {}),
                        "model": res.get("model", "MultispectralCNN-Phase6C"),
                        "is_calibrated": False
                    }
            except Exception as ex:
                logger.warning(f"Error during satellite model inference: {ex}")
                sat_cv_res = {"classification": "UNKNOWN", "confidence": 0.0, "is_calibrated": False}

        sat_evidence_merged = {**sat_data, **sat_cv_res}

        # 6. Base AI & Risk Assessment
        spot_dict = {
            "observation_id": clean_id,
            "latitude": lat,
            "longitude": lon,
            "frp": frp,
            "brightness": brightness,
            "confidence": confidence,
            "acquired_at": timestamp,
            "persistence_score": persistence_score,
            "observation_count": obs_count,
            "duration_hours": duration_hours,
            "industrial_context": osm_context
        }
        base_ai = classify_thermal_event(spot_dict, osm_context=osm_context)
        risk_res = calculate_risk_score(spot_dict, osm_context=osm_context, ai_classification=base_ai)

        # 7. Phase 6E Evidence Fusion
        fusion_svc = get_evidence_fusion_service()
        evidence_obj = fusion_svc.assemble_evidence_object(
            observation_id=clean_id,
            firms_data=target_obs,
            persistence_data=pers_data,
            osm_data=osm_context,
            satellite_data=sat_evidence_merged
        )
        fusion_out = fusion_svc.fuse(evidence_obj)

        # Combine all warnings
        all_warnings = list(dict.fromkeys(system_warnings + fusion_out.get("warnings", [])))

        # Determine overall investigation status
        if not sat_data.get("available") or not osm_context.get("distance_km"):
            status_label = "PARTIAL_EVIDENCE"
        elif sat_data.get("cloud_cover", 0.0) >= 50.0:
            status_label = "DEGRADED"
        else:
            status_label = "SUCCESS"

        # 8. Assemble Strongly Typed Pydantic Response
        detection_model = DetectionEvidence(
            source="NASA FIRMS",
            latitude=lat,
            longitude=lon,
            brightness=brightness,
            frp=frp,
            confidence=confidence,
            satellite=satellite_name,
            acquired_at=timestamp,
            freshness=target_obs.get("freshness")
        )

        persistence_model = PersistenceEvidence(
            available=True,
            score=persistence_score,
            observation_count=obs_count,
            duration_hours=duration_hours,
            time_window_hours=pers_data["time_window_hours"],
            classification=pers_data["classification"]
        )

        dist_km = osm_context.get("distance_km")
        dist_m = round(float(dist_km) * 1000.0, 1) if dist_km is not None else None
        industrial_model = IndustrialContextEvidence(
            available=bool(osm_context.get("nearby_facility") or dist_km is not None),
            score=evidence_obj["industrial_context"].get("score"),
            nearest_distance_m=dist_m,
            nearest_distance_km=dist_km,
            nearest_facility=osm_context.get("nearby_facility"),
            features=osm_context.get("features") or osm_context.get("nearby_features") or [],
            source="OpenStreetMap"
        )

        sentinel_model = Sentinel2Evidence(
            available=bool(sat_data.get("available")),
            state=sat_data.get("status") or ("ACQUISITION_AVAILABLE" if sat_data.get("available") else "NO_ACQUISITION"),
            class_name=fusion_out["sentinel2"].get("class", "UNKNOWN"),
            confidence=fusion_out["sentinel2"].get("confidence", 0.0),
            cloud_cover=fusion_out["sentinel2"].get("cloud_cover"),
            quality=fusion_out["sentinel2"].get("quality", "UNAVAILABLE"),
            is_synthetic=bool(sat_data.get("is_synthetic", False)),
            is_calibrated=False,
            satellite_acquired_at=sat_data.get("satellite_acquired_at"),
            time_difference_hours=sat_data.get("time_difference_hours"),
            image_url=sat_data.get("image_url"),
            model=sat_evidence_merged.get("model", "MultispectralCNN-Phase6C"),
            class_probabilities=sat_evidence_merged.get("class_probabilities", {})
        )

        fusion_model = FusionResult(
            candidate_class=fusion_out["candidate_class"],
            candidate_score=fusion_out["candidate_score"],
            evidence_strength=fusion_out["evidence_strength"],
            confidence_label=fusion_out["confidence_label"],
            reasoning=fusion_out["reasoning"],
            warnings=fusion_out["warnings"],
            contributing_evidence=fusion_out["contributing_evidence"]
        )

        risk_model = RiskResult(
            risk_score=risk_res.get("risk_score", int(fusion_out["candidate_score"] * 100)),
            risk_level=risk_res.get("risk_level", "MODERATE"),
            factors=risk_res.get("factors", {})
        )

        provenance_model = Provenance(
            sources=fusion_out["sources"],
            timestamps={
                "firms_acquired_at": timestamp,
                "satellite_acquired_at": sat_data.get("satellite_acquired_at"),
                "retrieved_at": datetime.now(timezone.utc).isoformat()
            },
            firms_acquired_at=timestamp,
            sentinel2_acquired_at=sat_data.get("satellite_acquired_at"),
            temporal_offset_hours=sat_data.get("time_difference_hours"),
            disclaimer=fusion_out.get("disclaimer", "")
        )

        now_iso = datetime.now(timezone.utc).isoformat()
        response = InvestigationResponse(
            observation_id=clean_id,
            status=status_label,
            detection=detection_model,
            persistence=persistence_model,
            industrial_context=industrial_model,
            sentinel2=sentinel_model,
            fusion=fusion_model,
            risk=risk_model,
            provenance=provenance_model,
            warnings=all_warnings,
            disclaimers=[
                "AI Candidate Classification is an evidence-fusion output, not a standalone confirmation of an industrial fire.",
                "Sentinel-2 imagery is optical evidence and may not be temporally coincident with the FIRMS observation."
            ],
            created_at=now_iso
        )

        # 9. Save to Cache
        self._save_to_cache(clean_id, response)
        return response


# Singleton service instance
_investigation_service_instance: Optional[InvestigationService] = None


def get_investigation_service() -> InvestigationService:
    global _investigation_service_instance
    if _investigation_service_instance is None:
        _investigation_service_instance = InvestigationService()
    return _investigation_service_instance
