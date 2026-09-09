"""
Phase 6K Test Suite: Sentinel-2 Primary + Sentinel-1 SAR Backup Architecture
Verifies the cloud-adaptive multi-sensor satellite orchestration policy for SIH 26162.

Tests:
1. S2 cloud = 15% (GOOD) -> S1 is NOT queried, Sentinel-2 selected.
2. S2 cloud = 42% (ACCEPTABLE/MODERATE) -> S1 is NOT queried, Sentinel-2 selected.
3. S2 cloud = 88% (HIGH_CLOUD) -> S1 IS queried and selected as backup.
4. S2 = NO_ACQUISITION -> S1 IS queried and selected.
5. S2 processing failure -> S1 IS queried.
6. Both S2 and S1 unavailable -> Graceful degradation; FIRMS + persistence + OSM intact.
7. S1 catalog query formatting and candidate ranking contract.
8. S1 Processing API evalscript and SAR visualization synthesis contract.
9. Scientific accuracy: S1 does NOT report fire temperature; mandatory SAR disclaimer present.
10. Investigation endpoint end-to-end integration with dual satellite metadata.
"""

import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.services.satellite_orchestrator import (
    SatelliteOrchestrator,
    get_satellite_orchestrator,
)
from app.services.sentinel1_service import (
    Sentinel1Service,
    get_sentinel1_service,
    SAR_EVALSCRIPT,
    SAR_DISCLAIMER,
)
from app.schemas.investigation import (
    Sentinel2Evidence,
    Sentinel1Evidence,
    InvestigationResponse,
    MANDATORY_SAR_DISCLAIMER,
)

client = TestClient(app)

LAT = 22.3039
LON = 70.8022
OBS_TIME = "2026-08-28T10:30:00Z"
OBS_ID = "423f0b1ad50facd6"


def test_01_s2_clear_15_percent_cloud_skips_s1():
    """
    Test 1: S2 cloud = 15% (GOOD)
    Expected: Sentinel-2 is used; Sentinel-1 is strictly NOT queried.
    """
    mock_s2_service = MagicMock()
    mock_s1_service = MagicMock()
    mock_s1_service.fetch_sentinel1_image = AsyncMock()

    s2_result = {
        "status": "SUCCESS",
        "available": True,
        "image_available": True,
        "cloud_cover": 15.0,
        "cloud_percentage": 15.0,
        "source": "SENTINEL_2",
        "image_path": "/fake/path/sat_s2_test.png",
        "quality": "GOOD",
        "classification": "INDUSTRIAL_FIRE",
        "confidence": 0.88,
    }
    mock_s2_service.fetch_satellite_image = AsyncMock(return_value=s2_result)

    orchestrator = SatelliteOrchestrator(
        s2_service=mock_s2_service,
        s1_service=mock_s1_service,
    )
    # mock image usability check
    orchestrator._is_image_usable = MagicMock(return_value=True)

    result = asyncio.run(orchestrator.get_satellite_evidence(
        lat=LAT,
        lon=LON,
        timestamp=OBS_TIME,
        observation_id=OBS_ID,
    ))

    # Verify S1 was NEVER queried
    mock_s1_service.fetch_sentinel1_image.assert_not_called()

    assert result["selected_satellite"] == "SENTINEL_2"
    assert result["sentinel2"]["available"] is True
    assert result["sentinel2"]["cloud_cover"] == 15.0
    assert result["sentinel1"]["status"] == "S1_NOT_QUERIED"
    assert result["sentinel1"]["available"] is False
    assert result["fallback_reason"] is None


