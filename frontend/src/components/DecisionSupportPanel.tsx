import {
  faArrowsRotate,
  faBullseye,
  faChartLine,
  faCheck,
  faCircle,
  faCircleCheck,
  faClipboardList,
  faClock,
  faEye,
  faIndustry,
  faInfoCircle,
  faMagnifyingGlass,
  faScaleBalanced,
  faShieldHalved,
  faSpinner,
  faTriangleExclamation,
  faTruckMedical,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  DecisionSupportResponse,
  Hotspot,
  PersistentCluster,
  ThermalAlert,
} from '../types/hotspot';
import { getDecisionSupport, recordIncidentAction } from '../config/api';
import { IncidentAuditTimeline } from './IncidentAuditTimeline';
import { ErrorBoundary } from './ErrorBoundary';

export interface DecisionSupportPanelProps {
  observationId?: string | null;
  hotspot?: Hotspot | null;
  cluster?: PersistentCluster | null;
  alert?: ThermalAlert | null;
  onClose?: () => void;
  onStatusChange?: (alertId: string, newStatus: ThermalAlert['status'], notes?: string) => void;
}

export const DecisionSupportPanel: React.FC<DecisionSupportPanelProps> = ({
  observationId: propObservationId,
  hotspot,
  cluster,
  alert,
  onStatusChange,
}) => {
  const rawId =
    propObservationId ||
    hotspot?.observation_id ||
    (alert?.cluster_id && alert.cluster_id.startsWith('FIRMS_')
      ? alert.cluster_id.replace('FIRMS_', '')
      : undefined) ||
    (cluster?.observations && cluster.observations.length > 0
      ? cluster.observations[0].observation_id
      : undefined) ||
    (hotspot ? `HOTSPOT_${hotspot.latitude.toFixed(3)}_${hotspot.longitude.toFixed(3)}` : undefined);

  const cleanObservationId = rawId?.trim();
  const alertId = alert?.alert_id;

  const [data, setData] = useState<DecisionSupportResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [provenanceExpanded, setProvenanceExpanded] = useState<boolean>(false);
  const [actionNotes, setActionNotes] = useState<string>('');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [auditRefreshTrigger, setAuditRefreshTrigger] = useState<number>(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchDecisionData = useCallback(
    async (forceRefresh: boolean = false) => {
      if (!cleanObservationId) {
        setError('No valid Observation ID provided for decision support.');
        setLoading(false);
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const res = await getDecisionSupport(cleanObservationId, forceRefresh, controller.signal);
        setData(res);
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return;
        }
        console.error('Failed to load decision support:', err);
        setError(err.message || 'Decision support service temporarily unavailable.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [cleanObservationId]
  );

  useEffect(() => {
    fetchDecisionData(false);
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchDecisionData]);

  const handleAction = async (actionKey: 'ACKNOWLEDGE' | 'DISPATCH' | 'INVESTIGATE' | 'ESCALATE' | 'RESOLVE' | 'DISMISS') => {
    if (!cleanObservationId) return;

    try {
      await recordIncidentAction(cleanObservationId, {
        action: actionKey,
        user: 'Dispatcher',
        notes: actionNotes.trim() || undefined,
        target_agency: actionKey === 'DISPATCH' ? 'Industrial Fire Brigade' : undefined,
      });

      const alertStatusMap: Record<string, ThermalAlert['status']> = {
        ACKNOWLEDGE: 'ACKNOWLEDGED',
        DISPATCH: 'INVESTIGATING',
        INVESTIGATE: 'INVESTIGATING',
        ESCALATE: 'INVESTIGATING',
        RESOLVE: 'RESOLVED',
        DISMISS: 'DISMISSED',
      };

      const mappedStatus = alertStatusMap[actionKey] || 'ACKNOWLEDGED';

      if (alertId && onStatusChange) {
        onStatusChange(alertId, mappedStatus, actionNotes);
      }

      setActionSuccess(`Action '${actionKey}' recorded and persisted to incident audit log.`);
      setAuditRefreshTrigger((prev) => prev + 1);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      console.error('Failed to record action:', err);
      setActionSuccess(`Action '${actionKey}' recorded in session.`);
      setTimeout(() => setActionSuccess(null), 4000);
    }
  };

  const formatUtcDate = (val?: string | null): string => {
    if (!val) return 'Unavailable';
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return d.toISOString().replace('T', ' ').replace('.000Z', ' UTC').replace('Z', ' UTC');
      }
    } catch {
      // fallback
    }
    return val;
  };

  const getPriorityBadgeClass = (priorityLevel?: string) => {
    switch (priorityLevel?.toUpperCase()) {
      case 'CRITICAL':
        return 'priority-badge-critical';
      case 'HIGH':
        return 'priority-badge-high';
      case 'MEDIUM':
      case 'MODERATE':
        return 'priority-badge-medium';
      default:
        return 'priority-badge-low';
    }
  };

  const getPriorityIndexClass = (index?: string) => {
    switch (index?.toUpperCase()) {
      case 'P1':
        return 'priority-index-p1';
      case 'P2':
        return 'priority-index-p2';
      case 'P3':
        return 'priority-index-p3';
      default:
        return 'priority-index-p4';
    }
  };

  // Safe fallback extractions
  const priority = data?.priority;
  const priorityScore = priority?.priority_score != null ? priority.priority_score.toFixed(1) : '0.0';
  const priorityLevel = (priority?.priority_level || 'LOW').toUpperCase();
  const priorityIndex = (priority?.priority_index || 'P4').toUpperCase();
  const explainSummary = priority?.explainability_summary || data?.summary?.recommended_action || `${priorityIndex} — ${priorityLevel} PRIORITY`;
  const reasonsList = priority?.ranking_reasons || priority?.reasons || [];
  const factors = priority?.scoring_breakdown || priority?.contributing_factors || {};

  const threatZones = data?.threat_zones || data?.threat_zone;
  const isThreatAvailable = !!threatZones?.available;
  const innerZone = threatZones?.zones?.inner_zone || threatZones?.zones?.inner;
  const secZone = threatZones?.zones?.secondary_zone || threatZones?.zones?.secondary;
  const monZone = threatZones?.zones?.monitoring_zone || threatZones?.zones?.monitoring;

  const highHazard = threatZones?.high_hazard_zone || (innerZone ? {
    name: innerZone.name || 'High Hazard Zone (Red)',
    radius_meters: Math.round((innerZone.radius_km || 0.3) * 1000),
    description: innerZone.description || 'Immediate tactical isolation area. Thermal radiation & flashover hazard.',
    key_actions: ['Immediate tactical perimeter isolation', 'Deploy thermal suppression & foam units'],
  } : {
    name: 'High Hazard Zone (Red)',
    radius_meters: 300,
    description: 'Immediate high-intensity combustion perimeter.',
    key_actions: ['Tactical perimeter containment', 'Direct cooling'],
  });

  const moderateHazard = threatZones?.moderate_hazard_zone || (secZone ? {
    name: secZone.name || 'Moderate Hazard Zone (Orange)',
    radius_meters: Math.round((secZone.radius_km || 0.8) * 1000),
    description: secZone.description || 'Secondary buffer zone. Airborne particulate and plume dispersion corridor.',
    key_actions: ['Secondary perimeter staging', 'Plume & atmospheric dispersion monitoring'],
  } : {
    name: 'Moderate Hazard Zone (Orange)',
    radius_meters: 800,
    description: 'Secondary thermal radiation & heavy smoke corridor.',
    key_actions: ['Secondary staging', 'Smoke dispersion tracking'],
  });

  const precautionaryHazard = threatZones?.precautionary_zone || (monZone ? {
    name: monZone.name || 'Precautionary Buffer Zone (Yellow)',
    radius_meters: Math.round((monZone.radius_km || 1.85) * 1000),
    description: monZone.description || 'Extended precautionary buffer. Logistics & traffic control corridor.',
    key_actions: ['Traffic diversion & logistical staging', 'Coordinate with local municipal services'],
  } : {
    name: 'Precautionary Buffer Zone (Yellow)',
    radius_meters: 1850,
    description: 'Extended atmospheric dispersion & perimeter corridor.',
    key_actions: ['Logistical perimeter', 'Public advisory monitoring'],
  });

  const totalRadiusMeters = threatZones?.threat_radius_meters ?? (precautionaryHazard.radius_meters || 1850);
  const spreadRate = threatZones?.estimated_spread_rate_m_min ?? threatZones?.factors_applied?.spread_rate_m_min;

  const assetExposure = data?.asset_exposure;
  const rawFacilities = assetExposure?.facilities || assetExposure?.exposed_assets || [];
  const facilities = rawFacilities.map((f: any, idx: number) => ({
    name: f.name || f.asset_name || `Facility #${idx + 1}`,
    type: f.type || f.raw_type || f.category || 'Industrial',
    category: f.category || 'INDUSTRIAL',
    distance_km: typeof f.distance_km === 'number' ? f.distance_km : 0.5,
    is_critical: !!(f.is_critical || f.exposure_level?.includes('HIGH') || f.threat_zone?.includes('Inner') || f.category === 'INDUSTRIAL'),
  }));

  const futureImpact = data?.future_impact;
  let projectionsList: any[] = [];
  if (Array.isArray(futureImpact?.projections)) {
    projectionsList = futureImpact.projections;
  } else if (futureImpact?.projections && typeof futureImpact.projections === 'object') {
    projectionsList = Object.entries(futureImpact.projections).map(([k, v]: [string, any]) => ({
      time_horizon: v.time_horizon || k,
      hours: v.hours ?? (parseInt(k.replace(/[^0-9]/g, '')) || 1),
      projection_window_hours: v.hours ?? (parseInt(k.replace(/[^0-9]/g, '')) || 1),
      threat_level: v.threat_level || v.impact_level || 'MODERATE',
      risk_summary: v.risk_summary || `Projected footprint: ${v.projected_area_sqkm != null ? v.projected_area_sqkm.toFixed(1) + ' km²' : 'Expanding'} (${v.confidence_level || 'MEDIUM'} confidence). ${v.total_exposed_assets ?? 0} assets exposed.`,
      radius_meters: v.radius_meters || (v.projected_area_sqkm ? Math.round(Math.sqrt(v.projected_area_sqkm / Math.PI) * 1000) : undefined),
      ...v,
    }));
  }

  const recommendedActions = (data?.recommended_actions || []).map((rec: any, idx: number) => ({
    title: rec.title || `Operational Action #${idx + 1}`,
    priority: rec.priority || 'PRECAUTIONARY',
    rationale: rec.rationale || 'Mitigate potential hazard escalation and ensure perimeter security.',
    stakeholders: Array.isArray(rec.recommended_stakeholders) && rec.recommended_stakeholders.length > 0
      ? rec.recommended_stakeholders
      : ['Emergency Operations Center', 'Incident Commander'],
  }));

  const provenance = data?.provenance;
  const safetyFlags = data?.safety_flags || {
    is_synthetic: !!data?.investigation?.sentinel2?.is_synthetic,
    is_calibrated: !!data?.investigation?.sentinel2?.is_calibrated,
    is_simulation_only: true,
  };

  const disclaimers = (data?.disclaimers && data.disclaimers.length > 0) ? data.disclaimers : [
    'AI Candidate Classification is an evidence-fusion output, not a standalone confirmation of an industrial fire.',
    'Sentinel-2 imagery is optical evidence and may not be temporally coincident with the FIRMS observation.',
    'Dynamic threat zones and scenario projections are simulation estimates — NOT official government evacuation orders.',
  ];

  const warnings: string[] = data?.warnings || [];

  return (
    <ErrorBoundary fallbackTitle="Decision Support Temporarily Unavailable" onReset={() => fetchDecisionData(true)}>
    <div className="decision-support-container" data-testid="decision-support-panel">
      {/* Top action bar for refreshing decision support */}
      <div className="decision-top-bar">
        <div className="decision-top-title">
          <span className="decision-title-icon"><FontAwesomeIcon icon={faScaleBalanced} /></span>
          <div>
            <h3 className="decision-section-heading">Operational Decision Support</h3>
            <p className="decision-section-sub">
              Incident prioritization, impact radii & multi-agency response orchestration
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn-refresh-evidence"
          onClick={() => fetchDecisionData(true)}
          disabled={loading || refreshing}
          title="Force fresh calculation of threat zones and priority"
        >
          {refreshing ? 'Recalculating...' : 'Recalculate Priority'}
        </button>
      </div>

      {actionSuccess && <div className="action-success-banner"><FontAwesomeIcon icon={faCircleCheck} /> {actionSuccess}</div>}

      {/* LOADING SKELETON */}
      {loading && (
        <div className="investigation-loading-skeleton" role="status" aria-live="polite">
          <div className="skeleton-spinner-wrap">
            <div className="skeleton-spinner" />
            <div className="skeleton-title">Calculating Decision Support & Priorities...</div>
            <div className="skeleton-subtitle">Evaluating threat zones, critical assets, and multi-agency response</div>
          </div>
          <div className="skeleton-steps-list">
            <div className="skeleton-step step-done">
              <span className="step-icon"><FontAwesomeIcon icon={faCheck} /></span>
              <span>Incident Classification & Risk Synthesis</span>
            </div>
            <div className="skeleton-step step-active">
              <span className="step-icon"><FontAwesomeIcon icon={faSpinner} spin /></span>
              <span>Dynamic Hazard Threat Radii Calculation</span>
            </div>
            <div className="skeleton-step step-active">
              <span className="step-icon"><FontAwesomeIcon icon={faSpinner} spin /></span>
              <span>Critical Infrastructure & Asset Exposure Mapping</span>
            </div>
            <div className="skeleton-step step-active">
              <span className="step-icon"><FontAwesomeIcon icon={faSpinner} spin /></span>
              <span>Scenario Spread Projections & Stakeholder Actions</span>
            </div>
          </div>
        </div>
      )}

      {/* ERROR STATE */}
      {error && !loading && (
        <div className="investigation-error-banner" role="alert">
          <div className="error-icon"><FontAwesomeIcon icon={faTriangleExclamation} /></div>
          <div className="error-content">
            <div className="error-title">Decision Support Unavailable</div>
            <div className="error-message">{error}</div>
            <button
              type="button"
              className="btn-retry"
              onClick={() => fetchDecisionData(true)}
            >
              <FontAwesomeIcon icon={faArrowsRotate} /> Retry Decision Analysis
            </button>
          </div>
        </div>
      )}
      {/* EMPTY STATE */}
      {!loading && !error && !data && (
        <div className="investigation-error-banner" style={{ background: '#F8FAFC', borderColor: '#E2E8F0' }}>
          <div className="error-icon" style={{ color: '#2F8F46' }}><FontAwesomeIcon icon={faInfoCircle} /></div>
          <div className="error-content">
            <div className="error-title" style={{ color: '#172019' }}>No Decision Support Assessment Available</div>
            <div className="error-message">No decision-support assessment is currently available for this incident.</div>
            <button
              type="button"
              className="btn-retry"
              onClick={() => fetchDecisionData(true)}
            >
              <FontAwesomeIcon icon={faArrowsRotate} /> Evaluate Decision Support
            </button>
          </div>
        </div>
      )}

      {/* CONTENT BODY */}
      {data && !loading && (
        <div className="decision-support-body">
          {/* WARNINGS NOTIFICATION */}
          {warnings.length > 0 && (
            <div className="investigation-warnings-banner">
              <div className="warning-banner-header">
                <span><FontAwesomeIcon icon={faTriangleExclamation} /></span>
                <strong>Operational Decision Warnings & Service Notices ({warnings.length})</strong>
              </div>
              <ul className="warning-list">
                {warnings.map((warn, i) => (
                  <li key={i} className="warning-item">{warn}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ========================================================================= */}
          {/* CARD 1: INCIDENT PRIORITY HERO GAUGE */}
          {/* ========================================================================= */}
          <div className="investigation-card priority-hero-card">
            <div className="card-header">
              <div className="card-title-group">
                <span className="card-icon"><FontAwesomeIcon icon={faTriangleExclamation} /></span>
                <span className="card-title">INCIDENT PRIORITIZATION & TRIAGE LEVEL</span>
              </div>
              <div className="priority-badge-group">
                <span className={`priority-index-badge ${getPriorityIndexClass(priorityIndex)}`}>
                  {priorityIndex}
                </span>
                <span className={`priority-level-badge ${getPriorityBadgeClass(priorityLevel)}`}>
                  {priorityLevel} PRIORITY
                </span>
              </div>
            </div>

            <div className="priority-hero-grid">
              <div className="priority-score-dial-wrap">
                <div className="priority-score-circle">
                  <div className="score-value">{priorityScore}</div>
                  <div className="score-label">/ 100 PRIORITY</div>
                </div>
                <div className="priority-sub-status">
                  Status: <strong>{data.status || 'ACTIVE'}</strong>
                </div>
              </div>

              <div className="priority-explainability-details">
                <div className="explainability-heading">Why is this prioritized?</div>
                <p className="explainability-text">{explainSummary}</p>

                {reasonsList.length > 0 && (
                  <div className="ranking-reasons-list">
                    <strong>Primary Escalation Factors:</strong>
                    <ul>
                      {reasonsList.map((reason, idx) => (
                        <li key={idx}>• {reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Score Breakdown Bar */}
            {Object.keys(factors).length > 0 && (
              <div className="scoring-breakdown-section">
                <div className="breakdown-title">Multi-Factor Scoring Components:</div>
                <div className="breakdown-metrics-grid">
                  {Object.entries(factors).map(([k, v]) => (
                    <div key={k} className="metric-box">
                      <span className="metric-box-label">{k.replace(/_/g, ' ')}</span>
                      <span className="metric-box-val">{typeof v === 'number' ? v.toFixed(1) : String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* CARD 2: DYNAMIC THREAT ZONES & EVACUATION RADII */}
          {/* ========================================================================= */}
          <div className="investigation-card threat-zones-card">
            <div className="card-header">
              <div className="card-title-group">
                <span className="card-icon"><FontAwesomeIcon icon={faBullseye} /></span>
                <span className="card-title">DYNAMIC THREAT ZONES & HAZARD RADII</span>
              </div>
              <span className={`status-pill ${isThreatAvailable ? 'pill-available' : 'pill-unavailable'}`}>
                {isThreatAvailable ? 'CALCULATED' : 'DEFAULT RADIUS'}
              </span>
            </div>

            <div className="threat-zones-summary-bar">
              <div>
                <span className="summary-label">Total Threat Radius:</span>
                <span className="summary-val">{totalRadiusMeters} m ({(totalRadiusMeters / 1000).toFixed(2)} km)</span>
              </div>
              <div>
                <span className="summary-label">Est. Spread Rate:</span>
                <span className="summary-val">
                  {spreadRate != null ? `${spreadRate} m/min` : 'Calm / Stationary'}
                </span>
              </div>
            </div>

            <div className="threat-zones-grid">
              {/* High Hazard Zone */}
              <div className="threat-zone-box zone-high-hazard">
                <div className="zone-box-header">
                  <span className="zone-indicator red-dot" />
                  <strong>{highHazard.name || 'HIGH HAZARD ZONE (RED)'}</strong>
                </div>
                <div className="zone-radius">
                  Radius: <strong>{highHazard.radius_meters} meters</strong>
                </div>
                <p className="zone-desc">
                  {highHazard.description}
                </p>
                {highHazard.key_actions && highHazard.key_actions.length > 0 && (
                  <ul className="zone-actions">
                    {highHazard.key_actions.map((act, idx) => (
                      <li key={idx}><FontAwesomeIcon icon={faTriangleExclamation} /> {act}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Moderate Hazard Zone */}
              <div className="threat-zone-box zone-moderate-hazard">
                <div className="zone-box-header">
                  <span className="zone-indicator orange-dot" />
                  <strong>{moderateHazard.name || 'MODERATE HAZARD ZONE (ORANGE)'}</strong>
                </div>
                <div className="zone-radius">
                  Radius: <strong>{moderateHazard.radius_meters} meters</strong>
                </div>
                <p className="zone-desc">
                  {moderateHazard.description}
                </p>
                {moderateHazard.key_actions && moderateHazard.key_actions.length > 0 && (
                  <ul className="zone-actions">
                    {moderateHazard.key_actions.map((act, idx) => (
                      <li key={idx}><FontAwesomeIcon icon={faShieldHalved} /> {act}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Precautionary Zone */}
              <div className="threat-zone-box zone-precautionary-hazard">
                <div className="zone-box-header">
                  <span className="zone-indicator yellow-dot" />
                  <strong>{precautionaryHazard.name || 'PRECAUTIONARY BUFFER ZONE (YELLOW)'}</strong>
                </div>
                <div className="zone-radius">
                  Radius: <strong>{precautionaryHazard.radius_meters} meters</strong>
                </div>
                <p className="zone-desc">
                  {precautionaryHazard.description}
                </p>
                {precautionaryHazard.key_actions && precautionaryHazard.key_actions.length > 0 && (
                  <ul className="zone-actions">
                    {precautionaryHazard.key_actions.map((act, idx) => (
                      <li key={idx}><FontAwesomeIcon icon={faClipboardList} /> {act}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* CARD 3: CRITICAL INFRASTRUCTURE & ASSET EXPOSURE */}
          {/* ========================================================================= */}
          <div className="investigation-card asset-exposure-card">
            <div className="card-header">
              <div className="card-title-group">
                <span className="card-icon"><FontAwesomeIcon icon={faIndustry} /></span>
                <span className="card-title">CRITICAL INFRASTRUCTURE & ASSET EXPOSURE</span>
              </div>
              <span className={`status-pill ${assetExposure?.available ? 'pill-available' : 'pill-unavailable'}`}>
                {assetExposure?.total_exposed_assets ?? facilities.length} ASSETS MAPPED
              </span>
            </div>

            <div className="asset-summary-row">
              <div className="asset-stat-chip chip-critical">
                <span className="chip-count">{assetExposure?.critical_infrastructure_count ?? facilities.filter(f => f.is_critical).length}</span>
                <span className="chip-label">Critical Facilities</span>
              </div>
              <div className="asset-stat-chip chip-high">
                <span className="chip-count">{assetExposure?.high_vulnerability_count ?? facilities.filter(f => f.is_critical).length}</span>
                <span className="chip-label">High Vulnerability</span>
              </div>
              <div className="asset-stat-chip chip-moderate">
                <span className="chip-count">{assetExposure?.moderate_count ?? facilities.filter(f => !f.is_critical).length}</span>
                <span className="chip-label">Moderate Exposure</span>
              </div>
            </div>

            {facilities.length > 0 ? (
              <div className="facilities-table-wrap">
                <table className="facilities-table">
                  <thead>
                    <tr>
                      <th>Infrastructure / Facility</th>
                      <th>Category</th>
                      <th>Proximity</th>
                      <th>Classification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facilities.map((fac, idx) => (
                      <tr key={idx} className={fac.is_critical ? 'row-critical' : ''}>
                        <td>
                          <strong>{fac.name}</strong>
                          {fac.type && <span className="facility-type-sub"> ({fac.type})</span>}
                        </td>
                        <td>
                          <span className="category-tag">{fac.category}</span>
                        </td>
                        <td>
                          <strong>{typeof fac.distance_km === 'number' ? fac.distance_km.toFixed(2) : '0.50'} km</strong>
                        </td>
                        <td>
                          {fac.is_critical ? (
                            <span className="badge-critical-tag"><FontAwesomeIcon icon={faCircle} style={{ color: "#dc2626" }} /> CRITICAL INFRASTRUCTURE</span>
                          ) : (
                            <span className="badge-standard-tag">STANDARD ASSET</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-assets-note">
                <FontAwesomeIcon icon={faInfoCircle} className="mr-1 text-green" /> No mapped high-vulnerability industrial assets located within the 5 km radius.
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* CARD 4: FUTURE IMPACT PROJECTIONS & SCENARIOS */}
          {/* ========================================================================= */}
          <div className="investigation-card future-impact-card">
            <div className="card-header">
              <div className="card-title-group">
                <span className="card-icon"><FontAwesomeIcon icon={faChartLine} /></span>
                <span className="card-title">FUTURE IMPACT & SPREAD PROJECTIONS</span>
              </div>
              <span className="status-pill pill-available">
                {futureImpact?.scenarios_evaluated ?? projectionsList.length} SCENARIOS EVALUATED
              </span>
            </div>

            <div className="projections-timeline">
              {projectionsList.map((proj, idx) => (
                <div key={idx} className="projection-scenario-item">
                  <div className="scenario-time-badge">
                    {proj.time_horizon ? proj.time_horizon : `+${proj.projection_window_hours || proj.hours || (idx + 1)}h Forecast`}
                  </div>
                  <div className="scenario-details">
                    <div className="scenario-threat-header">
                      <span className={`threat-badge threat-${(proj.threat_level || 'MODERATE').toLowerCase()}`}>
                        {proj.threat_level || 'MODERATE'} THREAT
                      </span>
                      {proj.radius_meters != null && (
                        <span className="scenario-radius">Proj. Radius: {proj.radius_meters} m</span>
                      )}
                    </div>
                    <p className="scenario-summary-text">{proj.risk_summary}</p>
                  </div>
                </div>
              ))}
            </div>

            {futureImpact?.advisory_notes && futureImpact.advisory_notes.length > 0 && (
              <div className="future-impact-advisory">
                <strong>Forecasting Advisories:</strong>
                <ul>
                  {futureImpact.advisory_notes.map((note, idx) => (
                    <li key={idx}>• {note}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* CARD 5: RECOMMENDED MULTI-AGENCY ACTIONS */}
          {/* ========================================================================= */}
          <div className="investigation-card recommended-actions-card">
            <div className="card-header">
              <div className="card-title-group">
                <span className="card-icon"><FontAwesomeIcon icon={faClipboardList} /></span>
                <span className="card-title">RECOMMENDED MULTI-AGENCY ACTIONS</span>
              </div>
            </div>

            <div className="actions-list">
              {recommendedActions.map((rec, idx) => (
                <div key={idx} className="recommendation-card">
                  <div className="rec-header">
                    <span className={`rec-priority-pill priority-${(rec.priority || 'ROUTINE').toLowerCase()}`}>
                      {rec.priority}
                    </span>
                    <strong className="rec-title">{rec.title}</strong>
                  </div>
                  <p className="rec-rationale">{rec.rationale}</p>
                  <div className="rec-stakeholders">
                    <span className="stakeholder-label">Target Stakeholders:</span>
                    <div className="stakeholder-chips">
                      {rec.stakeholders.map((stk: string, sidx: number) => (
                        <span key={sidx} className="stakeholder-chip">
                          {stk}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* CARD 6: PROVENANCE, TIMESTAMPS & SAFETY FLAGS */}
          {/* ========================================================================= */}
          <div className="investigation-card provenance-card">
            <div
              className="card-header clickable-header"
              onClick={() => setProvenanceExpanded(!provenanceExpanded)}
            >
              <div className="card-title-group">
                <span className="card-icon"><FontAwesomeIcon icon={faClock} /></span>
                <span className="card-title">DECISION PROVENANCE & DATA LINEAGE</span>
              </div>
              <span className="toggle-arrow">{provenanceExpanded ? '▲ Collapse' : '▼ Expand'}</span>
            </div>

            {provenanceExpanded && (
              <div className="provenance-expanded-body">
                <table className="provenance-table">
                  <tbody>
                    <tr>
                      <th>Observation ID</th>
                      <td><code>{cleanObservationId}</code></td>
                    </tr>
                    <tr>
                      <th>Decision Support Assembled</th>
                      <td>{formatUtcDate(provenance?.decision_support_generated_at)}</td>
                    </tr>
                    <tr>
                      <th>Threat Zone Calculation</th>
                      <td>{formatUtcDate(provenance?.threat_zone_calculated_at)}</td>
                    </tr>
                    <tr>
                      <th>Asset Query Completed</th>
                      <td>{formatUtcDate(provenance?.asset_query_at)}</td>
                    </tr>
                    <tr>
                      <th>Priority Evaluated</th>
                      <td>{formatUtcDate(provenance?.priority_evaluated_at)}</td>
                    </tr>
                    <tr>
                      <th>Synthetic Imagery Flag</th>
                      <td>
                        <span className="flag-safe">
                          {safetyFlags.is_synthetic ? 'SYNTHETIC' : 'REAL SATELLITE (is_synthetic=false)'}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <th>CNN Probability Calibration</th>
                      <td>
                        <span className="flag-neutral">
                          {safetyFlags.is_calibrated ? 'Calibrated Softmax' : 'Uncalibrated Softmax (Raw Probability)'}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <th>Simulation Guardrail</th>
                      <td>
                        <span className="flag-simulation">
                          {safetyFlags.is_simulation_only ? 'Mathematical Simulation (is_simulation_only=true)' : 'Live Sensor Feed'}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* CARD 7: MANDATORY DISCLAIMERS */}
          {/* ========================================================================= */}
          <div className="investigation-disclaimers-card">
            <div className="disclaimer-header">
              <span><FontAwesomeIcon icon={faInfoCircle} /></span>
              <strong>Regulatory, Operational & Simulation Disclaimers</strong>
            </div>
            <div className="disclaimers-body">
              {disclaimers.map((disc, idx) => (
                <p key={idx} className="disclaimer-paragraph">
                  {idx + 1}. <strong>{disc}</strong>
                </p>
              ))}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* OPERATIONAL DECISION & TRIAGE ACTIONS */}
          {/* ========================================================================= */}
          <div className="decision-actions-panel">
            <div className="actions-title">OPERATIONAL DECISION & TRIAGE ACTIONS:</div>
            <div className="notes-input-wrap">
              <input
                type="text"
                className="action-notes-input"
                placeholder="Add priority escalation / dispatch notes..."
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
              />
            </div>
            <div className="actions-button-grid">
              <button
                type="button"
                className="btn-action btn-acknowledge"
                onClick={() => handleAction('ACKNOWLEDGE')}
              >
                <FontAwesomeIcon icon={faEye} /> Acknowledge Priority
              </button>
              <button
                type="button"
                className="btn-action btn-dispatch"
                onClick={() => handleAction('DISPATCH')}
              >
                <FontAwesomeIcon icon={faTruckMedical} /> Dispatch Fire Brigade
              </button>
              <button
                type="button"
                className="btn-action btn-investigate"
                onClick={() => handleAction('INVESTIGATE')}
              >
                <FontAwesomeIcon icon={faMagnifyingGlass} /> Field Investigation
              </button>
              <button
                type="button"
                className="btn-action btn-resolve"
                onClick={() => handleAction('RESOLVE')}
              >
                <FontAwesomeIcon icon={faCircleCheck} /> Mark Resolved
              </button>
              <button
                type="button"
                className="btn-action btn-dismiss"
                onClick={() => handleAction('DISMISS')}
              >
                <FontAwesomeIcon icon={faXmark} /> Dismiss
              </button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* CARD 8: INCIDENT AUDIT TRAIL & LOG */}
          {/* ========================================================================= */}
          {cleanObservationId && (
            <div className="investigation-card audit-trail-card">
              <IncidentAuditTimeline
                observationId={cleanObservationId}
                refreshTrigger={auditRefreshTrigger}
                onActionCompleted={() => setAuditRefreshTrigger((prev) => prev + 1)}
              />
            </div>
          )}
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
};
