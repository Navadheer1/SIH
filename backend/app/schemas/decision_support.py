from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from app.schemas.investigation import InvestigationResponse


class PriorityResult(BaseModel):
    priority_index: str = Field(..., description="Priority index: P1, P2, P3, P4")
    priority_label: str = Field(..., description="Full descriptive priority label (e.g., P1 — CRITICAL DISPATCH)")
    priority_score: float = Field(..., description="Bounded operational priority score in [0.0, 100.0]")
    priority_level: str = Field(..., description="Qualitative priority level: CRITICAL, HIGH, MEDIUM, LOW")
    contributing_factors: Dict[str, float] = Field(default_factory=dict, description="Factor weight contributions")
    reasons: List[str] = Field(default_factory=list, description="Step-by-step explainable reasons for this priority")


class ThreatZoneDetails(BaseModel):
    name: str = Field(..., description="Threat zone name (e.g., Inner Tactical Zone)")
    radius_km: float = Field(..., description="Zone radius in kilometers")
    color: str = Field(..., description="Hex color for mapping")
    fill_opacity: float = Field(..., description="Fill opacity for map polygon")
    threat_level: str = Field(..., description="Threat tier description")
    description: str = Field(..., description="Tactical zone description")


class ThreatZoneResult(BaseModel):
    available: bool = Field(..., description="Whether dynamic threat zone analysis is available")
    zones: Dict[str, ThreatZoneDetails] = Field(default_factory=dict, description="Inner, secondary, and monitoring zones")
    factors_applied: Dict[str, Any] = Field(default_factory=dict, description="Radiometric and spatial factors applied")
    disclaimer: str = Field(
        "AI-generated risk/impact assessment zones — NOT official government evacuation boundaries.",
        description="Threat zone disclaimer"
    )


class AssetExposureItem(BaseModel):
    asset_name: str = Field(..., description="Mapped asset or facility name")
    category: str = Field(..., description="Asset category: INDUSTRIAL, HEALTHCARE, EDUCATION, UTILITIES, TRANSPORT, SETTLEMENTS, PUBLIC")
    raw_type: str = Field("urban", description="OSM feature type")
    latitude: Optional[float] = Field(None, description="Asset latitude")
    longitude: Optional[float] = Field(None, description="Asset longitude")
    distance_km: float = Field(..., description="Distance in kilometers to hotspot")
    threat_zone: str = Field(..., description="Zone location: Inner Zone, Secondary Zone, Monitoring Zone")
    exposure_level: str = Field(..., description="Exposure severity: HIGH EXPOSURE, MODERATE EXPOSURE, MONITORING EXPOSURE")
    status: str = Field("Within Risk Zone", description="Operational exposure status")
    data_source: str = Field("OpenStreetMap", description="Geospatial context provider")


class AssetExposureResult(BaseModel):
    available: bool = Field(..., description="Whether asset exposure analysis is available")
    total_exposed_assets: int = Field(0, description="Total count of mapped exposed assets")
    critical_infrastructure_count: int = Field(0, description="Count of critical infrastructure nodes")
    category_counts: Dict[str, int] = Field(default_factory=dict, description="Asset count by category")
    nearest_critical_asset: Optional[AssetExposureItem] = Field(None, description="Closest critical infrastructure asset")
    exposed_assets: List[AssetExposureItem] = Field(default_factory=list, description="List of exposed assets within threat perimeter")
    source: str = Field("OpenStreetMap", description="Asset provider")


class ImpactResult(BaseModel):
    available: bool = Field(..., description="Whether impact assessment is available")
    impact_score: float = Field(0.0, description="Normalized impact score in [0.0, 100.0]")
    impact_level: str = Field("LOW", description="Impact severity: CRITICAL, HIGH, MODERATE, LOW")
    critical_infrastructure_count: int = Field(0, description="Count of critical exposed assets")
    impact_reasons: List[str] = Field(default_factory=list, description="Explainable reasons why this incident matters")
    summary_statement: str = Field("", description="High-level operational impact summary")


class FutureImpactItem(BaseModel):
    time_horizon: str = Field(..., description="Time horizon label (e.g., NOW, +1H, +3H, +6H)")
    hours: float = Field(..., description="Hours from present")
    center_latitude: float = Field(..., description="Projected center latitude")
    center_longitude: float = Field(..., description="Projected center longitude")
    projected_area_sqkm: float = Field(..., description="Estimated spread footprint in sq km")
    confidence_score: float = Field(..., description="Projection confidence score in [0.0, 1.0]")
    confidence_level: str = Field(..., description="Projection confidence: HIGH, MEDIUM, LOW")
    total_exposed_assets: int = Field(0, description="Projected exposed assets count")
    critical_infrastructure_count: int = Field(0, description="Projected critical infrastructure count")
    impact_score: float = Field(0.0, description="Projected impact score")
    impact_level: str = Field("LOW", description="Projected impact level")
    priority_index: str = Field("P4", description="Projected priority index")
    priority_label: str = Field("", description="Projected priority label")
    nearest_critical_asset: Optional[Dict[str, Any]] = Field(None, description="Projected nearest critical asset")
    exposed_assets: List[Dict[str, Any]] = Field(default_factory=list, description="Top projected exposed assets")


