import {
  faCircleInfo,
  faCube,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';

interface ProjectionLegendProps {
  isSimulation?: boolean;
  windAvailable?: boolean;
}

export const ProjectionLegend: React.FC<ProjectionLegendProps> = ({
  isSimulation = false,
  windAvailable = true,
}) => {
  return (
    <div className="projection-legend-card">
      <div className="legend-header">
        <span className="legend-title"><FontAwesomeIcon icon={faCube} /> 3D THREAT VISUALIZATION LEGEND</span>
      </div>

      {/* 3D Vertical Height Elevation Disclaimer */}
      <div className="legend-disclaimer-banner">
        <FontAwesomeIcon icon={faCircleInfo} /> <em>Vertical 3D Height represents <strong>Relative Model Intensity</strong>, NOT actual flame height.</em>
      </div>

      <div className="legend-sections-grid">
        {/* Relative Model Intensity Scale */}
        <div className="legend-section">
          <span className="section-name">3D INTENSITY ELEVATION</span>
          <div className="legend-items-list">
            <div className="l-item"><span className="color-box color-critical" /> CRITICAL (Very High Elevation)</div>
            <div className="l-item"><span className="color-box color-high" /> HIGH (High Elevation)</div>
            <div className="l-item"><span className="color-box color-moderate" /> MODERATE (Medium Elevation)</div>
            <div className="l-item"><span className="color-box color-low" /> LOW (Short Elevation)</div>
          </div>
        </div>

        {/* Threat Layers */}
        <div className="legend-section">
          <span className="section-name">MODEL THREAT VOLUMES</span>
          <div className="legend-items-list">
            <div className="l-item"><span className="color-box color-core" /> Core Threat Area</div>
            <div className="l-item"><span className="color-box color-corridor" /> Projected Corridor</div>
            <div className="l-item"><span className="color-box color-uncertainty" /> Uncertainty Envelope</div>
            <div className="l-item"><span className="color-box color-monitoring" /> Perimeter Monitoring</div>
          </div>
        </div>

        {/* Provenance Badges */}
        <div className="legend-section">
          <span className="section-name">DATA PROVENANCE BADGES</span>
          <div className="provenance-badges-flex">
            <span className="prov-badge badge-live">LIVE DATA</span>
            <span className="prov-badge badge-ai">AI ANALYSIS</span>
            <span className="prov-badge badge-model">MODEL PROJECTION</span>
            {isSimulation && <span className="prov-badge badge-sim">SIMULATED SCENARIO</span>}
            {!windAvailable && <span className="prov-badge badge-nodata">WIND DATA UNAVAILABLE</span>}
          </div>
        </div>
      </div>
    </div>
  );
};
