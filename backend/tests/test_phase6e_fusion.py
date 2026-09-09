import pytest
import math
from app.services.evidence_fusion_service import (
    EvidenceFusionService,
    get_evidence_fusion_service,
    normalize_firms_thermal,
    normalize_persistence,
    normalize_industrial_context,
    assess_sentinel2_cloud_quality,
    fuse_thermal_evidence
)


@pytest.fixture
def fusion_service():
    return EvidenceFusionService()


def test_01_strong_industrial_fire(fusion_service):
    """
    Test Case 1: Strong Industrial Fire Alignment
    FIRMS strong + persistence strong + OSM industrial + S2 INDUSTRIAL_FIRE + low cloud (<30%)
    """
    evidence = fusion_service.assemble_evidence_object(
        observation_id="OBS_IND_01",
        firms_data={"frp": 65.0, "brightness": 395.0, "confidence": "high", "acquired_at": "2026-08-25 04:30 UTC"},
        persistence_data={"score": 85.0, "observation_count": 6, "duration_hours": 22.0},
        osm_data={"distance_km": 0.25, "nearby_facility": "Petrochemical Refinery Complex"},
        satellite_data={
            "available": True,
            "classification": "INDUSTRIAL_FIRE",
            "confidence": 0.98,
            "cloud_cover": 12.0,
            "satellite_acquired_at": "2026-08-25 05:22 UTC",
            "is_synthetic": False
        }
    )

    result = fusion_service.fuse(evidence)

    assert result["candidate_class"] == "INDUSTRIAL_FIRE"
    assert result["candidate_score"] >= 0.75
    assert result["evidence_strength"] in ["STRONG", "MODERATE"]
    assert result["confidence_label"] in ["HIGH", "MEDIUM"]
    assert len(result["reasoning"]) >= 3
    assert len(result["warnings"]) == 0
    assert "NASA FIRMS" in result["sources"]
    assert "OpenStreetMap Geospatial Context" in result["sources"]
    assert "Copernicus Sentinel-2 Multispectral" in result["sources"]
    assert result["sentinel2"]["is_calibrated"] is False


def test_02_wildfire_candidate(fusion_service):
    """
    Test Case 2: Wildfire Alignment
    FIRMS strong + OSM non-industrial (>5km) + S2 WILDFIRE
    """
    evidence = fusion_service.assemble_evidence_object(
        observation_id="OBS_WILD_01",
        firms_data={"frp": 85.0, "brightness": 410.0, "confidence": "high"},
        persistence_data={"score": 15.0, "observation_count": 1, "duration_hours": 1.0},
        osm_data={"distance_km": 8.5, "nearby_facility": None},
        satellite_data={
            "available": True,
            "classification": "WILDFIRE",
            "confidence": 0.96,
            "cloud_cover": 15.0,
            "is_synthetic": False
        }
    )

    result = fusion_service.fuse(evidence)

    assert result["candidate_class"] == "WILDFIRE"
    assert result["candidate_score"] >= 0.65
    assert result["evidence_strength"] in ["STRONG", "MODERATE"]
    assert result["sentinel2"]["class"] == "WILDFIRE"


def test_03_non_fire_candidate(fusion_service):
    """
    Test Case 3: Non-Fire Candidate
    FIRMS weak (<10 MW, 305K) + S2 NON_FIRE
    """
    evidence = fusion_service.assemble_evidence_object(
        observation_id="OBS_NON_01",
        firms_data={"frp": 2.0, "brightness": 305.0, "confidence": "low"},
        persistence_data={"score": 5.0, "observation_count": 1, "duration_hours": 0.5},
        osm_data={"distance_km": None},
        satellite_data={
            "available": True,
            "classification": "NON_FIRE",
            "confidence": 0.95,
            "cloud_cover": 5.0,
            "is_synthetic": False
        }
    )

    result = fusion_service.fuse(evidence)

    assert result["candidate_class"] == "NON_FIRE"
    assert 0.0 <= result["candidate_score"] <= 1.0


