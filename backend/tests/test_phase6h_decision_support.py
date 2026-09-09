import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app
from app.services.decision_support_service import get_decision_support_service

client = TestClient(app)

SAMPLE_OBS_ID = "423f0b1ad50facd6"


@pytest.fixture(autouse=True)
def clear_caches():
    get_decision_support_service().clear_cache()
    yield
    get_decision_support_service().clear_cache()


def test_01_valid_decision_support_request():
    """Test 1: Valid observation ID returns complete HTTP 200 decision support response."""
    resp = client.get(f"/api/firms/{SAMPLE_OBS_ID}/decision-support")
    assert resp.status_code == 200
    data = resp.json()

    assert data["observation_id"] == SAMPLE_OBS_ID
    assert "status" in data
    assert "summary" in data
    assert "investigation" in data
    assert "priority" in data
    assert "threat_zone" in data
    assert "asset_exposure" in data
    assert "impact" in data
    assert "future_impact" in data
    assert "recommended_actions" in data
    assert "provenance" in data
    assert "warnings" in data
    assert "disclaimers" in data


def test_02_nonexistent_observation_404():
    """Test 2: Non-existent observation ID returns HTTP 404."""
    resp = client.get("/api/firms/nonexistent_obs_99999/decision-support")
    assert resp.status_code == 404
    data = resp.json()
    assert "detail" in data


def test_03_malformed_observation_id_400():
    """Test 3: Empty/whitespace observation ID returns HTTP 400."""
    resp = client.get("/api/firms/%20%20/decision-support")
    assert resp.status_code == 400


def test_04_priority_calculation_and_explainability():
    """Test 4: Priority score (0-100), index (P1-P4), contributing factors, and explainable reasons."""
    resp = client.get(f"/api/firms/{SAMPLE_OBS_ID}/decision-support")
    assert resp.status_code == 200
    p = resp.json()["priority"]

    assert 0.0 <= p["priority_score"] <= 100.0
    assert p["priority_index"] in ["P1", "P2", "P3", "P4"]
    assert p["priority_level"] in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
    assert len(p["contributing_factors"]) > 0
    assert len(p["reasons"]) > 0


def test_05_threat_zones_structure_and_radii():
    """Test 5: Multi-tier dynamic threat zones (inner, secondary, monitoring) are calculated."""
    resp = client.get(f"/api/firms/{SAMPLE_OBS_ID}/decision-support")
    assert resp.status_code == 200
    tz = resp.json()["threat_zone"]

    assert tz["available"] is True
    assert "inner_zone" in tz["zones"]
    assert "secondary_zone" in tz["zones"]
    assert "monitoring_zone" in tz["zones"]
    assert tz["zones"]["inner_zone"]["radius_km"] > 0
    assert tz["zones"]["secondary_zone"]["radius_km"] >= tz["zones"]["inner_zone"]["radius_km"]


def test_06_threat_zones_failure_isolation():
    """Test 6: Exception in threat zone calculation does not crash endpoint (returns 200 with partial evidence)."""
    with patch("app.services.decision_support_service.calculate_threat_zones", side_effect=RuntimeError("Geometry engine crashed")):
        resp = client.get(f"/api/firms/{SAMPLE_OBS_ID}/decision-support")
        assert resp.status_code == 200
        data = resp.json()
        assert data["threat_zone"]["available"] is False
        assert any("Threat zone dynamic calculation degraded" in w for w in data["warnings"])


def test_07_asset_exposure_categorization():
    """Test 7: Asset exposure categorizes infrastructure nodes and reports critical counts."""
    resp = client.get(f"/api/firms/{SAMPLE_OBS_ID}/decision-support")
    assert resp.status_code == 200
    ae = resp.json()["asset_exposure"]

    assert ae["available"] is True
    assert ae["total_exposed_assets"] >= 0
    assert ae["critical_infrastructure_count"] >= 0
    assert isinstance(ae["exposed_assets"], list)


def test_08_asset_exposure_failure_isolation():
    """Test 8: Exception in asset exposure does not fail request with HTTP 500."""
    with patch("app.services.decision_support_service.analyze_asset_exposure", side_effect=Exception("Spatial tree error")):
        resp = client.get(f"/api/firms/{SAMPLE_OBS_ID}/decision-support")
        assert resp.status_code == 200
        data = resp.json()
        assert data["asset_exposure"]["available"] is False
        assert any("Asset exposure evaluation degraded" in w for w in data["warnings"])


