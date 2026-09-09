import {
  faCircle,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';

interface LegendProps {
  viewMode: 'hotspots' | 'clusters';
}

export const Legend: React.FC<LegendProps> = ({ viewMode }) => {
  return (
    <div className="map-legend">
      {viewMode === 'hotspots' ? (
        <div className="legend-section">
          <div className="legend-title">FRP Intensity (MW)</div>
          <div className="legend-item">
            <span className="legend-color high" />
            <span>High Intensity (&gt; 20 MW)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color medium" />
            <span>Moderate (5 - 20 MW)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color low" />
            <span>Low (&lt; 5 MW)</span>
          </div>
        </div>
      ) : (
        <div className="legend-section">
          <div className="legend-title">Persistence Score</div>
          <div className="legend-item">
            <span className="legend-color high-persistent" />
            <span>Highly Persistent (81 - 100)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color persistent" />
            <span>Persistent (61 - 80)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color suspicious" />
            <span>Suspicious (31 - 60)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color temporary" />
            <span>Temporary (0 - 30)</span>
          </div>
        </div>
      )}

      <div className="legend-divider" />

      {/* Investigation Risk Priority Legend */}
      <div className="legend-section">
        <div className="legend-title">Investigation Risk Level</div>
        <div className="legend-item">
          <span className="legend-color high-persistent" />
          <span><FontAwesomeIcon icon={faCircle} style={{ color: "#dc2626", marginRight: "6px" }} /> CRITICAL (75 - 100)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color suspicious" />
          <span><FontAwesomeIcon icon={faCircle} style={{ color: "#ea580c", marginRight: "6px" }} /> HIGH (50 - 74)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color temporary" />
          <span><FontAwesomeIcon icon={faCircle} style={{ color: "#d97706", marginRight: "6px" }} /> MODERATE (25 - 49)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#22c55e' }} />
          <span><FontAwesomeIcon icon={faCircle} style={{ color: "#2F8F46", marginRight: "6px" }} /> LOW (0 - 24)</span>
        </div>
      </div>

      <div className="legend-divider" />

      <div className="legend-section">
        <div className="legend-title">OSM Features</div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#a855f7' }} />
          <span>Industrial Site</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#06b6d4' }} />
          <span>Urban / Residential</span>
        </div>
      </div>
    </div>
  );
};
