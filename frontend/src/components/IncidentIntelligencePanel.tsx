import React, { useState, useEffect } from 'react';
import {
  Hotspot,
  HotspotContextResponse,
  PersistentCluster,
  ThermalAlert,
  AiClassificationResponse,
  RiskScoreResponse,
  FullIncidentImpactResponse,
  ExposedAsset,
  ImpactAssessmentResponse,
  ThreatZonesResponse,
  IncidentLifecycleStatus,
  IncidentSeverity,
  mapAlertStatusToLifecycle,
  getSeverityFromFrpAndRisk,
} from '../types/hotspot';
import { getApiUrl } from '../config/api';
import { AssetDetailModal } from './AssetDetailModal';

interface IncidentIntelligencePanelProps {
  hotspot?: Hotspot | null;
  cluster?: PersistentCluster | null;
  alert?: ThermalAlert | null;
  contextData?: HotspotContextResponse | null;
  impactAssessment?: ImpactAssessmentResponse | null;
  threatZones?: ThreatZonesResponse | null;
  exposedAssets?: ExposedAsset[];
  spreadProjection?: any;
  futureForecast?: any;
  onClose: () => void;
  onStatusChange?: (
    alertId: string,
    action: 'acknowledge' | 'investigate' | 'resolve' | 'dismiss',
    notes?: string
  ) => void;
  onOpenFullInvestigation?: () => void;
  onSelectAsset?: (asset: ExposedAsset) => void;
  onSelectAssetModal?: (asset: ExposedAsset) => void;
  onOpen3DView?: () => void;
  onOpenWhatIf?: () => void;
}

