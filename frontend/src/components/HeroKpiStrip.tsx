import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFire,
  faArrowsRotate,
  faIndustry,
  faTriangleExclamation,
  faCheckCircle,
} from '@fortawesome/free-solid-svg-icons';

interface HeroKpiStripProps {
  thermalAnomaliesCount: number;
  persistentSourcesCount: number;
  industrialCandidatesCount: number;
  highRiskIncidentsCount: number;
  activeFilter?: string;
  onFilterClick?: (filter: 'all' | 'persistent' | 'industrial' | 'high_risk') => void;
}

export const HeroKpiStrip: React.FC<HeroKpiStripProps> = ({
  thermalAnomaliesCount,
  persistentSourcesCount,
  industrialCandidatesCount,
  highRiskIncidentsCount,
  activeFilter = 'all',
  onFilterClick,
}) => {
  const isHighRiskActive = highRiskIncidentsCount > 0;

  return (
    <section className="hero-kpi-strip" aria-label="Operational Metrics">
      {/* 1. THERMAL ANOMALIES */}
      <div
        className={`hero-kpi-card ${activeFilter === 'all' ? 'card-selected' : ''}`}
        onClick={() => onFilterClick && onFilterClick('all')}
        role="button"
        tabIndex={0}
      >
        <div className="kpi-top">
          <span className="kpi-title">Thermal Anomalies</span>
          <FontAwesomeIcon icon={faFire} className="kpi-icon-regular text-muted" />
        </div>
        <div className="kpi-main">
          <span className="kpi-number">{thermalAnomaliesCount}</span>
        </div>
        <div className="kpi-bottom">
          <span className="kpi-caption">Active NASA FIRMS feeds</span>
        </div>
      </div>

      {/* 2. PERSISTENT SOURCES */}
      <div
        className={`hero-kpi-card ${activeFilter === 'persistent' ? 'card-selected' : ''}`}
        onClick={() => onFilterClick && onFilterClick('persistent')}
        role="button"
        tabIndex={0}
      >
        <div className="kpi-top">
          <span className="kpi-title">Persistent Sources</span>
          <FontAwesomeIcon icon={faArrowsRotate} className="kpi-icon-regular text-muted" />
        </div>
        <div className="kpi-main">
          <span className="kpi-number">{persistentSourcesCount}</span>
        </div>
        <div className="kpi-bottom">
          <span className="kpi-caption">Multi-pass recurrence</span>
        </div>
      </div>

      {/* 3. INDUSTRIAL CANDIDATES */}
      <div
        className={`hero-kpi-card ${activeFilter === 'industrial' ? 'card-selected' : ''}`}
        onClick={() => onFilterClick && onFilterClick('industrial')}
        role="button"
        tabIndex={0}
      >
        <div className="kpi-top">
          <span className="kpi-title">Industrial Candidates</span>
          <FontAwesomeIcon icon={faIndustry} className="kpi-icon-regular text-muted" />
        </div>
        <div className="kpi-main">
          <span className="kpi-number">{industrialCandidatesCount}</span>
        </div>
        <div className="kpi-bottom">
          <span className="kpi-caption">Within 5 km infrastructure</span>
        </div>
      </div>

      {/* 4. HIGH RISK INCIDENTS — VISUALLY DOMINANT (Answers Q1: Is there an active dangerous event?) */}
      <div
        className={`hero-kpi-card kpi-card-critical-dominant ${activeFilter === 'high_risk' ? 'card-selected' : ''}`}
        onClick={() => onFilterClick && onFilterClick('high_risk')}
        role="button"
        tabIndex={0}
      >
        <div className="kpi-top">
          <span className="kpi-title font-bold">High Risk Incidents</span>
          <FontAwesomeIcon
            icon={isHighRiskActive ? faTriangleExclamation : faCheckCircle}
            className={`kpi-icon-dominant ${isHighRiskActive ? 'icon-alert-urgent' : 'icon-alert-clear'}`}
          />
        </div>
        <div className="kpi-main">
          <span className={`kpi-number ${isHighRiskActive ? 'number-alert-urgent' : 'number-alert-clear'}`}>
            {highRiskIncidentsCount}
          </span>
          {isHighRiskActive && <span className="kpi-dominant-tag">ACTION REQUIRED</span>}
        </div>
        <div className="kpi-bottom">
          <span className="kpi-caption">
            {isHighRiskActive ? 'Critical priority triage queue' : 'No active critical escalations'}
          </span>
        </div>
      </div>
    </section>
  );
};
