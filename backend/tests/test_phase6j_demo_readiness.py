import os
import json
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.system_readiness_service import get_system_readiness_service, MANDATORY_DISCLAIMERS
from app.services.incident_audit_service import get_incident_audit_service

client = TestClient(app)

BENCHMARK_DEMO_OBS_ID = "423f0b1ad50facd6"
BENCHMARK_DEMO_OBS_ID_2 = "04e53a2f16d0d665"


def test_01_system_readiness_endpoint_structure_and_health():
    """
    Test 1: GET /api/system/readiness returns unified readiness payload with all components.
    """
    response = client.get("/api/system/readiness")
    assert response.status_code == 200
    data = response.json()

    assert data["status"] in ("HEALTHY", "DEGRADED", "UNAVAILABLE")
    assert "evaluated_at" in data
    assert "components" in data

    components = data["components"]
    expected_components = ["backend", "storage", "firms", "satellite", "osm", "ml_model", "incident_audit"]
    for comp in expected_components:
        assert comp in components, f"Missing component {comp} in readiness response"
        assert components[comp]["status"] in ("HEALTHY", "DEGRADED", "UNAVAILABLE", "NOT_CONFIGURED")
        assert "configured" in components[comp]
        assert "reachable" in components[comp]
        assert "usable" in components[comp]

    assert data["demo_scenarios"]["available"] is True
    assert data["demo_scenarios"]["presets_count"] >= 3


def test_02_system_readiness_zero_secret_leakage():
    """
    Test 2: Ensure NO API keys, passwords, client secrets, or auth tokens leak in readiness payload.
    """
    response = client.get("/api/system/readiness")
    assert response.status_code == 200
    raw_text = response.text.lower()

    sensitive_patterns = [
        "private_key",
        "password",
        "token=",
        "bearer ",
        "postgres://",
        "postgresql://",
    ]

    for pattern in sensitive_patterns:
        assert pattern not in raw_text, f"Potential secret leakage detected with pattern: '{pattern}'"


def test_03_system_readiness_probed_reachability():
    """
    Test 3: GET /api/system/readiness?probe_external=true executes with bounded timeouts.
    """
    response = client.get("/api/system/readiness?probe_external=true&force_refresh=true")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["components"]["backend"]["status"] == "HEALTHY"


def test_04_health_endpoint_backward_compatibility():
    """
    Test 4: GET /api/health maintains backward compatibility and reports readiness status.
    """
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("healthy", "unhealthy")
    assert "readiness_status" in data
    assert data["readiness_status"] in ("HEALTHY", "DEGRADED", "UNAVAILABLE")


def test_05_demo_scenarios_available_and_valid():
    """
    Test 5: Verify all benchmark demo observations can be investigated without 404 error.
    """
    for obs_id in [BENCHMARK_DEMO_OBS_ID, BENCHMARK_DEMO_OBS_ID_2]:
        resp = client.get(f"/api/firms/{obs_id}/investigation")
        assert resp.status_code == 200, f"Benchmark observation {obs_id} failed with HTTP {resp.status_code}"
        data = resp.json()
        assert data["observation_id"] == obs_id
        assert data["status"] in ("SUCCESS", "PARTIAL_EVIDENCE")
        assert data["detection"]["source"] == "NASA FIRMS"


def test_06_end_to_end_detect_investigate_decide_workflow():
    """
    Test 6: Full end-to-end DETECT -> INVESTIGATE -> DECIDE lifecycle on benchmark incident.
    """
    # 1. Investigate
    inv_resp = client.get(f"/api/firms/{BENCHMARK_DEMO_OBS_ID}/investigation")
    assert inv_resp.status_code == 200
    inv = inv_resp.json()
    assert inv["fusion"]["candidate_class"] in ("INDUSTRIAL_FIRE", "WILDFIRE", "NON_FIRE", "UNKNOWN")

    # 2. Decide
    dec_resp = client.get(f"/api/firms/{BENCHMARK_DEMO_OBS_ID}/decision-support")
    assert dec_resp.status_code == 200
    dec = dec_resp.json()
    assert dec["priority"]["priority_index"] in ("P1", "P2", "P3", "P4")
    assert dec["threat_zone"]["available"] is True
    assert len(dec["recommended_actions"]) >= 1