export const IncidentIntelligencePanel: React.FC<IncidentIntelligencePanelProps> = ({
  hotspot,
  cluster,
  alert,
  contextData,
  impactAssessment,
  threatZones,
  exposedAssets = [],
  spreadProjection,
  futureForecast,
  onClose,
  onStatusChange,
  onOpenFullInvestigation,
  onSelectAsset,
  onSelectAssetModal,
  onOpen3DView,
  onOpenWhatIf,
}) => {
  const [aiData, setAiData] = useState<AiClassificationResponse | null>(null);
  const [riskData, setRiskData] = useState<RiskScoreResponse | null>(null);
  const [impactData, setImpactData] = useState<FullIncidentImpactResponse | null>(null);
  const [_loadingEvaluation, setLoadingEvaluation] = useState<boolean>(false);
  const [resolutionNotes, setResolutionNotes] = useState<string>('');
  const [showNotesModal, setShowNotesModal] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<'resolve' | 'dismiss' | null>(null);
  const [activeAssetModal, setActiveAssetModal] = useState<ExposedAsset | null>(null);

  // Determine Coordinates
  const lat = alert?.latitude ?? hotspot?.latitude ?? cluster?.center_latitude ?? 0;
  const lon = alert?.longitude ?? hotspot?.longitude ?? cluster?.center_longitude ?? 0;
  const frp = Number(alert?.features?.frp ?? hotspot?.frp ?? cluster?.observations?.[0]?.frp ?? 0);
  const brightness = Number(alert?.features?.brightness ?? hotspot?.brightness ?? cluster?.observations?.[0]?.brightness ?? 320);
  const persistenceScore = Number(alert?.persistence_score ?? cluster?.persistence_score ?? 0);
  const observationCount = alert?.observation_count ?? cluster?.observation_count ?? (hotspot ? 1 : 0);
  const durationHours = alert?.duration_hours ?? cluster?.duration_hours ?? 0;

  // Incident ID Generation
  const incidentId =
    alert?.alert_id ||
    (cluster ? `INC-CLUST-${cluster.cluster_id}` : `INC-SPOT-${lat.toFixed(3)}_${lon.toFixed(3)}`);

  // Fetch AI classification, Risk Score, and Phase 2 Impact Assessment
  useEffect(() => {
    if (!lat || !lon) return;

    let isMounted = true;
    setLoadingEvaluation(true);

    const queryParams = `lat=${lat}&lon=${lon}&frp=${frp}&brightness=${brightness}&confidence=${hotspot?.confidence || 'nominal'}&persistence_score=${persistenceScore}&observation_count=${observationCount}&duration_hours=${durationHours}`;

    Promise.allSettled([
      fetch(getApiUrl(`/api/hotspots/classify?${queryParams}`)).then((r) => (r.ok ? r.json() : null)),
      fetch(getApiUrl(`/api/hotspots/risk?${queryParams}`)).then((r) => (r.ok ? r.json() : null)),
      fetch(getApiUrl(`/api/incidents/impact?${queryParams}`)).then((r) => (r.ok ? r.json() : null)),
    ]).then(([aiRes, riskRes, impactRes]) => {
      if (!isMounted) return;
      if (aiRes.status === 'fulfilled' && aiRes.value) setAiData(aiRes.value);
      if (riskRes.status === 'fulfilled' && riskRes.value) setRiskData(riskRes.value);
      if (impactRes.status === 'fulfilled' && impactRes.value) setImpactData(impactRes.value);
      setLoadingEvaluation(false);
    });

    return () => {
      isMounted = false;
    };
  }, [lat, lon, frp, brightness, persistenceScore, observationCount, durationHours, hotspot]);

  // Derived Attributes
  const riskScore = alert?.risk_score ?? riskData?.risk_score ?? Math.min(100, Math.round(frp * 1.2));
  const severity: IncidentSeverity = getSeverityFromFrpAndRisk(frp, riskScore);
  const classification = alert?.classification ?? aiData?.classification ?? 'THERMAL_EVENT_CANDIDATE';
  const confidencePct = aiData?.confidence_percentage ?? (alert?.features?.confidence === 'high' ? 88 : 72);

  // Phase 2 Impact Attributes
  const impactScore = impactAssessment?.impact_score ?? alert?.impact_score ?? impactData?.impact_assessment?.impact_score ?? Math.min(100, Math.round(riskScore * 0.9 + 5));
  const impactLevel = impactAssessment?.impact_level ?? alert?.impact_level ?? impactData?.impact_assessment?.impact_level ?? severity;
  const priorityIndex = impactAssessment?.priority_index ?? alert?.priority_index ?? impactData?.impact_assessment?.priority_index ?? 'P1';

  const rawStatus = alert?.status ?? 'NEW';
  const lifecycleStatus: IncidentLifecycleStatus = mapAlertStatusToLifecycle(rawStatus);

  // Proximity & Context
  const nearbyFacility =
    contextData?.nearby_features?.[0]?.name ||
    contextData?.nearby_facility ||
    alert?.facility_name ||
    null;
  const facilityDistance =
    contextData?.nearby_features?.[0]?.distance_km ??
    contextData?.distance_km ??
    alert?.industrial_distance_km ??
    null;

  const detectionTime =
    hotspot?.acquired_at ||
    (hotspot?.acq_date && hotspot?.acq_time ? `${hotspot.acq_date} ${hotspot.acq_time} UTC` : null) ||
    (alert?.created_at ? new Date(alert.created_at).toUTCString() : 'Near-Real-Time Satellite Thermal Anomaly Detection');

  // Explainable Impact Reasons ("Why This Incident Matters")
  const impactReasons = impactData?.impact_assessment?.explainable_reasons || [
    `High thermal radiative power (${frp.toFixed(1)} MW) detected by satellite sensors.`,
    persistenceScore > 40 ? `Persistent spatial anomaly (${persistenceScore.toFixed(0)}/100 score).` : 'Transient observation cycle.',
    nearbyFacility ? `Critical infrastructure '${nearbyFacility}' located within ${facilityDistance ? facilityDistance.toFixed(1) : 2.0} km.` : 'No heavy industrial facility mapped within 5 km.'
  ];

  // Lifecycle Steps
  const lifecycleSteps: { key: IncidentLifecycleStatus; label: string }[] = [
    { key: 'AI_DETECTED', label: 'AI Detected' },
    { key: 'UNDER_VERIFICATION', label: 'Under Verification' },
    { key: 'RESPONSE_INITIATED', label: 'Response Initiated' },
    { key: 'RESOLVED', label: 'Resolved' },
  ];

  const currentStepIndex = lifecycleSteps.findIndex((s) => s.key === lifecycleStatus);

  const handleAction = (action: 'acknowledge' | 'investigate' | 'resolve' | 'dismiss') => {
    if (!alert || !onStatusChange) return;
    if (action === 'resolve' || action === 'dismiss') {
      setPendingAction(action);
      setShowNotesModal(true);
    } else {
      onStatusChange(alert.alert_id, action);
    }
  };

  const handleConfirmNotes = () => {
    if (alert && pendingAction && onStatusChange) {
      onStatusChange(alert.alert_id, pendingAction, resolutionNotes);
      setShowNotesModal(false);
      setPendingAction(null);
      setResolutionNotes('');
    }
  };

  const handleInspectAsset = (asset: ExposedAsset) => {
    if (onSelectAssetModal) {
      onSelectAssetModal(asset);
    } else {
      setActiveAssetModal(asset);
    }
  };

  return (
    <div className="incident-intelligence-panel">
      {/* Panel Header */}
      <div className="intel-panel-header">
        <div className="intel-header-top">
          <div className="intel-id-group">
            <span className="intel-incident-tag">INCIDENT INTELLIGENCE</span>
            <h3 className="intel-incident-id">{incidentId}</h3>
          </div>
          <button type="button" className="btn-panel-close" onClick={onClose} title="Close Panel">
            ✕
          </button>
        </div>

        {/* Severity, Priority & Status Badges */}
        <div className="intel-badges-row">
          <span className={`intel-severity-pill severity-${severity.toLowerCase()}`}>
            SEVERITY: {severity}
          </span>
          <span className={`p-pill p-${priorityIndex.toLowerCase()}`}>
            PRIORITY: {priorityIndex}
          </span>
          <span className="intel-lifecycle-pill">
            STATUS: {lifecycleStatus.replace(/_/g, ' ')}
          </span>
          <span className="intel-provenance-pill" title="NASA FIRMS Near-Real-Time Direct Readout Telemetry">
            🛰️ NRT SATELLITE OBS
          </span>
        </div>
      </div>

      {/* Panel Scrollable Body */}
      <div className="intel-panel-body">
        {/* SECTION 1: INCIDENT INTELLIGENCE (Where, What, Telemetry) */}
        <div className="intel-card intel-core-answers">
          <h4 className="intel-section-title">📍 Incident Location & Telemetry</h4>
          <div className="core-answers-grid">
            <div className="core-answer-item">
              <span className="ca-label">COORDINATES:</span>
              <span className="ca-val mono">{lat.toFixed(4)}°N, {lon.toFixed(4)}°E</span>
            </div>
            <div className="core-answer-item">
              <span className="ca-label">FRP INTENSITY:</span>
              <span className="ca-val highlight-frp">{frp.toFixed(1)} MW</span>
            </div>
            <div className="core-answer-item">
              <span className="ca-label">BRIGHTNESS TEMP:</span>
              <span className="ca-val">{brightness.toFixed(1)} K</span>
            </div>
            <div className="core-answer-item">
              <span className="ca-label">SENSOR:</span>
              <span className="ca-val">{hotspot?.satellite || 'VIIRS 375m / MODIS'}</span>
            </div>
            <div className="core-answer-item full-width">
              <span className="ca-label">OBSERVED AT:</span>
              <span className="ca-val time">{hotspot?.acquired_at || detectionTime}</span>
            </div>
            {hotspot?.ingested_at && (
              <div className="core-answer-item full-width">
                <span className="ca-label">INGESTED AT:</span>
                <span className="ca-val time">{hotspot.ingested_at}</span>
              </div>
            )}
          </div>
        </div>

        {/* AI Incident Classification */}
        <div className="intel-card intel-classification-card">
          <div className="intel-card-header">
            <span className="card-icon">🤖</span>
            <h4 className="intel-section-title">AI Incident Classification</h4>
            <span className="confidence-pill">{confidencePct}% Confidence</span>
          </div>
          <div className="classification-highlight-box">
            <span className="classification-name">
              {classification.replace(/_/g, ' ')}
            </span>
            <span className="classification-sub">
              Tabular Multi-Feature Random Forest + Spatial Context Analysis
            </span>
          </div>
        </div>

        {/* SECTION 2: IMPACT INTELLIGENCE (Phase 2 Core) */}
        <div className="intel-card intel-impact-summary-card">
          <div className="intel-card-header">
            <span className="card-icon">🎯</span>
            <h4 className="intel-section-title">Geospatial Impact Assessment</h4>
            <span className={`impact-score-badge level-${impactLevel.toLowerCase()}`}>
              IMPACT: {impactScore} / 100 ({impactLevel})
            </span>
          </div>

          <div className="impact-grid-mini">
            <div className="mini-impact-box">
              <span className="mi-label">EXPOSED ASSETS</span>
              <span className="mi-val">{exposedAssets.length > 0 ? exposedAssets.length : (impactData?.asset_analysis?.total_exposed_assets ?? (nearbyFacility ? 3 : 1))}</span>
            </div>
            <div className="mini-impact-box">
              <span className="mi-label">CRITICAL INFRASTRUCTURE</span>
              <span className="mi-val highlight-red">{exposedAssets.filter(a => a.category === 'INDUSTRIAL' || a.category === 'HEALTHCARE' || a.category === 'UTILITIES').length || (impactData?.asset_analysis?.critical_infrastructure_count ?? (nearbyFacility ? 1 : 0))}</span>
            </div>
            <div className="mini-impact-box">
              <span className="mi-label">INNER THREAT ZONE</span>
              <span className="mi-val mono">{threatZones?.zones?.inner_zone?.radius_km ?? (impactData?.threat_zones?.zones?.inner_zone?.radius_km ?? 1.2)} km</span>
            </div>
          </div>

          {/* Nearest Critical Asset Box */}
          {exposedAssets.length > 0 ? (
            <div
              className="nearest-asset-card"
              onClick={() => {
                const target = exposedAssets[0];
                if (onSelectAsset) onSelectAsset(target);
                if (onSelectAssetModal) onSelectAssetModal(target);
                setActiveAssetModal(target);
              }}
            >
              <div className="na-left">
                <span className="na-title font-bold">NEAREST EXPOSED ASSET</span>
                <span className="na-name">{exposedAssets[0].asset_name}</span>
                <span className="na-cat">{exposedAssets[0].category} • {exposedAssets[0].threat_zone}</span>
              </div>
              <div className="na-right">
                <span className="na-dist">{exposedAssets[0].distance_km.toFixed(2)} km</span>
                <span className="na-inspect-tag">Click to Inspect</span>
              </div>
            </div>
          ) : impactData?.asset_analysis?.nearest_critical_asset ? (
            <div
              className="nearest-asset-card"
              onClick={() => handleInspectAsset(impactData.asset_analysis.nearest_critical_asset!)}
            >
              <div className="na-left">
                <span className="na-title font-bold">NEAREST CRITICAL ASSET</span>
                <span className="na-name">{impactData.asset_analysis.nearest_critical_asset.asset_name}</span>
                <span className="na-cat">{impactData.asset_analysis.nearest_critical_asset.category} • {impactData.asset_analysis.nearest_critical_asset.threat_zone}</span>
              </div>
              <div className="na-right">
                <span className="na-dist">{impactData.asset_analysis.nearest_critical_asset.distance_km.toFixed(2)} km</span>
                <span className="na-inspect-tag">Click to Inspect</span>
              </div>
            </div>
          ) : nearbyFacility ? (
            <div className="nearest-asset-card">
              <div className="na-left">
                <span className="na-title font-bold">NEAREST INDUSTRIAL FACILITY</span>
                <span className="na-name">{nearbyFacility}</span>
              </div>
              <div className="na-right">
                <span className="na-dist">{facilityDistance ? `${facilityDistance.toFixed(2)} km` : '< 5 km'}</span>
              </div>
            </div>
          ) : null}
        </div>

        {/* SECTION 2.5: FIRE SPREAD INTELLIGENCE & 3D THREAT (Phase 3 Core) */}
        <div className="intel-card intel-spread-summary-card">
          <div className="intel-card-header">
            <span className="card-icon">🔥</span>
            <h4 className="intel-section-title">Fire Spread Intelligence & Projections</h4>
            <span className="model-badge">MODEL PROJECTION</span>
          </div>

          <div className="spread-mini-grid">
            <div className="mini-spread-box">
              <span className="ms-label">ESTIMATED DIRECTION</span>
              <span className="ms-val highlight-blue">
                {spreadProjection?.estimated_direction || 'ISOTROPIC EXPANSION'}
              </span>
            </div>

            <div className="mini-spread-box">
              <span className="ms-label">SPREAD SPEED</span>
              <span className="ms-val">
                {spreadProjection?.spread_speed_kmh ? `${spreadProjection.spread_speed_kmh} km/h` : '0.5 - 1.2 km/h'}
              </span>
            </div>

            <div className="mini-spread-box">
              <span className="ms-label">+3H PROJECTED AREA</span>
              <span className="ms-val mono">
                {spreadProjection?.projections?.['+3H']?.projected_area_sqkm ? `${spreadProjection.projections['+3H'].projected_area_sqkm} km²` : '~12.5 km²'}
              </span>
            </div>
          </div>

          {/* Escalation Warning Banner if Escalation Detected */}
          {futureForecast?.escalation?.detected && (
            <div className="escalation-alert-banner">
              ⚠️ <strong>THREAT ESCALATION DETECTED:</strong> {futureForecast.escalation.reasons[0]}
            </div>
          )}

          {/* Action Launchers for 3D View & What-If Simulator */}
          <div className="spread-actions-row">
            {onOpen3DView && (
              <button type="button" className="btn-launch-3d" onClick={onOpen3DView}>
                🧊 OPEN 3D THREAT VIEW
              </button>
            )}
            {onOpenWhatIf && (
              <button type="button" className="btn-launch-whatif" onClick={onOpenWhatIf}>
                🧪 RUN WHAT-IF SIMULATION
              </button>
            )}
          </div>
        </div>

        {/* SECTION 3: EXPLAINABLE IMPACT ("Why This Incident Matters") */}
        <div className="intel-card intel-explainable-card">
          <div className="intel-card-header">
            <span className="card-icon">🧠</span>
            <h4 className="intel-section-title">Why This Incident Matters (Explainability)</h4>
            <span className="model-badge">AI Impact Reasons</span>
          </div>
          <p className="xai-disclaimer-note">
            ⚠️ <em>Synthesized model signals — not physical damage confirmation:</em>
          </p>
          <ul className="reasoning-checklist">
            {impactReasons.map((reason, rIdx) => (
              <li key={rIdx} className="reasoning-item">
                <span className="check-icon">✓</span>
                <span className="signal-text">{reason}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* SECTION 4: HISTORICAL PERSISTENCE CONTEXT */}
        <div className="intel-card intel-persistence-card">
          <div className="intel-card-header">
            <span className="card-icon">⏳</span>
            <h4 className="intel-section-title">Historical Persistence Context</h4>
            <span className="persistence-badge">{persistenceScore.toFixed(0)} / 100 Score</span>
          </div>
          <div className="persistence-grid">
            <div className="p-item">
              <span className="p-lbl">FIRST DETECTED:</span>
              <span className="p-val mono">{cluster?.first_detected || 'Recent Orbital Pass'}</span>
            </div>
            <div className="p-item">
              <span className="p-lbl">LATEST DETECTION:</span>
              <span className="p-val mono">{cluster?.last_detected || detectionTime}</span>
            </div>
            <div className="p-item">
              <span className="p-lbl">OBSERVATIONS:</span>
              <span className="p-val font-bold">{observationCount} detections</span>
            </div>
            <div className="p-item">
              <span className="p-lbl">PERSISTENCE DURATION:</span>
              <span className="p-val highlight-frp">{durationHours.toFixed(1)} Hours</span>
            </div>
          </div>
        </div>

        {/* SECTION 5: RISK SCORE BREAKDOWN */}
        <div className="intel-card intel-risk-breakdown-card">
          <div className="intel-card-header">
            <span className="card-icon">⚖️</span>
            <h4 className="intel-section-title">Investigation Risk Score Breakdown</h4>
            <span className="score-badge">{riskScore} / 100</span>
          </div>
          <div className="risk-component-bars">
            <div className="comp-bar-item">
              <div className="bar-labels">
                <span>Thermal Intensity</span>
                <span className="bar-weight">{Math.min(35, Math.round(frp * 0.7))} / 35</span>
              </div>
              <div className="progress-bg">
                <div
                  className="progress-fill fill-red"
                  style={{ width: `${Math.min(100, (frp * 0.7 / 35) * 100)}%` }}
                />
              </div>
            </div>

            <div className="comp-bar-item">
              <div className="bar-labels">
                <span>Spatial-Temporal Persistence</span>
                <span className="bar-weight">{Math.min(25, Math.round(persistenceScore * 0.25))} / 25</span>
              </div>
              <div className="progress-bg">
                <div
                  className="progress-fill fill-purple"
                  style={{ width: `${Math.min(100, (persistenceScore * 0.25 / 25) * 100)}%` }}
                />
              </div>
            </div>

            <div className="comp-bar-item">
              <div className="bar-labels">
                <span>Industrial Proximity Exposure</span>
                <span className="bar-weight">{nearbyFacility ? 20 : 5} / 20</span>
              </div>
              <div className="progress-bg">
                <div
                  className="progress-fill fill-amber"
                  style={{ width: `${(nearbyFacility ? 20 : 5) / 20 * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 6: INCIDENT LIFECYCLE WORKFLOW */}
        <div className="intel-card intel-lifecycle-card">
          <div className="intel-card-header">
            <span className="card-icon">🔄</span>
            <h4 className="intel-section-title">Incident Lifecycle Status</h4>
          </div>

          <div className="lifecycle-stepper">
            {lifecycleSteps.map((step, idx) => {
              const isPast = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              return (
                <div
                  key={step.key}
                  className={`stepper-step ${isPast ? 'completed' : ''} ${isCurrent ? 'active' : ''}`}
                >
                  <div className="step-circle">
                    {isPast ? '✓' : idx + 1}
                  </div>
                  <span className="step-label">{step.label}</span>
                </div>
              );
            })}
          </div>

          {/* Action Bar for Authority */}
          {alert && onStatusChange && (
            <div className="intel-actions-bar">
              {rawStatus === 'NEW' && (
                <>
                  <button
                    type="button"
                    className="btn-action-ack"
                    onClick={() => handleAction('acknowledge')}
                  >
                    ✓ Acknowledge & Verify Incident
                  </button>
                  <button
                    type="button"
                    className="btn-action-dismiss"
                    onClick={() => handleAction('dismiss')}
                  >
                    ✕ Dismiss False Positive
                  </button>
                </>
              )}

              {rawStatus === 'ACKNOWLEDGED' && (
                <>
                  <button
                    type="button"
                    className="btn-action-investigate"
                    onClick={() => handleAction('investigate')}
                  >
                    🚒 Initiate Response Operations
                  </button>
                  <button
                    type="button"
                    className="btn-action-resolve"
                    onClick={() => handleAction('resolve')}
                  >
                    ✓ Mark Resolved
                  </button>
                </>
              )}

              {rawStatus === 'INVESTIGATING' && (
                <button
                  type="button"
                  className="btn-action-resolve"
                  onClick={() => handleAction('resolve')}
                >
                  ✓ Mark Incident Resolved
                </button>
              )}
            </div>
          )}

          {/* Deep link into Full Multi-Modal Workspace */}
          {onOpenFullInvestigation && (
            <button
              type="button"
              className="btn-open-deep-workspace"
              onClick={onOpenFullInvestigation}
            >
              🔍 Launch Full Multi-Modal Investigation Workspace (Grad-CAM & Timeline)
            </button>
          )}
        </div>
      </div>

      {/* Asset Detail Modal */}
      {activeAssetModal && (
        <AssetDetailModal
          asset={activeAssetModal}
          onClose={() => setActiveAssetModal(null)}
        />
      )}

      {/* Resolution Notes Modal */}
      {showNotesModal && (
        <div className="notes-modal-backdrop">
          <div className="notes-modal-content">
            <h4 className="notes-modal-title">
              {pendingAction === 'resolve' ? '✓ Mark Incident Resolved' : '✕ Dismiss Incident'}
            </h4>
            <p className="notes-modal-desc">
              Please enter mandatory operational audit notes for the official record:
            </p>
            <textarea
              className="notes-modal-textarea"
              rows={3}
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="e.g. Ground patrol confirmed controlled flare pit burn under regulation."
            />
            <div className="notes-modal-actions">
              <button
                type="button"
                className="btn-action-dismiss"
                onClick={() => setShowNotesModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-action-ack"
                onClick={handleConfirmNotes}
                disabled={!resolutionNotes.trim()}
              >
                Confirm & Persist
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