def test_09_impact_assessment_scoring():
    """Test 9: Impact assessment returns score (0-100), level, and summary."""
    resp = client.get(f"/api/firms/{SAMPLE_OBS_ID}/decision-support")
    assert resp.status_code == 200
    imp = resp.json()["impact"]

    assert imp["available"] is True
    assert 0.0 <= imp["impact_score"] <= 100.0
    assert imp["impact_level"] in ["CRITICAL", "HIGH", "MODERATE", "LOW"]


def test_10_future_impact_projections():
    """Test 10: Future impact projections include time-series horizons (NOW, +1H, etc.)."""
    resp = client.get(f"/api/firms/{SAMPLE_OBS_ID}/decision-support")
    assert resp.status_code == 200
    fi = resp.json()["future_impact"]

    if fi["available"]:
        assert isinstance(fi["projections"], dict)
        assert "disclaimer" in fi
        assert "Forward-looking" in fi["disclaimer"]


def test_11_future_impact_timeout_isolation():
    """Test 11: Future impact timeout is gracefully caught without failing request."""
    with patch("app.services.decision_support_service.calculate_future_impact_forecast", side_effect=Exception("Simulation Timeout")):
        resp = client.get(f"/api/firms/{SAMPLE_OBS_ID}/decision-support")
        assert resp.status_code == 200
        data = resp.json()
        assert data["future_impact"]["available"] is False


def test_12_recommended_actions_generation():
    """Test 12: Context-aware recommended operational actions are generated."""
    resp = client.get(f"/api/firms/{SAMPLE_OBS_ID}/decision-support")
    assert resp.status_code == 200
    actions = resp.json()["recommended_actions"]

    assert isinstance(actions, list)
    assert len(actions) > 0
    for act in actions:
        assert "action_id" in act
        assert "title" in act
        assert "category" in act
        assert "priority" in act
        assert "rationale" in act


def test_13_incident_summary_synthesis():
    """Test 13: Executive operational summary is synthesized."""
    resp = client.get(f"/api/firms/{SAMPLE_OBS_ID}/decision-support")
    assert resp.status_code == 200
    s = resp.json()["summary"]

    assert "candidate_class" in s
    assert "evidence_strength" in s
    assert "risk_level" in s
    assert "priority_level" in s
    assert "recommended_action" in s


def test_14_decision_provenance_and_timestamps():
    """Test 14: Provenance contains complete audit timestamps."""
    resp = client.get(f"/api/firms/{SAMPLE_OBS_ID}/decision-support")
    assert resp.status_code == 200
    prov = resp.json()["provenance"]

    assert prov["observation_id"] == SAMPLE_OBS_ID
    assert "investigated_at" in prov
    assert "threat_zone_calculated_at" in prov
    assert "priority_evaluated_at" in prov
    assert "decision_support_generated_at" in prov


def test_15_safety_flags_and_disclaimers():
    """Test 15: Safety flags is_synthetic=False, is_calibrated=False, and mandatory disclaimers preserved."""
    resp = client.get(f"/api/firms/{SAMPLE_OBS_ID}/decision-support")
    assert resp.status_code == 200
    data = resp.json()

    assert data["investigation"]["sentinel2"]["is_synthetic"] is False
    assert data["investigation"]["sentinel2"]["is_calibrated"] is False
    assert len(data["disclaimers"]) >= 3
    assert any("AI Candidate Classification is an evidence-fusion output" in d for d in data["disclaimers"])
    assert any("Sentinel-2 imagery is optical evidence" in d for d in data["disclaimers"])
    assert any("Dynamic threat zones" in d for d in data["disclaimers"])


def test_16_repeated_request_caching():
    """Test 16: Second call uses cache and returns identical result."""
    resp1 = client.get(f"/api/firms/{SAMPLE_OBS_ID}/decision-support")
    resp2 = client.get(f"/api/firms/{SAMPLE_OBS_ID}/decision-support")
    assert resp1.status_code == 200
    assert resp2.status_code == 200
    assert resp1.json()["created_at"] == resp2.json()["created_at"]


def test_17_hotspots_alias_route():
    """Test 17: GET /api/hotspots/{id}/decision-support alias works."""
    resp = client.get(f"/api/hotspots/{SAMPLE_OBS_ID}/decision-support")
    assert resp.status_code == 200
    assert resp.json()["observation_id"] == SAMPLE_OBS_ID
