import React from 'react';
import { AppView } from '../types/hotspot';

interface TopBarProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
  lastUpdated: string;
  onRefresh: () => void;
  refreshing: boolean;
  onSelectDemoScenario?: (scenarioId: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentView,
  onViewChange,
  lastUpdated,
  onRefresh,
  refreshing,
  onSelectDemoScenario,
}) => {
  return (
    <header className="app-topbar">
      {/* 1. BRAND & IDENTITY */}
      <div className="topbar-brand">
        <div className="brand-badge">
          <span className="badge-sih">SIH 26162</span>
        </div>
        <div className="brand-titles">
          <h1 className="brand-main-title">Industrial Fire Intelligence</h1>
          <p className="brand-subtitle">
            NASA FIRMS thermal anomaly detection with Sentinel-2 optical evidence and industrial context.
          </p>
        </div>
      </div>

      {/* 2. PRIMARY NAVIGATION */}
      <nav className="topbar-nav" aria-label="Main Navigation">
        <button
          type="button"
          className={`nav-tab cinematic-tab ${currentView === 'landing' ? 'active' : ''}`}
          onClick={() => onViewChange('landing')}
          title="Switch to 3D Cinematic Observation Experience"
        >
          <span className="nav-icon">🪐</span>
          <span className="nav-label">CINEMATIC VIEW</span>
        </button>

        <button
          type="button"
          className={`nav-tab ${currentView === 'dashboard' ? 'active' : ''}`}
          onClick={() => onViewChange('dashboard')}
        >
          <span className="nav-icon">📊</span>
          <span className="nav-label">DASHBOARD</span>
        </button>

        <button
          type="button"
          className={`nav-tab ${currentView === 'incidents' ? 'active' : ''}`}
          onClick={() => onViewChange('incidents')}
        >
          <span className="nav-icon">🚨</span>
          <span className="nav-label">INCIDENTS</span>
        </button>

        <button
          type="button"
          className={`nav-tab ${currentView === 'map' ? 'active' : ''}`}
          onClick={() => onViewChange('map')}
        >
          <span className="nav-icon">🗺️</span>
          <span className="nav-label">MAP</span>
        </button>

        <button
          type="button"
          className={`nav-tab ${currentView === 'status' ? 'active' : ''}`}
          onClick={() => onViewChange('status')}
        >
          <span className="nav-icon">⚡</span>
          <span className="nav-label">SYSTEM STATUS</span>
        </button>

        <button
          type="button"
          className={`nav-tab ${currentView === 'settings' ? 'active' : ''}`}
          onClick={() => onViewChange('settings')}
        >
          <span className="nav-icon">⚙️</span>
          <span className="nav-label">SETTINGS</span>
        </button>
      </nav>

      {/* 3. SIH JUDGE DEMO SELECTOR & REFRESH */}
      <div className="topbar-actions">
        {onSelectDemoScenario && (
          <div className="demo-selector-wrap" title="Quickly jump to pre-validated benchmark scenarios for live demonstration">
            <span className="demo-selector-label">🎯 DEMO SCENARIO:</span>
            <select
              className="demo-scenarios-dropdown"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  onSelectDemoScenario(e.target.value);
                  e.target.value = '';
                }
              }}
            >
              <option value="" disabled>Select Benchmark Case...</option>
              <option value="demo_industrial_p1">🏭 P1 Critical — Petrochemical Flare</option>
              <option value="demo_wildfire_p2">🌲 P2 High — Forest Wildfire</option>
              <option value="demo_crop_burn_p4">🌾 P4 Low — Crop Residual Burn</option>
              <option value="demo_degraded_cloud">☁️ P3 Guardrail — Cloud Degraded</option>
            </select>
          </div>
        )}

        <div className="clock-badge">
          <span className="clock-label">SYNC:</span>
          <span className="clock-time">{lastUpdated}</span>
        </div>
        <button
          type="button"
          className="btn-refresh-top"
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh real FIRMS observations and alerts"
        >
          {refreshing ? '🔄 Syncing...' : '🔄 Refresh'}
        </button>
      </div>
    </header>
  );
};
