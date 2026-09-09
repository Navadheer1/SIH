from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class DetectionEvidence(BaseModel):
    source: str = Field("NASA FIRMS", description="Thermal observation source agency")
    latitude: float = Field(..., description="Latitude coordinate in WGS-84")
    longitude: float = Field(..., description="Longitude coordinate in WGS-84")
    brightness: float = Field(..., description="Brightness temperature in Kelvin")
    frp: float = Field(..., description="Fire Radiative Power in Megawatts")
    confidence: str = Field(..., description="Detection confidence flag (low, nominal, high)")
    satellite: Optional[str] = Field(None, description="Observing satellite sensor platform")
    acquired_at: Optional[str] = Field(None, description="Observation acquisition time in UTC")
    freshness: Optional[str] = Field(None, description="Elapsed freshness description")


class PersistenceEvidence(BaseModel):
    available: bool = Field(..., description="Whether temporal persistence analysis is available")
    score: Optional[float] = Field(None, description="Persistence score in [0.0, 100.0]")
    observation_count: int = Field(1, description="Number of recurrent thermal detections in cluster")
    duration_hours: float = Field(0.0, description="Duration in hours across detection window")
    time_window_hours: float = Field(24.0, description="Temporal clustering search window")
    classification: Optional[str] = Field(None, description="Persistence category")


class IndustrialContextEvidence(BaseModel):
    available: bool = Field(..., description="Whether OSM industrial context is available")
    score: Optional[float] = Field(None, description="Normalized industrial proximity score in [0.0, 1.0]")
    nearest_distance_m: Optional[float] = Field(None, description="Distance in meters to nearest industrial facility")
    nearest_distance_km: Optional[float] = Field(None, description="Distance in kilometers to nearest facility")
    nearest_facility: Optional[str] = Field(None, description="Name or type of nearest mapped facility")
    features: List[Dict[str, Any]] = Field(default_factory=list, description="Nearby mapped industrial facilities")
    source: str = Field("OpenStreetMap", description="Geospatial context provider")


class Sentinel2Evidence(BaseModel):
    available: bool = Field(..., description="Whether genuine Sentinel-2 optical imagery is available")
    state: str = Field(..., description="Acquisition state (e.g., ACQUISITION_AVAILABLE, NO_ACQUISITION, HIGH_CLOUD)")
    class_name: str = Field("UNKNOWN", alias="class", description="AI Vision classification: WILDFIRE, INDUSTRIAL_FIRE, NON_FIRE, UNKNOWN")
    confidence: float = Field(0.0, description="Softmax confidence score in [0.0, 1.0]")
    cloud_cover: Optional[float] = Field(None, description="Scene cloud cover percentage in [0.0, 100.0]")
    quality: str = Field("UNAVAILABLE", description="Atmospheric quality status: GOOD, MODERATE, HIGH_CLOUD, VERY_HIGH_CLOUD, UNAVAILABLE")
    is_synthetic: bool = Field(False, description="Strict safety flag indicating if imagery is synthetic")
    is_calibrated: bool = Field(False, description="Whether CNN softmax output is calibrated (always False for Phase 6C CNN)")
    satellite_acquired_at: Optional[str] = Field(None, description="Exact timestamp of optical acquisition")
    time_difference_hours: Optional[float] = Field(None, description="Hours between FIRMS and Sentinel-2 acquisitions")
    image_url: Optional[str] = Field(None, description="URL endpoint serving the genuine optical patch image")
    model: Optional[str] = Field(None, description="Model architecture identifier")
    class_probabilities: Dict[str, float] = Field(default_factory=dict, description="Class-wise probability distribution")

    model_config = {"populate_by_name": True}


MANDATORY_SAR_DISCLAIMER = (
    "Sentinel-1 is SAR radar evidence that can provide cloud-independent surface information. "
    "It does not measure fire temperature."
)


class Sentinel1Evidence(BaseModel):
    available: bool = Field(False, description="Whether genuine Sentinel-1 SAR backup imagery is available")
    state: str = Field("S1_NOT_QUERIED", description="S1 state: S1_NOT_QUERIED, S1_FALLBACK_AVAILABLE, S1_FALLBACK_UNAVAILABLE, S1_PROCESSING_FAILED, S1_AUTH_FAILED")
    role: str = Field("BACKUP", description="Satellite role: always BACKUP")
    product_id: Optional[str] = Field(None, description="Copernicus Sentinel-1 product ID")
    polarization: Optional[List[str]] = Field(None, description="SAR polarizations (e.g., ['VV', 'VH'])")
    orbit_direction: Optional[str] = Field(None, description="Orbit direction: ascending or descending")
    acquisition_mode: Optional[str] = Field(None, description="Sensor mode (e.g., IW)")
    satellite_acquired_at: Optional[str] = Field(None, description="Exact timestamp of SAR acquisition")
    time_difference_hours: Optional[float] = Field(None, description="Hours between FIRMS and Sentinel-1 acquisitions")
    image_url: Optional[str] = Field(None, description="URL endpoint serving genuine SAR georeferenced raster")
    source: str = Field("Copernicus Data Space", description="Evidence source")
    product: str = Field("Sentinel-1 GRD", description="Product type")
    is_synthetic: bool = Field(False, description="Strict safety flag indicating imagery is not synthetic")
    reason_not_queried: Optional[str] = Field(None, description="Explanation when Sentinel-1 was skipped")
    sar_disclaimer: str = Field(
        MANDATORY_SAR_DISCLAIMER,
        description="Mandatory scientific SAR disclaimer"
    )

    model_config = {"populate_by_name": True}


