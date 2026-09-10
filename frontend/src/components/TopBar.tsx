import React from 'react';
import { AppView } from '../types/hotspot';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFire,
  faTriangleExclamation,
  faMap,
  faBolt,
  faGear,
} from '@fortawesome/free-solid-svg-icons';

interface TopBarProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
}

export const TopBar: React.FC<TopBarProps> = ({ currentView, onViewChange }) => {
  return (
    <header className="app-topbar-wrapper">
      <div className="app-topbar">
        {/* BRAND IDENTITY */}
        <div className="topbar-brand" onClick={() => onViewChange('dashboard')} style={{ cursor: 'pointer' }}>
          <div className="brand-icon-box">
            <FontAwesomeIcon icon={faFire} className="brand-fa-icon" />
          </div>
          <div className="brand-titles">
            <h1 className="brand-main-title">Industrial Fire Intelligence</h1>
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
            <FontAwesomeIcon icon={faTriangleExclamation} className="nav-fa-icon" />
            <span className="nav-label">Incidents</span>
          </button>

          <button
            type="button"
            className={`nav-tab ${currentView === 'map' ? 'active' : ''}`}
            onClick={() => onViewChange('map')}
          >
            <FontAwesomeIcon icon={faMap} className="nav-fa-icon" />
            <span className="nav-label">Map</span>
          </button>

          <button
            type="button"
            className={`nav-tab ${currentView === 'status' ? 'active' : ''}`}
            onClick={() => onViewChange('status')}
          >
            <FontAwesomeIcon icon={faBolt} className="nav-fa-icon" />
            <span className="nav-label">System Status</span>
          </button>

          <button
            type="button"
            className={`nav-tab ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => onViewChange('settings')}
          >
            <FontAwesomeIcon icon={faGear} className="nav-fa-icon" />
            <span className="nav-label">Settings</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
