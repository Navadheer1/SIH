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
        GLOBE_RADIUS * 1.003
      );

      // Clutter Elimination (Requirement 2 & 7):
      // Layer 2 persistence rings are strictly managed by ThermalRiskField for the selected incident.
      // Inactive clusters only render minimal, subtle orbit pass indicators (opacity 0.25)
      // to keep the globe clean and legible.
      const historicalNodes: THREE.Mesh[] = [];

      if (!isSelected && (cluster.persistence_score || 0) >= 60) {
        // Single subtle indicator dot for high-persistence background clusters
        const nodeGeom = new THREE.CircleGeometry(0.035, 8);
        const nodeMat = new THREE.MeshBasicMaterial({
          color: 0x0284c7,
          transparent: true,
          opacity: 0.25,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const nodeMesh = new THREE.Mesh(nodeGeom, nodeMat);
        nodeMesh.position.copy(centerPos);
        nodeMesh.lookAt(new THREE.Vector3(0, 0, 0));
        group.add(nodeMesh);
        historicalNodes.push(nodeMesh);
      }

      animatedRings.push({
        historicalMarkers: historicalNodes,
        isSelected,
      });
    });
  };

  const update = (timeSec: number) => {
    animatedRings.forEach((item) => {
      item.historicalMarkers.forEach((node, nodeIdx) => {
        const nodePulse = Math.sin(timeSec * 2.0 + nodeIdx) * 0.15 + 0.85;
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
