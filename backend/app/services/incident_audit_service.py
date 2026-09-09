"""
Incident Audit Service for Phase 6I.
Handles persistent incident lifecycle state management, operator triage action recording,
chronological audit trail journaling, and fleet-wide operational summary reporting.
"""

import os
import json
import time
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple

from app.schemas.incident_audit import (
    IncidentActionRequest,
    IncidentActionResponse,
    IncidentAuditItem,
    IncidentStateSummary,
    IncidentAuditTrailResponse,
    IncidentOperationalSummary
)

logger = logging.getLogger(__name__)

# Local persistent JSON store path for resilient fallback
DEFAULT_AUDIT_STORE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data"
)
AUDIT_STORE_FILE = os.path.join(DEFAULT_AUDIT_STORE_DIR, "incident_audit_store.json")

# State transition matrix for incident operations
VALID_ACTIONS = {
    "ACKNOWLEDGE": "ACKNOWLEDGED",
    "DISPATCH": "DISPATCHED",
    "INVESTIGATE": "INVESTIGATING",
    "ESCALATE": "DISPATCHED",
    "RESOLVE": "RESOLVED",
    "DISMISS": "DISMISSED",
    "ADD_NOTE": None,  # Preserves current status
}

ACTION_DESCRIPTIONS = {
    "ACKNOWLEDGE": "Operator acknowledged incident priority and queued for dispatch assessment.",
    "DISPATCH": "Emergency response unit deployed to incident perimeter.",
    "INVESTIGATE": "Field surveillance and aerial verification dispatched.",
    "ESCALATE": "Incident escalated to District Emergency Operations Centre (EOC).",
    "RESOLVE": "Hazard verified contained / extinguished. Operational incident closed.",
    "DISMISS": "Thermal anomaly reviewed and dismissed as non-hazardous.",
    "ADD_NOTE": "Operational intelligence note appended to incident log.",
}


