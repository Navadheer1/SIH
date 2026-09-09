"""
Pydantic Schemas for Phase 6I Operational Incident Lifecycle, Action Management & Audit Trails.
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class IncidentActionRequest(BaseModel):
    """Payload sent by an operator to record an action on an incident."""
    action: str = Field(
        ...,
        description="Action type: ACKNOWLEDGE, DISPATCH, INVESTIGATE, ESCALATE, RESOLVE, DISMISS, ADD_NOTE"
    )
    user: Optional[str] = Field(
        default="Operator",
        description="Operator name, badge ID, or role taking the action"
    )
    target_agency: Optional[str] = Field(
        default=None,
        description="Target stakeholder or agency dispatched (e.g. Industrial Fire Brigade, Local Police, State PCB)"
    )
    notes: Optional[str] = Field(
        default=None,
        description="Operational notes, rationale, dispatch instructions, or field findings"
    )
    priority_override: Optional[str] = Field(
        default=None,
        description="Optional manual priority level override: CRITICAL, HIGH, MEDIUM, LOW"
    )


class IncidentAuditItem(BaseModel):
    """Single chronological audit event in an incident's lifecycle."""
    id: str = Field(..., description="Unique audit event identifier")
    observation_id: str = Field(..., description="Unique FIRMS observation identifier")
    timestamp: str = Field(..., description="ISO-8601 UTC timestamp of the action")
    actor: str = Field(..., description="Actor name or system component")
    actor_type: str = Field(
        ...,
        description="Actor classification: HUMAN_DISPATCHER, AUTOMATED_PIPELINE, SYSTEM_SUPERVISOR"
    )
    action: str = Field(..., description="Action or event type")
    previous_status: Optional[str] = Field(None, description="Incident status prior to action")
    new_status: str = Field(..., description="Incident status resulting from action")
    target_agency: Optional[str] = Field(None, description="Dispatched agency or team")
    notes: Optional[str] = Field(None, description="Operator notes or automated description")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Supplementary event metadata")


class IncidentStateSummary(BaseModel):
    """Current operational state of an incident."""
    observation_id: str = Field(..., description="Unique FIRMS observation identifier")
    status: str = Field(
        ...,
        description="Current operational status: NEW, ACKNOWLEDGED, DISPATCHED, INVESTIGATING, RESOLVED, DISMISSED"
    )
    priority_level: str = Field(..., description="Current priority level: CRITICAL, HIGH, MEDIUM, LOW")
    priority_index: str = Field(..., description="Current priority index: P1, P2, P3, P4")
    assigned_agency: Optional[str] = Field(None, description="Currently dispatched response agency")
    last_updated_at: str = Field(..., description="ISO-8601 UTC timestamp of most recent change")
    last_updated_by: str = Field(..., description="Operator or system component that last modified state")
    total_actions_count: int = Field(0, description="Total number of logged audit actions")


class IncidentActionResponse(BaseModel):
    """Response returned after recording an operational action."""
    success: bool = Field(..., description="Whether action was successfully recorded")
    observation_id: str = Field(..., description="Unique FIRMS observation identifier")
    action_recorded: str = Field(..., description="Recorded action type")
    current_state: IncidentStateSummary = Field(..., description="Updated incident operational state")
    audit_entry: IncidentAuditItem = Field(..., description="Generated audit log item")
    message: str = Field(..., description="Human-readable success message")


class IncidentAuditTrailResponse(BaseModel):
    """Full chronological audit trail and operational state for an incident."""
    observation_id: str = Field(..., description="Unique FIRMS observation identifier")
    state: IncidentStateSummary = Field(..., description="Current incident state")
    audit_trail: List[IncidentAuditItem] = Field(
        default_factory=list,
        description="Chronological list of all audit events in descending or ascending order"
    )
    disclaimers: List[str] = Field(
        default_factory=lambda: [
            "AI Candidate Classification is an evidence-fusion output, not a standalone confirmation of an industrial fire.",
            "Sentinel-2 imagery is optical evidence and may not be temporally coincident with the FIRMS observation.",
            "Dynamic threat zones and scenario projections are simulation estimates — NOT official government evacuation orders."
        ],
        description="Mandatory regulatory and operational disclaimers"
    )
    retrieved_at: str = Field(..., description="Audit retrieval timestamp in ISO-8601 UTC")


class IncidentOperationalSummary(BaseModel):
    """Fleet-wide operational triage status distribution."""
    total_incidents: int = Field(0, description="Total active and historical incidents")
    new_count: int = Field(0, description="Unacknowledged incidents (NEW)")
    acknowledged_count: int = Field(0, description="Acknowledged incidents")
    dispatched_count: int = Field(0, description="Active field dispatch incidents")
    investigating_count: int = Field(0, description="Under active investigation")
    resolved_count: int = Field(0, description="Resolved incidents")
    dismissed_count: int = Field(0, description="Dismissed false alarms")
    p1_critical_active_count: int = Field(0, description="P1 Critical incidents currently active")
    p2_high_active_count: int = Field(0, description="P2 High incidents currently active")
    generated_at: str = Field(..., description="Summary timestamp in ISO-8601 UTC")
