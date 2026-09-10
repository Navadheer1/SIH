import * as THREE from 'three';
import { Hotspot, ThreatZonesResponse } from '../../types/hotspot';
import { GLOBE_RADIUS, latLonToGlobeVector3 } from './EarthGlobe';

export type ExpansionStage =
  | 'STATE 1: THERMAL SIGNAL'
  | 'STATE 2: SIGNAL VALIDATED'
  | 'STATE 3: PERSISTENCE CONFIRMED'
  | 'STATE 4: AI RISK MODEL'
  | 'STATE 5: RISK FIELD STABILIZED'
  | 'STATE 6: INCIDENT ASSESSED';

export interface ThermalRiskFieldSystem {
  group: THREE.Group;
  setActiveTarget: (
    hotspot: Hotspot | null,
    threatZones: ThreatZonesResponse | null,
    riskScore?: number,
    classification?: string,
    persistenceScore?: number
  ) => void;
  update: (deltaSec: number, timeSec: number) => void;
  getExpansionState: () => {
    stage: ExpansionStage;
    stageNumber: number;
    label: string;
    progress: number;
    radiiKm: { inner: number; secondary: number; monitoring: number };
  };
  dispose: () => void;
}

// Generates high-DPI canvas texture for the vertical "THERMAL DETECTION ▼" pin
function createCalloutTexture(mainText: string, subText: string, accentColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 140;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 512, 140);
    // Dark translucent HUD box with subtle rounded corners
    ctx.fillStyle = 'rgba(2, 6, 23, 0.90)';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(10, 10, 492, 86, 10);
    ctx.fill();
    ctx.stroke();

    // Top text (THERMAL DETECTION)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px "JetBrains Mono", monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(mainText, 256, 46);

    // Sub text if any
    if (subText) {
      ctx.fillStyle = accentColor;
      ctx.font = 'bold 22px "JetBrains Mono", monospace, sans-serif';
      ctx.fillText(subText, 256, 78);
    }

    // Small down pointer triangle ▼
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.moveTo(242, 98);
    ctx.lineTo(270, 98);
    ctx.lineTo(256, 122);
    ctx.closePath();
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// Generates high-DPI canvas texture for floating field label
function createRiskLabelTexture(radiusKm: number, riskLevel: string, accentHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 120;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 512, 120);
    ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(10, 10, 492, 100, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = accentHex;
    ctx.font = 'bold 24px "JetBrains Mono", monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('AI ESTIMATED THERMAL RISK FIELD', 256, 48);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 26px "JetBrains Mono", monospace, sans-serif';
    ctx.fillText(`${radiusKm.toFixed(1)} KM INFLUENCE ZONE (${riskLevel})`, 256, 88);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function createThermalRiskField(): ThermalRiskFieldSystem {
  const group = new THREE.Group();
  group.name = 'thermal-risk-field-system';

  let currentHotspot: Hotspot | null = null;
  let elapsedAnimationTime = 0.0; // 0.0s to 3.5s+
  let isTargetActive = false;

  // Scale factor: Earth radius 20 units -> 1 km visual scale ~ 0.28 units on globe
  const KM_TO_GLOBE = 0.28;

  // Data-driven radii in km
  let innerRadiusKm = 1.2;
  let secondaryRadiusKm = 2.8;
  let monitoringRadiusKm = 5.2;
  let riskLevel: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' = 'HIGH';

  // =========================================================================
  // LAYER 1: THERMAL CORE + VERTICAL CALLOUT MARKER
  // Small bright thermal core + orange/red center + thin selection ring + vertical marker
  // =========================================================================
  const layer1Group = new THREE.Group();
  layer1Group.name = 'layer-1-thermal-core';
  group.add(layer1Group);

  // 1A. Thermal Core: Incandescent Inner Sphere
  const coreInnerGeom = new THREE.SphereGeometry(0.065, 16, 16);
  const coreInnerMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1.0,
  });
  const coreInnerMesh = new THREE.Mesh(coreInnerGeom, coreInnerMat);
  coreInnerMesh.position.set(0, 0.04, 0);
  layer1Group.add(coreInnerMesh);

  // 1B. Thermal Core: Radiant Hot Corona
  const coreOuterGeom = new THREE.SphereGeometry(0.11, 16, 16);
  const coreOuterMat = new THREE.MeshBasicMaterial({
    color: 0xef4444, // Orange/red center
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
  });
  const coreOuterMesh = new THREE.Mesh(coreOuterGeom, coreOuterMat);
  coreOuterMesh.position.set(0, 0.04, 0);
  layer1Group.add(coreOuterMesh);

  // 1C. Thin White/Cyan Selection Ring on Ground Plane
  const selectionRingGeom = new THREE.RingGeometry(0.14, 0.18, 32);
  const selectionRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const selectionRingMesh = new THREE.Mesh(selectionRingGeom, selectionRingMat);
  selectionRingMesh.rotation.x = -Math.PI / 2;
  layer1Group.add(selectionRingMesh);

  // 1D. Vertical Marker Stem (Thin Line pointing from ground to label)
  const stemGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.04, 0),
    new THREE.Vector3(0, 0.46, 0),
  ]);
  const stemMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.75,
  });
  const stemLine = new THREE.Line(stemGeom, stemMat);
  layer1Group.add(stemLine);

  // 1E. Small Vertical Marker Callout Label Sprite: "THERMAL DETECTION ▼"
  let calloutTexture = createCalloutTexture('THERMAL DETECTION', 'NASA FIRMS VIIRS', '#38bdf8');
  const calloutSpriteMat = new THREE.SpriteMaterial({
    map: calloutTexture,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const calloutSprite = new THREE.Sprite(calloutSpriteMat);
  calloutSprite.position.set(0, 0.64, 0);
  calloutSprite.scale.set(1.4, 0.38, 1.0);
  layer1Group.add(calloutSprite);

  // =========================================================================
  // LAYER 2: PERSISTENCE RING (MAXIMUM 2 SUBTLE RINGS)
  // Clean, thin, non-cluttered historical multi-pass indication
  // =========================================================================
  const layer2Group = new THREE.Group();
  layer2Group.name = 'layer-2-persistence';
  group.add(layer2Group);

  // 2A. Primary Persistence Ring
  const persistRing1Geom = new THREE.RingGeometry(0.96, 1.0, 48);
  const persistRing1Mat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const persistRing1Mesh = new THREE.Mesh(persistRing1Geom, persistRing1Mat);
  persistRing1Mesh.rotation.x = -Math.PI / 2;
  layer2Group.add(persistRing1Mesh);

  // 2B. Secondary Subtle Persistence Ring (Inner bounds)
  const persistRing2Geom = new THREE.RingGeometry(0.68, 0.72, 40);
  const persistRing2Mat = new THREE.MeshBasicMaterial({
    color: 0x0284c7,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const persistRing2Mesh = new THREE.Mesh(persistRing2Geom, persistRing2Mat);
  persistRing2Mesh.rotation.x = -Math.PI / 2;
  layer2Group.add(persistRing2Mesh);

  // =========================================================================
  // LAYER 3: ONE 3D AI RISK FIELD (VOLUMETRIC PLUME + GRADIENT GROUND FOOTPRINT)
  // Continuous exponential falloff: Center = High, Middle = Moderate, Edge = Weak
  // =========================================================================
  const layer3Group = new THREE.Group();
  layer3Group.name = 'layer-3-ai-risk-field';
  group.add(layer3Group);

  // 3A. Volumetric 3D Atmospheric Elevation Plume (Rises from ground)
  const plumeSegments = 32;
  const plumeRings = 16;
  const plumeGeom = new THREE.CylinderGeometry(0.12, 1.0, 1.0, plumeSegments, plumeRings, true);
  plumeGeom.translate(0, 0.5, 0); // Base sits flush at y = 0

  const plumeMat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      progress: { value: 0 },
      radius: { value: 1.0 },
      height: { value: 1.0 },
      colorCore: { value: new THREE.Color(0xffffff) },
      colorMid: { value: new THREE.Color(0xf97316) },
      colorOuter: { value: new THREE.Color(0xfbbf24) },
    },
    vertexShader: `
      uniform float radius;
      uniform float height;
      uniform float progress;

      varying vec3 vPosition;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        float verticalFactor = position.y; // 0.0 at base to 1.0 at apex
        float rScale = radius * (1.0 - (verticalFactor * 0.45)) * progress;
        float hScale = height * progress;

        vec3 newPos = vec3(position.x * rScale, position.y * hScale, position.z * rScale);
        vPosition = newPos;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float progress;
      uniform float radius;
      uniform float height;
      uniform vec3 colorCore;
      uniform vec3 colorMid;
      uniform vec3 colorOuter;

      varying vec3 vPosition;

      void main() {
        if (progress <= 0.02) discard;

        // Radial normalized distance from center (0.0 to 1.0)
        float rDist = length(vPosition.xz) / max(0.01, radius * progress);
        // Exponential radial falloff: Center strongest, Edge fading to zero
        float radialFactor = exp(-pow(rDist, 2.0) * 3.5);

        // Vertical falloff: strongest near surface, atmospheric decay upward
        float vertNorm = clamp(vPosition.y / max(0.01, height * progress), 0.0, 1.0);
        float vertFactor = pow(1.0 - vertNorm, 1.4);

        // Continuous combined falloff intensity
        float intensity = radialFactor * vertFactor;

        // Subtle ambient pulse after stabilization
        float pulse = 1.0 + sin(time * 2.5 + vPosition.y * 3.0) * 0.04;

        // Semantic color transition
        vec3 finalColor = mix(colorOuter, colorMid, smoothstep(0.18, 0.65, intensity));
        finalColor = mix(finalColor, colorCore, smoothstep(0.65, 0.95, intensity));

        float alpha = clamp(intensity * 0.50 * pulse * progress, 0.0, 0.75);

        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const plumeMesh = new THREE.Mesh(plumeGeom, plumeMat);
  layer3Group.add(plumeMesh);

  // 3B. Continuous Gradient Ground Footprint Disc
  const groundFootprintGeom = new THREE.CircleGeometry(1.0, 48);
  const groundFootprintMat = new THREE.ShaderMaterial({
    uniforms: {
      colorCenter: { value: new THREE.Color(0xef4444) },
      colorEdge: { value: new THREE.Color(0xf97316) },
      radius: { value: 1.0 },
      progress: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 colorCenter;
      uniform vec3 colorEdge;
      uniform float radius;
      uniform float progress;
      varying vec2 vUv;

      void main() {
        if (progress <= 0.02) discard;
        vec2 center = vec2(0.5, 0.5);
        float d = distance(vUv, center) * 2.0;

        // Exponential falloff with zero harsh circular cutoffs
        float falloff = exp(-pow(d, 2.2) * 3.5);
        vec3 col = mix(colorEdge, colorCenter, falloff);
        float alpha = falloff * 0.32 * progress;

        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const groundFootprintMesh = new THREE.Mesh(groundFootprintGeom, groundFootprintMat);
  groundFootprintMesh.rotation.x = -Math.PI / 2;
  layer3Group.add(groundFootprintMesh);

  // 3C. Floating Label Sprite: "AI ESTIMATED THERMAL RISK FIELD"
  let riskLabelTexture = createRiskLabelTexture(2.8, 'HIGH', '#f97316');
  const riskLabelSpriteMat = new THREE.SpriteMaterial({
    map: riskLabelTexture,
    transparent: true,
    opacity: 0.90,
    depthWrite: false,
  });
  const riskLabelSprite = new THREE.Sprite(riskLabelSpriteMat);
  riskLabelSprite.scale.set(1.5, 0.36, 1.0);
  layer3Group.add(riskLabelSprite);

  group.visible = false;

  const setActiveTarget = (
    hotspot: Hotspot | null,
    threatZones: ThreatZonesResponse | null,
    riskScore = 75,
    classification = 'INDUSTRIAL_FIRE',
    persistenceScore = 50
  ) => {
    currentHotspot = hotspot;
    if (!hotspot) {
      group.visible = false;
      isTargetActive = false;
      return;
    }

    // Centralized data-driven radius calculation
    if (threatZones?.zones) {
      innerRadiusKm = threatZones.zones.inner_zone.radius_km;
      secondaryRadiusKm = threatZones.zones.secondary_zone.radius_km;
      monitoringRadiusKm = threatZones.zones.monitoring_zone.radius_km;
    } else {
      const frpVal = hotspot.frp || 25.0;
      const frpFactor = Math.log1p(Math.max(0, frpVal)) / 3.0;
      const riskFactor = (Math.max(0, Math.min(100, riskScore)) / 100.0) * 0.8;
      const classMult = classification.toUpperCase().includes('INDUSTRIAL') ? 1.25 : 1.0;
      const persistFactor = (Math.max(0, Math.min(100, persistenceScore)) / 100.0) * 0.3;
      const multiplier = (1.0 + frpFactor + riskFactor + persistFactor) * classMult;

      innerRadiusKm = Math.max(0.5, Math.min(2.5, +(0.8 * multiplier).toFixed(2)));
      secondaryRadiusKm = Math.max(1.5, Math.min(5.0, +(2.5 * multiplier).toFixed(2)));
      monitoringRadiusKm = Math.max(3.0, Math.min(8.0, +(4.5 * multiplier).toFixed(2)));
    }

    riskLevel =
      riskScore >= 75 ? 'CRITICAL' : riskScore >= 50 ? 'HIGH' : riskScore >= 25 ? 'MODERATE' : 'LOW';

    // Position at exact ground coordinate (Requirement 4: Co-located with FIRMS point)
    const groundPos = latLonToGlobeVector3(hotspot.latitude, hotspot.longitude, GLOBE_RADIUS * 1.002);
    group.position.copy(groundPos);

    // Align vertical orientation normal to Earth's sphere
    const normal = groundPos.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, normal);
    group.setRotationFromQuaternion(quat);

    // Semantic Color Semantics (Requirement 18)
    // LOW = cyan/green, MODERATE = yellow, HIGH = orange, CRITICAL = red
    let accentHex = '#f97316';
    if (riskLevel === 'CRITICAL') {
      accentHex = '#ef4444';
      coreOuterMat.color.setHex(0xef4444);
      plumeMat.uniforms.colorCore.value.setHex(0xffffff);
      plumeMat.uniforms.colorMid.value.setHex(0xef4444);
      plumeMat.uniforms.colorOuter.value.setHex(0xf97316);
      groundFootprintMat.uniforms.colorCenter.value.setHex(0xef4444);
      groundFootprintMat.uniforms.colorEdge.value.setHex(0xf97316);
    } else if (riskLevel === 'HIGH') {
      accentHex = '#f97316';
      coreOuterMat.color.setHex(0xf97316);
      plumeMat.uniforms.colorCore.value.setHex(0xffedd5);
      plumeMat.uniforms.colorMid.value.setHex(0xf97316);
      plumeMat.uniforms.colorOuter.value.setHex(0xfbbf24);
      groundFootprintMat.uniforms.colorCenter.value.setHex(0xf97316);
      groundFootprintMat.uniforms.colorEdge.value.setHex(0xfbbf24);
    } else if (riskLevel === 'MODERATE') {
      accentHex = '#eab308';
      coreOuterMat.color.setHex(0xeab308);
      plumeMat.uniforms.colorCore.value.setHex(0xfef08a);
      plumeMat.uniforms.colorMid.value.setHex(0xeab308);
      plumeMat.uniforms.colorOuter.value.setHex(0x38bdf8);
      groundFootprintMat.uniforms.colorCenter.value.setHex(0xeab308);
      groundFootprintMat.uniforms.colorEdge.value.setHex(0x38bdf8);
    } else {
      accentHex = '#10b981';
      coreOuterMat.color.setHex(0x10b981);
      plumeMat.uniforms.colorCore.value.setHex(0xa7f3d0);
      plumeMat.uniforms.colorMid.value.setHex(0x10b981);
      plumeMat.uniforms.colorOuter.value.setHex(0x06b6d4);
      groundFootprintMat.uniforms.colorCenter.value.setHex(0x10b981);
      groundFootprintMat.uniforms.colorEdge.value.setHex(0x06b6d4);
    }

    // Refresh Callout and Risk Field Floating Sprites
    calloutTexture.dispose();
    calloutTexture = createCalloutTexture(
      'THERMAL DETECTION',
      `FRP ${(hotspot.frp || 25).toFixed(1)} MW`,
      '#38bdf8'
    );
    calloutSpriteMat.map = calloutTexture;
    calloutSpriteMat.needsUpdate = true;

    riskLabelTexture.dispose();
    riskLabelTexture = createRiskLabelTexture(secondaryRadiusKm, riskLevel, accentHex);
    riskLabelSpriteMat.map = riskLabelTexture;
    riskLabelSpriteMat.needsUpdate = true;

    const riskRadiusGlobe = secondaryRadiusKm * KM_TO_GLOBE;
    riskLabelSprite.position.set(riskRadiusGlobe * 0.85, 0.42, 0);

    // Reset exact animation timeline (Requirement 17)
    elapsedAnimationTime = 0.0;
    isTargetActive = true;
    group.visible = true;
  };

  const update = (deltaSec: number, timeSec: number) => {
    if (!group.visible || !currentHotspot || !isTargetActive) return;

    elapsedAnimationTime += deltaSec;

    // =========================================================================
    // EXACT ANIMATION TIMING (Requirement 17):
    // 0.0 sec: thermal core detected
    // 0.4 sec: selection ring appears
    // 0.8 sec: persistence ring appears
    // 1.2 sec: AI risk calculation
    // 1.5 sec: risk field starts expanding
    // 2.5 sec: risk field reaches calculated radius
    // 3.0 sec: industrial context appears
    // 3.5 sec: risk assessment complete -> stabilized subtle pulse
    // =========================================================================

    // --- LAYER 1: Thermal Core & Callout Pin ---
    // 0.0s+: Core detected, subtle pulse
    const coreActive = Math.min(1.0, elapsedAnimationTime / 0.35);
    const corePulse = 1.0 + Math.sin(timeSec * 6.0) * 0.15;
    coreInnerMesh.scale.setScalar(coreActive * corePulse);
    coreOuterMesh.scale.setScalar(coreActive * corePulse);

    // 0.4s+: Selection ring fades in
    const selRingActive = Math.max(0.0, Math.min(1.0, (elapsedAnimationTime - 0.4) / 0.4));
    selectionRingMat.opacity = 0.85 * selRingActive;
    stemMat.opacity = 0.75 * selRingActive;
    calloutSpriteMat.opacity = 0.95 * selRingActive;

    // --- LAYER 2: Persistence Rings (Max 2 subtle rings) ---
    // 0.8s+: Persistence rings fade in
    const persistActive = Math.max(0.0, Math.min(1.0, (elapsedAnimationTime - 0.8) / 0.4));
    const p1Radius = innerRadiusKm * KM_TO_GLOBE * 1.1;
    const p2Radius = innerRadiusKm * KM_TO_GLOBE * 0.75;
    persistRing1Mesh.scale.set(p1Radius, p1Radius, 1);
    persistRing2Mesh.scale.set(p2Radius, p2Radius, 1);
    persistRing1Mat.opacity = 0.55 * persistActive;
    persistRing2Mat.opacity = 0.35 * persistActive;

    // --- LAYER 3: AI 3D Volumetric Risk Plume & Footprint ---
    // 1.5s to 2.5s: Smooth expansion to calculated radius
    const expansionProgress = Math.max(0.0, Math.min(1.0, (elapsedAnimationTime - 1.5) / 1.0));
    const targetRadius = secondaryRadiusKm * KM_TO_GLOBE;
    const targetHeight = targetRadius * 0.85;

    plumeMat.uniforms.time.value = timeSec;
    plumeMat.uniforms.progress.value = expansionProgress;
    plumeMat.uniforms.radius.value = targetRadius;
    plumeMat.uniforms.height.value = targetHeight;

    groundFootprintMat.uniforms.progress.value = expansionProgress;
    groundFootprintMat.uniforms.radius.value = targetRadius;
    groundFootprintMesh.scale.set(targetRadius, targetRadius, 1);

    // 2.5s+: Floating label appears as field reaches calculated bounds
    const labelActive = Math.max(0.0, Math.min(1.0, (elapsedAnimationTime - 2.5) / 0.5));
    riskLabelSpriteMat.opacity = 0.92 * labelActive;
  };

  const getExpansionState = (): {
    stage: ExpansionStage;
    stageNumber: number;
    label: string;
    progress: number;
    radiiKm: { inner: number; secondary: number; monitoring: number };
  } => {
    let stage: ExpansionStage = 'STATE 1: THERMAL SIGNAL';
    let stageNumber = 1;
    let label = 'THERMAL CORE DETECTED';

    if (elapsedAnimationTime < 0.4) {
      stage = 'STATE 1: THERMAL SIGNAL';
      stageNumber = 1;
      label = 'THERMAL CORE DETECTED';
    } else if (elapsedAnimationTime < 0.8) {
      stage = 'STATE 2: SIGNAL VALIDATED';
      stageNumber = 2;
      label = 'SIGNAL RADIANCE VALIDATED';
    } else if (elapsedAnimationTime < 1.2) {
      stage = 'STATE 3: PERSISTENCE CONFIRMED';
      stageNumber = 3;
      label = 'TEMPORAL PERSISTENCE CONFIRMED';
    } else if (elapsedAnimationTime < 2.5) {
      stage = 'STATE 4: AI RISK MODEL';
      stageNumber = 4;
      label = '3D VOLUMETRIC RISK FIELD EXPANDING';
    } else if (elapsedAnimationTime < 3.5) {
      stage = 'STATE 5: RISK FIELD STABILIZED';
      stageNumber = 5;
      label = 'AI THERMAL RISK FIELD STABILIZED';
    } else {
      stage = 'STATE 6: INCIDENT ASSESSED';
      stageNumber = 6;
      label = 'INCIDENT RISK ASSESSMENT COMPLETE';
    }

    const normProgress = Math.min(1.0, elapsedAnimationTime / 3.5);

    return {
      stage,
      stageNumber,
      label,
      progress: normProgress,
      radiiKm: {
        inner: innerRadiusKm,
        secondary: secondaryRadiusKm,
        monitoring: monitoringRadiusKm,
      },
    };
  };

  return {
    group,
    setActiveTarget,
    update,
    getExpansionState,
    dispose: () => {
      coreInnerGeom.dispose();
      coreInnerMat.dispose();
      coreOuterGeom.dispose();
      coreOuterMat.dispose();
      selectionRingGeom.dispose();
      selectionRingMat.dispose();
      stemGeom.dispose();
      stemMat.dispose();
      calloutTexture.dispose();
      calloutSpriteMat.dispose();
      persistRing1Geom.dispose();
      persistRing1Mat.dispose();
      persistRing2Geom.dispose();
      persistRing2Mat.dispose();
      plumeGeom.dispose();
      plumeMat.dispose();
      groundFootprintGeom.dispose();
      groundFootprintMat.dispose();
      riskLabelTexture.dispose();
      riskLabelSpriteMat.dispose();
    },
  };
}

