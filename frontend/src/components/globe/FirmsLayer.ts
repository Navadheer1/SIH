import * as THREE from 'three';
import { Hotspot } from '../../types/hotspot';
import { GLOBE_RADIUS, latLonToGlobeVector3 } from './EarthGlobe';

export interface FirmsLayerSystem {
  group: THREE.Group;
  interactiveMeshes: THREE.Mesh[];
  setHotspots: (hotspots: Hotspot[], selectedId: string | null) => void;
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
    pulseRing: THREE.Mesh;
    baseScale: number;
    isSelected: boolean;
  }[] = [];

  const markerGeometry = new THREE.SphereGeometry(0.12, 12, 12);
  const hitGeometry = new THREE.SphereGeometry(0.35, 8, 8);
  const ringGeometry = new THREE.RingGeometry(0.15, 0.28, 24);

  const clear = () => {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
    }
    interactiveMeshes = [];
    animatedMarkers = [];
  };

  const setHotspots = (hotspots: Hotspot[], selectedId: string | null) => {
    clear();

    hotspots.forEach((h) => {
      const isSelected = h.observation_id === selectedId;
      const pos = latLonToGlobeVector3(h.latitude, h.longitude, GLOBE_RADIUS * 1.004);
      const color = getHotspotColor(h);

      // Radiometric scaling factor based on FRP
      const frpVal = Math.max(5, Math.min(250, h.frp || 20));
      const scaleFactor = 0.7 + (Math.log1p(frpVal) / 5.5) * 1.2;

      // 1. Core Thermal Marker Mesh
      const markerMat = new THREE.MeshBasicMaterial({
        color: isSelected ? 0xffffff : color,
      });
      const markerMesh = new THREE.Mesh(markerGeometry, markerMat);
      markerMesh.position.copy(pos);
      markerMesh.scale.setScalar(scaleFactor);
      group.add(markerMesh);

      // 2. Pulsing Ground Ring
      const ringMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: isSelected ? 0.9 : 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const ringMesh = new THREE.Mesh(ringGeometry, ringMat);
      ringMesh.position.copy(pos);
      ringMesh.lookAt(new THREE.Vector3(0, 0, 0)); // Align flush to sphere surface
      group.add(ringMesh);

      // 3. Invisible Hit Target for Raycasting
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeometry, hitMat);
      hitMesh.position.copy(pos);
      hitMesh.userData = { hotspot: h };
      group.add(hitMesh);
      interactiveMeshes.push(hitMesh);

      animatedMarkers.push({
        mesh: markerMesh,
        pulseRing: ringMesh,
        baseScale: scaleFactor,
        isSelected,
      });
    });
  };

  const update = (timeSec: number) => {
    animatedMarkers.forEach((item, idx) => {
      // Staggered pulsation based on index
      const phase = (timeSec * 3.0) + (idx * 0.4);
      const pulse = Math.sin(phase) * 0.2 + 1.0;

      if (item.isSelected) {
        item.mesh.scale.setScalar(item.baseScale * (1.2 + Math.sin(timeSec * 6) * 0.25));
        const ringScale = (timeSec * 2.0) % 2.5 + 1.0;
        item.pulseRing.scale.set(ringScale, ringScale, 1);
        (item.pulseRing.material as THREE.MeshBasicMaterial).opacity = 1.0 - (ringScale / 3.5);
      } else {
        item.mesh.scale.setScalar(item.baseScale * pulse);
        const ringScale = (timeSec * 1.2 + idx * 0.3) % 2.0 + 0.8;
        item.pulseRing.scale.set(ringScale, ringScale, 1);
        (item.pulseRing.material as THREE.MeshBasicMaterial).opacity = (1.0 - (ringScale / 2.8)) * 0.6;
      }
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
      ringGeometry.dispose();
    },
  };
}
