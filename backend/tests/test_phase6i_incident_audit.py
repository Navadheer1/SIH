"""
Automated Test Suite for Phase 6I: Operational Incident Lifecycle, Action Management & Audit Trails.
"""

import os
import shutil
import tempfile
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.incident_audit_service import IncidentAuditService, get_incident_audit_service
from app.schemas.incident_audit import IncidentActionRequest


@pytest.fixture(autouse=True)
def clean_audit_service():
    """Provides a fresh isolated audit store for each test."""
    temp_dir = tempfile.mkdtemp()
    temp_store_file = os.path.join(temp_dir, "test_audit_store.json")

    # Override singleton with temporary isolated instance
    import app.services.incident_audit_service as audit_module
    old_instance = audit_module._incident_audit_service_instance
    audit_module._incident_audit_service_instance = IncidentAuditService(store_path=temp_store_file)

    yield audit_module._incident_audit_service_instance

    # Cleanup
    audit_module._incident_audit_service_instance = old_instance
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def client():
    return TestClient(app)


def test_01_initial_audit_trail_creation(client):
    """Test querying audit trail for a new observation initializes HOTSPOT_DETECTED."""
    obs_id = "test_obs_phase6i_001"
    response = client.get(f"/api/incidents/{obs_id}/audit-trail")
    assert response.status_code == 200
    data = response.json()

    assert data["observation_id"] == obs_id
    assert data["state"]["status"] == "NEW"
    assert data["state"]["priority_level"] == "LOW"
    assert data["state"]["total_actions_count"] == 1
    assert len(data["audit_trail"]) == 1

    first_event = data["audit_trail"][0]
    assert first_event["action"] == "HOTSPOT_DETECTED"
    assert first_event["actor_type"] == "AUTOMATED_PIPELINE"
    assert first_event["new_status"] == "NEW"


