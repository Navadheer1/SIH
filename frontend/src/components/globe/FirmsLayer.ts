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

  const markerGeometry = new THREE.SphereGeometry(0.09, 12, 12);
  const hitGeometry = new THREE.SphereGeometry(0.35, 8, 8);
  const densityGeometry = new THREE.CircleGeometry(1.0, 32);

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

    hotspots.forEach((h) => {
      const isSelected = h.observation_id === selectedId;
      const pos = latLonToGlobeVector3(h.latitude, h.longitude, GLOBE_RADIUS * 1.004);
      const color = getHotspotColor(h);

      // Radiometric scaling factor based on FRP
      const frpVal = Math.max(5, Math.min(250, h.frp || 20));
      const scaleFactor = 0.75 + (Math.log1p(frpVal) / 5.5) * 0.9;

      // 1. Precise Radiometric Point Observation (Small, clean, no circle clutter)
      const markerMat = new THREE.MeshBasicMaterial({
        color: isSelected ? 0xffffff : color,
        transparent: true,
        opacity: isSelected ? 1.0 : 0.75,
      });
      const markerMesh = new THREE.Mesh(markerGeometry, markerMat);
      markerMesh.position.copy(pos);
      markerMesh.scale.setScalar(isSelected ? scaleFactor * 1.5 : scaleFactor);
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
        const densityRadius = 0.5 + (Math.log1p(frpVal) / 4.0) * 0.8;
        const densityMat = new THREE.MeshBasicMaterial({
          color: color,
          transparent: true,
          opacity: 0.28,
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
        baseScale: scaleFactor,
        isSelected,
      });
    });
  };

  const update = (timeSec: number) => {
    animatedMarkers.forEach((item) => {
      if (item.isSelected) {
        // High-intensity radiant pulsation on selected core
        const pulse = 1.2 + Math.sin(timeSec * 7.0) * 0.25;
        item.mesh.scale.setScalar(item.baseScale * pulse);
      }
    });

    densityMeshes.forEach((dMesh, idx) => {
      // Gentle thermal heat distortion pulse in heatmap mode
      const dPulse = 1.0 + Math.sin(timeSec * 2.0 + idx) * 0.06;
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
