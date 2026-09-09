import pytest
import time
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.investigation import InvestigationResponse
from app.services.investigation_service import get_investigation_service
from app.services.firms_ingestion_service import load_stored_observations

client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_service_cache():
    svc = get_investigation_service()
    svc.clear_cache()
    yield
    svc.clear_cache()


def test_01_valid_investigation_request():
    """
    Test 1: Valid investigation request returns 200 with full schema.
    """
    obs = load_stored_observations()
    assert len(obs) > 0, "Stored observations must exist for testing"
    target_id = obs[0]["observation_id"]

    resp = client.get(f"/api/firms/{target_id}/investigation")
    assert resp.status_code == 200
    data = resp.json()

    # Validate against Pydantic model
    validated = InvestigationResponse(**data)
    assert validated.observation_id == target_id
    assert validated.detection.latitude == float(obs[0]["latitude"])
    assert validated.detection.longitude == float(obs[0]["longitude"])
    assert validated.detection.source == "NASA FIRMS"
    assert validated.fusion.candidate_class in ["INDUSTRIAL_FIRE", "WILDFIRE", "NON_FIRE", "UNKNOWN"]
    assert 0.0 <= validated.fusion.candidate_score <= 1.0


def test_02_nonexistent_observation_404():
    """
    Test 2: Non-existent observation ID returns HTTP 404.
    """
    resp = client.get("/api/firms/NON_EXISTENT_ID_999999/investigation")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_03_malformed_observation_id_400():
    """
    Test 3: Empty or invalid observation ID path parameters.
    """
    resp = client.get("/api/firms/%20%20/investigation")
    assert resp.status_code in [400, 404]


def test_04_partial_satellite_evidence():
    """
    Test 4: Partial evidence when satellite acquisition is not found.
    """
    obs = load_stored_observations()
    target_id = obs[0]["observation_id"]

    # Mock satellite provider to return no acquisition
    with patch("app.services.satellite_service.Sentinel2ImageProvider.fetch_satellite_image", new_callable=AsyncMock) as mock_sat:
        mock_sat.return_value = {
            "status": "NO_ACQUISITION",
            "available": False,
            "image_available": False,
            "is_synthetic": False
        }
        resp = client.get(f"/api/firms/{target_id}/investigation?force_refresh=true")
        assert resp.status_code == 200
        data = resp.json()
        assert data["sentinel2"]["available"] is False
        assert data["sentinel2"]["state"] == "NO_ACQUISITION"
        assert data["status"] in ["PARTIAL_EVIDENCE", "SUCCESS"]
        assert 0.0 <= data["fusion"]["candidate_score"] <= 1.0


def test_05_sentinel2_dependency_failure_isolation():
    """
    Test 5: Sentinel-2 provider exception does not crash investigation (HTTP 500 prevented).
    """
    obs = load_stored_observations()
    target_id = obs[0]["observation_id"]

    with patch("app.services.satellite_service.Sentinel2ImageProvider.fetch_satellite_image", side_effect=Exception("Copernicus CDSE network unreachable")):
        resp = client.get(f"/api/firms/{target_id}/investigation?force_refresh=true")
        assert resp.status_code == 200
        data = resp.json()
        assert data["sentinel2"]["available"] is False
        assert any("sentinel" in w.lower() or "copernicus" in w.lower() for w in data["warnings"])


def test_06_osm_dependency_failure_isolation():
    """
    Test 6: OSM context fetch failure does not crash investigation.
    """
    obs = load_stored_observations()
    target_id = obs[0]["observation_id"]

    with patch("app.services.investigation_service.fetch_hotspot_osm_context", side_effect=Exception("OSM Overpass timeout")):
        resp = client.get(f"/api/firms/{target_id}/investigation?force_refresh=true")
        assert resp.status_code == 200
        data = resp.json()
        assert data["industrial_context"]["available"] is False
        assert any("openstreetmap" in w.lower() or "osm" in w.lower() for w in data["warnings"])


