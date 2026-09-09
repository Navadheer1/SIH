import {
  faGear,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';

interface SettingsViewProps {
  region: string;
  onRegionChange: (region: string) => void;
  customBbox: string;
  onCustomBboxChange: (bbox: string) => void;
  onApplyCustomBbox: () => void;
  onRefresh: () => void;
  onSelectDemoScenario?: (scenarioId: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  region,
  onRegionChange,
  customBbox,
  onCustomBboxChange,
  onApplyCustomBbox,
  onRefresh,
  onSelectDemoScenario,
}) => {
  return (
    <div className="settings-view">
      <div className="view-header-bar">
        <div>
          <h2 className="view-title"><FontAwesomeIcon icon={faGear} /> Operational System Settings & Parameters</h2>
          <p className="view-subtitle">
            Emergency Operations Center Configuration • Detection Thresholds • Regional Geofencing
          </p>
        </div>
      </div>

      <div className="settings-cards-grid">
        {/* Geographic Focus Configuration */}
        <div className="settings-card">
          <h4>Geographic Surveillance Focus</h4>
          <div className="settings-form-group">
            <label>Surveillance Region:</label>
            <select
              className="settings-input"
              value={region}
              onChange={(e) => onRegionChange(e.target.value)}
            >
              <option value="india">National Surveillance: India (All Sectors)</option>
              <option value="andhra_pradesh">Andhra Pradesh Industrial Corridor (SEZ Focus)</option>
              <option value="custom">Custom Geographic Bounding Box (West, South, East, North)</option>
            </select>
          </div>

          {region === 'custom' && (
            <div className="settings-form-group">
              <label>Bounding Box Coordinates [minLon, minLat, maxLon, maxLat]:</label>
              <div className="custom-bbox-row">
                <input
                  type="text"
                  className="settings-input"
                  value={customBbox}
                  onChange={(e) => onCustomBboxChange(e.target.value)}
                  placeholder="79.5, 15.5, 81.5, 17.5"
                />
                <button type="button" className="btn-apply-bbox" onClick={onApplyCustomBbox}>
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Model Thresholds & Parameters */}
        <div className="settings-card">
          <h4>Analytical Engine Thresholds</h4>
          <div className="params-list">
            <div className="param-item">
              <span className="p-label">FRP High-Hazard Threshold:</span>
              <span className="p-val mono">50.0 MW</span>
            </div>
            <div className="param-item">
              <span className="p-label">Persistence Spatial Radius:</span>
              <span className="p-val mono">1.0 km</span>
            </div>
            <div className="param-item">
              <span className="p-label">Alert Cooldown Window:</span>
              <span className="p-val mono">12.0 Hours</span>
            </div>
            <div className="param-item">
              <span className="p-label">OSM Facility Search Radius:</span>
              <span className="p-val mono">5.0 km</span>
            </div>
          </div>
        </div>

        {/* Benchmark Testing / Demo Scenarios */}
        {onSelectDemoScenario && (
          <div className="settings-card full-width">
            <h4>Benchmark Testing & Validation Scenarios</h4>
            <p className="settings-desc">
              Execute standardized test cases for multi-modal validation and explainable AI assessment without modifying live state:
            </p>
            <div className="settings-form-group" style={{ maxWidth: '420px', marginTop: '0.75rem' }}>
              <label>Select Test Scenario:</label>
              <select
                className="settings-input"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    onSelectDemoScenario(e.target.value);
                    e.target.value = '';
                  }
                }}
              >
                <option value="" disabled>Choose benchmark scenario...</option>
                <option value="demo_industrial_p1">P1 Critical — Petrochemical Flare</option>
                <option value="demo_wildfire_p2">P2 High — Forest Wildfire</option>
                <option value="demo_crop_burn_p4">P4 Low — Crop Residual Burn</option>
                <option value="demo_degraded_cloud">P3 Guardrail — Cloud Degraded</option>
              </select>
            </div>
          </div>
        )}

        {/* System Ingestion Actions */}
        <div className="settings-card full-width">
          <h4>Telemetry Ingestion & Orbital Synchronization</h4>
          <p className="settings-desc">
            Manually trigger synchronization with NASA FIRMS active fire endpoints, OpenStreetMap infrastructure graph, and persistent clustering engine:
          </p>
          <button type="button" className="btn-force-sync" onClick={onRefresh}>
            Force Telemetry Refresh & Alert Evaluation
          </button>
        </div>
      </div>
    </div>
  );
};
