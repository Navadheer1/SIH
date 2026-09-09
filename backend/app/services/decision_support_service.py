import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List, Tuple
from fastapi import HTTPException

from app.schemas.decision_support import (
    PriorityResult,
    ThreatZoneDetails,
    ThreatZoneResult,
    AssetExposureItem,
    AssetExposureResult,
    ImpactResult,
    FutureImpactItem,
    FutureImpactResult,
    RecommendedAction,
    DecisionProvenance,
    IncidentSummary,
    DecisionSupportResponse,
)
from app.services.investigation_service import get_investigation_service
from app.services.threat_zone_service import calculate_threat_zones
from app.services.asset_exposure_service import analyze_asset_exposure
from app.services.impact_service import calculate_impact_assessment
from app.services.future_impact_service import calculate_future_impact_forecast

logger = logging.getLogger("decision_support_service")

# Thread-safe in-memory cache for decision support responses (120s TTL)
_decision_support_cache: Dict[str, Tuple[float, DecisionSupportResponse]] = {}
CACHE_TTL_SECONDS = 120.0
MAX_CACHE_ENTRIES = 500


class DecisionSupportService:
    """
    Operational Decision Support & Incident Prioritization Orchestrator.
    Composes Phase 6F Investigation with Phase 2 Threat Zones, Asset Exposure,
    Impact Assessment, and Forward-Looking Fire Spread Projections.
    """

    def __init__(self):
        self.investigation_service = get_investigation_service()

    def _get_from_cache(self, observation_id: str) -> Optional[DecisionSupportResponse]:
        now = time.time()
        if observation_id in _decision_support_cache:
            ts, resp = _decision_support_cache[observation_id]
            if now - ts < CACHE_TTL_SECONDS:
                return resp
            else:
                _decision_support_cache.pop(observation_id, None)
        return None

    def _save_to_cache(self, observation_id: str, resp: DecisionSupportResponse) -> None:
        if len(_decision_support_cache) > MAX_CACHE_ENTRIES:
            oldest_key = min(_decision_support_cache.keys(), key=lambda k: _decision_support_cache[k][0])
            _decision_support_cache.pop(oldest_key, None)
        _decision_support_cache[observation_id] = (time.time(), resp)

    def clear_cache(self) -> None:
        _decision_support_cache.clear()

    async def get_decision_support(
        self,
        observation_id: str,
        force_refresh: bool = False
    ) -> DecisionSupportResponse:
        """
        Retrieves canonical decision support analysis for an observation.
        Fault-isolated: gracefully degrades if sub-services (OSM, Threat Zones, Future Impact) experience delays.
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

        # 2. Retrieve Phase 6F Investigation
        investigation = await self.investigation_service.investigate_observation(clean_id, force_refresh=force_refresh)

        lat = investigation.detection.latitude
        lon = investigation.detection.longitude
        frp = investigation.detection.frp
        brightness = investigation.detection.brightness
        persistence_score = investigation.persistence.score or (15.0 if investigation.persistence.observation_count <= 1 else 65.0)
        risk_score = float(investigation.risk.risk_score)
        risk_level = investigation.risk.risk_level
        candidate_class = investigation.fusion.candidate_class
        evidence_strength = investigation.fusion.evidence_strength
        candidate_score = investigation.fusion.candidate_score

        osm_features = investigation.industrial_context.features or []
        warnings: List[str] = list(investigation.warnings)

        now_utc = datetime.now(timezone.utc).isoformat()

        # 3. Calculate Threat Zones (Fault-Isolated)
        threat_zone_calc_time = now_utc
        try:
            raw_threat_zones = calculate_threat_zones(
                frp=frp,
                risk_score=risk_score,
                severity=risk_level,
                classification=candidate_class,
                persistence_score=persistence_score
            )
            parsed_zones: Dict[str, ThreatZoneDetails] = {}
            for z_key, z_val in raw_threat_zones.get("zones", {}).items():
                parsed_zones[z_key] = ThreatZoneDetails(
                    name=z_val["name"],
                    radius_km=float(z_val["radius_km"]),
                    color=z_val["color"],
                    fill_opacity=float(z_val.get("fill_opacity", 0.2)),
                    threat_level=z_val.get("threat_level", "EXPOSURE"),
                    description=z_val.get("description", "")
                )
            threat_zone_result = ThreatZoneResult(
                available=True,
                zones=parsed_zones,
                factors_applied=raw_threat_zones.get("factors_applied", {}),
                disclaimer=raw_threat_zones.get("disclaimer", "AI-generated risk/impact assessment zones — NOT official government evacuation boundaries.")
            )
        except Exception as e:
            logger.warning(f"Threat zone calculation failed for {clean_id}: {e}")
            warnings.append(f"Threat zone dynamic calculation degraded ({str(e)}); using baseline perimeter.")
            threat_zone_result = ThreatZoneResult(
                available=False,
                zones={},
                factors_applied={},
                disclaimer="Threat-zone analysis unavailable."
            )

        # 4. Analyze Asset Exposure (Fault-Isolated)
        asset_query_time = now_utc
        try:
            if threat_zone_result.available and raw_threat_zones:
                raw_assets = analyze_asset_exposure(lat, lon, osm_features, raw_threat_zones)
            else:
                # Fallback mock zones for exposure lookup
                fallback_zones = {"zones": {"inner_zone": {"radius_km": 1.0}, "secondary_zone": {"radius_km": 2.5}}}
                raw_assets = analyze_asset_exposure(lat, lon, osm_features, fallback_zones)

            exposed_items: List[AssetExposureItem] = []
            for item in raw_assets.get("exposed_assets", []):
                exposed_items.append(
                    AssetExposureItem(
                        asset_name=item.get("asset_name") or "Infrastructure Asset",
                        category=item.get("category", "PUBLIC"),
                        raw_type=item.get("raw_type", "urban"),
                        latitude=item.get("latitude"),
                        longitude=item.get("longitude"),
                        distance_km=float(item.get("distance_km", 0.0)),
                        threat_zone=item.get("threat_zone", "Monitoring Zone"),
                        exposure_level=item.get("exposure_level", "MONITORING EXPOSURE"),
                        status=item.get("status", "Within Risk Zone"),
                        data_source=item.get("data_source", "OpenStreetMap")
                    )
                )

            nearest_crit = None
            if raw_assets.get("nearest_critical_asset"):
                nca = raw_assets["nearest_critical_asset"]
                nearest_crit = AssetExposureItem(
                    asset_name=nca.get("asset_name") or "Critical Facility",
                    category=nca.get("category", "INDUSTRIAL"),
                    raw_type=nca.get("raw_type", "industrial"),
                    latitude=nca.get("latitude"),
                    longitude=nca.get("longitude"),
                    distance_km=float(nca.get("distance_km", 0.0)),
                    threat_zone=nca.get("threat_zone", "Inner Zone"),
                    exposure_level=nca.get("exposure_level", "HIGH EXPOSURE"),
                    status=nca.get("status", "Within Risk Zone"),
                    data_source="OpenStreetMap"
                )

            asset_exposure_result = AssetExposureResult(
                available=True,
                total_exposed_assets=raw_assets.get("total_exposed_assets", len(exposed_items)),
                critical_infrastructure_count=raw_assets.get("critical_infrastructure_count", 0),
                category_counts=raw_assets.get("category_counts", {}),
                nearest_critical_asset=nearest_crit,
                exposed_assets=exposed_items,
                source="OpenStreetMap"
            )
        except Exception as e:
            logger.warning(f"Asset exposure analysis failed for {clean_id}: {e}")
            warnings.append(f"Asset exposure evaluation degraded ({str(e)}); proceeding with baseline telemetry.")
            asset_exposure_result = AssetExposureResult(
                available=False,
                total_exposed_assets=0,
                critical_infrastructure_count=0,
                category_counts={},
                nearest_critical_asset=None,
                exposed_assets=[],
                source="OpenStreetMap"
            )

        # 5. Calculate Impact Assessment (Fault-Isolated)
        try:
            raw_impact = calculate_impact_assessment(
                frp=frp,
                risk_score=risk_score,
                persistence_score=persistence_score,
                asset_analysis=raw_assets if 'raw_assets' in locals() else {},
                classification=candidate_class
            )
            impact_result = ImpactResult(
                available=True,
                impact_score=float(raw_impact.get("impact_score", 0.0)),
                impact_level=raw_impact.get("impact_level", "LOW"),
                critical_infrastructure_count=raw_impact.get("critical_infrastructure_count", asset_exposure_result.critical_infrastructure_count),
                impact_reasons=raw_impact.get("impact_reasons", []),
                summary_statement=raw_impact.get("summary_statement", "")
            )
        except Exception as e:
            logger.warning(f"Impact assessment failed for {clean_id}: {e}")
            warnings.append(f"Impact scoring degraded ({str(e)}).")
            impact_result = ImpactResult(
                available=False,
                impact_score=0.0,
                impact_level="LOW",
                critical_infrastructure_count=0,
                impact_reasons=[],
                summary_statement="Impact analysis unavailable."
            )

        # 6. Future Impact & Fire Spread Forecast (Fault-Isolated with 4.0s timeout)
        try:
            raw_forecast = await asyncio.wait_for(
                calculate_future_impact_forecast(
                    lat=lat,
                    lon=lon,
                    frp=frp,
                    persistence_score=persistence_score,
                    risk_score=risk_score,
                    classification=candidate_class
                ),
                timeout=4.0
            )

            projections_dict: Dict[str, FutureImpactItem] = {}
            for h_key, h_val in raw_forecast.get("time_series_forecast", {}).items():
                projections_dict[h_key] = FutureImpactItem(
                    time_horizon=h_val["time_horizon"],
                    hours=float(h_val["hours"]),
                    center_latitude=float(h_val["center_latitude"]),
                    center_longitude=float(h_val["center_longitude"]),
                    projected_area_sqkm=float(h_val.get("projected_area_sqkm", 0.0)),
                    confidence_score=float(h_val.get("confidence_score", 0.8)),
                    confidence_level=h_val.get("confidence_level", "MEDIUM"),
                    total_exposed_assets=int(h_val.get("total_exposed_assets", 0)),
                    critical_infrastructure_count=int(h_val.get("critical_infrastructure_count", 0)),
                    impact_score=float(h_val.get("impact_score", 0.0)),
                    impact_level=h_val.get("impact_level", "LOW"),
                    priority_index=h_val.get("priority_index", "P4"),
                    priority_label=h_val.get("priority_label", "P4 — LOW PRIORITY"),
                    nearest_critical_asset=h_val.get("nearest_critical_asset"),
                    exposed_assets=h_val.get("exposed_assets", [])
                )

            future_impact_result = FutureImpactResult(
                available=True,
                escalation_detected=bool(raw_forecast.get("escalation_detected", False)),
                escalation_reasons=raw_forecast.get("escalation_reasons", []),
                projections=projections_dict,
                disclaimer="Forward-looking scenario projections are simulated estimates — NOT deterministic predictions."
            )
        except asyncio.TimeoutError:
            logger.warning(f"Future impact projection timed out for {clean_id}")
            future_impact_result = FutureImpactResult(
                available=False,
                escalation_detected=False,
                escalation_reasons=[],
                projections={},
                disclaimer="Forward-looking scenario projection timed out."
            )
        except Exception as e:
            logger.warning(f"Future impact projection failed for {clean_id}: {e}")
            future_impact_result = FutureImpactResult(
                available=False,
                escalation_detected=False,
                escalation_reasons=[],
                projections={},
                disclaimer="Forward-looking scenario projection unavailable."
            )

        # 7. Priority Evaluation & Contributing Reasons
        priority_eval_time = now_utc
        impact_score_val = impact_result.impact_score if impact_result.available else (risk_score * 0.8)
        
        # Priority Score formula (0-100):
        # 35% Operational Risk + 30% Impact Score + 20% Asset Criticality + 15% Candidate Confidence
        strength_mult = 1.0 if evidence_strength == "STRONG" else (0.75 if evidence_strength == "MODERATE" else 0.5)
        asset_crit_pts = min(100.0, (asset_exposure_result.critical_infrastructure_count * 25.0) + (asset_exposure_result.total_exposed_assets * 5.0))

        priority_score_raw = (
            (risk_score * 0.35) +
            (impact_score_val * 0.30) +
            (asset_crit_pts * 0.20) +
            (candidate_score * 100.0 * strength_mult * 0.15)
        )
        priority_score = round(min(100.0, max(0.0, priority_score_raw)), 1)

        # Assign Priority Level & Index (P1-P4)
        if priority_score >= 75.0 or (asset_exposure_result.nearest_critical_asset and asset_exposure_result.nearest_critical_asset.distance_km <= 1.0):
            priority_index = "P1"
            priority_level = "CRITICAL"
            priority_label = "P1 — CRITICAL DISPATCH"
        elif priority_score >= 50.0 or asset_exposure_result.critical_infrastructure_count >= 2:
            priority_index = "P2"
            priority_level = "HIGH"
            priority_label = "P2 — HIGH PRIORITY"
        elif priority_score >= 25.0:
            priority_index = "P3"
            priority_level = "MEDIUM"
            priority_label = "P3 — MODERATE PRIORITY"
        else:
            priority_index = "P4"
            priority_level = "LOW"
            priority_label = "P4 — LOW PRIORITY"

        # Explainable Priority Reasons
        priority_reasons: List[str] = []
        if priority_score >= 75.0:
            priority_reasons.append(f"Critical composite priority score ({priority_score}/100) indicates acute operational urgency.")
        if risk_score >= 70.0:
            priority_reasons.append(f"Elevated operational risk ({risk_score:.1f}/100) driven by {investigation.risk.primary_driver or 'combustion intensity'}.")
        if frp >= 30.0:
            priority_reasons.append(f"Substantial combustion radiance ({frp:.1f} MW Fire Radiative Power).")
        if persistence_score >= 50.0:
            priority_reasons.append(f"High multi-pass persistence ({persistence_score:.0f}/100) confirms persistent thermal source.")
        if asset_exposure_result.critical_infrastructure_count > 0:
            priority_reasons.append(f"{asset_exposure_result.critical_infrastructure_count} critical infrastructure asset(s) within threat perimeter.")
        if asset_exposure_result.nearest_critical_asset:
            nca = asset_exposure_result.nearest_critical_asset
            priority_reasons.append(f"Nearest critical facility: {nca.asset_name} ({nca.distance_km:.2f} km away in {nca.threat_zone}).")
        if candidate_class == "INDUSTRIAL_FIRE":
            priority_reasons.append("Multi-source AI candidate classified as INDUSTRIAL FIRE.")
        elif candidate_class == "WILDFIRE":
            priority_reasons.append("Multi-source AI candidate classified as WILDFIRE.")
        if not priority_reasons:
            priority_reasons.append("Routine thermal anomaly within acceptable monitoring baseline.")

        priority_factors = {
            "operational_risk": round(risk_score * 0.35, 1),
            "impact_assessment": round(impact_score_val * 0.30, 1),
            "asset_criticality": round(asset_crit_pts * 0.20, 1),
            "evidence_strength": round(candidate_score * 100.0 * strength_mult * 0.15, 1)
        }

        priority_result = PriorityResult(
            priority_index=priority_index,
            priority_label=priority_label,
            priority_score=priority_score,
            priority_level=priority_level,
            contributing_factors=priority_factors,
            reasons=priority_reasons
        )

        # 8. Generate Recommended Operational Actions
        recommended_actions: List[RecommendedAction] = []
        if priority_level in ("CRITICAL", "HIGH") and asset_exposure_result.critical_infrastructure_count > 0:
            recommended_actions.append(
                RecommendedAction(
                    action_id="act_tactical_dispatch",
                    title="Deploy Rapid Tactical Verification Unit",
                    category="DEPLOY_UNIT",
                    priority="IMMEDIATE",
                    rationale=f"High priority incident near {asset_exposure_result.critical_infrastructure_count} critical infrastructure asset(s)."
                )
            )

        if candidate_class == "INDUSTRIAL_FIRE" or investigation.industrial_context.nearest_distance_km and investigation.industrial_context.nearest_distance_km <= 2.0:
            facility_name = investigation.industrial_context.nearest_facility or "nearby mapped facility"
            recommended_actions.append(
                RecommendedAction(
                    action_id="act_verify_facility",
                    title=f"Verify Industrial Facility Perimeter ({facility_name})",
                    category="VERIFY_FACILITY",
                    priority="HIGH" if priority_level in ("CRITICAL", "HIGH") else "PRECAUTIONARY",
                    rationale=f"Hotspot located in close proximity ({investigation.industrial_context.nearest_distance_km or 1.0:.1f} km) to industrial zone."
                )
            )

        if persistence_score >= 40.0 or investigation.persistence.observation_count > 1:
            recommended_actions.append(
                RecommendedAction(
                    action_id="act_monitor_recurrence",
                    title="Monitor Orbital Pass Recurrence Corridor",
                    category="MONITOR_RECURRENCE",
                    priority="HIGH",
                    rationale=f"Recurrent multi-pass signature ({investigation.persistence.observation_count} passes) typical of continuous thermal operations."
                )
            )

        if investigation.sentinel2.available:
            quality_note = f"Quality: {investigation.sentinel2.quality}"
            recommended_actions.append(
                RecommendedAction(
                    action_id="act_review_optical",
                    title="Review High-Resolution Sentinel-2 Multispectral Evidence",
                    category="REVIEW_SATELLITE",
                    priority="PRECAUTIONARY",
                    rationale=f"Optical acquisition available ({quality_note}). Check surface burn perimeter."
                )
            )
        else:
            recommended_actions.append(
                RecommendedAction(
                    action_id="act_request_optical",
                    title="Schedule Next-Pass Copernicus Optical Surveillance",
                    category="REVIEW_SATELLITE",
                    priority="ROUTINE",
                    rationale="No cloud-free Sentinel-2 overpass coincident with current thermal anomaly."
                )
            )

        if future_impact_result.escalation_detected:
            recommended_actions.append(
                RecommendedAction(
                    action_id="act_escalate",
                    title="Escalate Incident to Regional Operations Command",
                    category="ESCALATE",
                    priority="HIGH",
                    rationale="Forward-looking fire spread simulation predicts potential threat escalation."
                )
            )

        if candidate_class == "NON_FIRE" and evidence_strength in ("STRONG", "MODERATE"):
            recommended_actions.append(
                RecommendedAction(
                    action_id="act_dismiss_nonfire",
                    title="Evaluate for Incident Dismissal (Non-Fire Signature)",
                    category="DISMISS",
                    priority="ROUTINE",
                    rationale="Low thermal radiance and non-fire optical features indicate non-hazardous thermal source."
                )
            )

        # 9. Assemble Incident Summary
        incident_summary = IncidentSummary(
            candidate_class=candidate_class.replace("_", " "),
            evidence_strength=evidence_strength,
            risk_level=risk_level,
            priority_level=priority_level,
            priority_index=priority_index,
            persistence_interpretation=investigation.persistence.classification or ("RECURRENT" if investigation.persistence.observation_count > 1 else "TRANSIENT"),
            industrial_context_summary=investigation.industrial_context.nearest_facility or "No nearby mapped industrial infrastructure",
            optical_evidence_quality=investigation.sentinel2.quality,
            asset_exposure_summary=f"{asset_exposure_result.total_exposed_assets} mapped assets ({asset_exposure_result.critical_infrastructure_count} critical)",
            recommended_action=recommended_actions[0].title if recommended_actions else "Continue standard surveillance monitoring."
        )

        # 10. Assemble Decision Provenance
        decision_provenance = DecisionProvenance(
            observation_id=clean_id,
            investigated_at=investigation.created_at,
            threat_zone_calculated_at=threat_zone_calc_time,
            asset_query_at=asset_query_time,
            priority_evaluated_at=priority_eval_time,
            decision_support_generated_at=now_utc
        )

        status_label = "SUCCESS" if not warnings else "PARTIAL_EVIDENCE"

        response = DecisionSupportResponse(
            observation_id=clean_id,
            status=status_label,
            summary=incident_summary,
            investigation=investigation,
            priority=priority_result,
            threat_zone=threat_zone_result,
            asset_exposure=asset_exposure_result,
            impact=impact_result,
            future_impact=future_impact_result,
            recommended_actions=recommended_actions,
            provenance=decision_provenance,
            warnings=warnings,
            created_at=now_utc
        )

        # Save to Cache
        self._save_to_cache(clean_id, response)
        return response


# Singleton instance
_decision_support_service_instance: Optional[DecisionSupportService] = None


def get_decision_support_service() -> DecisionSupportService:
    global _decision_support_service_instance
    if _decision_support_service_instance is None:
        _decision_support_service_instance = DecisionSupportService()
    return _decision_support_service_instance
