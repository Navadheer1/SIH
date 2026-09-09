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
    ringMesh?: THREE.Mesh;
    historicalMarkers: THREE.Mesh[];
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

      const persistenceScore = cluster.persistence_score || 50;
      const obsCount = Math.max(1, cluster.observation_count || 1);
      const ringRadius = 0.35 + (persistenceScore / 100) * 0.45;

      let ringMesh: THREE.Mesh | undefined;

      // Only render concentric persistence ring if selected (Clutter Reduction Rule)
      if (isSelected) {
        const ringGeom = new THREE.RingGeometry(ringRadius * 0.94, ringRadius, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        ringMesh = new THREE.Mesh(ringGeom, ringMat);
        ringMesh.position.copy(centerPos);
        ringMesh.lookAt(new THREE.Vector3(0, 0, 0));
        group.add(ringMesh);
      }

      // Small Historical Detection Orbit Satellite Pass Nodes (○  ●  ○)
      const historicalNodes: THREE.Mesh[] = [];
      const nodeCount = Math.min(4, obsCount);
      const nodeGeom = new THREE.CircleGeometry(0.04, 12);
      const nodeMat = new THREE.MeshBasicMaterial({
        color: isSelected ? 0x38bdf8 : 0x0284c7,
        transparent: true,
        opacity: isSelected ? 0.85 : 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      for (let i = 0; i < nodeCount; i++) {
        const angle = (i / nodeCount) * Math.PI * 2;
        const offsetLat = cluster.center_latitude + Math.sin(angle) * 0.16;
        const offsetLon = cluster.center_longitude + Math.cos(angle) * 0.16;
        const nodePos = latLonToGlobeVector3(offsetLat, offsetLon, GLOBE_RADIUS * 1.005);

        const nodeMesh = new THREE.Mesh(nodeGeom, nodeMat);
        nodeMesh.position.copy(nodePos);
        nodeMesh.lookAt(new THREE.Vector3(0, 0, 0));
        group.add(nodeMesh);
        historicalNodes.push(nodeMesh);
      }

      animatedRings.push({
        ringMesh,
        historicalMarkers: historicalNodes,
        isSelected,
      });
    });
  };

  const update = (timeSec: number) => {
    animatedRings.forEach((item) => {
      if (item.isSelected && item.ringMesh) {
        const pulse = Math.sin(timeSec * 2.5) * 0.05 + 1.0;
        item.ringMesh.scale.set(pulse, pulse, 1);
      }

      item.historicalMarkers.forEach((node, nodeIdx) => {
        const nodePulse = Math.sin(timeSec * 3.0 + nodeIdx) * 0.2 + 0.8;
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