class FusionResult(BaseModel):
    candidate_class: str = Field(..., description="Synthesized candidate classification: WILDFIRE, INDUSTRIAL_FIRE, NON_FIRE, UNKNOWN")
    candidate_score: float = Field(..., description="Bounded multi-source fusion score in [0.0, 1.0]")
    evidence_strength: str = Field(..., description="Strength of supporting evidence: STRONG, MODERATE, WEAK, INSUFFICIENT")
    confidence_label: str = Field(..., description="Qualitative confidence: HIGH, MEDIUM, LOW, INCONCLUSIVE")
    reasoning: List[str] = Field(default_factory=list, description="Step-by-step decision rationales")
    warnings: List[str] = Field(default_factory=list, description="Active guardrail triggers and conflict notices")
    contributing_evidence: Dict[str, Any] = Field(default_factory=dict, description="Active weights and normalized scores")


class RiskResult(BaseModel):
    risk_score: int = Field(..., description="Integrated risk score in [0, 100]")
    risk_level: str = Field(..., description="Risk tier: LOW, MODERATE, HIGH, CRITICAL")
    factors: Dict[str, Any] = Field(default_factory=dict, description="Contributing risk components")


class Provenance(BaseModel):
    sources: List[str] = Field(default_factory=list, description="List of all contributing data providers")
    timestamps: Dict[str, Optional[str]] = Field(default_factory=dict, description="Component acquisition timestamps")
    firms_acquired_at: Optional[str] = Field(None, description="FIRMS observation time")
    sentinel2_acquired_at: Optional[str] = Field(None, description="Sentinel-2 acquisition time")
    sentinel1_acquired_at: Optional[str] = Field(None, description="Sentinel-1 acquisition time")
    satellite_primary_source: str = Field("Copernicus Data Space Sentinel-2 L2A", description="Primary optical satellite source")
    satellite_backup_source: str = Field("Copernicus Data Space Sentinel-1 GRD", description="Backup SAR radar satellite source")
    selected_satellite: str = Field("SENTINEL_2", description="Active satellite source: SENTINEL_2, SENTINEL_1, NONE")
    temporal_offset_hours: Optional[float] = Field(None, description="Temporal offset in hours between FIRMS and satellite")
    disclaimer: str = Field(
        "AI Candidate Classification is an evidence-fusion output, not a standalone confirmation of an industrial fire. "
        "Sentinel-2 imagery is optical evidence and may not be temporally coincident with the FIRMS observation. "
        "Sentinel-1 is SAR radar evidence that can provide cloud-independent surface information. It does not measure fire temperature.",
        description="Mandatory scientific disclaimer"
    )


class InvestigationResponse(BaseModel):
    observation_id: str = Field(..., description="Unique FIRMS observation identifier")
    status: str = Field("SUCCESS", description="Investigation completion status: SUCCESS, PARTIAL_EVIDENCE, DEGRADED")
    detection: DetectionEvidence = Field(..., description="NASA FIRMS thermal anomaly metrics")
    persistence: PersistenceEvidence = Field(..., description="Temporal persistence evidence")
    industrial_context: IndustrialContextEvidence = Field(..., description="OpenStreetMap industrial proximity context")
    sentinel2: Sentinel2Evidence = Field(..., description="Copernicus Sentinel-2 optical CNN evidence")
    sentinel1: Sentinel1Evidence = Field(default_factory=Sentinel1Evidence, description="Copernicus Sentinel-1 SAR radar backup evidence")
    selected_satellite: str = Field("SENTINEL_2", description="Active satellite source: SENTINEL_2, SENTINEL_1, NONE")
    satellite_fallback_reason: Optional[str] = Field(None, description="Reason Sentinel-1 backup was triggered, or None if S2 was usable")
    fusion: FusionResult = Field(..., description="Phase 6E Multi-Source Evidence Fusion Result")
    risk: RiskResult = Field(..., description="Operational hazard risk assessment")
    provenance: Provenance = Field(..., description="Data lineage, timestamps, and disclaimers")
    warnings: List[str] = Field(default_factory=list, description="System-level warnings and guardrail alerts")
    disclaimers: List[str] = Field(
        default_factory=lambda: [
            "AI Candidate Classification is an evidence-fusion output, not a standalone confirmation of an industrial fire.",
            "Sentinel-2 imagery is optical evidence and may not be temporally coincident with the FIRMS observation.",
            "Sentinel-1 is SAR radar evidence that can provide cloud-independent surface information. It does not measure fire temperature."
        ],
        description="Mandatory regulatory and operational disclaimers"
    )
    created_at: str = Field(..., description="Investigation assembly timestamp in ISO-8601 UTC")