def test_04_high_cloud_guardrail(fusion_service):
    """
    Test Case 4: High Cloud (50% <= cloud < 70%)
    S2 evidence marked HIGH_CLOUD and contribution discounted
    """
    evidence = fusion_service.assemble_evidence_object(
        observation_id="OBS_CLOUD_55",
        firms_data={"frp": 45.0, "brightness": 360.0, "confidence": "nominal"},
        persistence_data={"score": 50.0},
        osm_data={"distance_km": 1.2, "nearby_facility": "Industrial Shed"},
        satellite_data={
            "available": True,
            "classification": "INDUSTRIAL_FIRE",
            "confidence": 0.90,
            "cloud_cover": 58.0,
            "is_synthetic": False
        }
    )

    result = fusion_service.fuse(evidence)

    assert result["sentinel2"]["quality"] == "HIGH_CLOUD"
    assert any("downgraded" in w.lower() or "cloud cover is 58" in w.lower() for w in result["warnings"])
    contrib_s2 = result["contributing_evidence"]["sentinel2_vision"]
    assert contrib_s2["cloud_multiplier"] == 0.40


def test_05_very_high_cloud_guardrail(fusion_service):
    """
    Test Case 5: Very High Cloud (cloud >= 70%)
    Strongly down-weighted, cannot confirm industrial fire alone without OSM
    """
    evidence = fusion_service.assemble_evidence_object(
        observation_id="OBS_CLOUD_88",
        firms_data={"frp": 30.0, "brightness": 340.0, "confidence": "nominal"},
        persistence_data={"score": 20.0},
        osm_data={"distance_km": None},  # No industrial OSM
        satellite_data={
            "available": True,
            "classification": "INDUSTRIAL_FIRE",
            "confidence": 0.92,
            "cloud_cover": 88.0,
            "is_synthetic": False
        }
    )

    result = fusion_service.fuse(evidence)

    assert result["sentinel2"]["quality"] == "VERY_HIGH_CLOUD"
    assert result["candidate_class"] != "INDUSTRIAL_FIRE" or result["evidence_strength"] == "WEAK"
    assert any("obscured" in w.lower() or "cloud" in w.lower() for w in result["warnings"])
    assert result["contributing_evidence"]["sentinel2_vision"]["cloud_multiplier"] == 0.15


def test_06_no_sentinel2_acquisition(fusion_service):
    """
    Test Case 6: No Sentinel-2 Acquisition
    satellite.available = false, fusion continues with FIRMS + persistence + OSM
    """
    evidence = fusion_service.assemble_evidence_object(
        observation_id="OBS_NO_SAT",
        firms_data={"frp": 55.0, "brightness": 380.0, "confidence": "high"},
        persistence_data={"score": 75.0, "duration_hours": 15.0},
        osm_data={"distance_km": 0.4, "nearby_facility": "Chemical Manufacturing Plant"},
        satellite_data={"available": False}
    )

    result = fusion_service.fuse(evidence)

    assert result["sentinel2"]["available"] is False
    assert result["candidate_class"] == "INDUSTRIAL_FIRE"
    assert result["contributing_evidence"]["sentinel2_vision"]["active_weight"] == 0.0
    assert any("unavailable" in r.lower() for r in result["reasoning"])


def test_07_conflicting_evidence_wildfire_vs_industrial_osm(fusion_service):
    """
    Test Case 7: Conflicting Evidence (Industrial OSM vs S2 WILDFIRE)
    """
    evidence = fusion_service.assemble_evidence_object(
        observation_id="OBS_CONFLICT",
        firms_data={"frp": 70.0, "brightness": 390.0, "confidence": "high"},
        persistence_data={"score": 20.0},
        osm_data={"distance_km": 0.3, "nearby_facility": "Power Substation"},
        satellite_data={
            "available": True,
            "classification": "WILDFIRE",
            "confidence": 0.95,
            "cloud_cover": 10.0,
            "is_synthetic": False
        }
    )

    result = fusion_service.fuse(evidence)

    assert any("conflicting" in w.lower() for w in result["warnings"])
    assert result["candidate_class"] == "WILDFIRE"
    assert result["evidence_strength"] == "MODERATE"