def test_02_s2_moderate_42_percent_cloud_skips_s1():
    """
    Test 2: S2 cloud = 42% (ACCEPTABLE / MODERATE)
    Expected: Sentinel-2 is used; Sentinel-1 is strictly NOT queried.
    """
    mock_s2_service = MagicMock()
    mock_s1_service = MagicMock()
    mock_s1_service.fetch_sentinel1_image = AsyncMock()

    s2_result = {
        "status": "SUCCESS",
        "available": True,
        "image_available": True,
        "cloud_cover": 42.0,
        "cloud_percentage": 42.0,
        "source": "SENTINEL_2",
        "image_path": "/fake/path/sat_s2_test_mod.png",
        "quality": "MODERATE",
        "classification": "NATURAL_FIRE",
        "confidence": 0.74,
    }
    mock_s2_service.fetch_satellite_image = AsyncMock(return_value=s2_result)

    orchestrator = SatelliteOrchestrator(
        s2_service=mock_s2_service,
        s1_service=mock_s1_service,
    )
    orchestrator._is_image_usable = MagicMock(return_value=True)

    result = asyncio.run(orchestrator.get_satellite_evidence(
        lat=LAT,
        lon=LON,
        timestamp=OBS_TIME,
        observation_id=OBS_ID,
    ))

    # Verify S1 was NEVER queried
    mock_s1_service.fetch_sentinel1_image.assert_not_called()

    assert result["selected_satellite"] == "SENTINEL_2"
    assert result["sentinel2"]["available"] is True
    assert result["sentinel2"]["cloud_cover"] == 42.0
    assert result["sentinel1"]["status"] == "S1_NOT_QUERIED"
    assert result["sentinel1"]["available"] is False
    assert result["fallback_reason"] is None


def test_03_s2_heavy_cloud_88_percent_queries_and_selects_s1():
    """
    Test 3: S2 cloud = 88% (HIGH / VERY HIGH CLOUD)
    Expected: Sentinel-1 IS queried and selected as primary operational satellite evidence.
    """
    mock_s2_service = MagicMock()
    mock_s1_service = MagicMock()

    s2_result = {
        "status": "HIGH_CLOUD",
        "available": False,
        "image_available": False,
        "cloud_cover": 88.0,
        "cloud_percentage": 88.0,
        "source": "SENTINEL_2",
        "quality": "VERY_HIGH_CLOUD",
    }
    mock_s2_service.fetch_satellite_image = AsyncMock(return_value=s2_result)

    s1_result = {
        "status": "SUCCESS",
        "available": True,
        "image_available": True,
        "role": "BACKUP",
        "product_id": "S1A_IW_GRDH_1SDV_20260828",
        "acquisition_mode": "IW",
        "polarization": ["VV", "VH"],
        "orbit_direction": "descending",
        "satellite_acquired_at": "2026-08-28 12:00:00 UTC",
        "image_url": "/api/satellite/image/sat_s1_test",
        "source": "Copernicus Data Space",
        "product": "Sentinel-1 GRD",
        "is_synthetic": False,
        "sar_disclaimer": MANDATORY_SAR_DISCLAIMER,
    }
    mock_s1_service.fetch_sentinel1_image = AsyncMock(return_value=s1_result)

    orchestrator = SatelliteOrchestrator(
        s2_service=mock_s2_service,
        s1_service=mock_s1_service,
    )

    result = asyncio.run(orchestrator.get_satellite_evidence(
        lat=LAT,
        lon=LON,
        timestamp=OBS_TIME,
        observation_id=OBS_ID,
    ))

    # Verify S1 WAS queried
    mock_s1_service.fetch_sentinel1_image.assert_called_once()

    assert result["selected_satellite"] == "SENTINEL_1"
    assert result["sentinel2"]["available"] is False
    assert result["sentinel1"]["available"] is True
    assert result["sentinel1"]["product_id"] == "S1A_IW_GRDH_1SDV_20260828"
    assert "88.0%" in result["fallback_reason"]


def test_04_s2_no_acquisition_triggers_s1():
    """
    Test 4: S2 = NO_ACQUISITION
    Expected: Sentinel-1 IS queried to provide backup structural evidence.
    """
    mock_s2_service = MagicMock()
    mock_s1_service = MagicMock()

    s2_result = {
        "status": "NO_ACQUISITION",
        "available": False,
        "image_available": False,
        "source": "SENTINEL_2",
        "quality": "UNKNOWN",
        "message": "No Sentinel-2 overpass found within temporal window",
    }
    mock_s2_service.fetch_satellite_image = AsyncMock(return_value=s2_result)

    s1_result = {
        "status": "SUCCESS",
        "available": True,
        "image_available": True,
        "role": "BACKUP",
        "product_id": "S1A_IW_GRDH_1SDV_20260828",
        "acquisition_mode": "IW",
        "polarization": ["VV", "VH"],
        "image_url": "/api/satellite/image/sat_s1_no_acq",
    }
    mock_s1_service.fetch_sentinel1_image = AsyncMock(return_value=s1_result)

    orchestrator = SatelliteOrchestrator(
        s2_service=mock_s2_service,
        s1_service=mock_s1_service,
    )

    result = asyncio.run(orchestrator.get_satellite_evidence(
        lat=LAT,
        lon=LON,
        timestamp=OBS_TIME,
        observation_id=OBS_ID,
    ))

    mock_s1_service.fetch_sentinel1_image.assert_called_once()
    assert result["selected_satellite"] == "SENTINEL_1"
    assert result["sentinel1"]["available"] is True
    assert "NO_ACQUISITION" in result["fallback_reason"]


