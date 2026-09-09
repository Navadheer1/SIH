import * as THREE from 'three';
import { PersistentCluster } from '../../types/hotspot';
import { GLOBE_RADIUS, latLonToGlobeVector3 } from './EarthGlobe';

export interface PersistenceFieldSystem {
  group: THREE.Group;
  setClusters: (clusters: PersistentCluster[], selectedId: string | null) => void;
  update: (timeSec: number) => void;
  dispose: () => void;
}

export function createPersistenceField(): PersistenceFieldSystem {
  const group = new THREE.Group();
  group.name = 'persistence-clusters-field';

  let animatedRings: {
    ringMesh: THREE.Mesh;
    historicalMarkers: THREE.Mesh[];
    baseRadius: number;
    isSelected: boolean;
  }[] = [];

  const clear = () => {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
    }
    animatedRings = [];
  };

  const setClusters = (clusters: PersistentCluster[], selectedId: string | null) => {
    clear();

    clusters.forEach((cluster) => {
      const isSelected = cluster.cluster_id === selectedId;
      const centerPos = latLonToGlobeVector3(
        cluster.center_latitude,
        cluster.center_longitude,
        GLOBE_RADIUS * 1.005
      );

      // Persistence score (0 - 100) scales the concentric orbit rings
      const persistenceScore = cluster.persistence_score || 50;
      const obsCount = Math.max(1, cluster.observation_count || 1);
      const ringRadius = 0.4 + (persistenceScore / 100) * 0.6;

      // 1. Concentric Temporal Persistence Ring
      const ringGeom = new THREE.RingGeometry(ringRadius * 0.9, ringRadius, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: isSelected ? 0x38bdf8 : 0x0284c7, // Scientific telemetry cyan
        transparent: true,
        opacity: isSelected ? 0.9 : 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.position.copy(centerPos);
      ringMesh.lookAt(new THREE.Vector3(0, 0, 0));
      group.add(ringMesh);

      // 2. Secondary Historical Orbit Pass Ring for High Persistence
      if (obsCount >= 3) {
        const outerRingGeom = new THREE.RingGeometry(ringRadius * 1.35, ringRadius * 1.42, 32);
        const outerRingMat = new THREE.MeshBasicMaterial({
          color: 0x60a5fa,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const outerRingMesh = new THREE.Mesh(outerRingGeom, outerRingMat);
        outerRingMesh.position.copy(centerPos);
        outerRingMesh.lookAt(new THREE.Vector3(0, 0, 0));
        group.add(outerRingMesh);
      }

      // 3. Historical Detection Orbit Satellite Pass Nodes (○  ●  ○)
      const historicalNodes: THREE.Mesh[] = [];
      const nodeCount = Math.min(6, obsCount);
      const nodeGeom = new THREE.RingGeometry(0.04, 0.08, 16);
      const nodeMat = new THREE.MeshBasicMaterial({
        color: 0x93c5fd,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      for (let i = 0; i < nodeCount; i++) {
        const angle = (i / nodeCount) * Math.PI * 2;
        const offsetLat = cluster.center_latitude + Math.sin(angle) * 0.25;
        const offsetLon = cluster.center_longitude + Math.cos(angle) * 0.25;
        const nodePos = latLonToGlobeVector3(offsetLat, offsetLon, GLOBE_RADIUS * 1.006);

        const nodeMesh = new THREE.Mesh(nodeGeom, nodeMat);
        nodeMesh.position.copy(nodePos);
        nodeMesh.lookAt(new THREE.Vector3(0, 0, 0));
        group.add(nodeMesh);
        historicalNodes.push(nodeMesh);
      }

      animatedRings.push({
        ringMesh,
        historicalMarkers: historicalNodes,
        baseRadius: ringRadius,
        isSelected,
      });
    });
  };

  const update = (timeSec: number) => {
    animatedRings.forEach((item, idx) => {
      // Rotation & subtle breathing pulse for persistence visualization
      const pulse = Math.sin(timeSec * 2.0 + idx * 0.5) * 0.08 + 1.0;
      item.ringMesh.scale.set(pulse, pulse, 1);

      item.historicalMarkers.forEach((node, nodeIdx) => {
        const nodePulse = Math.sin(timeSec * 3.5 + nodeIdx) * 0.3 + 0.7;
        node.scale.setScalar(nodePulse);
      });
    });
  };

  return {
    group,
    setClusters,
    update,
    dispose: () => {
      clear();
    },
  };
}