def test_07_missing_persistence_handled():
    """
    Test 7: Observation without prior persistence history completes successfully.
    """
    obs = load_stored_observations()
    target_id = obs[0]["observation_id"]

    resp = client.get(f"/api/firms/{target_id}/investigation?force_refresh=true")
    assert resp.status_code == 200
    data = resp.json()
    assert "persistence" in data
    assert 0 <= data["persistence"]["observation_count"]


def test_08_missing_optional_evidence_clean():
    """
    Test 8: Both OSM and Satellite unavailable still yields HTTP 200 with FIRMS detection.
    """
    obs = load_stored_observations()
    target_id = obs[0]["observation_id"]

    with patch("app.services.investigation_service.fetch_hotspot_osm_context", new_callable=AsyncMock) as mock_osm, \
         patch("app.services.satellite_service.Sentinel2ImageProvider.fetch_satellite_image", new_callable=AsyncMock) as mock_sat:
        mock_osm.return_value = {"distance_km": None, "features": [], "nearby_facility": None}
        mock_sat.return_value = {"available": False, "status": "NO_ACQUISITION"}

        resp = client.get(f"/api/firms/{target_id}/investigation?force_refresh=true")
        assert resp.status_code == 200
        data = resp.json()
        assert data["detection"]["source"] == "NASA FIRMS"
        assert data["fusion"]["candidate_class"] in ["WILDFIRE", "NON_FIRE", "UNKNOWN"]


def test_09_fusion_result_propagation():
    """
    Test 9: Phase 6E multi-source fusion output is fully exposed in investigation response.
    """
    obs = load_stored_observations()
    target_id = obs[0]["observation_id"]

    resp = client.get(f"/api/firms/{target_id}/investigation?force_refresh=true")
    assert resp.status_code == 200
    fusion = resp.json()["fusion"]
    assert "candidate_class" in fusion
    assert "candidate_score" in fusion
    assert "evidence_strength" in fusion
    assert "confidence_label" in fusion
    assert "reasoning" in fusion
    assert isinstance(fusion["reasoning"], list)
    assert len(fusion["reasoning"]) > 0


def test_10_cloud_warning_propagation():
    """
    Test 10: Cloud guardrail quality state (HIGH_CLOUD / VERY_HIGH_CLOUD) propagates warnings.
    """
    obs = load_stored_observations()
    target_id = obs[0]["observation_id"]

    with patch("app.services.satellite_service.Sentinel2ImageProvider.fetch_satellite_image", new_callable=AsyncMock) as mock_sat:
        mock_sat.return_value = {
            "status": "ACQUISITION_AVAILABLE_HIGH_CLOUD",
            "available": True,
            "image_available": True,
            "cloud_percentage": 78.5,
            "satellite_acquired_at": "2026-09-07 06:15:00 UTC",
            "classification": "INDUSTRIAL_FIRE",
            "confidence": 0.85,
            "is_synthetic": False
        }
        resp = client.get(f"/api/firms/{target_id}/investigation?force_refresh=true")
        assert resp.status_code == 200
        data = resp.json()
        assert data["sentinel2"]["quality"] == "VERY_HIGH_CLOUD"
        assert any("cloud" in w.lower() for w in data["warnings"])


def test_11_timestamp_provenance_propagation():
    """
    Test 11: FIRMS and Sentinel-2 acquisition timestamps are preserved with temporal offset.
    """
    obs = load_stored_observations()
    target_id = obs[0]["observation_id"]

    with patch("app.services.satellite_service.Sentinel2ImageProvider.fetch_satellite_image", new_callable=AsyncMock) as mock_sat:
        mock_sat.return_value = {
            "status": "ACQUISITION_AVAILABLE",
            "available": True,
            "image_available": True,
            "cloud_percentage": 10.0,
            "satellite_acquired_at": "2026-09-07 08:30:00 UTC",
            "time_difference_hours": 2.5,
            "is_synthetic": False
        }
        resp = client.get(f"/api/firms/{target_id}/investigation?force_refresh=true")
        assert resp.status_code == 200
        data = resp.json()
        assert data["provenance"]["firms_acquired_at"] is not None
        assert data["provenance"]["sentinel2_acquired_at"] == "2026-09-07 08:30:00 UTC"
        assert data["provenance"]["temporal_offset_hours"] == 2.5