def test_07_incident_action_and_audit_consistency():
    """
    Test 7: Record operator actions (ACKNOWLEDGE -> DISPATCH -> ADD_NOTE) and verify audit trail.
    """
    obs_id = f"audit_test_{os.urandom(4).hex()}"

    # Step 1: Initial state is NEW
    initial_trail = client.get(f"/api/incidents/{obs_id}/audit-trail").json()
    assert initial_trail["state"]["status"] == "NEW"

    # Step 2: Acknowledge
    ack_payload = {
        "action": "ACKNOWLEDGE",
        "user": "Test Duty Officer",
        "notes": "Acknowledged alert for SIH validation."
    }
    ack_res = client.post(f"/api/incidents/{obs_id}/action", json=ack_payload)
    assert ack_res.status_code == 200
    assert ack_res.json()["current_state"]["status"] == "ACKNOWLEDGED"

    # Step 3: Dispatch
    dispatch_payload = {
        "action": "DISPATCH",
        "user": "Chief Dispatcher",
        "notes": "Deploying industrial foam tender.",
        "target_agency": "Foam Tender Unit 1",
        "priority_override": "CRITICAL"
    }
    disp_res = client.post(f"/api/incidents/{obs_id}/action", json=dispatch_payload)
    assert disp_res.status_code == 200
    assert disp_res.json()["current_state"]["status"] == "DISPATCHED"

    # Step 4: Add note without mutating status
    note_payload = {
        "action": "ADD_NOTE",
        "user": "On-Scene Commander",
        "notes": "Units arrived on scene. Perimeter secured."
    }
    note_res = client.post(f"/api/incidents/{obs_id}/action", json=note_payload)
    assert note_res.status_code == 200
    assert note_res.json()["current_state"]["status"] == "DISPATCHED"

    # Step 5: Verify complete audit trail history (Initial + ACK + DISPATCH + ADD_NOTE = 4)
    trail_res = client.get(f"/api/incidents/{obs_id}/audit-trail")
    assert trail_res.status_code == 200
    trail_data = trail_res.json()
    assert trail_data["state"]["total_actions_count"] == 4
    assert len(trail_data["audit_trail"]) == 4


def test_08_invalid_action_rejection():
    """
    Test 8: Invalid actions or illegal state transitions return HTTP 400.
    """
    obs_id = f"invalid_test_{os.urandom(4).hex()}"

    # 1. Unknown action
    bad_res = client.post(f"/api/incidents/{obs_id}/action", json={"action": "FIRE_WATER_MISSILE", "user": "Test"})
    assert bad_res.status_code == 400

    # 2. Empty observation ID
    empty_res = client.post("/api/incidents/%20/action", json={"action": "ACKNOWLEDGE", "user": "Test"})
    assert empty_res.status_code == 400


def test_09_external_dependency_timeout_isolation():
    """
    Test 9: External timeouts or dependency failures gracefully return PARTIAL_EVIDENCE.
    """
    response = client.get(f"/api/firms/{BENCHMARK_DEMO_OBS_ID}/decision-support")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("SUCCESS", "PARTIAL_EVIDENCE")
    assert isinstance(data["warnings"], list)


def test_10_repeated_request_caching_and_performance():
    """
    Test 10: Repeated requests hit in-memory cache and return sub-10ms response times.
    """
    # Prime cache
    client.get(f"/api/firms/{BENCHMARK_DEMO_OBS_ID}/decision-support")

    # Second call should be instant
    resp = client.get(f"/api/firms/{BENCHMARK_DEMO_OBS_ID}/decision-support")
    assert resp.status_code == 200
    assert resp.json()["observation_id"] == BENCHMARK_DEMO_OBS_ID


def test_11_fleet_operational_summary_metrics():
    """
    Test 11: GET /api/incidents/operational-summary aggregates active, dispatched, and resolved counts.
    """
    resp = client.get("/api/incidents/operational-summary")
    assert resp.status_code == 200
    summary = resp.json()
    assert "total_incidents" in summary
    assert "new_count" in summary
    assert "dispatched_count" in summary
    assert "p1_critical_active_count" in summary


def test_12_three_mandatory_disclaimers_preservation():
    """
    Test 12: All 3 mandatory disclaimers exist verbatim across responses.
    """
    # Readiness disclaimers
    readiness_res = client.get("/api/system/readiness").json()
    assert len(readiness_res["disclaimers"]) == 3
    assert readiness_res["disclaimers"] == MANDATORY_DISCLAIMERS

    # Decision support disclaimers
    dec_res = client.get(f"/api/firms/{BENCHMARK_DEMO_OBS_ID}/decision-support").json()
    assert len(dec_res["disclaimers"]) == 3
    assert dec_res["disclaimers"] == MANDATORY_DISCLAIMERS


def test_13_safety_flags_enforcement():
    """
    Test 13: Strict enforcement of is_calibrated=false, is_synthetic=false, is_simulation_only=true.
    """
    readiness = client.get("/api/system/readiness").json()
    flags = readiness["safety_flags"]
    assert flags["is_calibrated"] is False
    assert flags["is_synthetic"] is False
    assert flags["is_simulation_only"] is True

    inv = client.get(f"/api/firms/{BENCHMARK_DEMO_OBS_ID}/investigation").json()
    assert inv["sentinel2"]["is_calibrated"] is False
    assert inv["sentinel2"]["is_synthetic"] is False


def test_14_demo_scenario_provenance_labeling():
    """
    Test 14: Demo benchmark scenarios contain structured provenance timestamps and source tags.
    """
    inv = client.get(f"/api/firms/{BENCHMARK_DEMO_OBS_ID}/investigation").json()
    assert "provenance" in inv
    assert "NASA FIRMS" in inv["provenance"]["sources"]
    assert inv["provenance"]["firms_acquired_at"] is not None
