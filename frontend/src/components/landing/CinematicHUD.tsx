import React from 'react';
import { HotspotTelemetryItem } from '../../types/hotspot';

interface CinematicHUDProps {
  scrollProgress: number;
  activeHotspot: HotspotTelemetryItem | null;
  onSelectHotspot: (hotspot: HotspotTelemetryItem) => void;
  onLaunchDashboard: () => void;
  onExploreHotspots: () => void;
}

export const CinematicHUD: React.FC<CinematicHUDProps> = ({
  scrollProgress: p,
  activeHotspot,
  onSelectHotspot,
  onLaunchDashboard,
  onExploreHotspots,
}) => {
  // Act opacity calculations based on scroll progress
  // Act 1: 0.00 - 0.20
  const act1Opacity = p < 0.18 ? 1 - p / 0.18 : 0;
  // Act 2: 0.18 - 0.44
  const act2Opacity = p >= 0.18 && p < 0.44 ? (p < 0.26 ? (p - 0.18) / 0.08 : (0.44 - p) / 0.1) : 0;
  // Act 3: 0.44 - 0.68
  const act3Opacity = p >= 0.44 && p < 0.68 ? (p < 0.52 ? (p - 0.44) / 0.08 : (0.68 - p) / 0.1) : 0;
  // Act 4: 0.68 - 0.86
  const act4Opacity = p >= 0.68 && p < 0.88 ? (p < 0.74 ? (p - 0.68) / 0.06 : (0.88 - p) / 0.08) : 0;
  // Act 5: 0.85 - 0.94
  const act5Opacity = p >= 0.84 && p < 0.94 ? (p < 0.88 ? (p - 0.84) / 0.04 : (0.94 - p) / 0.04) : 0;
  // Act 6: 0.92 - 1.00
  const act6Opacity = p >= 0.91 ? Math.min(1, (p - 0.91) / 0.06) : 0;

  // Fallback active hotspot (Korba) if none is hovered/selected
  const displayedHotspot = activeHotspot || {
    id: 'FIRMS_IN_KORBA_089',
    latitude: 22.3595,
    longitude: 82.7501,
    brightness: 374.8,
    confidence: '98%',
    timestamp: '2026-03-09T08:24:12Z',
    riskScore: 87,
    classification: 'INDUSTRIAL FIRE / THERMAL FLARE',
    clusterName: 'Korba Power & Smelter Basin',
    state: 'Chhattisgarh',
    frp: 89.4,
    satellite: 'NOAA-20 (VIIRS)',
    instrument: 'VIIRS-I4',
  };

  return (
    <div className="cinematic-hud-layer" style={{ pointerEvents: 'none' }}>
      {/* ---------------- ACT 1: DEEP SPACE ---------------- */}
      {act1Opacity > 0.01 && (
        <div
          className="hud-section act-space"
          style={{ opacity: act1Opacity, transform: `translateY(${p * -40}px)` }}
        >
          <div className="act-space-content">
            <span className="hud-eyebrow">SIH 2026 • PROBLEM STATEMENT 26162</span>
            <h1 className="hero-monumental-title">
              FROM SPACE.
              <br />
              TO SIGNAL.
              <br />
              TO ACTION.
            </h1>
            <p className="hero-subtext">
              AI-powered detection and classification of industrial fires and persistent thermal
              sources using NASA FIRMS, OpenStreetMap, and Earth-observation satellites.
            </p>
          </div>

          <div className="hud-scroll-prompt">
            <span className="scroll-track-line" />
            <span className="scroll-prompt-label">SCROLL TO DESCEND</span>
          </div>

          <div className="hud-corner-telemetry bottom-left">
            <span className="telemetry-tag">PLATFORM STATUS</span>
            <span className="telemetry-val">NOMINAL // DEEP SPACE ACQUISITION</span>
          </div>
          <div className="hud-corner-telemetry bottom-right">
            <span className="telemetry-tag">SENSOR DISTANCE</span>
            <span className="telemetry-val">120,000 KM // SUN-EARTH L1 VECTOR</span>
          </div>
        </div>
      )}

      {/* ---------------- ACT 2: SATELLITE ORBIT ---------------- */}
      {act2Opacity > 0.01 && (
        <div className="hud-section act-orbit" style={{ opacity: act2Opacity }}>
          <div className="hud-bracket-card">
            <div className="hud-card-header">
              <span className="hud-indicator-dot" />
              <span className="hud-card-title">ORBITAL OBSERVATION PLATFORM</span>
              <span className="hud-card-badge">LEO // 705 KM</span>
            </div>
            <div className="hud-grid-specs">
              <div className="spec-item">
                <span className="spec-label">SPACECRAFT</span>
                <span className="spec-value">NASA / NOAA-20 (VIIRS)</span>
              </div>
              <div className="spec-item">
                <span className="spec-label">ORBIT TYPE</span>
                <span className="spec-value">Sun-Synchronous (98.7° Inclination)</span>
              </div>
              <div className="spec-item">
                <span className="spec-label">PRIMARY PAYLOAD</span>
                <span className="spec-value">Visible Infrared Imaging Radiometer Suite</span>
              </div>
              <div className="spec-item">
                <span className="spec-label">THERMAL BANDS</span>
                <span className="spec-value">3.74 µm (I4) & 11.45 µm (I5) Radiometry</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- ACT 3: INDIA NADIR APPROACH ---------------- */}
      {act3Opacity > 0.01 && (
        <div className="hud-section act-india" style={{ opacity: act3Opacity }}>
          <div className="hud-nadir-target">
            <div className="target-crosshair" />
            <div className="target-info">
              <span className="target-label">REMOTE SENSING NADIR LOCK</span>
              <span className="target-coords">20.5937° N, 78.9629° E // REGION: SOUTH ASIA</span>
              <span className="target-subtext">Swath Width: 3,060 km • Resolving Subcontinental Surface</span>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- ACT 4: THERMAL HOTSPOTS ---------------- */}
      {act4Opacity > 0.01 && (
        <div className="hud-section act-hotspots" style={{ opacity: act4Opacity }}>
          <div className="hotspots-header">
            <span className="hud-eyebrow">RADIOMETRIC THERMAL INVERSION</span>
            <h2 className="hud-title-medium">Active Thermal Point Sources Identified</h2>
            <p className="hud-caption">
              Calibrated high-temperature anomalies detected across key industrial corridors.
            </p>
          </div>

          <div
            className="incident-telemetry-panel"
            style={{ pointerEvents: 'auto' }}
            onClick={() => onSelectHotspot(displayedHotspot)}
          >
            <div className="telemetry-panel-top">
              <span className="anomaly-pulse-indicator" />
              <span className="anomaly-id">{displayedHotspot.id}</span>
              <span className="anomaly-risk-badge">RISK SCORE: {displayedHotspot.riskScore} / 100</span>
            </div>

            <div className="telemetry-panel-body">
              <h3 className="incident-name">{displayedHotspot.clusterName}</h3>
              <span className="incident-state">{displayedHotspot.state}, INDIA</span>

              <div className="telemetry-metrics-row">
                <div className="metric-pill">
                  <span className="m-label">BRIGHTNESS TEMP</span>
                  <span className="m-val">{displayedHotspot.brightness} K</span>
                </div>
                <div className="metric-pill">
                  <span className="m-label">FIRE RADIATIVE POWER</span>
                  <span className="m-val">{displayedHotspot.frp} MW</span>
                </div>
                <div className="metric-pill">
                  <span className="m-label">CLASSIFICATION</span>
                  <span className="m-val highlight">{displayedHotspot.classification}</span>
                </div>
                <div className="metric-pill">
                  <span className="m-label">DETECTION SENSOR</span>
                  <span className="m-val">{displayedHotspot.satellite}</span>
                </div>
              </div>

              <div className="panel-footer-hint">
                <span>Click to inspect incident in Emergency Operations Center →</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- ACT 5: AI CLASSIFICATION PIPELINE ---------------- */}
      {act5Opacity > 0.01 && (
        <div className="hud-section act-pipeline" style={{ opacity: act5Opacity }}>
          <div className="pipeline-card">
            <span className="hud-eyebrow">AUTOMATED DECISION SUPPORT ARCHITECTURE</span>
            <h2 className="hud-title-medium">Scientific Intelligence Pipeline</h2>

            <div className="pipeline-flow-steps">
              <div className="step-node completed">
                <span className="step-num">01</span>
                <span className="step-name">SATELLITE OBSERVATION</span>
                <span className="step-desc">NASA FIRMS VIIRS & MODIS passes</span>
              </div>
              <div className="flow-arrow">→</div>
              <div className="step-node completed">
                <span className="step-num">02</span>
                <span className="step-name">THERMAL SIGNAL</span>
                <span className="step-desc">Radiometric 3.74µm flux extraction</span>
              </div>
              <div className="flow-arrow">→</div>
              <div className="step-node completed">
                <span className="step-num">03</span>
                <span className="step-name">AI CLASSIFICATION</span>
                <span className="step-desc">Sentinel-2 & OSM multi-source CNN</span>
              </div>
              <div className="flow-arrow">→</div>
              <div className="step-node completed">
                <span className="step-num">04</span>
                <span className="step-name">RISK ASSESSMENT</span>
                <span className="step-desc">Asset exposure & plume radius model</span>
              </div>
              <div className="flow-arrow">→</div>
              <div className="step-node completed active">
                <span className="step-num">05</span>
                <span className="step-name">DISASTER ALERT</span>
                <span className="step-desc">Automated EOC multi-agency dispatch</span>
              </div>
            </div>

            <div className="pipeline-verification-bar">
              <div className="verif-item">
                <span className="v-label">AI CONFIDENCE</span>
                <span className="v-val">94.2%</span>
              </div>
              <div className="verif-item">
                <span className="v-label">WILDFIRE REJECTION</span>
                <span className="v-val">CONFIRMED (Zero Forest Proximity)</span>
              </div>
              <div className="verif-item">
                <span className="v-label">PERSISTENCE INDEX</span>
                <span className="v-val">98.4% (Continuous Industrial Flare)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- ACT 6: FINAL HERO SETTLE ---------------- */}
      {act6Opacity > 0.01 && (
        <div
          className="hud-section act-final"
          style={{ opacity: act6Opacity, pointerEvents: 'auto' }}
        >
          <div className="final-hero-content">
            <span className="hud-eyebrow">THERMOSCOPE // NATIONAL SATELLITE SURVEILLANCE</span>
            <h1 className="hero-monumental-title settle-title">
              SEE FIRE
              <br />
              BEFORE IT BECOMES
              <br />
              A DISASTER.
            </h1>
            <p className="hero-subtext settle-subtext">
              AI-powered satellite intelligence for detecting, classifying and monitoring industrial
              fires and persistent thermal sources across the Indian subcontinent.
            </p>

            <div className="final-cta-group">
              <button
                type="button"
                className="btn-primary-cinematic"
                onClick={onExploreHotspots}
              >
                <span>Explore Fire Intelligence</span>
              </button>

              <button
                type="button"
                className="btn-secondary-cinematic"
                onClick={onLaunchDashboard}
              >
                <span>Launch Operations Dashboard →</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
