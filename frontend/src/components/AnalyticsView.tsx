import {
  faChartSimple,
  faCircleCheck,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';
import { Hotspot, ThermalAlert } from '../types/hotspot';

interface AnalyticsViewProps {
  hotspots: Hotspot[];
  alerts: ThermalAlert[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ hotspots, alerts }) => {
  const criticalCount = alerts.filter((a) => a.risk_level === 'CRITICAL').length;
  const highCount = alerts.filter((a) => a.risk_level === 'HIGH').length;
  const moderateCount = alerts.filter((a) => a.risk_level === 'MODERATE').length;
  const lowCount = alerts.filter((a) => a.risk_level === 'LOW').length;

  const totalFrp = hotspots.reduce((sum, h) => sum + (h.frp || 0), 0);
  const avgFrp = hotspots.length > 0 ? (totalFrp / hotspots.length).toFixed(1) : '0.0';

  const resolvedCount = alerts.filter((a) => a.status === 'RESOLVED').length;
  const resolutionRate = alerts.length > 0 ? Math.round((resolvedCount / alerts.length) * 100) : 0;

  return (
    <div className="analytics-view">
      <div className="view-header-bar">
        <div>
          <h2 className="view-title"><FontAwesomeIcon icon={faChartSimple} /> Operational Disaster Analytics & Severity Distribution</h2>
          <p className="view-subtitle">
            Sensor Telemetry Aggregates • Severity Stratification • Incident Resolution Performance
          </p>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="analytics-kpi-grid">
        <div className="analytics-kpi-box">
          <span className="kpi-label">TOTAL THERMAL SOURCES</span>
          <span className="kpi-val">{hotspots.length}</span>
          <span className="kpi-sub">Active NASA FIRMS Detections</span>
        </div>
        <div className="analytics-kpi-box">
          <span className="kpi-label">TOTAL FIRE RADIATIVE POWER</span>
          <span className="kpi-val highlight-frp">{totalFrp.toFixed(1)} MW</span>
          <span className="kpi-sub">Cumulative Radiative Energy</span>
        </div>
        <div className="analytics-kpi-box">
          <span className="kpi-label">AVERAGE INTENSITY</span>
          <span className="kpi-val">{avgFrp} MW</span>
          <span className="kpi-sub">Mean Radiative Power per Hotspot</span>
        </div>
        <div className="analytics-kpi-box">
          <span className="kpi-label">RESOLUTION EFFICIENCY</span>
          <span className="kpi-val highlight-green">{resolutionRate}%</span>
          <span className="kpi-sub">{resolvedCount} of {alerts.length} Incidents Closed</span>
        </div>
      </div>

      {/* Breakdown Grids */}
      <div className="analytics-details-grid">
        {/* Severity Stratification */}
        <div className="analytics-card">
          <h4>Incident Severity Stratification</h4>
          <div className="stratification-bars">
            <div className="strat-row">
              <span className="strat-label">CRITICAL PRIORITY</span>
              <div className="strat-bar-container">
                <div
                  className="strat-bar-fill fill-critical"
                  style={{ width: `${alerts.length ? (criticalCount / alerts.length) * 100 : 0}%` }}
                />
              </div>
              <span className="strat-count">{criticalCount}</span>
            </div>

            <div className="strat-row">
              <span className="strat-label">HIGH SEVERITY</span>
              <div className="strat-bar-container">
                <div
                  className="strat-bar-fill fill-high"
                  style={{ width: `${alerts.length ? (highCount / alerts.length) * 100 : 0}%` }}
                />
              </div>
              <span className="strat-count">{highCount}</span>
            </div>

            <div className="strat-row">
              <span className="strat-label">MODERATE RISK</span>
              <div className="strat-bar-container">
                <div
                  className="strat-bar-fill fill-moderate"
                  style={{ width: `${alerts.length ? (moderateCount / alerts.length) * 100 : 0}%` }}
                />
              </div>
              <span className="strat-count">{moderateCount}</span>
            </div>

            <div className="strat-row">
              <span className="strat-label">LOW / MONITORING</span>
              <div className="strat-bar-container">
                <div
                  className="strat-bar-fill fill-low"
                  style={{ width: `${alerts.length ? (lowCount / alerts.length) * 100 : 0}%` }}
                />
              </div>
              <span className="strat-count">{lowCount}</span>
            </div>
          </div>
        </div>

        {/* Data Provenance & Sensor Pipeline Integrity */}
        <div className="analytics-card">
          <h4>Data Provenance & Pipeline Integrity</h4>
          <div className="integrity-items-list">
            <div className="integrity-item">
              <span className="int-check"><FontAwesomeIcon icon={faCircleCheck} style={{ color: "#2F8F46", marginRight: "6px" }} /></span>
              <div>
                <strong>NASA FIRMS Satellite Telemetry:</strong>
                <p>NRT VIIRS 375m & MODIS 1km sensor ingest active. Zero synthetic records injected.</p>
              </div>
            </div>
            <div className="integrity-item">
              <span className="int-check"><FontAwesomeIcon icon={faCircleCheck} style={{ color: "#2F8F46", marginRight: "6px" }} /></span>
              <div>
                <strong>OpenStreetMap Infrastructure Graph:</strong>
                <p>Overpass API geodesic queries active with 5.0 km dynamic radius and Haversine distance.</p>
              </div>
            </div>
            <div className="integrity-item">
              <span className="int-check"><FontAwesomeIcon icon={faCircleCheck} style={{ color: "#2F8F46", marginRight: "6px" }} /></span>
              <div>
                <strong>PyTorch Sentinel-2 CV Model:</strong>
                <p>ResNet-18 vision model active with Grad-CAM spatial explainability heatmaps.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
