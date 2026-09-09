import os
import logging
from typing import Dict, Any, Optional, Tuple
from datetime import datetime

import app.config as config
from app.services.satellite_service import get_satellite_provider
from app.services.sentinel1_service import get_sentinel1_provider, SAR_DISCLAIMER

logger = logging.getLogger("satellite_orchestrator")


class SatelliteOrchestrator:
    """
    Phase 6K Single Orchestration Layer for Satellite Evidence.
    Enforces Sentinel-2 as PRIMARY optical evidence and Sentinel-1 as BACKUP SAR evidence.

    Policy:
      1. S2 cloud < 30%:
         - Use Sentinel-2.
         - Do NOT query Sentinel-1 (fast path).
      2. S2 cloud 30–50%:
         - Use Sentinel-2.
         - Do NOT query Sentinel-1 (fast path).
      3. S2 cloud 50–70%:
         - Use Sentinel-2 if actual image/AOI is usable.
         - Do NOT query Sentinel-1 when usable.
         - If actually unusable or retrieval failed, query Sentinel-1.
      4. S2 cloud >= 70%:
         - Optical evidence considered unreliable / obscured.
         - Query Sentinel-1 as backup.
         - Prefer Sentinel-1 evidence if available.
      5. S2 NO_ACQUISITION / AUTH_FAILED / PROCESSING_FAILED / TIMEOUT:
         - Query Sentinel-1 as backup.
      6. Both S2 and S1 unavailable:
         - Never crash or fail investigation.
         - Return selected_satellite="NONE" with full provenance;
           downstream fusion falls back to FIRMS + persistence + OSM.
    """

    def __init__(
        self,
        s2_provider: Optional[Any] = None,
        s1_provider: Optional[Any] = None,
        s2_service: Optional[Any] = None,
        s1_service: Optional[Any] = None,
    ):
        self.s2_provider = s2_provider or s2_service or get_satellite_provider()
        self.s1_provider = s1_provider or s1_service or get_sentinel1_provider()

    @staticmethod
    def _is_image_usable(image_path: Optional[str]) -> bool:
        """Verify whether an image file physically exists and is non-empty."""
        if not image_path:
            return False
        return os.path.exists(image_path) and os.path.getsize(image_path) > 100

    async def get_orchestrated_satellite_evidence(
        self,
        lat: float,
        lon: float,
        timestamp: Optional[str] = None,
        radius_km: Optional[float] = None,
        observation_id: Optional[str] = None,
        force_refresh: bool = False
    ) -> Dict[str, Any]:
        """
        Orchestrate satellite evidence collection obeying the primary/backup contract.
        Never queries Sentinel-1 unnecessarily.
        """
        # =========================================================================
        # 1. PRIMARY: Query Sentinel-2 Multispectral Optical Evidence
        # =========================================================================
        try:
            s2_res = await self.s2_provider.fetch_satellite_image(
                lat=lat,
                lon=lon,
                timestamp=timestamp,
                radius_km=radius_km,
                observation_id=observation_id,
                force_refresh=force_refresh
            )
        except Exception as ex:
            logger.warning(f"Sentinel-2 primary retrieval exception: {ex}")
            s2_res = {
                "status": "PROCESSING_FAILED",
                "available": False,
                "image_available": False,
                "is_synthetic": False,
                "error": str(ex),
                "message": f"Sentinel-2 retrieval failed: {ex}"
            }

        s2_status = s2_res.get("status", "NO_ACQUISITION")
        s2_available = bool(s2_res.get("available") or s2_res.get("image_available"))
        s2_cloud = s2_res.get("cloud_cover") if s2_res.get("cloud_cover") is not None else s2_res.get("cloud_percentage")
        s2_cloud_float = float(s2_cloud) if s2_cloud is not None else None
        s2_img_path = s2_res.get("image_path")
        s2_img_usable = self._is_image_usable(s2_img_path)

        # Evaluate S2 usability strictly according to policy
        should_query_s1 = False
        fallback_trigger_reason = None

        if s2_cloud_float is not None and s2_cloud_float >= 70.0:
            # Rule 4: >= 70% High/Very High Cloud -> Trigger S1
            should_query_s1 = True
            fallback_trigger_reason = f"Sentinel-2 optical visibility heavily obscured by cloud cover ({s2_cloud_float:.1f}% >= 70%)."
        elif not s2_available or s2_status in ("NO_ACQUISITION", "AUTH_FAILED", "PROCESSING_FAILED", "TIMEOUT", "RETRIEVAL_FAILED"):
            should_query_s1 = True
            fallback_trigger_reason = f"Sentinel-2 acquisition unavailable ({s2_status})."
        elif s2_cloud_float is not None:
            if s2_cloud_float < 30.0:
                # Rule 1: Good clear sky -> NEVER query S1
                should_query_s1 = False
            elif s2_cloud_float < 50.0:
                # Rule 2: Moderate/acceptable -> NEVER query S1
                should_query_s1 = False
            elif s2_cloud_float < 70.0:
                # Rule 3: 50-70% Degraded -> Use S2 if image usable; if unusable, trigger S1
                if s2_img_usable:
                    should_query_s1 = False
                else:
                    should_query_s1 = True
                    fallback_trigger_reason = f"Sentinel-2 optical patch unusable under elevated cloud cover ({s2_cloud_float:.1f}%)."
        else:
            # Cloud percentage missing: if image not usable, query S1
            if not s2_img_usable:
                should_query_s1 = True
                fallback_trigger_reason = "Sentinel-2 optical image missing or unusable."

        # Check if S1 backup is globally disabled in config
        if not getattr(config, "SENTINEL1_BACKUP_ENABLED", True):
            should_query_s1 = False

        # =========================================================================
        # 2. BACKUP: Query Sentinel-1 ONLY if S2 is unusable or too cloudy
        # =========================================================================
        if not should_query_s1:
            # FAST PATH: S1 is NOT QUERIED to eliminate latency and API overhead
            reason_skipped = (
                f"Sentinel-2 optical conditions acceptable ({s2_cloud_float:.1f}% cloud cover < 50%)."
                if s2_cloud_float is not None and s2_cloud_float < 50.0
                else "Sentinel-2 optical patch usable; backup satellite not required."
            )
            s1_res = {
                "status": "S1_NOT_QUERIED",
                "available": False,
                "image_available": False,
                "role": "BACKUP",
                "product_id": None,
                "polarization": None,
                "orbit_direction": None,
                "acquisition_mode": None,
                "satellite_acquired_at": None,
                "time_difference_hours": None,
                "image_url": None,
                "image_path": None,
                "source": "Copernicus Data Space",
                "product": "Sentinel-1 GRD",
                "is_synthetic": False,
                "is_radar_sar": True,
                "reason_not_queried": reason_skipped,
                "sar_disclaimer": SAR_DISCLAIMER,
                "message": reason_skipped
            }
            selected_satellite = "SENTINEL_2"
            fallback_reason = None
            active_evidence = s2_res
        else:
            # DEGRADED / CLOUDY PATH: Query Sentinel-1 backup
            logger.info(f"Triggering Sentinel-1 backup for obs {observation_id}: {fallback_trigger_reason}")
            try:
                s1_res = await self.s1_provider.fetch_sentinel1_image(
                    lat=lat,
                    lon=lon,
                    timestamp=timestamp,
                    radius_km=radius_km,
                    observation_id=observation_id,
                    force_refresh=force_refresh
                )
            except Exception as ex:
                logger.warning(f"Sentinel-1 backup retrieval error: {ex}")
                s1_res = {
                    "status": "S1_PROCESSING_FAILED",
                    "available": False,
                    "image_available": False,
                    "role": "BACKUP",
                    "is_synthetic": False,
                    "is_radar_sar": True,
                    "source": "Copernicus Data Space",
                    "product": "Sentinel-1 GRD",
                    "error": str(ex),
                    "sar_disclaimer": SAR_DISCLAIMER,
                    "message": f"Sentinel-1 backup retrieval failed: {ex}"
                }

            s1_available = bool(s1_res.get("available") or s1_res.get("image_available"))

            if s1_available:
                selected_satellite = "SENTINEL_1"
                fallback_reason = fallback_trigger_reason
                active_evidence = s1_res
            elif s2_available:
                # S1 unavailable but degraded S2 exists -> keep degraded S2
                selected_satellite = "SENTINEL_2"
                fallback_reason = f"{fallback_trigger_reason} Sentinel-1 backup also unavailable ({s1_res.get('status')})."
                active_evidence = s2_res
            else:
                # Both unavailable
                selected_satellite = "NONE"
                fallback_reason = f"Both Sentinel-2 ({s2_status}) and Sentinel-1 ({s1_res.get('status')}) acquisitions unavailable."
                active_evidence = {"available": False, "status": "UNAVAILABLE", "is_synthetic": False}

        return {
            "sentinel2": s2_res,
            "sentinel1": s1_res,
            "selected_satellite": selected_satellite,
            "fallback_reason": fallback_reason,
            "active_evidence": active_evidence
        }

    # Alias for convenience
    get_satellite_evidence = get_orchestrated_satellite_evidence


# Singleton orchestrator instance
_orchestrator_instance: Optional[SatelliteOrchestrator] = None


def get_satellite_orchestrator() -> SatelliteOrchestrator:
    global _orchestrator_instance
    if _orchestrator_instance is None:
        _orchestrator_instance = SatelliteOrchestrator()
    return _orchestrator_instance
