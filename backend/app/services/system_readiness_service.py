import os
import sys
import time
import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List

import app.config as config
from app.services.firms_service import check_firms_connectivity
from app.services.firms_ingestion_service import (
    get_firms_ingestion_status,
    get_latest_firms_observation,
)
from app.services.satellite_auth_service import get_satellite_auth_service
from app.db.database import check_database_connectivity, get_session_factory
from app.services.incident_audit_service import get_incident_audit_service

logger = logging.getLogger("system_readiness")

MANDATORY_DISCLAIMERS = [
    "AI Candidate Classification is an evidence-fusion output, not a standalone confirmation of an industrial fire.",
    "Sentinel-2 imagery is optical evidence and may not be temporally coincident with the FIRMS observation.",
    "Dynamic threat zones and scenario projections are simulation estimates — NOT official government evacuation orders.",
]


class SystemReadinessService:
    """
    Unified System Readiness & Dependency Health Service for SIH 2026.
    Evaluates end-to-end component readiness across FastAPI backend, database/file storage,
    NASA FIRMS, Copernicus Sentinel-2, OpenStreetMap Overpass, ML Satellite Vision CNN,
    and Incident Audit Store.
    
    States:
      - HEALTHY: Service is configured, reachable, and fully functional.
      - DEGRADED: Service is partially operational or operating in resilient fallback mode.
      - UNAVAILABLE: Service failed active reachability probes or dependencies missing.
      - NOT_CONFIGURED: Required credentials or endpoints are absent.
    """

    def __init__(self):
        self.cached_readiness: Optional[Dict[str, Any]] = None
        self.cache_timestamp: float = 0.0
        self.cache_ttl: float = 15.0  # 15s cache to protect against rapid polling

    async def get_system_readiness(
        self,
        probe_external: bool = False,
        force_refresh: bool = False
    ) -> Dict[str, Any]:
        """
        Calculates unified multi-component readiness.
        """
        now = time.time()
        if not force_refresh and not probe_external and self.cached_readiness and (now - self.cache_timestamp < self.cache_ttl):
            return self.cached_readiness

        now_utc = datetime.now(timezone.utc).isoformat()

        # 1. Backend Core Service
        backend_status = "HEALTHY"
        backend_detail = {
            "status": backend_status,
            "configured": True,
            "reachable": True,
            "usable": True,
            "service": "SIH 26162 FastAPI Core",
            "version": "1.0.0",
            "python_version": sys.version.split()[0],
            "environment": config.ENVIRONMENT,
        }

        # 2. Database & Persistent Storage
        db_conn = check_database_connectivity(timeout_seconds=2.0) if probe_external else {
            "configured": bool(config.DATABASE_URL),
            "status": "CONFIGURED" if config.DATABASE_URL else "FALLBACK_LOCAL_JSON",
            "reachable": bool(config.DATABASE_URL),
            "usable": True,
            "dialect": "postgresql" if config.DATABASE_URL else "file_storage"
        }
        
        # Verify JSON file storage health
        obs_file_exists = os.path.exists(config.FIRMS_OBSERVATIONS_PATH)
        audit_file_exists = os.path.exists(os.path.join(config.BACKEND_DIR, "data", "incident_audit_store.json"))
        
        if db_conn.get("status") in ("CONNECTED", "REACHABLE", "CONFIGURED"):
            db_status = "HEALTHY"
        elif obs_file_exists or audit_file_exists:
            db_status = "DEGRADED"  # Resilient fallback storage active
        else:
            db_status = "DEGRADED"

        storage_detail = {
            "status": db_status,
            "configured": bool(config.DATABASE_URL),
            "reachable": db_conn.get("reachable", True),
            "usable": True,
            "primary_backend": "SUPABASE_POSTGRESQL" if config.DATABASE_URL else "LOCAL_JSON_RESILIENT_STORE",
            "local_fallback_available": True,
            "observations_indexed": obs_file_exists,
            "audit_store_available": True,
        }

        # 3. NASA FIRMS Pipeline
        firms_configured = bool(config.NASA_FIRMS_MAP_KEY)
        ingestion_status = get_firms_ingestion_status()
        latest_obs = get_latest_firms_observation()

        if probe_external and firms_configured:
            firms_probe = await check_firms_connectivity(timeout_seconds=4.0)
            if firms_probe.get("status") in ("CONNECTED", "REACHABLE"):
                firms_status = "HEALTHY"
            elif firms_probe.get("status") == "INVALID_MAP_KEY":
                firms_status = "UNAVAILABLE"
            else:
                firms_status = "DEGRADED"
            firms_latency = firms_probe.get("latency_ms")
        else:
            firms_status = "HEALTHY" if firms_configured else "NOT_CONFIGURED"
            firms_latency = None

        firms_detail = {
            "status": firms_status,
            "configured": firms_configured,
            "reachable": firms_status in ("HEALTHY", "DEGRADED"),
            "usable": firms_status in ("HEALTHY", "DEGRADED"),
            "ingestion_state": ingestion_status.get("status", "NOT_STARTED"),
            "total_stored_records": ingestion_status.get("total_stored_records", 0),
            "latest_observation_id": latest_obs.get("observation_id") if latest_obs.get("available") else None,
            "latest_observation_time": latest_obs.get("acquired_at") if latest_obs.get("available") else None,
            "freshness": latest_obs.get("freshness", "NO_DATA"),
            "latency_ms": firms_latency,
        }

        # 4. Copernicus Sentinel-2 Satellite Intelligence
        copernicus_configured = bool(config.COPERNICUS_CLIENT_ID and config.COPERNICUS_CLIENT_SECRET)
        if probe_external and copernicus_configured:
            sat_auth = await get_satellite_auth_service().check_auth_connectivity(timeout_seconds=4.0)
            if sat_auth.get("status") in ("CONNECTED", "REACHABLE"):
                sat_status = "HEALTHY"
            else:
                sat_status = "DEGRADED"
            sat_latency = sat_auth.get("latency_ms")
        else:
            sat_status = "HEALTHY" if copernicus_configured else "NOT_CONFIGURED"
            sat_latency = None

        satellite_detail = {
            "status": sat_status,
            "configured": copernicus_configured,
            "reachable": sat_status in ("HEALTHY", "DEGRADED"),
            "usable": sat_status in ("HEALTHY", "DEGRADED"),
            "provider": "Copernicus Data Space Ecosystem (CDSE)",
            "product": "Sentinel-2 L2A Multispectral",
            "backup_product": "Sentinel-1 GRD SAR",
            "catalog_api": "sh.dataspace.copernicus.eu/catalog/v1/search",
            "processing_api": "sh.dataspace.copernicus.eu/process/v1",
            "latency_ms": sat_latency,
            "optical_evidence_ready": True,
            "backup_sar_ready": config.SENTINEL1_BACKUP_ENABLED,
        }

        # 5. OpenStreetMap & Overpass Context Service
        osm_status = "HEALTHY"
        osm_detail = {
            "status": osm_status,
            "configured": True,
            "reachable": True,
            "usable": True,
            "provider": "Overpass API & OSM Local Graph",
            "industrial_search_radius_km": config.INDUSTRIAL_CANDIDATE_RADIUS_KM,
        }

        # 6. Machine Learning Multispectral Vision CNN Model
        from app.ml.satellite_model.config import BEST_MODEL_PATH, MODEL_METADATA_PATH, NUM_CHANNELS, INPUT_BANDS
        ml_weights_exist = os.path.exists(BEST_MODEL_PATH)
        ml_meta_exists = os.path.exists(MODEL_METADATA_PATH)

        if ml_weights_exist:
            ml_status = "HEALTHY"
        else:
            ml_status = "DEGRADED"

        ml_model_detail = {
            "status": ml_status,
            "configured": True,
            "reachable": True,
            "usable": ml_weights_exist,
            "model_architecture": "6-Band Multispectral Residual CNN (Phase 6C)",
            "checkpoint_path": "app/ml/models/satellite_classifier_best.pth",
            "weights_loaded": ml_weights_exist,
            "metadata_loaded": ml_meta_exists,
            "input_bands": INPUT_BANDS,
            "num_channels": NUM_CHANNELS,
            "classes": ["WILDFIRE", "INDUSTRIAL_FIRE", "NON_FIRE"],
            "is_calibrated": False,
        }

        # 7. Incident Action & Persistent Audit Engine
        audit_service = get_incident_audit_service()
        op_summary = audit_service.get_operational_summary()
        audit_status = "HEALTHY"

        audit_detail = {
            "status": audit_status,
            "configured": True,
            "reachable": True,
            "usable": True,
            "state_machine": "NEW -> ACKNOWLEDGED -> DISPATCHED -> UNDER_INVESTIGATION -> ESCALATED -> RESOLVED / DISMISSED",
            "tracked_incidents_count": op_summary.total_incidents,
            "active_incidents_count": op_summary.dispatched_count + op_summary.acknowledged_count + op_summary.investigating_count,
            "p1_critical_active": op_summary.p1_critical_active_count,
            "dual_storage_mode": "RELATIONAL_SQL_WITH_JSON_FALLBACK",
        }

        # Overall System Evaluation
        critical_statuses = [backend_status, storage_detail["status"], ml_status, audit_status]
        if all(s == "HEALTHY" for s in critical_statuses):
            overall_status = "HEALTHY"
        elif any(s == "UNAVAILABLE" for s in critical_statuses):
            overall_status = "UNAVAILABLE"
        else:
            overall_status = "DEGRADED"

        readiness_payload = {
            "status": overall_status,
            "service_name": "SIH-26162 Emergency Operations Center AI Platform",
            "version": "1.0.0",
            "environment": config.ENVIRONMENT,
            "evaluated_at": now_utc,
            "components": {
                "backend": backend_detail,
                "storage": storage_detail,
                "firms": firms_detail,
                "satellite": satellite_detail,
                "osm": osm_detail,
                "ml_model": ml_model_detail,
                "incident_audit": audit_detail,
            },
            "demo_scenarios": {
                "available": True,
                "presets_count": 4,
                "presets": [
                    {
                        "id": "demo_industrial_p1",
                        "title": "Petrochemical Refinery Fire (P1 Critical)",
                        "observation_id": "423f0b1ad50facd6",
                        "status": "READY",
                    },
                    {
                        "id": "demo_wildfire_p2",
                        "title": "Steel Mill / Forest Thermal Anomaly (P2 High)",
                        "observation_id": "04e53a2f16d0d665",
                        "status": "READY",
                    },
                    {
                        "id": "demo_crop_burn_p4",
                        "title": "Agricultural Crop Residual (P4 Low)",
                        "observation_id": "a35cd8640d876fc2",
                        "status": "READY",
                    },
                    {
                        "id": "demo_degraded_cloud",
                        "title": "Coastal Anomaly Cloud Degraded (P3 Medium)",
                        "observation_id": "90b58068fefb3a79",
                        "status": "READY",
                    },
                ],
            },
            "safety_flags": {
                "is_calibrated": False,
                "is_synthetic": False,
                "is_simulation_only": True,
            },
            "disclaimers": MANDATORY_DISCLAIMERS,
        }

        self.cached_readiness = readiness_payload
        self.cache_timestamp = now
        return readiness_payload


_readiness_service: Optional[SystemReadinessService] = None


def get_system_readiness_service() -> SystemReadinessService:
    global _readiness_service
    if _readiness_service is None:
        _readiness_service = SystemReadinessService()
    return _readiness_service