def test_08_missing_osm_evidence(fusion_service):
    """
    Test Case 8: Missing OSM Evidence
    """
    evidence = fusion_service.assemble_evidence_object(
        observation_id="OBS_NO_OSM",
        firms_data={"frp": 50.0, "brightness": 370.0, "confidence": "high"},
        persistence_data={"score": 40.0},
        osm_data=None,
        satellite_data={
            "available": True,
            "classification": "WILDFIRE",
            "confidence": 0.90,
            "cloud_cover": 15.0
        }
    )

    result = fusion_service.fuse(evidence)
    assert result["industrial_context"]["available"] is False
    assert result["candidate_class"] in ["WILDFIRE", "UNKNOWN"]
    assert 0.0 <= result["candidate_score"] <= 1.0


def test_09_missing_persistence(fusion_service):
    """
    Test Case 9: Missing Persistence Evidence
    """
    evidence = fusion_service.assemble_evidence_object(
        observation_id="OBS_NO_PERS",
        firms_data={"frp": 40.0, "brightness": 350.0, "confidence": "nominal"},
        persistence_data=None,
        osm_data={"distance_km": 0.5, "nearby_facility": "Steel Mill"},
        satellite_data=None
    )

    result = fusion_service.fuse(evidence)
    assert result["persistence"]["available"] is False
    assert 0.0 <= result["candidate_score"] <= 1.0


def test_10_all_optional_evidence_unavailable(fusion_service):
    """
    Test Case 10: All Optional Evidence Unavailable (FIRMS only)
    """
    evidence = fusion_service.assemble_evidence_object(
        observation_id="OBS_ONLY_FIRMS",
        firms_data={"frp": 35.0, "brightness": 345.0, "confidence": "nominal"},
        persistence_data=None,
        osm_data=None,
        satellite_data=None
    )

    result = fusion_service.fuse(evidence)
    assert result["firms"]["available"] is True
    assert result["persistence"]["available"] is False
    assert result["industrial_context"]["available"] is False
    assert result["sentinel2"]["available"] is False
    assert 0.0 <= result["candidate_score"] <= 1.0


def test_11_unknown_insufficient_evidence(fusion_service):
    """
    Test Case 11: Complete Lack of Evidence -> UNKNOWN
    """
    evidence = fusion_service.assemble_evidence_object(
        observation_id="OBS_EMPTY",
        firms_data=None,
        persistence_data=None,
        osm_data=None,
        satellite_data=None
    )

    result = fusion_service.fuse(evidence)
    assert result["candidate_class"] == "UNKNOWN"
    assert result["candidate_score"] == 0.0
    assert result["evidence_strength"] == "INSUFFICIENT"


def test_12_score_bounded_zero_to_one(fusion_service):
    """
    Test Case 12, 13, 14: Score always remains in [0, 1], non-negative, and no NaN/Inf
    """
    for frp in [-10.0, 0.0, 50.0, 500.0]:
        for dist in [None, -5.0, 0.0, 0.2, 5.0, 50.0]:
            for cloud in [0.0, 25.0, 55.0, 85.0, 100.0]:
                evidence = fusion_service.assemble_evidence_object(
                    observation_id="OBS_BOUND",
                    firms_data={"frp": frp, "brightness": 350.0},
                    persistence_data={"score": 50.0},
                    osm_data={"distance_km": dist},
                    satellite_data={"available": True, "classification": "INDUSTRIAL_FIRE", "confidence": 0.8, "cloud_cover": cloud}
                )
                res = fusion_service.fuse(evidence)
                score = res["candidate_score"]
                assert not math.isnan(score)
                assert not math.isinf(score)
                assert 0.0 <= score <= 1.0


def test_15_is_calibrated_remains_false(fusion_service):
    """
    Test Case 15: is_calibrated remains false
    """
    evidence = fusion_service.assemble_evidence_object(
        observation_id="OBS_CALIB",
        satellite_data={"available": True, "classification": "WILDFIRE", "confidence": 0.99}
    )
    result = fusion_service.fuse(evidence)
    assert result["sentinel2"]["is_calibrated"] is False


