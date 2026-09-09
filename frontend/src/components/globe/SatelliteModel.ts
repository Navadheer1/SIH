import * as THREE from 'three';
import { OrbitState } from './SatelliteOrbit';

export interface SatelliteModelSystem {
  group: THREE.Group;
  update: (orbitState: OrbitState) => void;
  dispose: () => void;
}

export function createSatelliteModel(): SatelliteModelSystem {
  const group = new THREE.Group();
  group.name = 'noaa21-satellite-model';

  // 1. Satellite Bus (Main Equipment Enclosure)
  const busGeom = new THREE.BoxGeometry(0.35, 0.45, 0.7);
  const mliGoldMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37, // Multi-layer insulation gold foil
    metalness: 0.85,
    roughness: 0.25,
    emissive: 0x553300,
    emissiveIntensity: 0.2,
  });
  const busMesh = new THREE.Mesh(busGeom, mliGoldMat);
  group.add(busMesh);

  // 2. Solar Array Boom and Wings
  const solarWingGeom = new THREE.BoxGeometry(1.6, 0.02, 0.45);
  const solarPanelMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a, // Deep blue-black photovoltaic silicon
    metalness: 0.7,
    roughness: 0.15,
    emissive: 0x0284c7,
    emissiveIntensity: 0.15,
  });
  const solarWingMesh = new THREE.Mesh(solarWingGeom, solarPanelMat);
  solarWingMesh.position.set(0.9, 0, 0); // Extended solar wing
  group.add(solarWingMesh);

  // Solar Wing Strut
  const strutGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8);
  const strutMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.1 });
  const strutMesh = new THREE.Mesh(strutGeom, strutMat);
  strutMesh.rotation.z = Math.PI / 2;
  strutMesh.position.set(0.2, 0, 0);
  group.add(strutMesh);

  // 3. VIIRS Nadir Optical Sensor Barrel
  const sensorGeom = new THREE.CylinderGeometry(0.12, 0.15, 0.25, 16);
  const sensorMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.9,
    roughness: 0.3,
  });
  const sensorMesh = new THREE.Mesh(sensorGeom, sensorMat);
  sensorMesh.position.set(0, -0.28, 0); // Pointing Nadir (-Y)
  group.add(sensorMesh);

  // Sensor Optical Aperture Lens
  const lensGeom = new THREE.CircleGeometry(0.1, 16);
  const lensMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.85,
  });
  const lensMesh = new THREE.Mesh(lensGeom, lensMat);
  lensMesh.rotation.x = Math.PI / 2;
  lensMesh.position.set(0, -0.41, 0);
  group.add(lensMesh);

  // 4. Parabolic Communication Antenna Dish
  const dishGeom = new THREE.SphereGeometry(0.18, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.4);
  const dishMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    side: THREE.DoubleSide,
    metalness: 0.8,
    roughness: 0.2,
  });
  const dishMesh = new THREE.Mesh(dishGeom, dishMat);
  dishMesh.rotation.x = -Math.PI / 2;
  dishMesh.position.set(0, 0.26, -0.35);
  group.add(dishMesh);

  // 5. Subtle Satellite Halo Indicator
  const beaconGeom = new THREE.SphereGeometry(0.04, 8, 8);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
  const beaconMesh = new THREE.Mesh(beaconGeom, beaconMat);
  beaconMesh.position.set(0, 0.24, 0.35);
  group.add(beaconMesh);

  const update = (orbitState: OrbitState) => {
    // 1. Position satellite at orbital coordinates
    group.position.copy(orbitState.orbitPosition);

    // 2. Orient Nadir towards Earth Center (0, 0, 0)
    const nadirDirection = new THREE.Vector3().subVectors(new THREE.Vector3(0, 0, 0), orbitState.orbitPosition).normalize();
    const velocity = orbitState.velocityTangent.clone().normalize();
    const wingAxis = new THREE.Vector3().crossVectors(nadirDirection, velocity).normalize();

    // Reconstruct rotation matrix: X = wing, Y = -nadir, Z = velocity
    const rotMatrix = new THREE.Matrix4().makeBasis(wingAxis, nadirDirection.negate(), velocity);
    group.rotation.setFromRotationMatrix(rotMatrix);
  };

  return {
    group,
    update,
    dispose: () => {
      busGeom.dispose();
      mliGoldMat.dispose();
      solarWingGeom.dispose();
      solarPanelMat.dispose();
      sensorGeom.dispose();
      sensorMat.dispose();
      lensGeom.dispose();
      lensMat.dispose();
      dishGeom.dispose();
      dishMat.dispose();
    },
  };
}
