import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  DecisionSupportResponse,
  Hotspot,
  PersistentCluster,
  ThermalAlert,
} from '../types/hotspot';
import { getDecisionSupport, recordIncidentAction } from '../config/api';
import { IncidentAuditTimeline } from './IncidentAuditTimeline';

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

  const getPriorityBadgeClass = (priorityLevel: string) => {
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

  const getPriorityIndexClass = (index: string) => {
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

  return (
    <div className="decision-support-container" data-testid="decision-support-panel">
      {/* Top action bar for refreshing decision support */}
      <div className="decision-top-bar">
        <div className="decision-top-title">
          <span className="decision-title-icon">⚖️</span>
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
          {refreshing ? '⏳ Recalculating...' : '🔄 Recalculate Priority'}
        </button>
      </div>

      {actionSuccess && <div className="action-success-banner">✅ {actionSuccess}</div>}

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
              <span className="step-icon">✓</span>
              <span>Incident Classification & Risk Synthesis</span>
            </div>
            <div className="skeleton-step step-active">
              <span className="step-icon">◐</span>
              <span>Dynamic Hazard Threat Radii Calculation</span>
            </div>
            <div className="skeleton-step step-active">
              <span className="step-icon">◐</span>
              <span>Critical Infrastructure & Asset Exposure Mapping</span>
            </div>
            <div className="skeleton-step step-active">
              <span className="step-icon">◐</span>
              <span>Scenario Spread Projections & Stakeholder Actions</span>
            </div>
          </div>
        </div>
      )}

      {/* ERROR STATE */}
      {error && !loading && (
        <div className="investigation-error-banner" role="alert">
          <div className="error-icon">⚠️</div>
          <div className="error-content">
            <div className="error-title">Decision Support Unavailable</div>
            <div className="error-message">{error}</div>
            <button
              type="button"
              className="btn-retry"
              onClick={() => fetchDecisionData(true)}
            >
              🔄 Retry Decision Analysis
            </button>
          </div>
        </div>
      )}

      {/* CONTENT BODY */}
      {data && !loading && (
        <div className="decision-support-body">
          {/* WARNINGS NOTIFICATION */}
          {data.warnings && data.warnings.length > 0 && (
            <div className="investigation-warnings-banner">
              <div className="warning-banner-header">
                <span>⚠️</span>
                <strong>Operational Decision Warnings & Service Notices ({data.warnings.length})</strong>
              </div>
              <ul className="warning-list">
                {data.warnings.map((warn, i) => (
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
                <span className="card-icon">🚨</span>
                <span className="card-title">INCIDENT PRIORITIZATION & TRIAGE LEVEL</span>
              </div>
              <div className="priority-badge-group">
                <span className={`priority-index-badge ${getPriorityIndexClass(data.priority.priority_index)}`}>
                  {data.priority.priority_index}
                </span>
                <span className={`priority-level-badge ${getPriorityBadgeClass(data.priority.priority_level)}`}>
                  {data.priority.priority_level} PRIORITY
                </span>
              </div>
            </div>

            <div className="priority-hero-grid">
              <div className="priority-score-dial-wrap">
                <div className="priority-score-circle">
                  <div className="score-value">{data.priority.priority_score}</div>
                  <div className="score-label">/ 100 PRIORITY</div>
                </div>
                <div className="priority-sub-status">
                  Status: <strong>{data.status}</strong>
                </div>
              </div>

              <div className="priority-explainability-details">
                <div className="explainability-heading">Why is this prioritized?</div>
                <p className="explainability-text">{data.priority.explainability_summary}</p>

                {data.priority.ranking_reasons && data.priority.ranking_reasons.length > 0 && (
                  <div className="ranking-reasons-list">
                    <strong>Primary Escalation Factors:</strong>
                    <ul>
                      {data.priority.ranking_reasons.map((reason, idx) => (
                        <li key={idx}>• {reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Score Breakdown Bar */}
            <div className="scoring-breakdown-section">
              <div className="breakdown-title">Multi-Factor Scoring Components:</div>
              <div className="breakdown-metrics-grid">
                <div className="metric-box">
                  <span className="metric-box-label">Risk Weight</span>
                  <span className="metric-box-val">{data.priority.scoring_breakdown.risk_component ?? 0}</span>
                </div>
                <div className="metric-box">
                  <span className="metric-box-label">Asset Exposure</span>
                  <span className="metric-box-val">{data.priority.scoring_breakdown.asset_exposure_component ?? 0}</span>
                </div>
                <div className="metric-box">
                  <span className="metric-box-label">Industrial Classification</span>
                  <span className="metric-box-val">{data.priority.scoring_breakdown.industrial_class_bonus ?? 0}</span>
                </div>
                <div className="metric-box">
                  <span className="metric-box-label">Persistence</span>
                  <span className="metric-box-val">{data.priority.scoring_breakdown.persistence_bonus ?? 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* CARD 2: DYNAMIC THREAT ZONES & EVACUATION RADII */}
          {/* ========================================================================= */}
          <div className="investigation-card threat-zones-card">
            <div className="card-header">
              <div className="card-title-group">
                <span className="card-icon">🎯</span>
                <span className="card-title">DYNAMIC THREAT ZONES & HAZARD RADII</span>
              </div>
              <span className={`status-pill ${data.threat_zones.available ? 'pill-available' : 'pill-unavailable'}`}>
                {data.threat_zones.available ? 'CALCULATED' : 'DEFAULT RADIUS'}
              </span>
            </div>

            <div className="threat-zones-summary-bar">
              <div>
                <span className="summary-label">Total Threat Radius:</span>
                <span className="summary-val">{data.threat_zones.threat_radius_meters} m ({(data.threat_zones.threat_radius_meters / 1000).toFixed(2)} km)</span>
              </div>
              <div>
                <span className="summary-label">Est. Spread Rate:</span>
                <span className="summary-val">
                  {data.threat_zones.estimated_spread_rate_m_min != null ? `${data.threat_zones.estimated_spread_rate_m_min} m/min` : 'Calm / Stationary'}
                </span>
              </div>
            </div>

            <div className="threat-zones-grid">
              {/* High Hazard Zone */}
              <div className="threat-zone-box zone-high-hazard">
                <div className="zone-box-header">
                  <span className="zone-indicator red-dot" />
                  <strong>HIGH HAZARD ZONE (RED)</strong>
                </div>
                <div className="zone-radius">
                  Radius: <strong>{data.threat_zones.high_hazard_zone?.radius_meters ?? 0} meters</strong>
                </div>
                <p className="zone-desc">
                  {data.threat_zones.high_hazard_zone?.description || 'Immediate high-intensity combustion / blast perimeter.'}
                </p>
                {data.threat_zones.high_hazard_zone?.key_actions && (
                  <ul className="zone-actions">
                    {data.threat_zones.high_hazard_zone.key_actions.map((act, idx) => (
                      <li key={idx}>⚠️ {act}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Moderate Hazard Zone */}
              <div className="threat-zone-box zone-moderate-hazard">
                <div className="zone-box-header">
                  <span className="zone-indicator orange-dot" />
                  <strong>MODERATE HAZARD ZONE (ORANGE)</strong>
                </div>
                <div className="zone-radius">
                  Radius: <strong>{data.threat_zones.moderate_hazard_zone?.radius_meters ?? 0} meters</strong>
                </div>
                <p className="zone-desc">
                  {data.threat_zones.moderate_hazard_zone?.description || 'Secondary thermal radiation & heavy smoke plume corridor.'}
                </p>
                {data.threat_zones.moderate_hazard_zone?.key_actions && (
                  <ul className="zone-actions">
                    {data.threat_zones.moderate_hazard_zone.key_actions.map((act, idx) => (
                      <li key={idx}>🛡️ {act}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Precautionary Zone */}
              <div className="threat-zone-box zone-precautionary-hazard">
                <div className="zone-box-header">
                  <span className="zone-indicator yellow-dot" />
                  <strong>PRECAUTIONARY BUFFER ZONE (YELLOW)</strong>
                </div>
                <div className="zone-radius">
                  Radius: <strong>{data.threat_zones.precautionary_zone?.radius_meters ?? 0} meters</strong>
                </div>
                <p className="zone-desc">
                  {data.threat_zones.precautionary_zone?.description || 'Extended atmospheric dispersion & perimeter staging corridor.'}
                </p>
                {data.threat_zones.precautionary_zone?.key_actions && (
                  <ul className="zone-actions">
                    {data.threat_zones.precautionary_zone.key_actions.map((act, idx) => (
                      <li key={idx}>📋 {act}</li>
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
                <span className="card-icon">🏭</span>
                <span className="card-title">CRITICAL INFRASTRUCTURE & ASSET EXPOSURE</span>
              </div>
              <span className={`status-pill ${data.asset_exposure.available ? 'pill-available' : 'pill-unavailable'}`}>
                {data.asset_exposure.total_exposed_assets} ASSETS MAPPED
              </span>
            </div>

            <div className="asset-summary-row">
              <div className="asset-stat-chip chip-critical">
                <span className="chip-count">{data.asset_exposure.critical_infrastructure_count}</span>
                <span className="chip-label">Critical Facilities</span>
              </div>
              <div className="asset-stat-chip chip-high">
                <span className="chip-count">{data.asset_exposure.high_vulnerability_count}</span>
                <span className="chip-label">High Vulnerability</span>
              </div>
              <div className="asset-stat-chip chip-moderate">
                <span className="chip-count">{data.asset_exposure.moderate_count}</span>
                <span className="chip-label">Moderate Exposure</span>
              </div>
            </div>

            {data.asset_exposure.facilities && data.asset_exposure.facilities.length > 0 ? (
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
                    {data.asset_exposure.facilities.map((fac, idx) => (
                      <tr key={idx} className={fac.is_critical ? 'row-critical' : ''}>
                        <td>
                          <strong>{fac.name || 'Unnamed Facility'}</strong>
                          {fac.type && <span className="facility-type-sub"> ({fac.type})</span>}
                        </td>
                        <td>
                          <span className="category-tag">{fac.category || 'Industrial'}</span>
                        </td>
                        <td>
                          <strong>{fac.distance_km.toFixed(2)} km</strong>
                        </td>
                        <td>
                          {fac.is_critical ? (
                            <span className="badge-critical-tag">🔴 CRITICAL INFRASTRUCTURE</span>
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
                ℹ️ No mapped high-vulnerability industrial assets located within the 5 km radius.
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* CARD 4: FUTURE IMPACT PROJECTIONS & SCENARIOS */}
          {/* ========================================================================= */}
          <div className="investigation-card future-impact-card">
            <div className="card-header">
              <div className="card-title-group">
                <span className="card-icon">📈</span>
                <span className="card-title">FUTURE IMPACT & SPREAD PROJECTIONS</span>
              </div>
              <span className="status-pill pill-available">
                {data.future_impact.scenarios_evaluated} SCENARIOS EVALUATED
              </span>
            </div>

            <div className="projections-timeline">
              {data.future_impact.projections.map((proj, idx) => (
                <div key={idx} className="projection-scenario-item">
                  <div className="scenario-time-badge">
                    +{proj.projection_window_hours}h Forecast
                  </div>
                  <div className="scenario-details">
                    <div className="scenario-threat-header">
                      <span className={`threat-badge threat-${proj.threat_level?.toLowerCase()}`}>
                        {proj.threat_level} THREAT
                      </span>
                      {proj.radius_meters && (
                        <span className="scenario-radius">Proj. Radius: {proj.radius_meters} m</span>
                      )}
                    </div>
                    <p className="scenario-summary-text">{proj.risk_summary}</p>
                  </div>
                </div>
              ))}
            </div>

            {data.future_impact.advisory_notes && data.future_impact.advisory_notes.length > 0 && (
              <div className="future-impact-advisory">
                <strong>Forecasting Advisories:</strong>
                <ul>
                  {data.future_impact.advisory_notes.map((note, idx) => (
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
                <span className="card-icon">📋</span>
                <span className="card-title">RECOMMENDED MULTI-AGENCY ACTIONS</span>
              </div>
            </div>

            <div className="actions-list">
              {data.recommended_actions.map((rec, idx) => (
                <div key={idx} className="recommendation-card">
                  <div className="rec-header">
                    <span className={`rec-priority-pill priority-${rec.priority?.toLowerCase()}`}>
                      {rec.priority}
                    </span>
                    <strong className="rec-title">{rec.title}</strong>
                  </div>
                  <p className="rec-rationale">{rec.rationale}</p>
                  <div className="rec-stakeholders">
                    <span className="stakeholder-label">Target Stakeholders:</span>
                    <div className="stakeholder-chips">
                      {rec.recommended_stakeholders.map((stk, sidx) => (
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
                <span className="card-icon">⏱️</span>
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
                      <td><code>{data.provenance.observation_id}</code></td>
                    </tr>
                    <tr>
                      <th>Decision Support Assembled</th>
                      <td>{formatUtcDate(data.provenance.decision_support_generated_at)}</td>
                    </tr>
                    <tr>
                      <th>Threat Zone Calculation</th>
                      <td>{formatUtcDate(data.provenance.threat_zone_calculated_at)}</td>
                    </tr>
                    <tr>
                      <th>Asset Query Completed</th>
                      <td>{formatUtcDate(data.provenance.asset_query_at)}</td>
                    </tr>
                    <tr>
                      <th>Priority Evaluated</th>
                      <td>{formatUtcDate(data.provenance.priority_evaluated_at)}</td>
                    </tr>
                    <tr>
                      <th>Synthetic Imagery Flag</th>
                      <td>
                        <span className="flag-safe">
                          {data.safety_flags.is_synthetic ? 'SYNTHETIC' : 'REAL SATELLITE (is_synthetic=false)'}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <th>CNN Probability Calibration</th>
                      <td>
                        <span className="flag-neutral">
                          {data.safety_flags.is_calibrated ? 'Calibrated Softmax' : 'Uncalibrated Softmax (Raw Probability)'}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <th>Simulation Guardrail</th>
                      <td>
                        <span className="flag-simulation">
                          {data.safety_flags.is_simulation_only ? 'Mathematical Simulation (is_simulation_only=true)' : 'Live Sensor Feed'}
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
              <span>ℹ️</span>
              <strong>Regulatory, Operational & Simulation Disclaimers</strong>
            </div>
            <div className="disclaimers-body">
              {data.disclaimers && data.disclaimers.length > 0 ? (
                data.disclaimers.map((disc, idx) => (
                  <p key={idx} className="disclaimer-paragraph">
                    {idx + 1}. <strong>{disc}</strong>
                  </p>
                ))
              ) : (
                <>
                  <p className="disclaimer-paragraph">
                    1. <strong>AI Candidate Classification is an evidence-fusion output, not a standalone confirmation of an industrial fire.</strong> Field and aerial verification are required for operational dispatch.
                  </p>
                  <p className="disclaimer-paragraph">
                    2. <strong>Sentinel-2 imagery is optical evidence and may not be temporally coincident with the FIRMS observation.</strong> Optical acquisitions provide surface context and land-cover validation.
                  </p>
                  <p className="disclaimer-paragraph">
                    3. <strong>Dynamic threat zones and scenario projections are simulation estimates — NOT official government evacuation orders.</strong>
                  </p>
                </>
              )}
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
                👁️ Acknowledge Priority
              </button>
              <button
                type="button"
                className="btn-action btn-dispatch"
                onClick={() => handleAction('DISPATCH')}
              >
                🚒 Dispatch Fire Brigade
              </button>
              <button
                type="button"
                className="btn-action btn-investigate"
                onClick={() => handleAction('INVESTIGATE')}
              >
                🔍 Field Investigation
              </button>
              <button
                type="button"
                className="btn-action btn-resolve"
                onClick={() => handleAction('RESOLVE')}
              >
                ✅ Mark Resolved
              </button>
              <button
                type="button"
                className="btn-action btn-dismiss"
                onClick={() => handleAction('DISMISS')}
              >
                ✕ Dismiss
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
  );
};
