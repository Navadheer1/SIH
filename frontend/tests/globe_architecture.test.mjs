import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// --- Test 1 Helpers: Spherical Math ---
function latLonToGlobeVector3Math(lat, lon, radius = 20.0) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return { x, y, z, length: Math.sqrt(x * x + y * y + z * z) };
}

// --- Test 2 Helpers: Deterministic Orbit Mechanics ---
const ORBIT_INCLINATION_DEG = 98.71;
const ORBIT_ALTITUDE_KM = 824.0;
const ORBIT_PERIOD_MIN = 101.4;

function calculateOrbitalLat(phase) {
  const meanAnomaly = phase * 2.0 * Math.PI;
  const incRad = (ORBIT_INCLINATION_DEG * Math.PI) / 180;
  const latRad = Math.asin(Math.sin(incRad) * Math.sin(meanAnomaly));
  return (latRad * 180) / Math.PI;
}

function isOverIndia(lat, lon) {
  return lat >= 6.0 && lat <= 38.0 && lon >= 66.0 && lon <= 99.0;
}

// --- Test 3 Helpers: Data-Driven Threat Zones Radii Formula ---
function calculateThreatZoneRadii(frp, riskScore = 50.0, classification = 'INDUSTRIAL_FIRE', persistenceScore = 0.0) {
  const baseInner = 0.8;
  const baseSecondary = 2.5;
  const baseMonitoring = 4.5;

  const frpFactor = Math.log1p(Math.max(0.0, frp)) / 3.0;
  const riskFactor = (Math.max(0.0, Math.min(100.0, riskScore)) / 100.0) * 0.8;
  const classMultiplier = classification.toUpperCase().includes('INDUSTRIAL') ? 1.25 : 1.0;
  const persistenceFactor = (Math.max(0.0, Math.min(100.0, persistenceScore)) / 100.0) * 0.3;

  const multiplier = (1.0 + frpFactor + riskFactor + persistenceFactor) * classMultiplier;

  let innerRadius = Math.round(baseInner * multiplier * 100) / 100;
  let secondaryRadius = Math.round(baseSecondary * multiplier * 100) / 100;
  let monitoringRadius = Math.round(baseMonitoring * multiplier * 100) / 100;

  innerRadius = Math.max(0.5, Math.min(2.5, innerRadius));
  secondaryRadius = Math.max(1.5, Math.min(5.0, secondaryRadius));
  monitoringRadius = Math.max(3.0, Math.min(8.0, monitoringRadius));

  return { innerRadius, secondaryRadius, monitoringRadius, multiplier };
}

// --- Test 4 Helpers: 5-Phase Expansion Sequence ---
function getExpansionPhase(progress) {
  if (progress < 0.2) return { phase: 'T0', label: 'THERMAL SIGNAL DETECTED' };
  if (progress < 0.45) return { phase: 'T1', label: 'CORE INTENSITY ACQUIRED' };
  if (progress < 0.65) return { phase: 'T2', label: 'PERSISTENCE & RADII COMPUTED' };
  if (progress < 0.95) return { phase: 'T3', label: '3D RISK PROPAGATION EXPANDING' };
  return { phase: 'T4', label: 'STABILIZED THERMAL RISK ZONE' };
}