class IncidentAuditService:
    """
    Manages operational state transitions and append-only audit trail logging for incidents.
    """

    def __init__(self, store_path: str = AUDIT_STORE_FILE):
        self.store_path = store_path
        self._memory_cache: Dict[str, Dict[str, Any]] = {}
        self._load_local_store()

    def _load_local_store(self):
        """Loads persistent JSON file into memory cache if present."""
        if os.path.exists(self.store_path):
            try:
                with open(self.store_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        self._memory_cache = data
            except Exception as e:
                logger.warning(f"Failed to load incident audit store from {self.store_path}: {e}")

    def _save_local_store(self):
        """Flushes memory cache to persistent JSON file."""
        try:
            os.makedirs(os.path.dirname(self.store_path), exist_ok=True)
            with open(self.store_path, "w", encoding="utf-8") as f:
                json.dump(self._memory_cache, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"Failed to persist incident audit store to {self.store_path}: {e}")

    def _get_or_create_incident_record(self, observation_id: str) -> Dict[str, Any]:
        """Gets existing incident state and history or initializes a new record."""
        clean_id = observation_id.strip()
        now_iso = datetime.now(timezone.utc).isoformat()

        if clean_id not in self._memory_cache:
            initial_audit_id = f"AUDIT-INIT-{uuid.uuid4().hex[:8].upper()}"
            initial_item = {
                "id": initial_audit_id,
                "observation_id": clean_id,
                "timestamp": now_iso,
                "actor": "System Pipeline",
                "actor_type": "AUTOMATED_PIPELINE",
                "action": "HOTSPOT_DETECTED",
                "previous_status": None,
                "new_status": "NEW",
                "target_agency": None,
                "notes": "Radiometric thermal anomaly ingested from NASA FIRMS sensor stream.",
                "metadata": {
                    "source": "NASA FIRMS",
                    "lifecycle_stage": "DETECT"
                }
            }

            self._memory_cache[clean_id] = {
                "state": {
                    "observation_id": clean_id,
                    "status": "NEW",
                    "priority_level": "LOW",
                    "priority_index": "P4",
                    "assigned_agency": None,
                    "last_updated_at": now_iso,
                    "last_updated_by": "System Pipeline",
                    "total_actions_count": 1
                },
                "audit_trail": [initial_item]
            }
            self._save_local_store()

        return self._memory_cache[clean_id]

    def record_action(
        self,
        observation_id: str,
        request: IncidentActionRequest
    ) -> IncidentActionResponse:
        """
        Records an operator action or triage event on an incident.
        Validates transition, appends to audit log, updates state, and persists.
        """
        if not observation_id or not isinstance(observation_id, str):
            raise ValueError("Observation ID must be a non-empty string.")

        clean_id = observation_id.strip()
        if not clean_id:
            raise ValueError("Observation ID must be a non-empty string.")

        action_key = request.action.strip().upper()

        if action_key not in VALID_ACTIONS:
            valid_list = list(VALID_ACTIONS.keys())
            raise ValueError(f"Invalid action '{request.action}'. Allowed actions: {valid_list}")

        record = self._get_or_create_incident_record(clean_id)
        current_state = record["state"]
        previous_status = current_state["status"]

        # Determine target status
        target_status = VALID_ACTIONS[action_key] or previous_status

        now_iso = datetime.now(timezone.utc).isoformat()
        audit_id = f"AUDIT-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6].upper()}"

        user_name = request.user.strip() if request.user else "Operator"
        actor_type = "HUMAN_DISPATCHER"

        notes = request.notes.strip() if request.notes else ACTION_DESCRIPTIONS.get(action_key, "Action recorded.")

        # Construct Audit Item
        audit_item_dict = {
            "id": audit_id,
            "observation_id": clean_id,
            "timestamp": now_iso,
            "actor": user_name,
            "actor_type": actor_type,
            "action": action_key,
            "previous_status": previous_status,
            "new_status": target_status,
            "target_agency": request.target_agency,
            "notes": notes,
            "metadata": {
                "priority_override": request.priority_override,
            }
        }

        # Update State
        current_state["status"] = target_status
        current_state["last_updated_at"] = now_iso
        current_state["last_updated_by"] = user_name
        current_state["total_actions_count"] = int(current_state.get("total_actions_count", 0)) + 1

        if request.target_agency:
            current_state["assigned_agency"] = request.target_agency

        if request.priority_override:
            p_upper = request.priority_override.strip().upper()
            if p_upper in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
                current_state["priority_level"] = p_upper
                p_map = {"CRITICAL": "P1", "HIGH": "P2", "MEDIUM": "P3", "LOW": "P4"}
                current_state["priority_index"] = p_map.get(p_upper, "P4")

        # Append to audit trail
        record["audit_trail"].append(audit_item_dict)
        self._save_local_store()

        # Database async persistence (best-effort with fallback)
        self._persist_to_db_best_effort(clean_id, current_state, audit_item_dict)

        audit_item = IncidentAuditItem(**audit_item_dict)
        state_summary = IncidentStateSummary(**current_state)

        return IncidentActionResponse(
            success=True,
            observation_id=clean_id,
            action_recorded=action_key,
            current_state=state_summary,
            audit_entry=audit_item,
            message=f"Action '{action_key}' recorded successfully. Status updated to '{target_status}'."
        )

    def get_audit_trail(
        self,
        observation_id: str,
        descending: bool = True
    ) -> IncidentAuditTrailResponse:
        """
        Retrieves the complete audit trail and current state for an incident.
        """
        if not observation_id or not isinstance(observation_id, str):
            raise ValueError("Observation ID must be a non-empty string.")

        clean_id = observation_id.strip()
        if not clean_id:
            raise ValueError("Observation ID must be a non-empty string.")
        record = self._get_or_create_incident_record(clean_id)

        trail_dicts = list(record.get("audit_trail", []))
        if descending:
            trail_dicts.reverse()

        audit_items = [IncidentAuditItem(**item) for item in trail_dicts]
        state_summary = IncidentStateSummary(**record["state"])

        return IncidentAuditTrailResponse(
            observation_id=clean_id,
            state=state_summary,
            audit_trail=audit_items,
            retrieved_at=datetime.now(timezone.utc).isoformat()
        )

    def get_operational_summary(self) -> IncidentOperationalSummary:
        """
        Aggregates operational lifecycle counts across all recorded incidents.
        """
        total = len(self._memory_cache)
        counts = {
            "NEW": 0,
            "ACKNOWLEDGED": 0,
            "DISPATCHED": 0,
            "INVESTIGATING": 0,
            "RESOLVED": 0,
            "DISMISSED": 0,
        }
        p1_active = 0
        p2_active = 0

        for rec in self._memory_cache.values():
            st = rec.get("state", {}).get("status", "NEW").upper()
            lvl = rec.get("state", {}).get("priority_level", "LOW").upper()

            if st in counts:
                counts[st] += 1
            else:
                counts["NEW"] += 1

            if st in ["NEW", "ACKNOWLEDGED", "DISPATCHED", "INVESTIGATING"]:
                if lvl == "CRITICAL" or rec.get("state", {}).get("priority_index") == "P1":
                    p1_active += 1
                elif lvl == "HIGH" or rec.get("state", {}).get("priority_index") == "P2":
                    p2_active += 1

        return IncidentOperationalSummary(
            total_incidents=total,
            new_count=counts["NEW"],
            acknowledged_count=counts["ACKNOWLEDGED"],
            dispatched_count=counts["DISPATCHED"],
            investigating_count=counts["INVESTIGATING"],
            resolved_count=counts["RESOLVED"],
            dismissed_count=counts["DISMISSED"],
            p1_critical_active_count=p1_active,
            p2_high_active_count=p2_active,
            generated_at=datetime.now(timezone.utc).isoformat()
        )

    def _persist_to_db_best_effort(
        self,
        observation_id: str,
        state_dict: Dict[str, Any],
        audit_dict: Dict[str, Any]
    ):
        """Attempts to synchronize state and audit entry into PostgreSQL/SQLite."""
        try:
            from app.db.database import get_session_factory
            from app.db.models import IncidentStateRecord, IncidentAuditLog
            SessionLocal = get_session_factory()
            if not SessionLocal:
                return

            with SessionLocal() as session:
                # Upsert state record
                state_rec = session.query(IncidentStateRecord).filter(
                    IncidentStateRecord.observation_id == observation_id
                ).first()

                if not state_rec:
                    state_rec = IncidentStateRecord(
                        observation_id=observation_id,
                        status=state_dict["status"],
                        priority_level=state_dict.get("priority_level", "LOW"),
                        priority_index=state_dict.get("priority_index", "P4"),
                        assigned_agency=state_dict.get("assigned_agency"),
                        last_updated_by=state_dict.get("last_updated_by", "Operator"),
                        total_actions_count=state_dict.get("total_actions_count", 1)
                    )
                    session.add(state_rec)
                else:
                    state_rec.status = state_dict["status"]
                    state_rec.priority_level = state_dict.get("priority_level", "LOW")
                    state_rec.priority_index = state_dict.get("priority_index", "P4")
                    state_rec.assigned_agency = state_dict.get("assigned_agency")
                    state_rec.last_updated_by = state_dict.get("last_updated_by", "Operator")
                    state_rec.total_actions_count = state_dict.get("total_actions_count", 1)

                # Add audit log
                audit_log = IncidentAuditLog(
                    audit_id=audit_dict["id"],
                    observation_id=observation_id,
                    actor=audit_dict["actor"],
                    actor_type=audit_dict["actor_type"],
                    action=audit_dict["action"],
                    previous_status=audit_dict["previous_status"],
                    new_status=audit_dict["new_status"],
                    target_agency=audit_dict.get("target_agency"),
                    notes=audit_dict.get("notes"),
                    metadata_json=json.dumps(audit_dict.get("metadata", {}))
                )
                session.add(audit_log)
                session.commit()
        except Exception as e:
            # Safe degradation: local store is already written
            logger.debug(f"Database sync skipped for incident audit: {e}")


# Singleton instance
_incident_audit_service_instance: Optional[IncidentAuditService] = None


def get_incident_audit_service() -> IncidentAuditService:
    """Returns singleton instance of IncidentAuditService."""
    global _incident_audit_service_instance
    if _incident_audit_service_instance is None:
        _incident_audit_service_instance = IncidentAuditService()
    return _incident_audit_service_instance
