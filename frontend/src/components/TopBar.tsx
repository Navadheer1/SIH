import React from 'react';
import { AuthorityRole } from '../types/hotspot';

interface TopBarProps {
  lastUpdated: string;
  backendOnline: boolean;
  activeCriticalAlertsCount: number;
  currentRole: AuthorityRole;
  onRoleChange: (role: AuthorityRole) => void;
  onLaunchDemo: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  lastUpdated,
  backendOnline,
  activeCriticalAlertsCount,
  currentRole,
  onRoleChange,
  onLaunchDemo,
}) => {
  const getRoleLabel = (role: AuthorityRole): string => {
    switch (role) {
      case 'SEOC_DIRECTOR':
        return 'State EOC Director (SDMA)';
      case 'FIRE_RESCUE_CHIEF':
        return 'Fire & Rescue Services Command';
      case 'INDUSTRIAL_SAFETY_INSPECTOR':
        return 'Industrial Safety & Hazmat Directorate';
      case 'POLICE_COMMISSIONER':
        return 'Police Emergency Operations';
      case 'CITIZEN_OBSERVER':
        return 'Public Observer (Read-Only)';
      default:
        return 'Emergency Operations Center';
    }
  };

  return (
    <header className="eoc-topbar">
      {/* Brand & Platform Identity */}
      <div className="topbar-brand-section">
        <div className="brand-badge-pill">
          <span className="sih-tag">SIH 26162</span>
          <span className="eoc-code">EOC-HQ</span>
        </div>
        <div className="brand-text-block">
          <h1 className="eoc-platform-title">AI Disaster Intelligence & Emergency Response Platform</h1>
          <span className="eoc-platform-sub">
            Real-Time Thermal Anomaly Detection • Industrial Risk Assessment • Automated Authority Triage
          </span>
        </div>
      </div>

      {/* System Telemetry & Data Sources Status */}
      <div className="topbar-telemetry-strip">
        <div className="telemetry-item">
          <span className="telemetry-label">SYSTEM STATUS</span>
          <div className="telemetry-val-group">
            <span className={`status-indicator-dot ${backendOnline ? 'online' : 'offline'}`} />
            <span className="telemetry-val-text">
              {backendOnline ? 'OPERATIONAL • LIVE' : 'OFFLINE'}
            </span>
          </div>
        </div>

        <div className="telemetry-divider" />

        <div className="telemetry-item">
          <span className="telemetry-label">LAST ORBIT REFRESH</span>
          <span className="telemetry-val-text time-text">{lastUpdated}</span>
        </div>

        <div className="telemetry-divider" />

        {/* Data Source Badges */}
        <div className="telemetry-sources">
          <span className="source-tag source-firms" title="NASA Fire Information for Resource Management System (MODIS/VIIRS)">
            <span className="src-dot" /> NASA FIRMS
          </span>
          <span className="source-tag source-osm" title="OpenStreetMap Geospatial Infrastructure Overpass API">
            <span className="src-dot" /> OSM Overpass
          </span>
          <span className="source-tag source-ml" title="PyTorch ResNet-18 Satellite Vision & Tabular Random Forest Classifier">
            <span className="src-dot" /> PyTorch CV
          </span>
        </div>
      </div>

      {/* Authority Control & Quick Actions */}
      <div className="topbar-controls-section">
        {/* SIH Demo Walkthrough Button */}
        <button
          type="button"
          className="btn-eoc-demo"
          onClick={onLaunchDemo}
          title="Instantly center on the highest-priority live thermal incident and open full intelligence"
        >
          <span className="btn-lightning">⚡</span>
          <span>Demo Incident</span>
        </button>

        {/* Critical Alerts Pill */}
        <div
          className={`alerts-notification-pill ${activeCriticalAlertsCount > 0 ? 'has-critical' : ''}`}
          title={`${activeCriticalAlertsCount} active critical/high severity incidents requiring authority verification`}
        >
          <span className="alert-bell-icon">🚨</span>
          <span className="alert-count-num">{activeCriticalAlertsCount}</span>
          <span className="alert-text-label">CRITICAL</span>
        </div>

        {/* Authority Role Selector */}
        <div className="authority-role-selector-wrap">
          <span className="role-prefix-label">AUTHORITY PROFILE:</span>
          <select
            className="authority-role-select"
            value={currentRole}
            onChange={(e) => onRoleChange(e.target.value as AuthorityRole)}
          >
            <option value="SEOC_DIRECTOR">🛡️ {getRoleLabel('SEOC_DIRECTOR')}</option>
            <option value="FIRE_RESCUE_CHIEF">🚒 {getRoleLabel('FIRE_RESCUE_CHIEF')}</option>
            <option value="INDUSTRIAL_SAFETY_INSPECTOR">🏭 {getRoleLabel('INDUSTRIAL_SAFETY_INSPECTOR')}</option>
            <option value="POLICE_COMMISSIONER">🚓 {getRoleLabel('POLICE_COMMISSIONER')}</option>
            <option value="CITIZEN_OBSERVER">👁️ {getRoleLabel('CITIZEN_OBSERVER')}</option>
          </select>
        </div>
      </div>
    </header>
  );
};