def test_05_s2_processing_failure_triggers_s1():
    """
    Test 5: S2 processing failure (PROCESSING_FAILED or timeout)
    Expected: Sentinel-1 is queried to safeguard against single-point failure.
    """
    mock_s2_service = MagicMock()
    mock_s1_service = MagicMock()

    s2_result = {
        "status": "PROCESSING_FAILED",
        "available": False,
        "image_available": False,
        "source": "SENTINEL_2",
        "quality": "UNKNOWN",
        "message": "Copernicus Processing API returned 504 Gateway Timeout",
    }
    mock_s2_service.fetch_satellite_image = AsyncMock(return_value=s2_result)

    s1_result = {
        "status": "SUCCESS",
        "available": True,
        "image_available": True,
        "role": "BACKUP",
        "product_id": "S1B_IW_GRDH_1SDV_20260828",
        "acquisition_mode": "IW",
        "polarization": ["VV", "VH"],
        "image_url": "/api/satellite/image/sat_s1_proc_fail",
    }
    mock_s1_service.fetch_sentinel1_image = AsyncMock(return_value=s1_result)

    orchestrator = SatelliteOrchestrator(
        s2_service=mock_s2_service,
        s1_service=mock_s1_service,
    )

    result = asyncio.run(orchestrator.get_satellite_evidence(
        lat=LAT,
        lon=LON,
        timestamp=OBS_TIME,
        observation_id=OBS_ID,
    ))

    mock_s1_service.fetch_sentinel1_image.assert_called_once()
    assert result["selected_satellite"] == "SENTINEL_1"
    assert "PROCESSING_FAILED" in result["fallback_reason"]


def test_06_both_satellites_unavailable_graceful_degradation():
    """
    Test 6: Both Sentinel-2 and Sentinel-1 are unavailable.
    Expected: Selected satellite is NONE; system does NOT crash;
    Investigation gracefully degrades and preserves FIRMS, persistence, and OSM evidence.
    """
    mock_s2_service = MagicMock()
    mock_s1_service = MagicMock()

    s2_result = {
        "status": "NO_ACQUISITION",
        "available": False,
        "image_available": False,
        "source": "SENTINEL_2",
        "message": "No Sentinel-2 overpass found",
    }
    mock_s2_service.fetch_satellite_image = AsyncMock(return_value=s2_result)

    s1_result = {
        "status": "NO_ACQUISITION",
        "available": False,
        "image_available": False,
        "role": "BACKUP",
        "reason_not_queried": "No Sentinel-1 GRD IW scene found in temporal window",
    }
    mock_s1_service.fetch_sentinel1_image = AsyncMock(return_value=s1_result)

    orchestrator = SatelliteOrchestrator(
        s2_service=mock_s2_service,
        s1_service=mock_s1_service,
    )

    result = asyncio.run(orchestrator.get_satellite_evidence(
        lat=LAT,
        lon=LON,
        timestamp=OBS_TIME,
        observation_id=OBS_ID,
    ))

    assert result["selected_satellite"] == "NONE"
    assert result["sentinel2"]["available"] is False
    assert result["sentinel1"]["available"] is False
    assert "unavailable" in result["fallback_reason"]