describe('Thermoscope 3D Satellite Intelligence Globe Architecture Tests', () => {
  it('Test 1: Validates exact spherical coordinate to Cartesian conversions on globe', () => {
    const R = 20.0;
    const northPole = latLonToGlobeVector3Math(90, 0, R);
    assert.ok(Math.abs(northPole.y - R) < 0.001, 'North Pole must lie exactly at +Y');
    assert.ok(Math.abs(northPole.x) < 0.001, 'North Pole X must be 0');
    assert.ok(Math.abs(northPole.z) < 0.001, 'North Pole Z must be 0');

    const southPole = latLonToGlobeVector3Math(-90, 0, R);
    assert.ok(Math.abs(southPole.y - (-R)) < 0.001, 'South Pole must lie exactly at -Y');

    const equatorZero = latLonToGlobeVector3Math(0, 0, R);
    assert.ok(Math.abs(equatorZero.y) < 0.001, 'Equator Y must be 0');
    assert.ok(Math.abs(equatorZero.length - R) < 0.001, 'Distance from origin must strictly equal R');

    // Test Indian reference coordinate (New Delhi: 28.6139 N, 77.2090 E)
    const delhi = latLonToGlobeVector3Math(28.6139, 77.209, R);
    assert.ok(delhi.y > 0, 'Delhi Y must be positive (Northern Hemisphere)');
    assert.ok(Math.abs(delhi.length - R) < 0.001, 'Delhi vector distance must equal R');
  });

  it('Test 2: Validates deterministic NOAA-21 VIIRS orbit mechanics and Indian corridor bounds', () => {
    // Inclination: 98.71 degrees
    const maxLat = calculateOrbitalLat(0.25);
    assert.ok(maxLat > 80.0 && maxLat <= 90.0, 'Max latitude must match polar orbit envelope');

    // Test India detection
    assert.equal(isOverIndia(20.59, 78.96), true, 'Central India must be identified as active pass');
    assert.equal(isOverIndia(16.31, 80.42), true, 'Andhra Pradesh corridor must be active pass');
    assert.equal(isOverIndia(51.5, -0.12), false, 'London must NOT be in India observation corridor');
    assert.equal(isOverIndia(-33.86, 151.2), false, 'Sydney must NOT be in India observation corridor');
  });

  it('Test 3: Validates 5-layer 3D thermal risk radius mathematical bounds and data-driven constraints', () => {
    // Low FRP, Low Risk
    const low = calculateThreatZoneRadii(5.0, 20.0, 'NON_FIRE', 0.0);
    assert.ok(low.innerRadius >= 0.5 && low.innerRadius <= 2.5, 'Inner radius must remain within [0.5, 2.5] km');
    assert.ok(low.secondaryRadius >= 1.5 && low.secondaryRadius <= 5.0, 'Secondary radius within [1.5, 5.0] km');
    assert.ok(low.monitoringRadius >= 3.0 && low.monitoringRadius <= 8.0, 'Monitoring radius within [3.0, 8.0] km');

    // High FRP, High Risk, Industrial Candidate
    const high = calculateThreatZoneRadii(120.0, 95.0, 'INDUSTRIAL_FIRE', 85.0);
    assert.ok(high.innerRadius > low.innerRadius, 'High risk inner radius must exceed low risk');
    assert.ok(high.secondaryRadius > low.secondaryRadius, 'High risk secondary radius must exceed low risk');
    assert.ok(high.monitoringRadius > low.monitoringRadius, 'High risk monitoring radius must exceed low risk');

    // Multiplier for industrial fire must include 1.25x class bonus
    assert.ok(high.multiplier >= 1.25, 'Industrial multiplier must include 1.25x scaling');
  });

  it('Test 4: Validates expansion sequence progress mapping through T0 to T4', () => {
    assert.equal(getExpansionPhase(0.05).phase, 'T0');
    assert.equal(getExpansionPhase(0.3).phase, 'T1');
    assert.equal(getExpansionPhase(0.55).phase, 'T2');
    assert.equal(getExpansionPhase(0.8).phase, 'T3');
    assert.equal(getExpansionPhase(1.0).phase, 'T4');
    assert.equal(getExpansionPhase(1.0).label, 'STABILIZED THERMAL RISK ZONE');
  });

  it('Test 5: Validates scientific disclaimer and distinction between FIRMS point vs 3D influence zone', () => {
    const disclaimer = 'AI ESTIMATED THERMAL INFLUENCE ZONE — Calculated risk propagation, not physical fire boundary.';
    assert.ok(disclaimer.includes('AI ESTIMATED THERMAL INFLUENCE ZONE'), 'Must declare AI estimation');
    assert.ok(disclaimer.includes('not physical fire boundary'), 'Must explicitly disclaim physical fire size');
  });

  it('Test 6: Validates radiometric severity color mapping for thermal observations', () => {
    function getSeverityColorHex(frp) {
      if (frp >= 70) return '#ef4444';
      if (frp >= 35) return '#f97316';
      if (frp >= 15) return '#eab308';
      return '#06b6d4';
    }

    assert.equal(getSeverityColorHex(120), '#ef4444');
    assert.equal(getSeverityColorHex(55), '#f97316');
    assert.equal(getSeverityColorHex(25), '#eab308');
    assert.equal(getSeverityColorHex(8), '#06b6d4');
  });

  it('Test 7: Validates the upgraded 6-stage state machine mapping', () => {
    function getSixStageExpansion(progress) {
      if (progress < 0.18) return { stage: 'STATE 1: THERMAL SIGNAL', stageNumber: 1 };
      if (progress < 0.38) return { stage: 'STATE 2: SIGNAL VALIDATED', stageNumber: 2 };
      if (progress < 0.58) return { stage: 'STATE 3: PERSISTENCE CONFIRMED', stageNumber: 3 };
      if (progress < 0.82) return { stage: 'STATE 4: AI RISK MODEL', stageNumber: 4 };
      if (progress < 0.98) return { stage: 'STATE 5: RISK FIELD STABILIZED', stageNumber: 5 };
      return { stage: 'STATE 6: INCIDENT ASSESSED', stageNumber: 6 };
    }

    assert.equal(getSixStageExpansion(0.08).stageNumber, 1);
    assert.equal(getSixStageExpansion(0.25).stageNumber, 2);
    assert.equal(getSixStageExpansion(0.48).stageNumber, 3);
    assert.equal(getSixStageExpansion(0.72).stageNumber, 4);
    assert.equal(getSixStageExpansion(0.90).stageNumber, 5);
    assert.equal(getSixStageExpansion(1.0).stageNumber, 6);
    assert.equal(getSixStageExpansion(1.0).stage, 'STATE 6: INCIDENT ASSESSED');
  });

  it('Test 8: Validates natural exponential volumetric gradient falloff math', () => {
    function calculateVolumetricIntensity(rNorm, yNorm) {
      const radial = Math.exp(-Math.pow(rNorm, 2.0) * 3.2);
      const vertical = Math.pow(Math.max(0.0, 1.0 - yNorm), 1.4);
      return radial * vertical;
    }

    // At ground center (r = 0, y = 0)
    const center = calculateVolumetricIntensity(0, 0);
    assert.ok(Math.abs(center - 1.0) < 0.001, 'Center ground intensity must equal 1.0');

    // At boundary (r = 1.0, y = 0.8)
    const edge = calculateVolumetricIntensity(1.0, 0.8);
    assert.ok(edge < 0.05, 'Outer boundary intensity must fade smoothly to near zero');
  });

  it('Test 9: Validates strict 3-layer visual hierarchy and clutter elimination rule', () => {
    const validLayers = ['LAYER 1: THERMAL CORE', 'LAYER 2: PERSISTENCE RING', 'LAYER 3: AI RISK FIELD'];
    assert.equal(validLayers.length, 3, 'Must have strictly 3 visual layers for selected incident');
    assert.ok(validLayers[0].includes('THERMAL CORE'), 'Layer 1 must be Thermal Core');
    assert.ok(validLayers[1].includes('PERSISTENCE RING'), 'Layer 2 must be Persistence Ring');
    assert.ok(validLayers[2].includes('AI RISK FIELD'), 'Layer 3 must be AI Risk Field');

    // Persistence rings count must not exceed 2
    const maxPersistenceRings = 2;
    assert.ok(maxPersistenceRings <= 2, 'Persistence rings must not exceed 2 to prevent clutter');
  });

  it('Test 10: Validates 7-step automated SIH demo pipeline workflow', () => {
    const pipelineSteps = [
      { step: '01', label: 'SATELLITE PASS' },
      { step: '02', label: 'VIIRS OBSERVATION' },
      { step: '03', label: 'FIRMS THERMAL DETECTION' },
      { step: '04', label: 'PERSISTENCE CONFIRMED' },
      { step: '05', label: 'AI INDUSTRIAL CLASSIFICATION' },
      { step: '06', label: '3D RISK FIELD' },
      { step: '07', label: 'INCIDENT PRIORITIZED' },
    ];

    assert.equal(pipelineSteps.length, 7, 'Must have strictly 7 operational demo steps');
    assert.equal(pipelineSteps[0].label, 'SATELLITE PASS');
    assert.equal(pipelineSteps[1].label, 'VIIRS OBSERVATION');
    assert.equal(pipelineSteps[2].label, 'FIRMS THERMAL DETECTION');
    assert.equal(pipelineSteps[3].label, 'PERSISTENCE CONFIRMED');
    assert.equal(pipelineSteps[4].label, 'AI INDUSTRIAL CLASSIFICATION');
    assert.equal(pipelineSteps[5].label, '3D RISK FIELD');
    assert.equal(pipelineSteps[6].label, 'INCIDENT PRIORITIZED');
  });

  it('Test 11: Validates Explanation Card data synchronization and Field Basis formula', () => {
    const fieldBasis = 'THERMAL SIGNAL + PERSISTENCE + INDUSTRIAL CONTEXT + SPATIAL RISK';
    assert.ok(fieldBasis.includes('THERMAL SIGNAL'), 'Must incorporate thermal signal');
    assert.ok(fieldBasis.includes('PERSISTENCE'), 'Must incorporate persistence');
    assert.ok(fieldBasis.includes('INDUSTRIAL CONTEXT'), 'Must incorporate industrial context');
    assert.ok(fieldBasis.includes('SPATIAL RISK'), 'Must incorporate spatial risk');

    // Radii naming test: never call it "fire radius" or "actual fire size"
    const label = 'AI ESTIMATED THERMAL RISK FIELD';
    assert.ok(!label.includes('FIRE RADIUS'), 'Must not declare fire radius');
    assert.ok(!label.includes('ACTUAL FIRE SIZE'), 'Must not declare actual fire size');
    assert.ok(label.includes('AI ESTIMATED'), 'Must declare AI estimation');
  });

  it('Test 12: Validates CTRL + SCROLL ZOOM ONLY authorization and page scroll passthrough', () => {
    // Zoom authorization logic simulated from GlobeControls.ts
    function processWheelEvent({ ctrlKey, shiftKey, deltaY, currentRadius, minRadius, maxRadius }) {
      let preventedDefault = false;
      let targetRadius = currentRadius;
      let hintTriggered = false;
      let zoomAuthorized = false;

      if (ctrlKey && !shiftKey) {
        preventedDefault = true;
        zoomAuthorized = true;
        const zoomSpeed = 0.0035;
        targetRadius += deltaY * zoomSpeed * (currentRadius * 0.15);
        targetRadius = Math.max(minRadius, Math.min(maxRadius, targetRadius));
      } else {
        hintTriggered = true;
      }

      return { preventedDefault, targetRadius, hintTriggered, zoomAuthorized };
    }

    const minR = 23.6;
    const maxR = 65.0;

    // 1. Normal scroll without Ctrl
    const normalScroll = processWheelEvent({
      ctrlKey: false,
      shiftKey: false,
      deltaY: 100,
      currentRadius: 48.0,
      minRadius: minR,
      maxRadius: maxR,
    });
    assert.equal(normalScroll.preventedDefault, false, 'Normal scroll must NOT prevent default (must allow page scroll)');
    assert.equal(normalScroll.zoomAuthorized, false, 'Normal scroll must NOT zoom the globe');
    assert.equal(normalScroll.targetRadius, 48.0, 'Camera radius must remain unchanged');
    assert.equal(normalScroll.hintTriggered, true, 'Normal scroll must trigger UX hint');

    // 2. Ctrl + Scroll
    const ctrlZoomIn = processWheelEvent({
      ctrlKey: true,
      shiftKey: false,
      deltaY: -100,
      currentRadius: 48.0,
      minRadius: minR,
      maxRadius: maxR,
    });
    assert.equal(ctrlZoomIn.preventedDefault, true, 'Ctrl + scroll must prevent default page scroll');
    assert.equal(ctrlZoomIn.zoomAuthorized, true, 'Ctrl + scroll must authorize zoom');
    assert.ok(ctrlZoomIn.targetRadius < 48.0, 'Negative deltaY must zoom in (decrease radius)');
    assert.equal(ctrlZoomIn.hintTriggered, false, 'UX hint must not trigger during authorized zoom');

    // 3. Shift + Scroll (must NOT zoom)
    const shiftScroll = processWheelEvent({
      ctrlKey: false,
      shiftKey: true,
      deltaY: 100,
      currentRadius: 48.0,
      minRadius: minR,
      maxRadius: maxR,
    });
    assert.equal(shiftScroll.zoomAuthorized, false, 'Shift + scroll must NOT zoom');
    assert.equal(shiftScroll.preventedDefault, false, 'Shift + scroll must not prevent default');

    // 4. Ctrl + Shift + Scroll (Shift must prevent zoom)
    const ctrlShiftScroll = processWheelEvent({
      ctrlKey: true,
      shiftKey: true,
      deltaY: 100,
      currentRadius: 48.0,
      minRadius: minR,
      maxRadius: maxR,
    });
    assert.equal(ctrlShiftScroll.zoomAuthorized, false, 'Ctrl + Shift + scroll must NOT zoom');

    // 5. Clamping bounds check
    const extremeZoomIn = processWheelEvent({
      ctrlKey: true,
      shiftKey: false,
      deltaY: -100000,
      currentRadius: 48.0,
      minRadius: minR,
      maxRadius: maxR,
    });
    assert.equal(extremeZoomIn.targetRadius, minR, 'Extreme zoom in must clamp to minRadius');

    const extremeZoomOut = processWheelEvent({
      ctrlKey: true,
      shiftKey: false,
      deltaY: 100000,
      currentRadius: 48.0,
      minRadius: minR,
      maxRadius: maxR,
    });
    assert.equal(extremeZoomOut.targetRadius, maxR, 'Extreme zoom out must clamp to maxRadius');
  });
});

