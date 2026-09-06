import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SpreadProjectionResponse, TimeHorizonKey, ExposedAsset } from '../types/hotspot';
import { ProjectionLegend } from './ProjectionLegend';

interface Threat3DViewProps {
  latitude: number;
  longitude: number;
  frp: number;
  spreadProjection?: SpreadProjectionResponse | null;
  timeHorizon: TimeHorizonKey;
  exposedAssets?: ExposedAsset[];
  onSelectAsset?: (asset: ExposedAsset) => void;
  isSimulation?: boolean;
}

export const Threat3DView: React.FC<Threat3DViewProps> = ({
  latitude,
  longitude,
  frp,
  spreadProjection,
  timeHorizon,
  exposedAssets = [],
  onSelectAsset,
  isSimulation = false,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [selectedAssetIn3D, setSelectedAssetIn3D] = useState<ExposedAsset | null>(null);

  // Camera presets controller state
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Active time horizon geometry details
  const activeProj = spreadProjection?.projections?.[timeHorizon];
  const windData = spreadProjection?.wind_data;

  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth || 800;
    const height = mountRef.current.clientHeight || 500;

    // 1. Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1329); // Dark EOC Slate
    sceneRef.current = scene;

    // 2. Camera Setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 25, 35);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // 3. Renderer Setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;

    mountRef.current.innerHTML = '';
    mountRef.current.appendChild(renderer.domElement);

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0xff4444, 2.0, 50);
    pointLight.position.set(0, 5, 0);
    scene.add(pointLight);

    // 5. Ground Plane & Geospatial Grid
    const gridHelper = new THREE.GridHelper(60, 30, 0x0284c7, 0x1e293b);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    const planeGeo = new THREE.PlaneGeometry(60, 60);
    const planeMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.8,
      metalness: 0.2,
      side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(planeGeo, planeMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // 6. Relative Thermal Intensity Core Height Calculation
    const intensity = activeProj?.relative_intensity || (frp >= 50 ? 'CRITICAL' : frp >= 25 ? 'HIGH' : frp >= 10 ? 'MODERATE' : 'LOW');
    let coreHeight = 3.0;
    let coreColor = 0xeab308; // yellow

    if (intensity === 'CRITICAL') {
      coreHeight = 9.0;
      coreColor = 0xef4444; // red
    } else if (intensity === 'HIGH') {
      coreHeight = 6.5;
      coreColor = 0xf97316; // orange
    } else if (intensity === 'MODERATE') {
      coreHeight = 4.0;
      coreColor = 0xeab308; // yellow
    } else {
      coreHeight = 2.0;
      coreColor = 0x22c55e; // green
    }

    // 7. Central Thermal Fire Core 3D Mesh (Cylinder/Cone)
    const coreGeo = new THREE.CylinderGeometry(0.5, 2.5, coreHeight, 32);
    const coreMat = new THREE.MeshPhongMaterial({
      color: coreColor,
      emissive: coreColor,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.85,
      wireframe: false,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.set(0, coreHeight / 2, 0);
    scene.add(coreMesh);

    // Core pulsing ring at base
    const ringGeo = new THREE.RingGeometry(1.0, 3.0, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: coreColor, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.05;
    scene.add(ringMesh);

    // 8. 3D Threat Volume Layers (Core, High Risk Corridor, Uncertainty, Monitoring)
    const radii = activeProj?.radii_km || { core: 1.0, high_risk: 2.0, uncertainty: 3.5, monitoring: 5.0 };
    const headingDeg = windData?.heading_deg ?? 0;
    const headingRad = (headingDeg * Math.PI) / 180;
    const dispKm = activeProj?.displacement_km || 0;

    // Center displacement of projected threat corridor
    const projX = dispKm * Math.sin(headingRad) * 2.0; // scale factor for 3D grid
    const projZ = -dispKm * Math.cos(headingRad) * 2.0;

    // High Risk Corridor Mesh
    const corridorGeo = new THREE.CylinderGeometry(radii.high_risk * 1.5, radii.high_risk * 2.0, 1.2, 32);
    const corridorMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.35,
      wireframe: false,
    });
    const corridorMesh = new THREE.Mesh(corridorGeo, corridorMat);
    corridorMesh.position.set(projX, 0.6, projZ);
    scene.add(corridorMesh);

    // Uncertainty Volume Mesh
    const uncertaintyGeo = new THREE.CylinderGeometry(radii.uncertainty * 2.0, radii.uncertainty * 2.5, 0.6, 32);
    const uncertaintyMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.2,
      wireframe: true,
    });
    const uncertaintyMesh = new THREE.Mesh(uncertaintyGeo, uncertaintyMat);
    uncertaintyMesh.position.set(projX, 0.3, projZ);
    scene.add(uncertaintyMesh);

    // 9. Directional Threat Vector Arrow (If wind data available)
    if (windData?.available && (windData.heading_deg !== null && windData.heading_deg !== undefined)) {
      const dirVector = new THREE.Vector3(Math.sin(headingRad), 0, -Math.cos(headingRad)).normalize();
      const origin = new THREE.Vector3(0, 0.2, 0);
      const arrowLength = Math.max(6, dispKm * 3.0 + 4);
      const arrowHelper = new THREE.ArrowHelper(dirVector, origin, arrowLength, 0x38bdf8, 2.0, 1.2);
      scene.add(arrowHelper);
    }

    // 10. 3D Asset Pillars (Exposed Assets from OpenStreetMap)
    const assetGroup = new THREE.Group();
    exposedAssets.forEach((asset, idx) => {
      // Map lat/lon to 3D grid relative to origin
      const dx = (asset.longitude - longitude) * 111.0 * Math.cos((latitude * Math.PI) / 180) * 4.0;
      const dz = -(asset.latitude - latitude) * 111.0 * 4.0;

      const isInsideProj = Math.hypot(dx - projX, dz - projZ) <= radii.uncertainty * 2.5;
      const pillarColor = isInsideProj ? 0xef4444 : 0x38bdf8;
      const pillarH = isInsideProj ? 5.0 : 3.0;

      const pillarGeo = new THREE.BoxGeometry(0.8, pillarH, 0.8);
      const pillarMat = new THREE.MeshStandardMaterial({
        color: pillarColor,
        emissive: isInsideProj ? 0xef4444 : 0x000000,
        emissiveIntensity: isInsideProj ? 0.4 : 0.0,
      });
      const pillarMesh = new THREE.Mesh(pillarGeo, pillarMat);
      pillarMesh.position.set(dx, pillarH / 2, dz);
      pillarMesh.name = `asset_${idx}`;
      assetGroup.add(pillarMesh);
    });
    scene.add(assetGroup);

    // 11. Mouse Drag Pointer Controls
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let cameraAngleX = 0;
    let cameraAngleY = 0.5;
    const distance = 45;

    const updateCameraPosition = () => {
      if (!cameraRef.current) return;
      cameraRef.current.position.x = distance * Math.sin(cameraAngleX) * Math.cos(cameraAngleY);
      cameraRef.current.position.y = distance * Math.sin(cameraAngleY);
      cameraRef.current.position.z = distance * Math.cos(cameraAngleX) * Math.cos(cameraAngleY);
      cameraRef.current.lookAt(projX / 2, 2, projZ / 2);
    };

    updateCameraPosition();

    const domElement = mountRef.current;
    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      cameraAngleX -= deltaX * 0.005;
      cameraAngleY = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, cameraAngleY + deltaY * 0.005));

      updateCameraPosition();
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // 12. Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      coreMesh.rotation.y += 0.01;
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, [latitude, longitude, frp, activeProj, windData, exposedAssets, timeHorizon]);

  // Camera Preset Actions
  const handleCameraPreset = (preset: 'RESET' | 'TOP' | 'INCIDENT' | 'FIT' | 'FOLLOW') => {
    if (!cameraRef.current) return;
    const camera = cameraRef.current;

    switch (preset) {
      case 'RESET':
        camera.position.set(0, 25, 35);
        camera.lookAt(0, 0, 0);
        break;
      case 'TOP':
        camera.position.set(0, 50, 0.1);
        camera.lookAt(0, 0, 0);
        break;
      case 'INCIDENT':
        camera.position.set(0, 8, 14);
        camera.lookAt(0, 2, 0);
        break;
      case 'FIT':
        camera.position.set(15, 35, 35);
        camera.lookAt(0, 0, 0);
        break;
      case 'FOLLOW':
        const dispKm = activeProj?.displacement_km || 0;
        const headingRad = ((windData?.heading_deg ?? 0) * Math.PI) / 180;
        const px = dispKm * Math.sin(headingRad) * 2.0;
        const pz = -dispKm * Math.cos(headingRad) * 2.0;
        camera.position.set(px, 15, pz + 20);
        camera.lookAt(px, 2, pz);
        break;
    }
  };

  return (
    <div className="threat-3d-stage-container">
      {/* 3D CAMERA CONTROLS BAR */}
      <div className="camera-presets-bar">
        <span className="camera-bar-title">3D CAMERA VIEWS:</span>
        <button type="button" className="btn-cam" onClick={() => handleCameraPreset('RESET')}>
          🔄 RESET VIEW
        </button>
        <button type="button" className="btn-cam" onClick={() => handleCameraPreset('TOP')}>
          ⬇ TOP VIEW (2D-ISO)
        </button>
        <button type="button" className="btn-cam" onClick={() => handleCameraPreset('INCIDENT')}>
          🔥 INCIDENT CORE
        </button>
        <button type="button" className="btn-cam" onClick={() => handleCameraPreset('FIT')}>
          🎯 FIT THREAT ZONE
        </button>
        <button type="button" className="btn-cam" onClick={() => handleCameraPreset('FOLLOW')}>
          🧭 FOLLOW SPREAD
        </button>
      </div>

      {/* WEBGL 3D CANVAS MOUNT */}
      <div ref={mountRef} className="webgl-3d-canvas" style={{ width: '100%', height: '480px', cursor: 'grab' }} />

      {/* 3D THREAT LEGEND & DATA BADGES */}
      <ProjectionLegend isSimulation={isSimulation} windAvailable={windData?.available ?? false} />

      {/* Selected Asset Details Drawer (If user clicked an asset in 3D scene) */}
      {selectedAssetIn3D && (
        <div className="asset-3d-info-drawer">
          <div className="drawer-header">
            <span>🏭 {selectedAssetIn3D.asset_name}</span>
            <button
              type="button"
              className="btn-close-sm"
              onClick={() => {
                if (onSelectAsset) onSelectAsset(selectedAssetIn3D);
                setSelectedAssetIn3D(null);
              }}
            >
              ✕ Inspect Details
            </button>
          </div>
          <div className="drawer-body">
            <div>Category: <strong>{selectedAssetIn3D.category}</strong></div>
            <div>Distance: <strong>{selectedAssetIn3D.distance_km.toFixed(2)} km</strong></div>
            <div>Threat Zone: <strong>{selectedAssetIn3D.threat_zone}</strong></div>
            <div>Exposure: <strong>{selectedAssetIn3D.exposure_level}</strong></div>
          </div>
        </div>
      )}
    </div>
  );
};
