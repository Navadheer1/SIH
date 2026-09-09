import * as THREE from 'three';
import { Hotspot } from '../../types/hotspot';
import { GLOBE_RADIUS, latLonToGlobeVector3 } from './EarthGlobe';

export interface FirmsLayerSystem {
  group: THREE.Group;
  interactiveMeshes: THREE.Mesh[];
  setHotspots: (
    hotspots: Hotspot[],
    selectedId: string | null,
    viewMode?: 'risk_field' | 'heatmap'
  ) => void;
  update: (timeSec: number) => void;
  dispose: () => void;
}

export function getHotspotColor(hotspot: Hotspot): THREE.Color {
  const frp = hotspot.frp || 0;
  if (frp >= 70) return new THREE.Color(0xef4444); // Critical Red
  if (frp >= 35) return new THREE.Color(0xf97316); // High Orange
  if (frp >= 15) return new THREE.Color(0xeab308); // Moderate Amber
  return new THREE.Color(0x06b6d4); // Low Cyan
}

export function createFirmsLayer(): FirmsLayerSystem {
  const group = new THREE.Group();
  group.name = 'firms-observations-layer';

  let interactiveMeshes: THREE.Mesh[] = [];
  let animatedMarkers: {
    mesh: THREE.Mesh;
    baseScale: number;
    isSelected: boolean;
  }[] = [];
  let densityMeshes: THREE.Mesh[] = [];

  // Tiny subtle sphere geometry for inactive FIRMS points (Requirement 2 & 15)
  const markerGeometry = new THREE.SphereGeometry(0.045, 8, 8);
  const hitGeometry = new THREE.SphereGeometry(0.35, 8, 8);
  const densityGeometry = new THREE.CircleGeometry(0.8, 32);

  const clear = () => {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
    }
    interactiveMeshes = [];
    animatedMarkers = [];
    densityMeshes = [];
  };

  const setHotspots = (
    hotspots: Hotspot[],
    selectedId: string | null,
    viewMode: 'risk_field' | 'heatmap' = 'risk_field'
  ) => {
    clear();

    const hasSelection = selectedId !== null;

    hotspots.forEach((h) => {
      const isSelected = h.observation_id === selectedId;
      const pos = latLonToGlobeVector3(h.latitude, h.longitude, GLOBE_RADIUS * 1.003);

      // Inactive FIRMS observations: Tiny cyan points (Requirement 2).
      // Dim all unrelated hotspots when an incident is selected (Requirement 16).
      const baseColor = new THREE.Color(0x06b6d4); // Clean observation cyan
      let opacity = 0.65;

      if (hasSelection) {
        if (isSelected) {
          // ThermalRiskField handles the selected thermal core & pin; keep invisible here to avoid duplicate
          opacity = 0.0;
        } else {
          // Dim unrelated hotspots (Requirement 16)
          opacity = 0.22;
        }
      }

      // 1. Precise, Tiny Radiometric Point Observation (No circle clutter)
      const markerMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: opacity,
        depthWrite: false,
      });
      const markerMesh = new THREE.Mesh(markerGeometry, markerMat);
      markerMesh.position.copy(pos);
      group.add(markerMesh);

      // 2. Invisible Hit Target for Raycasting
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeometry, hitMat);
      hitMesh.position.copy(pos);
      hitMesh.userData = { hotspot: h };
      group.add(hitMesh);
      interactiveMeshes.push(hitMesh);

      // 3. Thermal Field Mode: Aggregated Soft Density Footprint
      if (viewMode === 'heatmap') {
        const color = getHotspotColor(h);
        const frpVal = Math.max(5, Math.min(250, h.frp || 20));
        const densityRadius = 0.4 + (Math.log1p(frpVal) / 4.5) * 0.6;
        const densityMat = new THREE.MeshBasicMaterial({
          color: color,
          transparent: true,
          opacity: 0.24,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const dMesh = new THREE.Mesh(densityGeometry, densityMat);
        dMesh.position.copy(pos);
        dMesh.scale.set(densityRadius, densityRadius, 1);
        dMesh.lookAt(new THREE.Vector3(0, 0, 0));
        group.add(dMesh);
        densityMeshes.push(dMesh);
      }

      animatedMarkers.push({
        mesh: markerMesh,
        baseScale: 1.0,
        isSelected,
      });
    });
  };

  const update = (timeSec: number) => {
    densityMeshes.forEach((dMesh, idx) => {
      // Gentle thermal heat distortion pulse in heatmap mode
      const dPulse = 1.0 + Math.sin(timeSec * 2.0 + idx) * 0.05;
      dMesh.scale.set(dPulse, dPulse, 1);
    });
  };

  return {
    group,
    get interactiveMeshes() {
      return interactiveMeshes;
    },
    setHotspots,
    update,
    dispose: () => {
      clear();
      markerGeometry.dispose();
      hitGeometry.dispose();
      densityGeometry.dispose();
    },
  };
}
