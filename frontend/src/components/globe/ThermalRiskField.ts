import * as THREE from 'three';
import { Hotspot, ThreatZonesResponse } from '../../types/hotspot';
import { GLOBE_RADIUS, latLonToGlobeVector3 } from './EarthGlobe';

export interface ThermalRiskFieldSystem {
  group: THREE.Group;
  setActiveTarget: (
    hotspot: Hotspot | null,
    threatZones: ThreatZonesResponse | null,
    riskScore?: number,
    classification?: string
  ) => void;
  update: (deltaSec: number, timeSec: number) => void;
  getExpansionPhase: () => {
    phase: 'T0' | 'T1' | 'T2' | 'T3' | 'T4';
    label: string;
    progress: number;
  };
  dispose: () => void;
}

export function createThermalRiskField(): ThermalRiskFieldSystem {
  const group = new THREE.Group();
  group.name = 'thermal-risk-field-system';

  let currentHotspot: Hotspot | null = null;
  let expansionProgress = 0.0; // 0.0 (T0) to 1.0 (T4)
  let isExpanding = false;

  // Scale factor: Earth radius 20 units -> 1 km visual scale ~ 0.28 units on globe
  const KM_TO_GLOBE = 0.28;

  // Radii in km from backend calculation
  let innerRadiusKm = 1.2;
  let secondaryRadiusKm = 2.8;
  let monitoringRadiusKm = 5.2;
  let riskLevel = 'HIGH';

  // --- LAYER 1: Thermal Core (Small intense volumetric core) ---
  const coreGeom = new THREE.SphereGeometry(0.18, 16, 16);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
  });
  const coreMesh = new THREE.Mesh(coreGeom, coreMat);
  group.add(coreMesh);

  // --- LAYER 2: Inner Tactical Zone (Volumetric 3D Hemisphere) ---
  const innerDomeGeom = new THREE.SphereGeometry(1.0, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const innerMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    transparent: true,
    opacity: 0.35,
    roughness: 0.2,
    metalness: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const innerDomeMesh = new THREE.Mesh(innerDomeGeom, innerMat);
  group.add(innerDomeMesh);

  // --- LAYER 3: Risk Gradient Volume (Secondary Impact Dome) ---
  const secondaryDomeGeom = new THREE.SphereGeometry(1.0, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const secondaryMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const secondaryDomeMesh = new THREE.Mesh(secondaryDomeGeom, secondaryMat);
  group.add(secondaryDomeMesh);

  // --- LAYER 4: Outer Perimeter Monitoring Boundary Ring ---
  const boundaryGeom = new THREE.RingGeometry(0.96, 1.0, 48);
  const boundaryMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const boundaryMesh = new THREE.Mesh(boundaryGeom, boundaryMat);
  group.add(boundaryMesh);

  // --- LAYER 5: Ground Surface Projection Disc ---
  const groundDiscGeom = new THREE.CircleGeometry(1.0, 32);
  const groundDiscMat = new THREE.MeshBasicMaterial({
    color: 0xef4444,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const groundDiscMesh = new THREE.Mesh(groundDiscGeom, groundDiscMat);
  group.add(groundDiscMesh);

  // Set initial invisible state
  group.visible = false;

  const setActiveTarget = (
    hotspot: Hotspot | null,
    threatZones: ThreatZonesResponse | null,
    riskScore = 75,
    classification = 'INDUSTRIAL_FIRE'
  ) => {
    currentHotspot = hotspot;
    if (!hotspot) {
      group.visible = false;
      return;
    }

    // Extract or calculate data-driven radii
    if (threatZones?.zones) {
      innerRadiusKm = threatZones.zones.inner_zone.radius_km;
      secondaryRadiusKm = threatZones.zones.secondary_zone.radius_km;
      monitoringRadiusKm = threatZones.zones.monitoring_zone.radius_km;
    } else {
      // Data-driven fallback formula directly mirroring backend threat_zone_service
      const frpVal = hotspot.frp || 25.0;
      const frpFactor = Math.log1p(Math.max(0, frpVal)) / 3.0;
      const riskFactor = (Math.max(0, Math.min(100, riskScore)) / 100.0) * 0.8;
      const classMult = classification.toUpperCase().includes('INDUSTRIAL') ? 1.25 : 1.0;
      const multiplier = (1.0 + frpFactor + riskFactor) * classMult;

      innerRadiusKm = Math.max(0.5, Math.min(2.5, +(0.8 * multiplier).toFixed(2)));
      secondaryRadiusKm = Math.max(1.5, Math.min(5.0, +(2.5 * multiplier).toFixed(2)));
      monitoringRadiusKm = Math.max(3.0, Math.min(8.0, +(4.5 * multiplier).toFixed(2)));
    }

    riskLevel =
      riskScore >= 75 ? 'CRITICAL' : riskScore >= 50 ? 'HIGH' : riskScore >= 25 ? 'MEDIUM' : 'LOW';

    // Position group at exact ground coordinate
    const groundPos = latLonToGlobeVector3(hotspot.latitude, hotspot.longitude, GLOBE_RADIUS * 1.002);
    group.position.copy(groundPos);

    // Orient domes and rings to point along the sphere normal (away from Earth origin)
    const normal = groundPos.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, normal);
    group.setRotationFromQuaternion(quat);

    // Apply semantic color tuning based on risk
    if (riskLevel === 'CRITICAL') {
      innerMat.color.setHex(0xef4444); // Red
      secondaryMat.color.setHex(0xf97316); // Orange
      boundaryMat.color.setHex(0xf87171);
      groundDiscMat.color.setHex(0xef4444);
    } else if (riskLevel === 'HIGH') {
      innerMat.color.setHex(0xf97316); // Orange
      secondaryMat.color.setHex(0xfbbf24); // Amber
      boundaryMat.color.setHex(0xfdba74);
      groundDiscMat.color.setHex(0xf97316);
    } else {
      innerMat.color.setHex(0xeab308); // Yellow
      secondaryMat.color.setHex(0x38bdf8); // Sky
      boundaryMat.color.setHex(0x0284c7);
      groundDiscMat.color.setHex(0xeab308);
    }

    // Trigger expansion sequence from T0
    expansionProgress = 0.0;
    isExpanding = true;
    group.visible = true;
  };

  const update = (deltaSec: number, timeSec: number) => {
    if (!group.visible || !currentHotspot) return;

    if (isExpanding) {
      // Progress from 0 to 1 over ~2.8 seconds for scientific comprehension
      expansionProgress += deltaSec * 0.38;
      if (expansionProgress >= 1.0) {
        expansionProgress = 1.0;
        isExpanding = false;
      }
    }

    // --- Dynamic Multi-Tier Expansion Math ---
    // T0 -> T1: Core activates and pulses
    const coreScale = Math.min(1.0, expansionProgress * 3.0);
    const corePulse = 1.0 + Math.sin(timeSec * 6.0) * 0.25;
    coreMesh.scale.setScalar(coreScale * corePulse);

    // T1 -> T2: Inner tactical dome expands
    const innerProgress = Math.max(0.0, Math.min(1.0, (expansionProgress - 0.2) * 2.0));
    const innerRadius = innerRadiusKm * KM_TO_GLOBE * innerProgress;
    innerDomeMesh.scale.set(innerRadius, innerRadius, innerRadius);
    innerMat.opacity = 0.35 * innerProgress;

    // T2 -> T3: Secondary risk gradient volume expands
    const secondaryProgress = Math.max(0.0, Math.min(1.0, (expansionProgress - 0.45) * 2.2));
    const secondaryRadius = secondaryRadiusKm * KM_TO_GLOBE * secondaryProgress;
    secondaryDomeMesh.scale.set(secondaryRadius, secondaryRadius, secondaryRadius);
    secondaryMat.opacity = 0.22 * secondaryProgress;

    // T3 -> T4: Outer monitoring perimeter stabilizes & pulses
    const outerProgress = Math.max(0.0, Math.min(1.0, (expansionProgress - 0.65) * 2.8));
    const boundaryRadius = monitoringRadiusKm * KM_TO_GLOBE * outerProgress;
    const boundaryPulse = 1.0 + Math.sin(timeSec * 3.0) * 0.04;
    boundaryMesh.scale.set(boundaryRadius * boundaryPulse, boundaryRadius * boundaryPulse, 1);
    boundaryMat.opacity = 0.75 * outerProgress;

    // Ground projection disc
    groundDiscMesh.scale.set(secondaryRadius, secondaryRadius, 1);
    groundDiscMat.opacity = 0.18 * secondaryProgress;
  };

  const getExpansionPhase = (): {
    phase: 'T0' | 'T1' | 'T2' | 'T3' | 'T4';
    label: string;
    progress: number;
  } => {
    if (expansionProgress < 0.2) {
      return { phase: 'T0', label: 'THERMAL SIGNAL DETECTED', progress: expansionProgress / 0.2 };
    }
    if (expansionProgress < 0.45) {
      return { phase: 'T1', label: 'CORE INTENSITY ACQUIRED', progress: (expansionProgress - 0.2) / 0.25 };
    }
    if (expansionProgress < 0.65) {
      return { phase: 'T2', label: 'PERSISTENCE & RADII COMPUTED', progress: (expansionProgress - 0.45) / 0.2 };
    }
    if (expansionProgress < 0.95) {
      return { phase: 'T3', label: '3D RISK PROPAGATION EXPANDING', progress: (expansionProgress - 0.65) / 0.3 };
    }
    return { phase: 'T4', label: 'STABILIZED THERMAL RISK ZONE', progress: 1.0 };
  };

  return {
    group,
    setActiveTarget,
    update,
    getExpansionPhase,
    dispose: () => {
      coreGeom.dispose();
      coreMat.dispose();
      innerDomeGeom.dispose();
      innerMat.dispose();
      secondaryDomeGeom.dispose();
      secondaryMat.dispose();
      boundaryGeom.dispose();
      boundaryMat.dispose();
      groundDiscGeom.dispose();
      groundDiscMat.dispose();
    },
  };
}
