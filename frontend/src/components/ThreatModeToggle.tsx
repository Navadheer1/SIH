import {
  faCube,
  faMap,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';

interface ThreatModeToggleProps {
  mode: '2D' | '3D';
  onModeChange: (mode: '2D' | '3D') => void;
}

export const ThreatModeToggle: React.FC<ThreatModeToggleProps> = ({ mode, onModeChange }) => {
  return (
    <div className="threat-mode-toggle-bar">
      <span className="toggle-label">VIEWPORT MODE:</span>
      <div className="toggle-btn-group">
        <button
          type="button"
          className={`btn-mode ${mode === '2D' ? 'active' : ''}`}
          onClick={() => onModeChange('2D')}
        >
          <FontAwesomeIcon icon={faMap} /> 2D MAP
        </button>
        <button
          type="button"
          className={`btn-mode ${mode === '3D' ? 'active' : ''}`}
          onClick={() => onModeChange('3D')}
        >
          <FontAwesomeIcon icon={faCube} /> 3D THREAT VIEW
        </button>
      </div>
    </div>
  );
};
