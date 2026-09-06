import React from 'react';

interface SettingsViewProps {
  region: string;
  onRegionChange: (region: string) => void;
  customBbox: string;
  onCustomBboxChange: (bbox: string) => void;
  onApplyCustomBbox: () => void;
  onRefresh: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  region,
  onRegionChange,
  customBbox,
  onCustomBboxChange,
  onApplyCustomBbox,
  onRefresh,
}) => {
  return (
    <div className="settings-view">
      <div className="view-header-bar">
        <div>
          <h2 className="view-title">⚙️ Operational System Settings & Parameters</h2>
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
                  placeholder="e.g. 76.5,14.0,84.5,19.5"
                />
                <button
                  type="button"
                  className="btn-settings-apply"
                  onClick={onApplyCustomBbox}
                >
                  Apply BBox
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Operational Thresholds (Read-Only System Transparency) */}
        <div className="settings-card">
          <h4>National Disaster Threshold Parameters</h4>
          <div className="thresholds-params-list">
            <div className="param-item">
              <span className="p-label">Critical Alert Trigger Risk Score:</span>
              <span className="p-val mono">≥ 75.0 / 100</span>
            </div>
            <div className="param-item">
              <span className="p-label">High Severity Trigger Risk Score:</span>
              <span className="p-val mono">≥ 50.0 / 100</span>
            </div>
            <div className="param-item">
              <span className="p-label">Spatial Deduplication Radius:</span>
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

        {/* System Ingestion Actions */}
        <div className="settings-card full-width">
          <h4>Telemetry Ingestion & Orbital Synchronization</h4>
          <p className="settings-desc">
            Manually trigger synchronization with NASA FIRMS active fire endpoints, OpenStreetMap infrastructure graph, and persistent clustering engine:
          </p>
          <button type="button" className="btn-force-sync" onClick={onRefresh}>
            ↻ Force Telemetry Refresh & Alert Evaluation
          </button>
        </div>
      </div>
    </div>
  );
};
