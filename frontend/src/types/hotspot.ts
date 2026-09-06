export interface Hotspot {
  latitude: number;
  longitude: number;
  brightness: number;
  confidence: string | number;
  frp: number;
  acquired_at: string;
  acq_date?: string;
  acq_time?: string;
  satellite: string;
  instrument: string;
  source: string;
}

export interface HotspotsApiResponse {
  source: string;
  region: string;
  bbox: number[];
  count: number;
  hotspots: Hotspot[];
  fetched_at: string;
}

export interface OsmFeature {
  name: string;
  type: 'industrial' | 'power' | 'urban' | 'road';
  category: string;
  latitude: number;
  longitude: number;
  distance_km: number;
  osm_id: string;
}

export interface HotspotContextResponse {
  hotspot: {
    latitude: number;
    longitude: number;
  };
  search_radius_km: number;
  context_classification: 'INDUSTRIAL' | 'URBAN' | 'RURAL_OR_AGRICULTURAL' | 'UNKNOWN';
  facility_count: number;
  nearby_features: OsmFeature[];
  nearby_facility?: string | null;
  distance_km?: number | null;
  fetched_at: string;
}


export interface PersistentCluster {
  cluster_id: string;
  center_latitude: number;
  center_longitude: number;
  observation_count: number;
  first_detected: string;
  last_detected: string;
  duration_hours: number;
  spatial_radius_km: number;
  persistence_score: number;
  total_frp?: number;
  classification: 'TEMPORARY' | 'SUSPICIOUS' | 'PERSISTENT' | 'HIGHLY PERSISTENT';
  observations: Hotspot[];
  industrial_context?: {
    context_classification: string;
    nearby_facility: string | null;
    facility_type: string | null;
    facility_category: string | null;
    distance_km: number | null;
  } | null;
  has_sufficient_history: boolean;
}

export interface PersistentClustersApiResponse {
  source: string;
  region: string;
  total_clusters: number;
  persistent_cluster_count: number;
  spatial_threshold_km: number;
  clusters: PersistentCluster[];
  status: string;
  message?: string;
  fetched_at: string;
}

export interface AiClassificationResponse {
  classification: string;
  confidence_percentage: number;
  model_source: 'ML_MODEL' | 'PROTOTYPE_RULE_ENGINE';
  model_status: 'trained' | 'not_trained';
  model_version: string;
  supporting_indicators: string[];
  features: Record<string, number | string>;
}

export interface RiskScoreResponse {
  risk_score: number;
  risk_level: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  model_source: 'ML_MODEL' | 'PROTOTYPE_RULE_ENGINE';
  classification: string;
  components: {
    thermal_intensity: number;
    satellite_confidence: number;
    persistence: number;
    industrial_proximity: number;
    classification_context: number;
  };
  max_component_weights: {
    thermal_intensity: number;
    satellite_confidence: number;
    persistence: number;
    industrial_proximity: number;
    classification_context: number;
  };
  normalized_scores_100: Record<string, number>;
  reasons: string[];
  features: Record<string, number | string>;
  fetched_at: string;
}

export interface PriorityRankingItem {
  rank: number;
  cluster_id: string;
  latitude: number;
  longitude: number;
  risk_score: number;
  risk_level: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  classification: string;
  industrial_facility: string;
  industrial_distance_km: number | null;
  persistence_score: number;
  observation_count: number;
  duration_hours: number;
  reasons: string[];
}

export interface ThermalAlert {
  alert_id: string;
  cluster_id: string;
  latitude: number;
  longitude: number;
  risk_score: number;
  risk_level: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  frp?: number;
  impact_score?: number;
  impact_level?: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  priority_index?: PriorityIndex;
  classification: string;
  model_source: 'ML_MODEL' | 'PROTOTYPE_RULE_ENGINE';
  persistence_score: number;
  observation_count: number;
  duration_hours: number;
  industrial_distance_km: number | null;
  facility_name: string | null;
  status: 'NEW' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';
  evidence: string[];
  features: Record<string, number | string>;
  created_at: string;
  updated_at: string;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  resolution_notes?: string | null;
}

export interface AlertStats {
  total_alerts: number;
  active_alerts: number;
  critical_alerts: number;
  high_alerts: number;
  acknowledged_alerts: number;
  investigating_alerts: number;
  resolved_today: number;
  fetched_at: string;
}

