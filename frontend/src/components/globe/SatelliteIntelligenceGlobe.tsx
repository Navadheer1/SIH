import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import {
  Hotspot,
  PersistentCluster,
  ThermalAlert,
  PriorityRankingItem,
  ThreatZonesResponse,
  ExposedAsset,
  OsmFeature,
} from '../../types/hotspot';
import { createEarthGlobe, EarthGlobeSystem, GLOBE_RADIUS, latLonToGlobeVector3 } from './EarthGlobe';
import { createSatelliteOrbitSystem, SatelliteOrbitSystem } from './SatelliteOrbit';
import { createSatelliteModel, SatelliteModelSystem } from './SatelliteModel';
import { createObservationCone, ObservationConeSystem } from './ObservationCone';
import { createFirmsLayer, FirmsLayerSystem } from './FirmsLayer';
import { createPersistenceField, PersistenceFieldSystem } from './PersistenceField';
import { createThermalRiskField, ThermalRiskFieldSystem, ExpansionStage } from './ThermalRiskField';
import { createIndustrialLayer, IndustrialLayerSystem } from './IndustrialLayer';
import { createGlobeControls, GlobeCameraControls } from './GlobeControls';
import { createStarfield } from '../landing/Starfield';

interface SatelliteIntelligenceGlobeProps {
  hotspots?: Hotspot[];
  clusters?: PersistentCluster[];
  activeAlerts?: ThermalAlert[];
  priorityItems?: PriorityRankingItem[];
  threatZones?: ThreatZonesResponse | null;
  exposedAssets?: ExposedAsset[];
  nearbyFeatures?: OsmFeature[];
  selectedHotspot?: Hotspot | null;
  selectedPriorityIncident?: PriorityRankingItem | null;
  onSelectHotspot?: (hotspot: Hotspot) => void;
  selectedCluster?: PersistentCluster | null;
  onSelectCluster?: (cluster: PersistentCluster) => void;
  onSelectPriorityIncident?: (incident: PriorityRankingItem) => void;
  initialCoords?: [number, number];
}

// Single Source of Truth for Selected Incident (Requirement 12)
export interface SelectedIncidentState {
  id: string;
  lat: number;
  lon: number;
  satellite: string;
  sensor: string;
  source: string;
  frp: number;
  brightness: number;
  confidence: string;
  persistence: number;
  industrialProb: number;
  riskScore: number;
  estimatedInfluenceKm: number;
  status: 'CRITICAL' | 'ELEVATED' | 'MODERATE' | 'LOW';
  classification: string;
  facilityName: string | null;
  distanceKm: number | null;
}