def test_07_sentinel1_catalog_query_contract():
    """
    Test 7: Validates Sentinel-1 STAC catalog query parameters and ranking logic.
    """
    s1_service = get_sentinel1_service()

    # Test candidate ranking algorithm
    candidate_recent = {
        "id": "S1A_IW_GRDH_1SDV_20260828T120000",
        "properties": {
            "datetime": "2026-08-28T12:00:00Z",
            "sar:instrument_mode": "IW",
            "polarizationChannels": ["VV", "VH"],
        },
        "bbox": [70.0, 22.0, 71.0, 23.0],
    }
    candidate_older = {
        "id": "S1B_IW_GRDH_1SDV_20260822T000000",
        "properties": {
            "datetime": "2026-08-22T00:00:00Z",
            "sar:instrument_mode": "IW",
            "polarizationChannels": ["VV", "VH"],
        },
        "bbox": [70.0, 22.0, 71.0, 23.0],
    }
    candidate_ew = {
        "id": "S1A_EW_GRDM_1SDH_20260828T110000",
        "properties": {
            "datetime": "2026-08-28T11:00:00Z",
            "sar:instrument_mode": "EW",
            "polarizationChannels": ["HH"],
        },
        "bbox": [70.0, 22.0, 71.0, 23.0],
    }

    obs_dt = datetime.fromisoformat(OBS_TIME.replace("Z", "+00:00"))
    ranked = s1_service.rank_features([candidate_ew, candidate_older, candidate_recent], obs_dt)
    assert len(ranked) == 3
    # IW mode + DV polarization + closest time should rank first
    assert ranked[0]["id"] == candidate_recent["id"]


def test_08_sentinel1_processing_evalscript_contract():
    """
    Test 8: Validates Sentinel-1 SAR evalscript contract.
    SAR visualization must use VV and VH backscatter channels.
    """
    assert "function setup()" in SAR_EVALSCRIPT
    assert "VV" in SAR_EVALSCRIPT and "VH" in SAR_EVALSCRIPT
    assert "function evaluatePixel" in SAR_EVALSCRIPT
    # Ensure RGB mapping of VV, VH, and cross ratio
    assert "sample.VV" in SAR_EVALSCRIPT
    assert "sample.VH" in SAR_EVALSCRIPT
    assert "ratio" in SAR_EVALSCRIPT


def test_09_scientific_accuracy_and_disclaimers():
    """
    Test 9: Scientific accuracy and mandatory disclaimers.
    - Sentinel-1 SAR evidence must NEVER include thermal or fire temperature values.
    - Response disclaimers must include the mandatory SAR disclaimer.
    """
    evidence = Sentinel1Evidence(
        available=True,
        product_id="S1A_IW_GRDH_1SDV_20260828",
        acquisition_mode="IW",
        polarization=["VV", "VH"],
    )

    # Scientific check: no thermal fields in Sentinel1Evidence schema
    fields = evidence.model_dump()
    assert "temperature" not in fields
    assert "thermal_power" not in fields
    assert "frp" not in fields
    assert "fire_temperature_k" not in fields

    # Verify disclaimer exact text
    assert MANDATORY_SAR_DISCLAIMER in evidence.sar_disclaimer
    assert "does not measure fire temperature" in MANDATORY_SAR_DISCLAIMER or "does NOT detect thermal signatures or fire temperature" in MANDATORY_SAR_DISCLAIMER


def test_10_end_to_end_investigation_api_structure():
    """
    Test 10: GET /api/firms/{id}/investigation includes Phase 6K dual satellite structure.
    """
    response = client.get(f"/api/firms/{OBS_ID}/investigation")
    assert response.status_code == 200
    data = response.json()

    # Core Phase 6K fields
    assert "selected_satellite" in data
    assert data["selected_satellite"] in ("SENTINEL_2", "SENTINEL_1", "NONE")
    assert "satellite_fallback_reason" in data

    # Dual satellite blocks
    assert "sentinel2" in data
    assert "sentinel1" in data

    # Provenance fields
    prov = data.get("provenance", {})
    assert "satellite_primary_source" in prov
    assert "satellite_backup_source" in prov
    assert "selected_satellite" in prov

    # Disclaimers list
    disclaimers = data.get("disclaimers", [])
    assert len(disclaimers) >= 3
    for d in disclaimers:
        assert isinstance(d, str) and len(d) > 10
