import {
  faCheck,
  faClock,
  faFire,
  faIndustry,
  faRobot,
  faSatellite,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';
import { RiskScoreResponse } from '../types/hotspot';

interface RiskScoreCardProps {
  riskData: RiskScoreResponse | null;
  loading: boolean;
  error: string | null;
}

export const RiskScoreCard: React.FC<RiskScoreCardProps> = ({
  riskData,
  loading,
  error,
}) => {
  if (loading) {
    return (
      <div className="risk-card loading-card">
        <div className="spinner-small" />
        <span>Calculating Investigation Risk Score...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="risk-card error-card">
        <span><FontAwesomeIcon icon={faTriangleExclamation} /> Risk Calculation Error: {error}</span>
      </div>
    );
  }

  if (!riskData) return null;

  const { risk_score, risk_level, components, max_component_weights, reasons } = riskData;

  const getRiskBadgeClass = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'risk-badge-critical';
      case 'HIGH':
        return 'risk-badge-high';
      case 'MODERATE':
        return 'risk-badge-medium';
      default:
        return 'risk-badge-low';
    }
  };

  return (
    <div className="risk-card">
      <div className="risk-card-header">
        <div>
          <span className="risk-title"><FontAwesomeIcon icon={faTriangleExclamation} /> Investigation Priority Score</span>
          <p className="risk-subtitle">Explainable Weighted Prioritization Model</p>
        </div>
        <span className={`risk-level-badge ${getRiskBadgeClass(risk_level)}`}>
          {risk_level}
        </span>
      </div>

      <div className="risk-card-body">
        {/* Score Gauge & Percentage Bar */}
        <div className="risk-gauge-container">
          <div className="risk-gauge-val">
            <span className="big-score">{risk_score}</span>
            <span className="max-score">/ 100</span>
          </div>
          <div className="risk-bar-bg">
            <div
              className={`risk-bar-fill ${getRiskBadgeClass(risk_level)}`}
              style={{ width: `${risk_score}%` }}
            />
          </div>
        </div>

        {/* 5 Component Breakdown Table */}
        <div className="components-table-section">
          <div className="table-title">Risk Component Breakdown:</div>
          <div className="components-table">
            <div className="table-row">
              <span className="col-name"><FontAwesomeIcon icon={faFire} /> Thermal Intensity</span>
              <span className="col-val">{components.thermal_intensity} / {max_component_weights.thermal_intensity}</span>
            </div>
            <div className="table-row">
              <span className="col-name"><FontAwesomeIcon icon={faSatellite} /> Satellite Confidence</span>
              <span className="col-val">{components.satellite_confidence} / {max_component_weights.satellite_confidence}</span>
            </div>
            <div className="table-row">
              <span className="col-name"><FontAwesomeIcon icon={faClock} /> Persistence Score</span>
              <span className="col-val">{components.persistence} / {max_component_weights.persistence}</span>
            </div>
            <div className="table-row">
              <span className="col-name"><FontAwesomeIcon icon={faIndustry} /> Industrial Proximity</span>
              <span className="col-val">{components.industrial_proximity} / {max_component_weights.industrial_proximity}</span>
            </div>
            <div className="table-row">
              <span className="col-name"><FontAwesomeIcon icon={faRobot} /> AI Classification</span>
              <span className="col-val">{components.classification_context} / {max_component_weights.classification_context}</span>
            </div>
            <div className="table-row table-total">
              <span className="col-name">Total Score</span>
              <span className="col-val">{risk_score} / 100</span>
            </div>
          </div>
        </div>

        {/* Priority Reasons */}
        <div className="reasons-section">
          <div className="reasons-title">Priority Rationale:</div>
          <ul className="reasons-list">
            {reasons.map((reason, idx) => (
              <li key={`reason-${idx}`} className="reason-item">
                <FontAwesomeIcon icon={faCheck} className="mr-1" /> {reason}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
