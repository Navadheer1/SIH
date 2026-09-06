import React from 'react';
import { ThermalAlert, PriorityIncidentItem } from '../types/hotspot';
import { PriorityLeaderboard } from './PriorityLeaderboard';

interface ImpactAnalysisViewProps {
  alerts: ThermalAlert[];
  priorityItems?: PriorityIncidentItem[];
  loadingPriority?: boolean;
  onSelectAlert: (alert: ThermalAlert) => void;
  onSelectPriorityIncident?: (item: PriorityIncidentItem) => void;
}

export const ImpactAnalysisView: React.FC<ImpactAnalysisViewProps> = ({
  alerts,
  priorityItems = [],
  loadingPriority = false,
  onSelectAlert,
  onSelectPriorityIncident,
}) => {
  const criticalAndHigh = alerts.filter(
    (a) => a.risk_level === 'CRITICAL' || a.risk_level === 'HIGH'
  );

  return (
    <div className="impact-analysis-view">
      <div className="view-header-bar">
        <div>
          <h2 className="view-title">🏭 Critical Infrastructure & Population Impact Intelligence</h2>
          <p className="view-subtitle">
            Dynamic Threat Assessment • 7 Asset Exposure Classes • AI-Generated Threat Zones & Priority Index (P1–P4)
          </p>
        </div>
        <div className="impact-summary-pills">
          <span className="summary-pill pill-critical">
            {criticalAndHigh.length} High-Risk Infrastructure Intersections
          </span>
          <span className="summary-pill pill-buffer">Threat Zones: Inner, Secondary, Monitoring</span>
        </div>
      </div>

      {/* Dynamic Emergency Dispatch Priority Leaderboard */}
      <PriorityLeaderboard
        items={priorityItems}
        loading={loadingPriority}
        onSelectIncident={(item) => {
          if (onSelectPriorityIncident) {
            onSelectPriorityIncident(item);
          }
        }}
      />

      <div className="impact-grid-cards">
        {/* Dynamic Threat Zone Definitions Card */}
        <div className="impact-card">
          <div className="card-header">
            <span className="card-icon">🎯</span>
            <h4>AI-Generated Threat Assessment Zones (Disclaimer: Risk Zones Only)</h4>
          </div>
          <div className="buffer-standards-list">
            <div className="buffer-tier tier-inner">
              <span className="tier-tag">INNER THREAT ZONE (0 - 1.5 km)</span>
              <p>Direct exposure, intense thermal radiation, & toxic smoke plume path. Immediate response priority (P1).</p>
            </div>
            <div className="buffer-tier tier-mid">
              <span className="tier-tag">SECONDARY THREAT ZONE (1.5 - 3.5 km)</span>
              <p>Secondary hazard exposure, airborne particulate dispersion & potential shelter-in-place staging.</p>
            </div>
            <div className="buffer-tier tier-outer">
              <span className="tier-tag">MONITORING THREAT ZONE (3.5 - 7.5 km)</span>
              <p>Perimeter environmental monitoring, emergency vehicle access corridor, & traffic diversion zone.</p>
            </div>
          </div>
        </div>

        {/* Critical Asset Vulnerability List */}
        <div className="impact-card">
          <div className="card-header">
            <span className="card-icon">⚡</span>
            <h4>High-Priority Infrastructure Intersections ({criticalAndHigh.length})</h4>
          </div>
          {criticalAndHigh.length === 0 ? (
            <div className="empty-state-card">
              <span>No critical infrastructure currently intersecting with active high-risk thermal anomalies.</span>
            </div>
          ) : (
            <div className="vulnerability-items-list">
              {criticalAndHigh.map((alert) => (
                <div
                  key={alert.alert_id}
                  className="vuln-item-row"
                  onClick={() => onSelectAlert(alert)}
                >
                  <div className="vuln-left">
                    <span className="vuln-id">{alert.alert_id}</span>
                    <span className="vuln-fac">
                      {alert.facility_name || 'Industrial Facility Candidate'}
                    </span>
                    <span className="vuln-meta">
                      Coordinates: {alert.latitude.toFixed(3)}°N, {alert.longitude.toFixed(3)}°E • FRP: {alert.features?.frp} MW
                    </span>
                  </div>
                  <div className="vuln-right">
                    <span className={`vuln-risk-pill risk-${alert.risk_level.toLowerCase()}`}>
                      Risk {alert.risk_score}/100
                    </span>
                    <span className="vuln-dist">
                      {alert.industrial_distance_km !== null && alert.industrial_distance_km !== undefined
                        ? `${Number(alert.industrial_distance_km).toFixed(2)} km distance`
                        : 'Within 5 km'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

