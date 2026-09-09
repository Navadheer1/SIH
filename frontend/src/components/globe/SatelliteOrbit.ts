import * as THREE from 'three';
import { GLOBE_RADIUS, latLonToGlobeVector3 } from './EarthGlobe';

export const SATELLITE_ORBIT_RADIUS = GLOBE_RADIUS * 1.13; // 824 km altitude scale
export const SATELLITE_INCLINATION_RAD = THREE.MathUtils.degToRad(98.71); // Sun-synchronous polar orbit

export interface OrbitState {
  orbitPosition: THREE.Vector3;
  subSatellitePoint: THREE.Vector3;
  velocityTangent: THREE.Vector3;
  latitude: number;
  longitude: number;
  altitudeKm: number;
  isOverIndia: boolean;
}

export interface SatelliteOrbitSystem {
  group: THREE.Group;
  orbitLine: THREE.Line;
  groundTrackLine: THREE.Line;
  calculateState: (phase: number) => OrbitState;
  dispose: () => void;
}

/**
 * Calculates deterministic orbital coordinates given orbit progress phase (0.0 to 1.0).
 */
export function getOrbitCoordinates(phase: number, orbitRadius = SATELLITE_ORBIT_RADIUS): {
  position: THREE.Vector3;
  groundPosition: THREE.Vector3;
  latitude: number;
  longitude: number;
} {
  const meanAnomaly = phase * 2.0 * Math.PI;

  // Incline orbit along Z/Y axes
  const latRad = Math.asin(Math.sin(SATELLITE_INCLINATION_RAD) * Math.sin(meanAnomaly));
  const latitude = THREE.MathUtils.radToDeg(latRad);

  const inPlaneLonRad = Math.atan2(
    Math.cos(SATELLITE_INCLINATION_RAD) * Math.sin(meanAnomaly),
    Math.cos(meanAnomaly)
  );

  // Earth rotation progression
  const earthRotDeg = (phase * 360.0 * 0.25) % 360.0; // Simulated rotation rate
  let lonDeg = (THREE.MathUtils.radToDeg(inPlaneLonRad) - earthRotDeg + 78.96) % 360.0; // Anchored over India sector
  if (lonDeg > 180) lonDeg -= 360;
  if (lonDeg < -180) lonDeg += 360;

  const position = latLonToGlobeVector3(latitude, lonDeg, orbitRadius);
  const groundPosition = latLonToGlobeVector3(latitude, lonDeg, GLOBE_RADIUS * 1.003);

  return { position, groundPosition, latitude, longitude: lonDeg };
}

export function createSatelliteOrbitSystem(): SatelliteOrbitSystem {
  const group = new THREE.Group();
  group.name = 'satellite-orbit-system';

  // 1. Orbital Path Line in space
  const orbitPoints: THREE.Vector3[] = [];
  const groundTrackPoints: THREE.Vector3[] = [];
  const segments = 128;

  for (let i = 0; i <= segments; i++) {
    const p = i / segments;
    const coords = getOrbitCoordinates(p);
    orbitPoints.push(coords.position);
    groundTrackPoints.push(coords.groundPosition);
  }

  const orbitGeom = new THREE.BufferGeometry().setFromPoints(orbitPoints);
  const orbitMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.35,
  });
  const orbitLine = new THREE.Line(orbitGeom, orbitMat);
  group.add(orbitLine);

  // 2. Projected Ground Track on Earth Surface
  const groundTrackGeom = new THREE.BufferGeometry().setFromPoints(groundTrackPoints);
  const groundTrackMat = new THREE.LineDashedMaterial({
    color: 0x0284c7,
    dashSize: 0.6,
    gapSize: 0.3,
    transparent: true,
    opacity: 0.45,
  });
  const groundTrackLine = new THREE.Line(groundTrackGeom, groundTrackMat);
  groundTrackLine.computeLineDistances();
  group.add(groundTrackLine);

  const calculateState = (phase: number): OrbitState => {
    const { position, groundPosition, latitude, longitude } = getOrbitCoordinates(phase);

    // Tangent velocity vector calculation
    const deltaPhase = 0.002;
    const nextCoords = getOrbitCoordinates((phase + deltaPhase) % 1.0);
    const velocityTangent = new THREE.Vector3().subVectors(nextCoords.position, position).normalize();

    // Check India observation bounds (8N-37N, 68E-98E)
    const isOverIndia =
      latitude >= 6.0 && latitude <= 38.0 &&
      longitude >= 66.0 && longitude <= 99.0;

    return {
      orbitPosition: position,
      subSatellitePoint: groundPosition,
      velocityTangent,
      latitude,
      longitude,
      altitudeKm: 824,
      isOverIndia,
    };
  };

  return {
    group,
    orbitLine,
    groundTrackLine,
    calculateState,
    dispose: () => {
      orbitGeom.dispose();
      orbitMat.dispose();
      groundTrackGeom.dispose();
      groundTrackMat.dispose();
    },
  };
}