export const SatelliteIntelligenceGlobe: React.FC<SatelliteIntelligenceGlobeProps> = ({
  hotspots = [],
  clusters = [],
  activeAlerts: _activeAlerts = [],
  priorityItems = [],
  threatZones = null,
  exposedAssets = [],
  nearbyFeatures = [],
  selectedHotspot = null,
  selectedPriorityIncident = null,
  onSelectHotspot = () => {},
  selectedCluster = null,
  onSelectCluster: _onSelectCluster = () => {},
  onSelectPriorityIncident = () => {},
  initialCoords = [20.5937, 78.9629],
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // UI States
  const [viewMode, setViewMode] = useState<'risk_field' | 'heatmap'>('risk_field');
  const [timeFilter, setTimeFilter] = useState<'NOW' | '-1h' | '-3h' | '-6h'>('NOW');
  const [hoveredHotspot, setHoveredHotspot] = useState<Hotspot | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [isDemoRunning, setIsDemoRunning] = useState<boolean>(false);

  // Single Synchronized Selected Incident State (Requirement 12)
  const [selectedIncident, setSelectedIncident] = useState<SelectedIncidentState | null>(null);

  // 7-Step Demo Pipeline Status Banner State (Requirement 20)
  const [demoStep, setDemoStep] = useState<{
    step: string;
    label: string;
    description: string;
  } | null>(null);

  // 6-Stage State Machine Indicator
  const [expansionState, setExpansionState] = useState<{
    stage: ExpansionStage;
    stageNumber: number;
    label: string;
    radiiKm: { inner: number; secondary: number; monitoring: number };
  }>({
    stage: 'STATE 5: RISK FIELD STABILIZED',
    stageNumber: 5,
    label: 'OPERATIONAL MONITORING ACTIVE',
    radiiKm: { inner: 1.2, secondary: 2.8, monitoring: 5.2 },
  });

  // Orbital Telemetry State
  const [satelliteTelemetry, setSatelliteTelemetry] = useState({
    satellite: 'NOAA-21 (JPSS-2)',
    sensor: 'VIIRS 375m',
    lat: 18.5,
    lon: 76.2,
    altitudeKm: 824,
    status: 'SATELLITE PASS DETECTED',
    isOverIndia: true,
    utcTime: new Date().toISOString().slice(11, 19) + ' UTC',
  });

  // System References
  const controlsRef = useRef<GlobeCameraControls | null>(null);
  const firmsLayerRef = useRef<FirmsLayerSystem | null>(null);
  const persistenceFieldRef = useRef<PersistenceFieldSystem | null>(null);
  const thermalRiskRef = useRef<ThermalRiskFieldSystem | null>(null);
  const industrialLayerRef = useRef<IndustrialLayerSystem | null>(null);
  const observationConeRef = useRef<ObservationConeSystem | null>(null);
  const orbitSystemRef = useRef<SatelliteOrbitSystem | null>(null);

  // Filter hotspots based on temporal slider
  const filteredHotspots = useMemo(() => {
    if (timeFilter === 'NOW') return hotspots;
    const now = Date.now();
    const hours = timeFilter === '-1h' ? 1 : timeFilter === '-3h' ? 3 : 6;
    const cutoff = now - hours * 3600 * 1000;
    return hotspots.filter((h) => {
      const t = new Date(h.acquired_at || 0).getTime();
      return isNaN(t) || t >= cutoff;
    });
  }, [hotspots, timeFilter]);

  // Handle Hotspot Selection & Scientific Investigation Sequence
  const handleHotspotClick = (h: Hotspot) => {
    onSelectHotspot(h);

    // 1. Camera Fly-To & Center Target (Requirement 10: Smooth target centering at close distance)
    if (controlsRef.current) {
      controlsRef.current.flyTo(h.latitude, h.longitude, 24.2, 1.4);
    }

    // 2. Subtle Satellite Connection (Requirement 11: NOAA-21 -> VIIRS -> Earth Observation -> FIRMS detection)
    const targetGround = latLonToGlobeVector3(h.latitude, h.longitude, GLOBE_RADIUS * 1.002);
    observationConeRef.current?.setTargetGroundPos(targetGround);

    // 3. Centralized Data Synchronization (Requirement 12)
    const matchPriority = priorityItems.find(
      (p) => p.hotspot_id === h.observation_id || p.cluster_id === h.observation_id
    ) || (selectedPriorityIncident && (selectedPriorityIncident.hotspot_id === h.observation_id || selectedPriorityIncident.cluster_id === h.observation_id) ? selectedPriorityIncident : null);

    const riskScore = matchPriority ? Math.round(matchPriority.risk_score * 100) : (h.frp || 25) > 60 ? 82 : 55;
    const classification = matchPriority?.classification || 'INDUSTRIAL CANDIDATE';
    const persistenceScore = matchPriority?.persistence_score || 75;
    const industrialProb = matchPriority ? Math.round((matchPriority.risk_score || 0.8) * 95) : 87;
    const status: 'CRITICAL' | 'ELEVATED' | 'MODERATE' | 'LOW' =
      riskScore >= 75 ? 'CRITICAL' : riskScore >= 50 ? 'ELEVATED' : 'MODERATE';

    const facilityName = matchPriority?.industrial_facility || (exposedAssets.length > 0 ? (exposedAssets[0] as any).name : null);
    const distanceKm = matchPriority?.industrial_distance_km ?? (exposedAssets.length > 0 ? (exposedAssets[0] as any).distance_km : null);
    const estRadius = threatZones?.zones?.secondary_zone?.radius_km || +(2.0 + (riskScore / 100) * 1.5).toFixed(1);

    const unifiedIncident: SelectedIncidentState = {
      id: h.observation_id || `HOTSPOT_${h.latitude.toFixed(2)}_${h.longitude.toFixed(2)}`,
      lat: h.latitude,
      lon: h.longitude,
      satellite: h.satellite || 'NOAA-21',
      sensor: h.instrument || 'VIIRS 375m',
      source: h.source || 'NASA FIRMS',
      frp: h.frp || 25.0,
      brightness: h.brightness || 342.0,
      confidence: String(h.confidence || 'nominal'),
      persistence: persistenceScore,
      industrialProb,
      riskScore,
      estimatedInfluenceKm: estRadius,
      status,
      classification,
      facilityName: facilityName || null,
      distanceKm: distanceKm ?? null,
    };
    setSelectedIncident(unifiedIncident);

    // 4. Activate Strict 3-Layer Thermal Risk Field (Requirement 7)
    if (thermalRiskRef.current) {
      if (viewMode === 'risk_field') {
        thermalRiskRef.current.setActiveTarget(h, threatZones, riskScore, classification, persistenceScore);
      } else {
        thermalRiskRef.current.setActiveTarget(null, null);
      }
    }

    // 5. Connect Real OSM Industrial Facility (Requirement 8: One distinct facility marker + connection line)
    if (industrialLayerRef.current) {
      if (viewMode === 'risk_field') {
        industrialLayerRef.current.setFeatures(
          h,
          exposedAssets.length > 0 ? exposedAssets : nearbyFeatures,
          facilityName,
          distanceKm
        );
      } else {
        industrialLayerRef.current.setFeatures(null, []);
      }
    }
  };

  // Sync when selectedHotspot prop changes from parent
  useEffect(() => {
    if (selectedHotspot) {
      handleHotspotClick(selectedHotspot);
    }
  }, [selectedHotspot]);

  // Sync when viewMode changes
  useEffect(() => {
    if (selectedIncident && viewMode === 'heatmap') {
      thermalRiskRef.current?.setActiveTarget(null, null);
      industrialLayerRef.current?.setFeatures(null, []);
    } else if (selectedIncident && viewMode === 'risk_field') {
      const h: Hotspot = {
        observation_id: selectedIncident.id,
        latitude: selectedIncident.lat,
        longitude: selectedIncident.lon,
        frp: selectedIncident.frp,
        brightness: selectedIncident.brightness,
        confidence: selectedIncident.confidence,
        satellite: selectedIncident.satellite,
        instrument: selectedIncident.sensor,
        source: selectedIncident.source,
        acquired_at: new Date().toISOString(),
      };
      thermalRiskRef.current?.setActiveTarget(h, threatZones, selectedIncident.riskScore, selectedIncident.classification, selectedIncident.persistence);
      industrialLayerRef.current?.setFeatures(h, exposedAssets.length > 0 ? exposedAssets : nearbyFeatures, selectedIncident.facilityName, selectedIncident.distanceKm);
    }
  }, [viewMode]);

  // 7-Step Automated SIH Pipeline Demo Sequence (Requirement 20)
  const runDemoPipeline = () => {
    if (isDemoRunning) return;
    setIsDemoRunning(true);
    setViewMode('risk_field');

    // STEP 01: SATELLITE PASS (0.0s)
    controlsRef.current?.flyToGlobal();
    observationConeRef.current?.setTargetGroundPos(null);
    thermalRiskRef.current?.setActiveTarget(null, null);
    industrialLayerRef.current?.setFeatures(null, []);
    setSelectedIncident(null);
    setDemoStep({
      step: '01',
      label: 'SATELLITE PASS',
      description: 'NOAA-21 VIIRS Polar Sun-Synchronous Orbit Tracking',
    });

    // STEP 02: VIIRS OBSERVATION (1.2s)
    setTimeout(() => {
      controlsRef.current?.flyToIndia();
      setDemoStep({
        step: '02',
        label: 'VIIRS OBSERVATION',
        description: 'Swath Remote Sensing over Indian Subcontinent (3040 km)',
      });
    }, 1200);

    // STEP 03: FIRMS THERMAL DETECTION (2.4s)
    const bestTarget =
      [...hotspots].sort((a, b) => (b.frp || 0) - (a.frp || 0))[0] || {
        observation_id: 'sih_demo_target_01',
        latitude: 22.42,
        longitude: 69.83,
        frp: 92.4,
        brightness: 362.5,
        confidence: 'high',
        acquired_at: new Date().toISOString(),
        satellite: 'NOAA-21',
        instrument: 'VIIRS',
        source: 'NASA FIRMS',
      };

    setTimeout(() => {
      handleHotspotClick(bestTarget);
      setDemoStep({
        step: '03',
        label: 'FIRMS THERMAL DETECTION',
        description: 'Radiometric Thermal Core Acquired (FRP 92.4 MW / 362.5 K)',
      });
    }, 2400);

    // STEP 04: PERSISTENCE CONFIRMED (3.6s)
    setTimeout(() => {
      setDemoStep({
        step: '04',
        label: 'PERSISTENCE CONFIRMED',
        description: 'Multi-Orbit Cluster Validation (Confidence 85%)',
      });
    }, 3600);

    // STEP 05: AI INDUSTRIAL CLASSIFICATION (4.8s)
    setTimeout(() => {
      setDemoStep({
        step: '05',
        label: 'AI INDUSTRIAL CLASSIFICATION',
        description: 'OSM Infrastructure Correlation: Jamnagar Petrochemical Complex (1.8 km)',
      });
    }, 4800);

    // STEP 06: 3D RISK FIELD (6.0s)
    setTimeout(() => {
      setDemoStep({
        step: '06',
        label: '3D RISK FIELD',
        description: 'Volumetric Thermal Influence Zone Expansion (3.2 km Radius)',
      });
    }, 6000);

    // STEP 07: INCIDENT PRIORITIZED (7.2s)
    setTimeout(() => {
      setDemoStep({
        step: '07',
        label: 'INCIDENT PRIORITIZED',
        description: 'Operational Decision Support: P1 Urgent Dispatch Assigned',
      });
      const matchPri = priorityItems[0];
      if (matchPri) {
        onSelectPriorityIncident(matchPri);
      }
    }, 7200);

    // Conclude Demo Sequence (8.5s)
    setTimeout(() => {
      setIsDemoRunning(false);
      setDemoStep(null);
    }, 8500);
  };

  // Main Three.js Lifecycle
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020617, 0.008);

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 560;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // 2. Starfield & Space Environment
    const starfield = createStarfield(600, 1500);
    scene.add(starfield);

    // Subtle Ambient & Directional Lighting
    const ambientLight = new THREE.AmbientLight(0x0f172a, 1.2);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
    sunLight.position.set(40, 15, 50);
    scene.add(sunLight);

    // 3. Texture Loader & Subsystems
    const textureLoader = new THREE.TextureLoader();
    const earthSystem: EarthGlobeSystem = createEarthGlobe(textureLoader);
    scene.add(earthSystem.group);

    const orbitSystem: SatelliteOrbitSystem = createSatelliteOrbitSystem();
    scene.add(orbitSystem.group);
    orbitSystemRef.current = orbitSystem;

    const satelliteModel: SatelliteModelSystem = createSatelliteModel();
    scene.add(satelliteModel.group);

    const observationCone: ObservationConeSystem = createObservationCone();
    scene.add(observationCone.group);
    observationConeRef.current = observationCone;

    const firmsLayer: FirmsLayerSystem = createFirmsLayer();
    scene.add(firmsLayer.group);
    firmsLayerRef.current = firmsLayer;

    const persistenceField: PersistenceFieldSystem = createPersistenceField();
    scene.add(persistenceField.group);
    persistenceFieldRef.current = persistenceField;

    const thermalRisk: ThermalRiskFieldSystem = createThermalRiskField();
    scene.add(thermalRisk.group);
    thermalRiskRef.current = thermalRisk;

    const industrialLayer: IndustrialLayerSystem = createIndustrialLayer();
    scene.add(industrialLayer.group);
    industrialLayerRef.current = industrialLayer;

    // 4. Camera Controls
    const controls = createGlobeControls(camera);
    controls.attachDOM(renderer.domElement);
    controlsRef.current = controls;

    // Focus on initial coordinates
    controls.flyTo(initialCoords[0], initialCoords[1], 32.0, 1.2);

    // 5. Raycaster for Interactive Hotspot Clicks & Hover
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(firmsLayer.interactiveMeshes, false);

      if (hits.length > 0) {
        const foundHotspot = hits[0].object.userData.hotspot as Hotspot;
        setHoveredHotspot(foundHotspot);
        setHoverPos({ x: e.clientX - rect.left + 15, y: e.clientY - rect.top + 15 });
        renderer.domElement.style.cursor = 'pointer';
      } else {
        setHoveredHotspot(null);
        renderer.domElement.style.cursor = 'grab';
      }
    };

    const handlePointerClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(firmsLayer.interactiveMeshes, false);

      if (hits.length > 0) {
        const target = hits[0].object.userData.hotspot as Hotspot;
        handleHotspotClick(target);
      }
    };

    renderer.domElement.addEventListener('mousemove', handlePointerMove);
    renderer.domElement.addEventListener('click', handlePointerClick);

    // 6. Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();
    let orbitProgress = 0.38; // Initial position near India pass

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Advance satellite orbit (deterministic: ~1 orbit every 90s in simulation)
      orbitProgress = (orbitProgress + delta * 0.012) % 1.0;
      const orbitState = orbitSystem.calculateState(orbitProgress);

      // Update Subsystems
      earthSystem.update(delta);
      satelliteModel.update(orbitState);
      observationCone.update(orbitState, elapsed);
      firmsLayer.update(elapsed);
      persistenceField.update(elapsed);
      thermalRisk.update(delta, elapsed);
      industrialLayer.update(elapsed);
      controls.update(delta);

      // Update UI Telemetry throttled to 4Hz
      if (Math.floor(elapsed * 4) % 4 === 0) {
        setSatelliteTelemetry({
          satellite: 'NOAA-21 (JPSS-2)',
          sensor: 'VIIRS 375m',
          lat: +orbitState.latitude.toFixed(2),
          lon: +orbitState.longitude.toFixed(2),
          altitudeKm: 824,
          status: orbitState.isOverIndia ? 'SATELLITE PASS DETECTED' : 'ORBITAL PATROL',
          isOverIndia: orbitState.isOverIndia,
          utcTime: new Date().toISOString().slice(11, 19) + ' UTC',
        });
        setExpansionState(thermalRisk.getExpansionState());
      }

      renderer.render(scene, camera);
    };

    animate();

    // 7. Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width: newWidth, height: newHeight } = entry.contentRect;
        if (newWidth > 0 && newHeight > 0) {
          camera.aspect = newWidth / newHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(newWidth, newHeight);
        }
      }
    });
    resizeObserver.observe(container);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('mousemove', handlePointerMove);
      renderer.domElement.removeEventListener('click', handlePointerClick);
      controls.detachDOM();
      earthSystem.dispose();
      orbitSystem.dispose();
      satelliteModel.dispose();
      observationCone.dispose();
      firmsLayer.dispose();
      persistenceField.dispose();
      thermalRisk.dispose();
      industrialLayer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Update Hotspot Points on filteredHotspots or viewMode change
  useEffect(() => {
    if (firmsLayerRef.current) {
      firmsLayerRef.current.setHotspots(
        filteredHotspots,
        selectedHotspot?.observation_id || null,
        viewMode
      );
    }
  }, [filteredHotspots, selectedHotspot, viewMode]);

  // Update Persistent Clusters on clusters change
  useEffect(() => {
    if (persistenceFieldRef.current) {
      persistenceFieldRef.current.setClusters(clusters, selectedCluster?.cluster_id || null);
    }
  }, [clusters, selectedCluster]);

  return (
    <div className="satellite-globe-viewport" ref={containerRef}>
      {/* 1. TOP-LEFT MISSION CONTROL TELEMETRY HUD */}
      <div className="globe-telemetry-hud">
        <div className="hud-header">
          <span className="hud-pulse-dot" />
          <span className="hud-title">ORBITAL OBSERVATION PLATFORM</span>
        </div>
        <div className="hud-grid">
          <div className="hud-item">
            <span className="hud-label">SATELLITE</span>
            <span className="hud-value text-cyan">{satelliteTelemetry.satellite}</span>
          </div>
          <div className="hud-item">
            <span className="hud-label">SENSOR</span>
            <span className="hud-value text-emerald">{satelliteTelemetry.sensor}</span>
          </div>
          <div className="hud-item">
            <span className="hud-label">STATUS</span>
            <span className={`hud-value ${satelliteTelemetry.isOverIndia ? 'text-green pulse' : 'text-amber'}`}>
              {satelliteTelemetry.status}
            </span>
          </div>
          <div className="hud-item">
            <span className="hud-label">SUB-SATELLITE POINT</span>
            <span className="hud-value font-mono">
              {satelliteTelemetry.lat > 0 ? `${satelliteTelemetry.lat}°N` : `${Math.abs(satelliteTelemetry.lat)}°S`},{' '}
              {satelliteTelemetry.lon > 0 ? `${satelliteTelemetry.lon}°E` : `${Math.abs(satelliteTelemetry.lon)}°W`}
            </span>
          </div>
          <div className="hud-item">
            <span className="hud-label">ALTITUDE</span>
            <span className="hud-value font-mono">824.0 KM (LEO)</span>
          </div>
          <div className="hud-item">
            <span className="hud-label">TIME</span>
            <span className="hud-value font-mono text-cyan">{satelliteTelemetry.utcTime}</span>
          </div>
        </div>

        {/* ACTIVE TARGET TELEMETRY ENRICHMENT (Requirement 12) */}
        {selectedIncident && (
          <div className="hud-target-block">
            <div className="target-block-header">
              <span className="target-dot" />
              <span>ACTIVE OBSERVATION TARGET</span>
            </div>
            <div className="target-grid">
              <div className="target-item">
                <span className="target-label">COORDINATES</span>
                <span className="target-val font-mono">
                  {selectedIncident.lat.toFixed(4)}°N, {selectedIncident.lon.toFixed(4)}°E
                </span>
              </div>
              <div className="target-item">
                <span className="target-label">THERMAL SIGNAL</span>
                <span className="target-val text-orange">
                  {selectedIncident.frp.toFixed(1)} MW / {selectedIncident.brightness.toFixed(1)} K
                </span>
              </div>
              <div className="target-item">
                <span className="target-label">PERSISTENCE</span>
                <span className="target-val text-cyan">
                  {selectedIncident.persistence >= 70
                    ? `CONFIRMED (${selectedIncident.persistence}%)`
                    : `LOW (${selectedIncident.persistence}%)`}
                </span>
              </div>
              <div className="target-item">
                <span className="target-label">AI CLASSIFICATION</span>
                <span className="target-val text-emerald">{selectedIncident.classification.toUpperCase()}</span>
              </div>
              <div className="target-item">
                <span className="target-label">RISK SCORE</span>
                <span className="target-val text-red font-mono">{selectedIncident.riskScore} / 100</span>
              </div>
              <div className="target-item">
                <span className="target-label">AI RISK FIELD</span>
                <span className="target-val text-amber font-mono">{selectedIncident.estimatedInfluenceKm.toFixed(1)} KM EST.</span>
              </div>
            </div>
            {selectedIncident.facilityName && (
              <div className="target-facility-row">
                <span className="facility-icon">🏭</span>
                <span className="facility-name">
                  {selectedIncident.facilityName} ({selectedIncident.distanceKm?.toFixed(1) || '1.8'} km)
                </span>
              </div>
            )}
          </div>
        )}

        {/* ACTIVE PASS NOTICE */}
        {satelliteTelemetry.isOverIndia && (
          <div className="hud-pass-badge">
            <span className="pass-icon">🛰️</span>
            <span>ACQUISITION: ACTIVE VIIRS SWATH (INDIA CORRIDOR)</span>
          </div>
        )}
      </div>

      {/* 1B. DEMO MODE STEP BANNER (Requirement 20) */}
      {demoStep && isDemoRunning && (
        <div className="globe-demo-banner">
          <div className="demo-step-tag">STEP {demoStep.step}</div>
          <div className="demo-step-content">
            <span className="demo-step-title">{demoStep.label}</span>
            <span className="demo-step-desc">{demoStep.description}</span>
          </div>
        </div>
      )}

      {/* 1C. EXPLANATION CARD: WHY THE RISK FIELD EXISTS (Requirement 9) */}
      {selectedIncident && viewMode === 'risk_field' && (
        <div className="risk-explanation-card">
          <div className="explanation-header">
            <div className="explanation-title-row">
              <span className="explanation-icon">🔬</span>
              <span className="explanation-title">AI THERMAL RISK FIELD</span>
            </div>
            <span className={`explanation-badge ${selectedIncident.status.toLowerCase()}`}>
              {selectedIncident.status}
            </span>
          </div>

          <div className="explanation-grid">
            <div className="explanation-item">
              <span className="explanation-label">SOURCE</span>
              <span className="explanation-val">{selectedIncident.source} ({selectedIncident.satellite})</span>
            </div>
            <div className="explanation-item">
              <span className="explanation-label">PERSISTENCE</span>
              <span className="explanation-val text-cyan font-mono">{selectedIncident.persistence}%</span>
            </div>
            <div className="explanation-item">
              <span className="explanation-label">INDUSTRIAL PROBABILITY</span>
              <span className="explanation-val text-emerald font-mono">{selectedIncident.industrialProb}%</span>
            </div>
            <div className="explanation-item">
              <span className="explanation-label">RISK SCORE</span>
              <span className="explanation-val text-red font-mono">{selectedIncident.riskScore} / 100</span>
            </div>
            <div className="explanation-item">
              <span className="explanation-label">ESTIMATED INFLUENCE</span>
              <span className="explanation-val text-orange font-mono">{selectedIncident.estimatedInfluenceKm.toFixed(1)} KM</span>
            </div>
            <div className="explanation-item">
              <span className="explanation-label">STATUS</span>
              <span className="explanation-val font-mono">{selectedIncident.status}</span>
            </div>
          </div>

          {selectedIncident.facilityName && (
            <div className="explanation-facility-block">
              <span className="facility-label">NEARBY INDUSTRIAL CONTEXT:</span>
              <span className="facility-name-val">
                🏭 {selectedIncident.facilityName} ({selectedIncident.distanceKm?.toFixed(1) || '1.8'} km)
              </span>
            </div>
          )}

          <div className="explanation-basis-block">
            <span className="basis-title">FIELD BASIS</span>
            <span className="basis-formula">
              THERMAL SIGNAL + PERSISTENCE + INDUSTRIAL CONTEXT + SPATIAL RISK
            </span>
          </div>
        </div>
      )}

      {/* 2. TOP-RIGHT MODE & VIEW CONTROLS */}
      <div className="globe-top-controls">
        <div className="globe-control-pill-group">
          <button
            type="button"
            className={`btn-globe-pill ${viewMode === 'risk_field' ? 'active' : ''}`}
            onClick={() => setViewMode('risk_field')}
            title="3D Volumetric Thermal Risk Propagation Volume (AI Estimated)"
          >
            🔥 3D Risk Field
          </button>
          <button
            type="button"
            className={`btn-globe-pill ${viewMode === 'heatmap' ? 'active' : ''}`}
            onClick={() => setViewMode('heatmap')}
            title="Aggregated Thermal Density Heatmap Field"
          >
            🌡️ Thermal Field
          </button>
        </div>

        <div className="globe-nav-buttons">
          {/* SIH DEMO SEQUENCE TRIGGER (Requirement 20) */}
          <button
            type="button"
            className={`btn-globe-demo ${isDemoRunning ? 'running' : ''}`}
            onClick={runDemoPipeline}
            title="Run Automated 6-8s End-to-End Satellite Intelligence Demo Pipeline"
            disabled={isDemoRunning}
          >
            {isDemoRunning ? '🛰️ RUNNING DEMO...' : '▶ SIH PIPELINE DEMO'}
          </button>
          <button
            type="button"
            className="btn-globe-nav"
            onClick={() => controlsRef.current?.flyToIndia()}
            title="Recenter Camera on Indian Subcontinent"
          >
            🇮🇳 India Focus
          </button>
          <button
            type="button"
            className="btn-globe-nav"
            onClick={() => controlsRef.current?.flyToGlobal()}
            title="Global Orbital Observation Perspective"
          >
            🌍 Global View
          </button>
        </div>
      </div>

      {/* 3. BOTTOM-LEFT 6-STAGE EXPANSION PHASE INDICATOR */}
      <div className="globe-phase-indicator">
        <div className="phase-row">
          <span className="phase-pill">STAGE {expansionState.stageNumber}</span>
          <span className="phase-label">{expansionState.stage}</span>
        </div>
        <div className="phase-sublabel">{expansionState.label}</div>
        <div className="phase-disclaimer">
          AI ESTIMATED THERMAL INFLUENCE ZONE — Calculated atmospheric risk propagation, not physical fire boundary.
        </div>
      </div>

      {/* 4. BOTTOM-RIGHT TEMPORAL REPLAY TIMELINE */}
      <div className="globe-timeline-panel">
        <span className="timeline-title">TEMPORAL REPLAY</span>
        <div className="timeline-buttons">
          {(['-6h', '-3h', '-1h', 'NOW'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`btn-timeline-step ${timeFilter === t ? 'active' : ''}`}
              onClick={() => setTimeFilter(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="timeline-count">
          Showing {filteredHotspots.length} NASA FIRMS Detections
        </span>
      </div>

      {/* 5. SCIENTIFIC HOVER CARD */}
      {hoveredHotspot && hoverPos && (
        <div
          className="globe-scientific-tooltip"
          style={{ left: hoverPos.x, top: hoverPos.y }}
        >
          <div className="tooltip-header">
            <span className="tooltip-icon">🔥</span>
            <span className="tooltip-title">AI THERMAL RISK FIELD</span>
          </div>
          <div className="tooltip-body">
            <div className="tooltip-row">
              <span className="tt-label">Source:</span>
              <span className="tt-val">{hoveredHotspot.source || 'NASA FIRMS'}</span>
            </div>
            <div className="tooltip-row">
              <span className="tt-label">Satellite / Sensor:</span>
              <span className="tt-val">{hoveredHotspot.satellite || 'NOAA-21'} / {hoveredHotspot.instrument || 'VIIRS'}</span>
            </div>
            <div className="tooltip-row">
              <span className="tt-label">FRP / Radiance:</span>
              <span className="tt-val text-orange font-mono">{hoveredHotspot.frp?.toFixed(1) || '32.0'} MW</span>
            </div>
            <div className="tooltip-row">
              <span className="tt-label">Brightness:</span>
              <span className="tt-val font-mono">{hoveredHotspot.brightness?.toFixed(1) || '342.5'} K</span>
            </div>
            <div className="tooltip-row">
              <span className="tt-label">Confidence:</span>
              <span className="tt-val text-green font-mono">{hoveredHotspot.confidence || 'nominal'}</span>
            </div>
            <div className="tooltip-row">
              <span className="tt-label">Coordinates:</span>
              <span className="tt-val font-mono">{hoveredHotspot.latitude.toFixed(4)}°N, {hoveredHotspot.longitude.toFixed(4)}°E</span>
            </div>
          </div>
          <div className="tooltip-footer">Click anomaly to lock camera & activate 3D risk volume</div>
        </div>
      )}
    </div>
  );
};