class FutureImpactResult(BaseModel):
    available: bool = Field(..., description="Whether future impact projection is available")
    escalation_detected: bool = Field(False, description="Whether priority escalates over time horizons")
    escalation_reasons: List[str] = Field(default_factory=list, description="Reasons for potential escalation")
    projections: Dict[str, FutureImpactItem] = Field(default_factory=dict, description="Time-series scenario projections")
    disclaimer: str = Field(
        "Forward-looking scenario projections are simulated estimates — NOT deterministic predictions.",
        description="Scenario projection disclaimer"
    )


class RecommendedAction(BaseModel):
    action_id: str = Field(..., description="Identifier for action")
    title: str = Field(..., description="Operational action title")
    category: str = Field(..., description="Action category: VERIFY_FACILITY, DEPLOY_UNIT, MONITOR_RECURRENCE, REVIEW_SATELLITE, ESCALATE, RESOLVE, DISMISS")
    priority: str = Field(..., description="Action urgency: IMMEDIATE, HIGH, PRECAUTIONARY, ROUTINE")
    rationale: str = Field(..., description="Explainable rationale supporting this recommended action")


class DecisionProvenance(BaseModel):
    observation_id: str = Field(..., description="Unique FIRMS observation identifier")
    investigated_at: str = Field(..., description="Timestamp of underlying multi-source investigation")
    threat_zone_calculated_at: str = Field(..., description="Timestamp of threat zone generation")
    asset_query_at: str = Field(..., description="Timestamp of asset exposure query")
    priority_evaluated_at: str = Field(..., description="Timestamp of priority index calculation")
    decision_support_generated_at: str = Field(..., description="Timestamp of complete decision support assembly")


class IncidentSummary(BaseModel):
    candidate_class: str = Field(..., description="Synthesized candidate classification")
    evidence_strength: str = Field(..., description="Strength of supporting multi-source evidence")
    risk_level: str = Field(..., description="Operational hazard risk level")
    priority_level: str = Field(..., description="Emergency dispatch priority level")
    priority_index: str = Field(..., description="Priority index code (P1 - P4)")
    persistence_interpretation: str = Field(..., description="Interpretation of temporal recurrence")
    industrial_context_summary: str = Field(..., description="Summary of nearby mapped industrial infrastructure")
    optical_evidence_quality: str = Field(..., description="Quality of optical Sentinel-2 imagery")
    asset_exposure_summary: str = Field(..., description="Summary of exposed infrastructure")
    recommended_action: str = Field(..., description="Top recommended operational action")


class DecisionSupportResponse(BaseModel):
    observation_id: str = Field(..., description="Unique FIRMS observation identifier")
    status: str = Field("SUCCESS", description="Operational decision support status: SUCCESS, PARTIAL_EVIDENCE, DEGRADED")
    summary: IncidentSummary = Field(..., description="Executive operational summary of the incident")
    investigation: InvestigationResponse = Field(..., description="Full Phase 6F/6G Multi-Source Investigation Envelope")
    priority: PriorityResult = Field(..., description="Explainable Priority Index and Score")
    threat_zone: ThreatZoneResult = Field(..., description="Dynamic multi-tier threat zone radii and geometries")
    asset_exposure: AssetExposureResult = Field(..., description="Categorized exposed assets analysis")
    impact: ImpactResult = Field(..., description="Estimated infrastructure and environmental impact")
    future_impact: FutureImpactResult = Field(..., description="Forward-looking scenario projections across time horizons")
    recommended_actions: List[RecommendedAction] = Field(default_factory=list, description="Ranked recommended operational actions")
    provenance: DecisionProvenance = Field(..., description="Audit trail and computation lineage timestamps")
    warnings: List[str] = Field(default_factory=list, description="Operational warnings and degradation notices")
    disclaimers: List[str] = Field(
        default_factory=lambda: [
            "AI Candidate Classification is an evidence-fusion output, not a standalone confirmation of an industrial fire.",
            "Sentinel-2 imagery is optical evidence and may not be temporally coincident with the FIRMS observation.",
            "Dynamic threat zones and scenario projections are simulation estimates — NOT official government evacuation orders."
        ],
        description="Mandatory scientific and operational disclaimers"
    )
    created_at: str = Field(..., description="Decision support assembly timestamp in ISO-8601 UTC")