export interface SatelliteEvidence {
  image_available: boolean;
  classification: 'INDUSTRIAL_FIRE' | 'NATURAL_FIRE' | 'PERSISTENT_THERMAL_SOURCE' | 'NON_FIRE' | 'UNKNOWN';
  confidence: number;
  source: string;
  model?: string;
  model_type?: string;
  model_version?: string;
  captured_at?: string;
  image_url?: string;
  visual_evidence: string;
  class_probabilities?: Record<string, number>;
  gradcam_overlay_path?: string;
  gradcam_region?: string;
}


export interface FusedEvidenceResponse {
  final_classification: string;
  combined_confidence: number;
  combined_confidence_percentage: number;
  combined_risk_score: number;
  risk_level: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  fusion_summary: string;
  evidence: {
    firms: {
      frp_mw: number;
      brightness_k: number;
      confidence: string;
      summary: string;
    };
    osm: {
      context: string;
      nearby_facility: string;
      distance_km: number | null;
      summary: string;
    };
    persistence: {
      persistence_score: number;
      observation_count: number;
      duration_hours: number;
      summary: string;
    };
    satellite: SatelliteEvidence;
  };
}

export type IncidentSeverity = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';

export type IncidentLifecycleStatus =
  | 'AI_DETECTED'
  | 'UNDER_VERIFICATION'
  | 'CONFIRMED'
  | 'RESPONSE_INITIATED'
  | 'CONTAINMENT'
  | 'RESOLVED'
  | 'DISMISSED';

export type AuthorityRole =
  | 'SEOC_DIRECTOR'
  | 'FIRE_RESCUE_CHIEF'
  | 'INDUSTRIAL_SAFETY_INSPECTOR'
  | 'POLICE_COMMISSIONER'
  | 'CITIZEN_OBSERVER';

export interface SystemPipelineEvent {
  id: string;
  timestamp: string;
  stage: string;
  description: string;
  type: 'info' | 'success' | 'warning' | 'alert';
}

export function mapAlertStatusToLifecycle(status: string): IncidentLifecycleStatus {
  switch (status) {
    case 'NEW':
      return 'AI_DETECTED';
    case 'ACKNOWLEDGED':
      return 'UNDER_VERIFICATION';
    case 'INVESTIGATING':
      return 'RESPONSE_INITIATED';
    case 'RESOLVED':
      return 'RESOLVED';
    case 'DISMISSED':
      return 'DISMISSED';
    default:
      return 'AI_DETECTED';
  }
}

export function getSeverityFromFrpAndRisk(frp: number, riskScore?: number): IncidentSeverity {
  if ((riskScore !== undefined && riskScore >= 75) || frp >= 50) return 'CRITICAL';
  if ((riskScore !== undefined && riskScore >= 50) || frp >= 25) return 'HIGH';
  if ((riskScore !== undefined && riskScore >= 30) || frp >= 10) return 'MODERATE';
  return 'LOW';
}

export type PriorityIndex = 'P1' | 'P2' | 'P3' | 'P4';

export interface ThreatZoneDetail {
  name: string;
  radius_km: number;
  color: string;
  fill_opacity: number;
  threat_level: string;
  description: string;
}

export interface ThreatZonesResponse {
  zones: {
    inner_zone: ThreatZoneDetail;
    secondary_zone: ThreatZoneDetail;
    monitoring_zone: ThreatZoneDetail;
  };
  factors_applied: Record<string, any>;
  disclaimer: string;
}

export interface ExposedAsset {
  asset_name: string;
  category: 'INDUSTRIAL' | 'HEALTHCARE' | 'EDUCATION' | 'TRANSPORT' | 'UTILITIES' | 'SETTLEMENTS' | 'PUBLIC';
  raw_type: string;
  latitude: number;
  longitude: number;
  distance_km: number;
  threat_zone: string;
  exposure_level: string;
  status: string;
  data_source: string;
}

export interface AssetAnalysisResponse {
  total_exposed_assets: number;
  critical_infrastructure_count: number;
  category_counts: Record<string, number>;
  nearest_critical_asset?: ExposedAsset | null;
  exposed_assets: ExposedAsset[];
  data_provenance: string;
}