def test_02_acknowledge_action_transition(client):
    """Test operator ACKNOWLEDGE action updates status to ACKNOWLEDGED."""
    obs_id = "test_obs_phase6i_002"
    payload = {
        "action": "ACKNOWLEDGE",
        "user": "Dispatcher Harsha",
        "notes": "Reviewed radiometric FIRMS anomaly and confirming initial triage."
    }
    response = client.post(f"/api/incidents/{obs_id}/action", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert data["observation_id"] == obs_id
    assert data["action_recorded"] == "ACKNOWLEDGE"
    assert data["current_state"]["status"] == "ACKNOWLEDGED"
    assert data["current_state"]["last_updated_by"] == "Dispatcher Harsha"
    assert data["audit_entry"]["previous_status"] == "NEW"
    assert data["audit_entry"]["new_status"] == "ACKNOWLEDGED"


def test_03_dispatch_action_with_agency(client):
    """Test operator DISPATCH action assigns agency and updates status to DISPATCHED."""
    obs_id = "test_obs_phase6i_003"
    payload = {
        "action": "DISPATCH",
        "user": "Supervisor Rao",
        "target_agency": "Industrial Fire Brigade Unit 4",
        "notes": "Deploying foam tender due to close proximity to petrochemical flare."
    }
    response = client.post(f"/api/incidents/{obs_id}/action", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert data["current_state"]["status"] == "DISPATCHED"
    assert data["current_state"]["assigned_agency"] == "Industrial Fire Brigade Unit 4"
    assert data["audit_entry"]["target_agency"] == "Industrial Fire Brigade Unit 4"


def test_04_investigate_action(client):
    """Test operator INVESTIGATE action sets status to INVESTIGATING."""
    obs_id = "test_obs_phase6i_004"
    payload = {
        "action": "INVESTIGATE",
        "user": "Field Investigator Singh",
        "notes": "Drone reconnaissance team launched for thermal perimeter scan."
    }
    response = client.post(f"/api/incidents/{obs_id}/action", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert data["current_state"]["status"] == "INVESTIGATING"


def test_05_escalate_action_with_priority_override(client):
    """Test ESCALATE action modifies status and updates priority level and index."""
    obs_id = "test_obs_phase6i_005"
    payload = {
        "action": "ESCALATE",
        "user": "Chief Incident Commander",
        "target_agency": "District Emergency Operations Centre",
        "notes": "Escalating to Level 2 Major Incident due to wind shift toward chemical depot.",
        "priority_override": "CRITICAL"
    }
    response = client.post(f"/api/incidents/{obs_id}/action", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert data["current_state"]["status"] == "DISPATCHED"
    assert data["current_state"]["priority_level"] == "CRITICAL"
    assert data["current_state"]["priority_index"] == "P1"


def test_06_add_note_action(client):
    """Test ADD_NOTE action records note while maintaining current status."""
    obs_id = "test_obs_phase6i_006"
    # First set to ACKNOWLEDGED
    client.post(f"/api/incidents/{obs_id}/action", json={"action": "ACKNOWLEDGE", "user": "Op1"})

    # Now add note
    note_payload = {
        "action": "ADD_NOTE",
        "user": "Sensor Analyst",
        "notes": "Copernicus Sentinel-2 optical pass expected at 10:45 UTC."
    }
    response = client.post(f"/api/incidents/{obs_id}/action", json=note_payload)
    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert data["action_recorded"] == "ADD_NOTE"
    assert data["current_state"]["status"] == "ACKNOWLEDGED"
    assert data["audit_entry"]["notes"] == "Copernicus Sentinel-2 optical pass expected at 10:45 UTC."


def test_07_resolve_action(client):
    """Test RESOLVE action transitions incident to RESOLVED."""
    obs_id = "test_obs_phase6i_007"
    payload = {
        "action": "RESOLVE",
        "user": "Incident Commander",
        "notes": "Thermal signature extinguished and confirmed by on-site fire crew."
    }
    response = client.post(f"/api/incidents/{obs_id}/action", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert data["current_state"]["status"] == "RESOLVED"


def test_08_dismiss_action(client):
    """Test DISMISS action transitions incident to DISMISSED."""
    obs_id = "test_obs_phase6i_008"
    payload = {
        "action": "DISMISS",
        "user": "Monitoring Specialist",
        "notes": "Controlled stubble burning with valid agricultural permit. No risk."
    }
    response = client.post(f"/api/incidents/{obs_id}/action", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert data["current_state"]["status"] == "DISMISSED"


def test_09_invalid_action_returns_400(client):
    """Test unrecognized action returns HTTP 400."""
    obs_id = "test_obs_phase6i_009"
    payload = {
        "action": "NON_EXISTENT_ACTION",
        "user": "Operator"
    }
    response = client.post(f"/api/incidents/{obs_id}/action", json=payload)
    assert response.status_code == 400
    assert "Invalid action" in response.json()["detail"]


def test_10_invalid_empty_observation_id_returns_400(client):
    """Test blank observation ID returns HTTP 400."""
    payload = {"action": "ACKNOWLEDGE"}
    response = client.post("/api/incidents/%20/action", json=payload)
    assert response.status_code == 400


def test_11_audit_trail_chronological_ordering(client):
    """Test audit trail ordering parameter (descending vs ascending)."""
    obs_id = "test_obs_phase6i_011"
    # Action 1
    client.post(f"/api/incidents/{obs_id}/action", json={"action": "ACKNOWLEDGE", "user": "Op1"})
    # Action 2
    client.post(f"/api/incidents/{obs_id}/action", json={"action": "DISPATCH", "user": "Op2"})

    # Fetch descending (default)
    resp_desc = client.get(f"/api/incidents/{obs_id}/audit-trail?descending=true")
    assert resp_desc.status_code == 200
    trail_desc = resp_desc.json()["audit_trail"]
    assert len(trail_desc) == 3  # INIT + ACKNOWLEDGE + DISPATCH
    assert trail_desc[0]["action"] == "DISPATCH"
    assert trail_desc[1]["action"] == "ACKNOWLEDGE"
    assert trail_desc[2]["action"] == "HOTSPOT_DETECTED"

    # Fetch ascending
    resp_asc = client.get(f"/api/incidents/{obs_id}/audit-trail?descending=false")
    assert resp_asc.status_code == 200
    trail_asc = resp_asc.json()["audit_trail"]
    assert trail_asc[0]["action"] == "HOTSPOT_DETECTED"
    assert trail_asc[1]["action"] == "ACKNOWLEDGE"
    assert trail_asc[2]["action"] == "DISPATCH"


def test_12_operational_summary_aggregation(client):
    """Test operational summary accurately counts statuses across incidents."""
    client.post("/api/incidents/fleet_obs_1/action", json={"action": "ACKNOWLEDGE"})
    client.post("/api/incidents/fleet_obs_2/action", json={"action": "DISPATCH", "priority_override": "CRITICAL"})
    client.post("/api/incidents/fleet_obs_3/action", json={"action": "RESOLVE"})

    response = client.get("/api/incidents/operational-summary")
    assert response.status_code == 200
    summary = response.json()

    assert summary["total_incidents"] >= 3
    assert summary["acknowledged_count"] >= 1
    assert summary["dispatched_count"] >= 1
    assert summary["resolved_count"] >= 1
    assert summary["p1_critical_active_count"] >= 1


def test_13_audit_trail_disclaimers_present(client):
    """Test presence of all 3 mandatory regulatory/operational disclaimers in audit trail."""
    obs_id = "test_obs_phase6i_013"
    response = client.get(f"/api/incidents/{obs_id}/audit-trail")
    assert response.status_code == 200
    disclaimers = response.json()["disclaimers"]

    assert len(disclaimers) == 3
    assert any("AI Candidate Classification is an evidence-fusion output" in d for d in disclaimers)
    assert any("Sentinel-2 imagery is optical evidence" in d for d in disclaimers)
    assert any("Dynamic threat zones and scenario projections are simulation estimates" in d for d in disclaimers)


def test_14_persistent_store_resilience():
    """Test persistence survives creating a new service instance pointing to the same file."""
    temp_dir = tempfile.mkdtemp()
    store_file = os.path.join(temp_dir, "resilient_store.json")

    try:
        service_1 = IncidentAuditService(store_path=store_file)
        req = IncidentActionRequest(
            action="DISPATCH",
            user="Commander Aditi",
            target_agency="Hazmat Emergency Response Team",
            notes="Containment protocol initiated."
        )
        service_1.record_action("obs_resilience_test", req)

        # Create a second service instance reading the file
        service_2 = IncidentAuditService(store_path=store_file)
        trail_resp = service_2.get_audit_trail("obs_resilience_test")

        assert trail_resp.state.status == "DISPATCHED"
        assert trail_resp.state.assigned_agency == "Hazmat Emergency Response Team"
        assert len(trail_resp.audit_trail) == 2
        assert trail_resp.audit_trail[0].actor == "Commander Aditi"
    finally:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
