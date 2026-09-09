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

export function createThermalRiskField(): ThermalRiskFieldSystem {
  const group = new THREE.Group();
  group.name = 'thermal-risk-field-system';

  let currentHotspot: Hotspot | null = null;
  let expansionProgress = 0.0; // 0.0 to 1.0
  let isExpanding = false;

  // Scale factor: Earth radius 20 units -> 1 km visual scale ~ 0.28 units on globe
  const KM_TO_GLOBE = 0.28;

  // Data-driven radii in km
  let innerRadiusKm = 1.2;
  let secondaryRadiusKm = 2.8;
  let monitoringRadiusKm = 5.2;
  let riskLevel: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' = 'HIGH';

  // --- LAYER 1: Thermal Core (Small precise high-intensity core at FIRMS coordinate) ---
  const coreGeom = new THREE.SphereGeometry(0.12, 16, 16);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
  });
  const coreMesh = new THREE.Mesh(coreGeom, coreMat);
  group.add(coreMesh);

  // --- RING 1: Thermal Core Ring (First primary ring) ---
  const coreRingGeom = new THREE.RingGeometry(0.16, 0.22, 32);
  const coreRingMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const coreRingMesh = new THREE.Mesh(coreRingGeom, coreRingMat);
  group.add(coreRingMesh);

  // --- RING 2: Persistence Ring (Second primary ring) ---
  const persistenceRingGeom = new THREE.RingGeometry(0.95, 1.0, 48);
  const persistenceRingMat = new THREE.LineDashedMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const persistenceRingMesh = new THREE.Mesh(persistenceRingGeom, persistenceRingMat as any);
  group.add(persistenceRingMesh);

  // --- RING 3: Outer Risk Boundary Ring (Third primary ring) ---
  const outerBoundaryGeom = new THREE.RingGeometry(0.97, 1.0, 64);
  const outerBoundaryMat = new THREE.MeshBasicMaterial({
    color: 0xf97316,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const outerBoundaryMesh = new THREE.Mesh(outerBoundaryGeom, outerBoundaryMat);
  group.add(outerBoundaryMesh);

  // --- VOLUMETRIC 3D ATMOSPHERIC THERMAL RISK FIELD ---
  // Rises vertically from Earth's surface with exponential radial & vertical gradient falloff
  const plumeSegments = 32;
  const plumeRings = 16;
  const plumeGeom = new THREE.CylinderGeometry(0.1, 1.0, 1.0, plumeSegments, plumeRings, true);
  // Shift origin so base sits flush on the Earth's surface (y = 0 to 1.0)
  plumeGeom.translate(0, 0.5, 0);

  const plumeMat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      progress: { value: 0 },
      radius: { value: 1.0 },
      height: { value: 1.2 },
      colorCore: { value: new THREE.Color(0xef4444) },
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
        // Taper volume: narrower apex, wider base expanding with progress
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
      varying vec2 vUv;

      void main() {
        if (progress <= 0.02) discard;

        // Radial normalized distance from center (0.0 to 1.0)
        float rDist = length(vPosition.xz) / max(0.01, radius * progress);
        // Exponential radial falloff: highest at core, fading naturally to outer boundary
        float radialFactor = exp(-pow(rDist, 2.0) * 3.2);

        // Vertical falloff: strongest near surface, atmospheric decay upward
        float vertNorm = clamp(vPosition.y / max(0.01, height * progress), 0.0, 1.0);
        float vertFactor = pow(1.0 - vertNorm, 1.4);

        // Combined natural gradient intensity
        float intensity = radialFactor * vertFactor;

        // Subtle thermal pulse
        float pulse = 1.0 + sin(time * 3.5 + vPosition.y * 4.0) * 0.08;

        // Multi-tier scientific color transition
        vec3 finalColor = mix(colorOuter, colorMid, smoothstep(0.15, 0.6, intensity));
        finalColor = mix(finalColor, colorCore, smoothstep(0.6, 0.95, intensity));

        float alpha = clamp(intensity * 0.55 * pulse * progress, 0.0, 0.85);

        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const plumeMesh = new THREE.Mesh(plumeGeom, plumeMat);
  group.add(plumeMesh);

  // --- GROUND SURFACE GRADIENT FOOTPRINT DISC ---
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
        // Normalized distance from center (0.0 to 1.0)
        vec2 center = vec2(0.5, 0.5);
        float d = distance(vUv, center) * 2.0;

        // Exponential falloff with zero harsh circular cutoffs
        float falloff = exp(-pow(d, 2.2) * 3.5);
        vec3 col = mix(colorEdge, colorCenter, falloff);
        float alpha = falloff * 0.35 * progress;

        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const groundFootprintMesh = new THREE.Mesh(groundFootprintGeom, groundFootprintMat);
  group.add(groundFootprintMesh);

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

    // Position at exact ground coordinate
    const groundPos = latLonToGlobeVector3(hotspot.latitude, hotspot.longitude, GLOBE_RADIUS * 1.002);
    group.position.copy(groundPos);

    // Align vertical orientation normal to sphere
    const normal = groundPos.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, normal);
    group.setRotationFromQuaternion(quat);

    // Apply semantic palette
    if (riskLevel === 'CRITICAL') {
      plumeMat.uniforms.colorCore.value.setHex(0xffffff);
      plumeMat.uniforms.colorMid.value.setHex(0xef4444);
      plumeMat.uniforms.colorOuter.value.setHex(0xf97316);
      outerBoundaryMat.color.setHex(0xef4444);
      persistenceRingMat.color.setHex(0x38bdf8);
      groundFootprintMat.uniforms.colorCenter.value.setHex(0xef4444);
      groundFootprintMat.uniforms.colorEdge.value.setHex(0xf97316);
    } else if (riskLevel === 'HIGH') {
      plumeMat.uniforms.colorCore.value.setHex(0xffedd5);
      plumeMat.uniforms.colorMid.value.setHex(0xf97316);
      plumeMat.uniforms.colorOuter.value.setHex(0xfbbf24);
      outerBoundaryMat.color.setHex(0xf97316);
      persistenceRingMat.color.setHex(0x38bdf8);
      groundFootprintMat.uniforms.colorCenter.value.setHex(0xf97316);
      groundFootprintMat.uniforms.colorEdge.value.setHex(0xfbbf24);
    } else {
      plumeMat.uniforms.colorCore.value.setHex(0xfef08a);
      plumeMat.uniforms.colorMid.value.setHex(0xeab308);
      plumeMat.uniforms.colorOuter.value.setHex(0x38bdf8);
      outerBoundaryMat.color.setHex(0xeab308);
      persistenceRingMat.color.setHex(0x0284c7);
      groundFootprintMat.uniforms.colorCenter.value.setHex(0xeab308);
      groundFootprintMat.uniforms.colorEdge.value.setHex(0x38bdf8);
    }

    // Begin 6-stage expansion sequence
    expansionProgress = 0.0;
    isExpanding = true;
    group.visible = true;
  };

  const update = (deltaSec: number, timeSec: number) => {
    if (!group.visible || !currentHotspot) return;

    if (isExpanding) {
      // 1.8 to 2.2 seconds smooth progression
      expansionProgress += deltaSec * 0.48;
      if (expansionProgress >= 1.0) {
        expansionProgress = 1.0;
        isExpanding = false;
      }
    }

    // --- State-Driven Animation Logic (States 1 - 6) ---
    // State 1 & 2: Thermal Core Activation (0.0 to 0.3)
    const coreActive = Math.min(1.0, expansionProgress * 3.3);
    const corePulse = 1.0 + Math.sin(timeSec * 7.0) * 0.2;
    coreMesh.scale.setScalar(coreActive * corePulse);

    // Ring 1: Core Ring
    const coreRingPulse = (timeSec * 1.5) % 1.6 + 0.9;
    coreRingMesh.scale.set(coreRingPulse, coreRingPulse, 1);
    coreRingMat.opacity = Math.max(0, 0.85 - (coreRingPulse - 0.9) * 1.2) * coreActive;

    // State 3: Persistence Ring (0.3 to 0.6)
    const persistActive = Math.max(0.0, Math.min(1.0, (expansionProgress - 0.3) * 3.3));
    const persistRadius = innerRadiusKm * KM_TO_GLOBE * persistActive;
    persistenceRingMesh.scale.set(persistRadius, persistRadius, 1);
    persistenceRingMat.opacity = 0.8 * persistActive;

    // State 4 & 5: 3D Volumetric Thermal Plume & Ground Footprint Expansion (0.5 to 1.0)
    const volumeActive = Math.max(0.0, Math.min(1.0, (expansionProgress - 0.5) * 2.0));
    const targetRadius = secondaryRadiusKm * KM_TO_GLOBE;
    const targetHeight = targetRadius * 1.25; // 3D vertical rise from Earth surface

    plumeMat.uniforms.time.value = timeSec;
    plumeMat.uniforms.progress.value = volumeActive;
    plumeMat.uniforms.radius.value = targetRadius;
    plumeMat.uniforms.height.value = targetHeight;

    groundFootprintMat.uniforms.progress.value = volumeActive;
    groundFootprintMat.uniforms.radius.value = targetRadius;
    groundFootprintMesh.scale.set(targetRadius, targetRadius, 1);

    // Ring 3: Outer Risk Boundary Ring (Stabilizes at State 5)
    const outerActive = Math.max(0.0, Math.min(1.0, (expansionProgress - 0.7) * 3.3));
    const boundaryRadius = monitoringRadiusKm * KM_TO_GLOBE * outerActive;
    const boundaryPulse = 1.0 + Math.sin(timeSec * 2.5) * 0.03;
    outerBoundaryMesh.scale.set(boundaryRadius * boundaryPulse, boundaryRadius * boundaryPulse, 1);
    outerBoundaryMat.opacity = 0.7 * outerActive;
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

    if (expansionProgress < 0.18) {
      stage = 'STATE 1: THERMAL SIGNAL';
      stageNumber = 1;
      label = 'THERMAL CORE DETECTED';
    } else if (expansionProgress < 0.38) {
      stage = 'STATE 2: SIGNAL VALIDATED';
      stageNumber = 2;
      label = 'SIGNAL RADIANCE VALIDATED';
    } else if (expansionProgress < 0.58) {
      stage = 'STATE 3: PERSISTENCE CONFIRMED';
      stageNumber = 3;
      label = 'TEMPORAL PERSISTENCE CONFIRMED';
    } else if (expansionProgress < 0.82) {
      stage = 'STATE 4: AI RISK MODEL';
      stageNumber = 4;
      label = '3D VOLUMETRIC RISK FIELD EXPANDING';
    } else if (expansionProgress < 0.98) {
      stage = 'STATE 5: RISK FIELD STABILIZED';
      stageNumber = 5;
      label = 'AI THERMAL RISK FIELD STABILIZED';
    } else {
      stage = 'STATE 6: INCIDENT ASSESSED';
      stageNumber = 6;
      label = 'INCIDENT RISK ASSESSMENT COMPLETE';
    }

    return {
      stage,
      stageNumber,
      label,
      progress: expansionProgress,
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
      coreGeom.dispose();
      coreMat.dispose();
      coreRingGeom.dispose();
      coreRingMat.dispose();
      persistenceRingGeom.dispose();
      persistenceRingMat.dispose();
      outerBoundaryGeom.dispose();
      outerBoundaryMat.dispose();
      plumeGeom.dispose();
      plumeMat.dispose();
      groundFootprintGeom.dispose();
      groundFootprintMat.dispose();
    },
  };
}