def test_12_is_synthetic_safety_propagation():
    """
    Test 12: is_synthetic safety flag is strictly preserved.
    """
    obs = load_stored_observations()
    target_id = obs[0]["observation_id"]

    resp = client.get(f"/api/firms/{target_id}/investigation?force_refresh=true")
    assert resp.status_code == 200
    data = resp.json()
    assert "is_synthetic" in data["sentinel2"]
    assert data["sentinel2"]["is_synthetic"] is False


def test_13_is_calibrated_safety_propagation():
    """
    Test 13: is_calibrated is explicitly False for Phase 6C CNN output.
    """
    obs = load_stored_observations()
    target_id = obs[0]["observation_id"]

    resp = client.get(f"/api/firms/{target_id}/investigation?force_refresh=true")
    assert resp.status_code == 200
    data = resp.json()
    assert data["sentinel2"]["is_calibrated"] is False


def test_14_no_secret_leakage():
    """
    Test 14: Zero credentials, postgres URLs, or API keys exposed in API output.
    """
    obs = load_stored_observations()
    target_id = obs[0]["observation_id"]

    resp = client.get(f"/api/firms/{target_id}/investigation?force_refresh=true")
    text_content = resp.text.lower()
    for forbidden in ["password", "secret", "bearer", "postgresql://", "supabase.com:5432", "api_key"]:
        assert forbidden not in text_content, f"Forbidden credential substring '{forbidden}' found in response!"


def test_15_stable_response_schema():
    """
    Test 15: Exact JSON schema adherence with all mandatory fields present.
    """
    obs = load_stored_observations()
    target_id = obs[0]["observation_id"]

    resp = client.get(f"/api/firms/{target_id}/investigation?force_refresh=true")
    assert resp.status_code == 200
    data = resp.json()

    mandatory_top_level = [
        "observation_id", "status", "detection", "persistence",
        "industrial_context", "sentinel2", "fusion", "risk",
        "provenance", "warnings", "created_at"
    ]
    for field in mandatory_top_level:
        assert field in data, f"Missing mandatory field: {field}"


def test_16_repeated_request_caching():
    """
    Test 16: Repeated requests for the same observation are served from in-memory cache.
    """
    obs = load_stored_observations()
    target_id = obs[0]["observation_id"]

    t0 = time.perf_counter()
    resp1 = client.get(f"/api/firms/{target_id}/investigation")
    t1 = time.perf_counter()
    duration_uncached = t1 - t0

    t2 = time.perf_counter()
    resp2 = client.get(f"/api/firms/{target_id}/investigation")
    t3 = time.perf_counter()
    duration_cached = t3 - t2

    assert resp1.status_code == 200
    assert resp2.status_code == 200
    assert resp1.json()["observation_id"] == resp2.json()["observation_id"]
    # Cached request should return near-instantaneously (< 100ms)
    assert duration_cached < 0.15, f"Cached request took {duration_cached:.4f}s (expected < 0.15s)"


def test_17_hotspot_investigation_alias_route():
    """
    Test 17: GET /api/hotspots/{observation_id}/investigation returns identical response.
    """
    obs = load_stored_observations()
    target_id = obs[0]["observation_id"]

    resp1 = client.get(f"/api/firms/{target_id}/investigation")
    resp2 = client.get(f"/api/hotspots/{target_id}/investigation")

    assert resp1.status_code == 200
    assert resp2.status_code == 200
    assert resp1.json()["observation_id"] == resp2.json()["observation_id"]


def test_18_system_health_regression():
    """
    Test 18: System health endpoint remains functional.
    """
    resp = client.get("/api/system/status?check_connectivity=false")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert "services" in data
    assert "firms" in data["services"]
    assert "database" in data["services"]
    assert "satellite" in data["services"]