def test_16_synthetic_imagery_excluded(fusion_service):
    """
    Test Case 16: Synthetic imagery cannot be treated as genuine satellite evidence
    """
    evidence = fusion_service.assemble_evidence_object(
        observation_id="OBS_SYNTH",
        firms_data={"frp": 20.0, "brightness": 330.0},
        satellite_data={
            "available": True,
            "classification": "INDUSTRIAL_FIRE",
            "confidence": 0.99,
            "cloud_cover": 5.0,
            "is_synthetic": True
        }
    )
    result = fusion_service.fuse(evidence)
    assert any("synthetic" in w.lower() for w in result["warnings"])
    assert result["contributing_evidence"]["sentinel2_vision"]["active_weight"] == 0.0


def test_17_timestamp_provenance_preserved(fusion_service):
    """
    Test Case 17: Timestamp provenance is preserved across sources
    """
    evidence = fusion_service.assemble_evidence_object(
        observation_id="OBS_TIME",
        firms_data={"frp": 45.0, "brightness": 360.0, "acquired_at": "2026-08-25 04:30 UTC"},
        satellite_data={
            "available": True,
            "classification": "INDUSTRIAL_FIRE",
            "confidence": 0.90,
            "satellite_acquired_at": "2026-08-25 05:22 UTC",
            "time_difference_hours": 0.87,
            "cloud_cover": 18.0
        }
    )
    result = fusion_service.fuse(evidence)
    assert result["firms"]["acquired_at"] == "2026-08-25 04:30 UTC"
    assert result["sentinel2"]["satellite_acquired_at"] == "2026-08-25 05:22 UTC"
    assert any("2026-08-25 04:30 UTC" in s for s in result["sources"])
    assert any("2026-08-25 05:22 UTC" in s for s in result["sources"])


def test_legacy_fuse_thermal_evidence_compatibility():
    """
    Test that legacy fuse_thermal_evidence adapter continues to return expected format.
    """
    spot = {
        "observation_id": "OBS_LEGACY",
        "frp": 45.0,
        "brightness": 360.0,
        "confidence": "high",
        "persistence_score": 70.0,
        "observation_count": 4,
        "duration_hours": 12.0
    }
    osm_ctx = {
        "context_classification": "INDUSTRIAL",
        "nearby_facility": "Gas Bottling Plant",
        "distance_km": 0.4
    }
    ai_class = {"classification": "INDUSTRIAL_FIRE_CANDIDATE", "confidence_percentage": 85}
    risk_res = {"risk_score": 80, "risk_level": "HIGH"}

    res = fuse_thermal_evidence(spot, osm_context=osm_ctx, ai_classification=ai_class, risk_result=risk_res)

    assert "final_classification" in res
    assert "combined_confidence" in res
    assert "combined_confidence_percentage" in res
    assert "combined_risk_score" in res
    assert "phase6e_fusion" in res
    assert res["phase6e_fusion"]["candidate_class"] == "INDUSTRIAL_FIRE"


def test_api_hotspot_fusion_endpoint():
    """
    Test GET and POST /api/hotspots/{observation_id}/fusion endpoints.
    """
    from fastapi.testclient import TestClient
    from app.main import app
    client = TestClient(app)

    # 1. Non-existent observation returns 404
    resp = client.get("/api/hotspots/NON_EXISTENT_OBS_ID_99999/fusion")
    assert resp.status_code == 404

    # 2. Existing observation returns 200 with Phase 6E fusion structure
    from app.services.firms_ingestion_service import load_stored_observations
    obs = load_stored_observations()
    if obs:
        target_id = obs[0].get("observation_id")
        resp = client.get(f"/api/hotspots/{target_id}/fusion")
        assert resp.status_code == 200
        data = resp.json()
        assert data["observation_id"] == target_id
        assert "candidate_class" in data
        assert "candidate_score" in data
        assert 0.0 <= data["candidate_score"] <= 1.0
        assert "firms" in data
        assert "persistence" in data
        assert "industrial_context" in data
        assert "sentinel2" in data
        assert "reasoning" in data
        assert "warnings" in data
        assert "sources" in data
        assert "disclaimer" in data
        assert data["sentinel2"]["is_calibrated"] is False

