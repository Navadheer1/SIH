import * as THREE from 'three';
import { OsmFeature, ExposedAsset, Hotspot } from '../../types/hotspot';
import { GLOBE_RADIUS, latLonToGlobeVector3 } from './EarthGlobe';

export interface IndustrialLayerSystem {
  group: THREE.Group;
  setFeatures: (
    sourceHotspot: Hotspot | null,
    features: (OsmFeature | ExposedAsset)[],
    facilityName?: string | null,
    distanceKm?: number | null
  ) => void;
  update: (timeSec: number) => void;
  dispose: () => void;
}

export function createIndustrialLayer(): IndustrialLayerSystem {
  const group = new THREE.Group();
  group.name = 'industrial-intelligence-layer';

  let animatedConnectors: {
    line: THREE.Line;
    markerMesh: THREE.Mesh;
  }[] = [];

  const clear = () => {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
    }
    animatedConnectors = [];
  };

  const setFeatures = (
    sourceHotspot: Hotspot | null,
    features: (OsmFeature | ExposedAsset)[],
    facilityName?: string | null,
    distanceKm?: number | null
  ) => {
    clear();
    if (!sourceHotspot) return;

    const sourcePos = latLonToGlobeVector3(
      sourceHotspot.latitude,
      sourceHotspot.longitude,
      GLOBE_RADIUS * 1.004
    );

    // If explicit OSM features are provided, render up to 6 nearest
    const displayFeatures = features.slice(0, 6);

    // If no features array was passed but facilityName & distanceKm are known, synthesize the closest OSM node
    if (displayFeatures.length === 0 && facilityName && distanceKm !== null && distanceKm !== undefined) {
      // Offset position along longitude for visual representation
      const degOffset = (distanceKm / 111.0);
      const targetLat = sourceHotspot.latitude + degOffset * 0.7;
      const targetLon = sourceHotspot.longitude + degOffset * 0.7;
      displayFeatures.push({
        id: 'nearby_osm_facility',
        name: facilityName,
        feature_type: 'industrial',
        latitude: targetLat,
        longitude: targetLon,
        distance_km: distanceKm,
      } as any);
    }

    displayFeatures.forEach((feat) => {
      const fLat = (feat as any).latitude ?? (feat as any).lat ?? sourceHotspot.latitude;
      const fLon = (feat as any).longitude ?? (feat as any).lon ?? sourceHotspot.longitude;

      const targetPos = latLonToGlobeVector3(fLat, fLon, GLOBE_RADIUS * 1.004);

      // 1. Industrial Facility 3D Geometric Pin
      const pinGeom = new THREE.BoxGeometry(0.18, 0.18, 0.25);
      const pinMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.5,
        metalness: 0.8,
        roughness: 0.2,
      });
      const pinMesh = new THREE.Mesh(pinGeom, pinMat);
      pinMesh.position.copy(targetPos);
      pinMesh.lookAt(new THREE.Vector3(0, 0, 0));
      group.add(pinMesh);

      // 2. Telemetry Connector Line (Thermal Source -> Facility)
      // Raised curve above sphere surface
      const midPoint = new THREE.Vector3().addVectors(sourcePos, targetPos).multiplyScalar(0.5);
      midPoint.multiplyScalar(1.02); // Elevate midpoint above globe

      const curve = new THREE.QuadraticBezierCurve3(sourcePos, midPoint, targetPos);
      const curvePoints = curve.getPoints(24);
      const lineGeom = new THREE.BufferGeometry().setFromPoints(curvePoints);
      const lineMat = new THREE.LineDashedMaterial({
        color: 0x38bdf8,
        dashSize: 0.2,
        gapSize: 0.1,
        transparent: true,
        opacity: 0.75,
      });
      const line = new THREE.Line(lineGeom, lineMat);
      line.computeLineDistances();
      group.add(line);

      // 3. Facility Footprint Boundary Ring
      const ringGeom = new THREE.RingGeometry(0.25, 0.32, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x0284c7,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.position.copy(targetPos);
      ringMesh.lookAt(new THREE.Vector3(0, 0, 0));
      group.add(ringMesh);

      animatedConnectors.push({ line, markerMesh: pinMesh });
    });
  };

  const update = (timeSec: number) => {
    animatedConnectors.forEach((item, idx) => {
      // Subtle pulse on industrial pins
      const pulse = Math.sin(timeSec * 4.0 + idx) * 0.15 + 1.0;
      item.markerMesh.scale.set(pulse, pulse, pulse);
    });
  };

  return {
    group,
    setFeatures,
    update,
    dispose: () => {
      clear();
    },
  };
}