export interface ImpactAssessmentResponse {
  impact_score: number;
  impact_level: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  priority_index: PriorityIndex;
  priority_label: string;
  priority_description: string;
  components: {
    asset_exposure: number;
    infrastructure_criticality: number;
    fire_severity: number;
    persistence: number;
    industrial_context: number;
  };
  max_component_weights: Record<string, number>;
  explainable_reasons: string[];
  summary_statement: string;
}

export interface FullIncidentImpactResponse {
  incident: {
    latitude: number;
    longitude: number;
    frp: number;
    brightness: number;
    classification: string;
    risk_score: number;
    risk_level: string;
  };
  threat_zones: ThreatZonesResponse;
  asset_analysis: AssetAnalysisResponse;
  impact_assessment: ImpactAssessmentResponse;
  data_provenance: string;
}

export interface PriorityIncidentItem {
  cluster_id: string;
  latitude: number;
  longitude: number;
  frp: number;
  risk_score: number;
  risk_level: string;
  impact_score: number;
  impact_level: string;
  priority_index: PriorityIndex;
  priority_label: string;
  classification: string;
  exposed_assets_count: number;
  critical_infrastructure_count: number;
  nearest_critical_asset?: ExposedAsset | null;
  persistence_score: number;
  duration_hours: number;
  observation_count: number;
}

/* ==========================================================================
   PHASE 3 — FIRE SPREAD INTELLIGENCE & 3D THREAT TYPES
   ========================================================================== */

export type TimeHorizonKey = 'NOW' | '+1H' | '+3H' | '+6H' | '+12H';

export interface TimeHorizonGeometry {
  time_horizon: TimeHorizonKey;
  hours: number;
  label: string;
  center_latitude: number;
  center_longitude: number;
  displacement_km: number;
  radii_km: {
    core: number;
    high_risk: number;
    uncertainty: number;
    monitoring: number;
  };
  projected_area_sqkm: number;
  confidence_score: number;
  confidence_level: 'HIGH' | 'MEDIUM' | 'LOW';
  polygon_points: [number, number][];
  relative_intensity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
}

export interface SpreadProjectionResponse {
  incident_origin: {
    latitude: number;
    longitude: number;
    frp: number;
    risk_score: number;
    classification: string;
  };
  wind_data: {
    available: boolean;
    wind_speed_kmh?: number | null;
    wind_direction_deg?: number | null;
    heading_deg?: number | null;
    cardinal_direction: string;
    status_text: string;
  };
  spread_speed_kmh: number;
  estimated_direction: string;
  projections: Record<TimeHorizonKey, TimeHorizonGeometry>;
  explainable_reasons: string[];
  disclaimer: string;
  data_provenance: string;
}

export interface TimeSeriesHorizonImpact {
  time_horizon: TimeHorizonKey;
  hours: number;
  center_latitude: number;
  center_longitude: number;
  projected_area_sqkm: number;
  confidence_score: number;
  confidence_level: string;
  total_exposed_assets: number;
  critical_infrastructure_count: number;
  impact_score: number;
  impact_level: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  priority_index: PriorityIndex;
  priority_label: string;
  nearest_critical_asset?: ExposedAsset | null;
  exposed_assets: ExposedAsset[];
}

export interface FutureImpactForecastResponse {
  incident_origin: any;
  wind_data: any;
  spread_speed_kmh: number;
  estimated_direction: string;
  time_series_forecast: Record<TimeHorizonKey, TimeSeriesHorizonImpact>;
  escalation: {
    detected: boolean;
    initial_priority: string;
    projected_12h_priority: string;
    reasons: string[];
  };
  explainable_reasons: string[];
  disclaimer: string;
  data_provenance: string;
}

export interface SimulationResultResponse {
  status: string;
  is_simulation: boolean;
  isolation_guarantee: string;
  simulated_scenario_inputs: {
    wind_speed_kmh?: number | null;
    wind_direction_deg?: number | null;
    frp?: number | null;
    persistence_score?: number | null;
  };
  comparison_summary: {
    time_horizon: string;
    live_conditions: Record<string, any>;
    simulated_conditions: Record<string, any>;
    deltas: {
      delta_impact_score: number;
      delta_exposed_assets: number;
      delta_projected_area_sqkm: number;
      impact_escalated: boolean;
    };
  };
  live_forecast: FutureImpactForecastResponse;
  simulated_forecast: FutureImpactForecastResponse;
  data_provenance: string;
  disclaimer: string;
}



