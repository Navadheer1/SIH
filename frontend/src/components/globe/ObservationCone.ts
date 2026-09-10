import * as THREE from 'three';
import { OrbitState } from './SatelliteOrbit';

export interface ObservationConeSystem {
  group: THREE.Group;
  coneMesh: THREE.Mesh;
  footprintMesh: THREE.Mesh;
  scanRingMesh: THREE.Mesh;
  setTargetGroundPos: (pos: THREE.Vector3 | null) => void;
  update: (orbitState: OrbitState, timeSec: number) => void;
  dispose: () => void;
}

export function createObservationCone(): ObservationConeSystem {
  const group = new THREE.Group();
  group.name = 'observation-swath-system';

  let targetedGroundPos: THREE.Vector3 | null = null;

  // 1. Observation Cone Geometry (Apex at Satellite, Base at Earth Surface)
  const coneHeight = 2.6;
  const swathBaseRadius = 3.6;

  const coneGeom = new THREE.ConeGeometry(swathBaseRadius, coneHeight, 32, 1, true);
  // Shift origin to apex of cone so rotation and scaling happen from satellite aperture
  coneGeom.translate(0, -coneHeight / 2, 0);

  const coneMat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      baseColor: { value: new THREE.Color(0x06b6d4) }, // Cyan remote-sensing glow
      activeColor: { value: new THREE.Color(0x10b981) }, // Emerald active scan
      isActive: { value: 0.0 },
    },
    vertexShader: `
      varying vec3 vPosition;
      varying vec2 vUv;
      void main() {
        vPosition = position;
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 baseColor;
      uniform vec3 activeColor;
      uniform float isActive;

      varying vec3 vPosition;
      varying vec2 vUv;

      void main() {
        float vertFade = smoothstep(0.0, -2.6, vPosition.y);
        float pulse = sin((vPosition.y * 8.0) + (time * 4.0)) * 0.5 + 0.5;

        vec3 color = mix(baseColor, activeColor, isActive);
        float alpha = (vertFade * 0.18 + (pulse * 0.08 * isActive)) * (0.35 + isActive * 0.65);

        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const coneMesh = new THREE.Mesh(coneGeom, coneMat);
  group.add(coneMesh);

  // 2. Swath Footprint Circle on Earth Surface
  const footprintGeom = new THREE.RingGeometry(swathBaseRadius * 0.85, swathBaseRadius, 32);
  const footprintMat = new THREE.MeshBasicMaterial({
    color: 0x06b6d4,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const footprintMesh = new THREE.Mesh(footprintGeom, footprintMat);
  group.add(footprintMesh);

  // 3. Dynamic Center Scan Radar Ring
  const scanRingGeom = new THREE.RingGeometry(0.2, 0.4, 32);
  const scanRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const scanRingMesh = new THREE.Mesh(scanRingGeom, scanRingMat);
  group.add(scanRingMesh);

  const setTargetGroundPos = (pos: THREE.Vector3 | null) => {
    targetedGroundPos = pos;
  };

  const update = (orbitState: OrbitState, timeSec: number) => {
    const isTargeted = targetedGroundPos !== null;
    const isPass = orbitState.isOverIndia || isTargeted;

    coneMat.uniforms.time.value = timeSec;
    coneMat.uniforms.isActive.value = isPass ? 1.0 : 0.2;

    const satPos = orbitState.orbitPosition;
    const groundPos = targetedGroundPos || orbitState.subSatellitePoint;

    // Position cone apex at satellite
    coneMesh.position.copy(satPos);

    // Orient cone along vector from satellite to ground target
    const dir = new THREE.Vector3().subVectors(groundPos, satPos).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up.clone().negate(), dir);
    coneMesh.setRotationFromQuaternion(quat);

    // Scale length to actual distance
    const distance = satPos.distanceTo(groundPos);
    coneMesh.scale.set(1, distance / coneHeight, 1);

    // Position footprint ring on ground surface (Only for general swath pass; hide when locked to an incident to avoid ring clutter)
    if (isTargeted) {
      footprintMesh.visible = false;
      scanRingMesh.visible = false;
    } else {
      footprintMesh.visible = true;
      scanRingMesh.visible = true;
      footprintMesh.position.copy(groundPos);
      footprintMesh.lookAt(new THREE.Vector3(0, 0, 0));
      footprintMat.color.setHex(isPass ? 0x10b981 : 0x06b6d4);
      footprintMat.opacity = isPass ? 0.35 : 0.15;

      const scanPulse = ((timeSec * 0.8) % 1.0) * swathBaseRadius;
      scanRingMesh.position.copy(groundPos);
      scanRingMesh.lookAt(new THREE.Vector3(0, 0, 0));
      scanRingMesh.scale.set(scanPulse, scanPulse, 1);
      scanRingMat.opacity = (1.0 - scanPulse / swathBaseRadius) * 0.4;
    }
  };

  return {
    group,
    coneMesh,
    footprintMesh,
    scanRingMesh,
    setTargetGroundPos,
    update,
    dispose: () => {
      coneGeom.dispose();
      coneMat.dispose();
      footprintGeom.dispose();
      footprintMat.dispose();
      scanRingGeom.dispose();
      scanRingMat.dispose();
    },
  };
}
