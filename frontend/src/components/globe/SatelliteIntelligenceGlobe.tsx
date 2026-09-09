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
  onSelectHotspot?: (hotspot: Hotspot) => void;
  selectedCluster?: PersistentCluster | null;
  onSelectCluster?: (cluster: PersistentCluster) => void;
  onSelectPriorityIncident?: (incident: PriorityRankingItem) => void;
  initialCoords?: [number, number];
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
  onSelectHotspot = () => {},
  selectedCluster = null,
  onSelectCluster: _onSelectCluster = () => {},
  initialCoords = [20.5937, 78.9629],
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // UI States
  const [viewMode, setViewMode] = useState<'risk_field' | 'heatmap'>('risk_field');
  const [timeFilter, setTimeFilter] = useState<'NOW' | '-1h' | '-3h' | '-6h'>('NOW');
  const [hoveredHotspot, setHoveredHotspot] = useState<Hotspot | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [isDemoRunning, setIsDemoRunning] = useState<boolean>(false);

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

  // Target Anomaly Enrichment Telemetry Block
  const [activeTargetTelemetry, setActiveTargetTelemetry] = useState<{
    targetCoords: string;
    signal: string;
    persistence: string;
    classification: string;
    riskScore: string;
    riskFieldKm: string;
    facilityName?: string | null;
  } | null>(null);

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

    // 1. Smooth Camera Fly-To Easing
    if (controlsRef.current) {
      controlsRef.current.flyTo(h.latitude, h.longitude, 25.5, 1.4);
    }

    // 2. Direct Observation Beam from Satellite to Ground Coordinate
    const targetGround = latLonToGlobeVector3(h.latitude, h.longitude, GLOBE_RADIUS * 1.002);
    observationConeRef.current?.setTargetGroundPos(targetGround);

    // 3. Match Priority Ranking & Calculate Data-Driven Risk
    const matchPriority = priorityItems.find(
      (p) => p.hotspot_id === h.observation_id || p.cluster_id === h.observation_id
    );
    const riskScore = matchPriority ? matchPriority.risk_score * 100 : (h.frp || 25) > 60 ? 82 : 55;
    const classification = matchPriority?.classification || 'INDUSTRIAL CANDIDATE';
    const persistenceScore = matchPriority?.persistence_score || 75;

    // 4. Activate 5-Layer 3D Volumetric Thermal Risk Field (Rising Plume)
    if (thermalRiskRef.current) {
      thermalRiskRef.current.setActiveTarget(h, threatZones, riskScore, classification, persistenceScore);
    }

    // 5. Connect Real OSM Industrial Facilities
    if (industrialLayerRef.current) {
      industrialLayerRef.current.setFeatures(
        h,
        exposedAssets.length > 0 ? exposedAssets : nearbyFeatures,
        matchPriority?.industrial_facility,
        matchPriority?.industrial_distance_km
      );
    }

    // 6. Populate Mission Control Target Telemetry
    const estRadius = threatZones?.zones?.secondary_zone?.radius_km || (2.5 + (riskScore / 100) * 1.2);
    setActiveTargetTelemetry({
      targetCoords: `${h.latitude.toFixed(4)}°N, ${h.longitude.toFixed(4)}°E`,
      signal: `ACQUIRED (${(h.frp || 25.0).toFixed(1)} MW / ${(h.brightness || 342.0).toFixed(1)} K)`,
      persistence: persistenceScore >= 70 ? `CONFIRMED (${persistenceScore.toFixed(0)}%)` : `LOW (${persistenceScore.toFixed(0)}%)`,
      classification: classification.toUpperCase(),
      riskScore: `${Math.round(riskScore)} / 100`,
      riskFieldKm: `${estRadius.toFixed(1)} KM EST.`,
      facilityName: matchPriority?.industrial_facility,
    });
  };

  // Sync when selectedHotspot prop changes from parent
  useEffect(() => {
    if (selectedHotspot) {
      handleHotspotClick(selectedHotspot);
    }
  }, [selectedHotspot]);

  // Automated 6-8s SIH Demo Pipeline Sequence (Requirement 20)
  const runDemoPipeline = () => {
    if (isDemoRunning) return;
    setIsDemoRunning(true);

    // STEP 1: Global View & Orbit Patrol (0.0s)
    controlsRef.current?.flyToGlobal();
    observationConeRef.current?.setTargetGroundPos(null);

    // STEP 2: Satellite Approaches India & Detects Pass (1.8s)
    setTimeout(() => {
      controlsRef.current?.flyToIndia();
    }, 1800);

    // STEP 3: Lock Highest Value Thermal Anomaly & Fly-To Ground (3.6s)
    setTimeout(() => {
      const bestTarget =
        [...hotspots].sort((a, b) => (b.frp || 0) - (a.frp || 0))[0] || {
          observation_id: 'sih_demo_target_01',
          latitude: 16.31,
          longitude: 80.42,
          frp: 88.5,
          brightness: 358.4,
          confidence: 'nominal',
          acquired_at: new Date().toISOString(),
          satellite: 'NOAA-21',
          instrument: 'VIIRS',
          source: 'NASA FIRMS',
        };

      handleHotspotClick(bestTarget);
    }, 3600);

    // STEP 4: Conclude Demo Sequence (7.2s)
    setTimeout(() => {
      setIsDemoRunning(false);
    }, 7200);
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

        {/* ACTIVE TARGET TELEMETRY ENRICHMENT (Requirement 16) */}
        {activeTargetTelemetry && (
          <div className="hud-target-block">
            <div className="target-block-header">
              <span className="target-dot" />
              <span>ACTIVE OBSERVATION TARGET</span>
            </div>
            <div className="target-grid">
              <div className="target-item">
                <span className="target-label">COORDINATES</span>
                <span className="target-val font-mono">{activeTargetTelemetry.targetCoords}</span>
              </div>
              <div className="target-item">
                <span className="target-label">THERMAL SIGNAL</span>
                <span className="target-val text-orange">{activeTargetTelemetry.signal}</span>
              </div>
              <div className="target-item">
                <span className="target-label">PERSISTENCE</span>
                <span className="target-val text-cyan">{activeTargetTelemetry.persistence}</span>
              </div>
              <div className="target-item">
                <span className="target-label">AI CLASSIFICATION</span>
                <span className="target-val text-emerald">{activeTargetTelemetry.classification}</span>
              </div>
              <div className="target-item">
                <span className="target-label">RISK SCORE</span>
                <span className="target-val text-red font-mono">{activeTargetTelemetry.riskScore}</span>
              </div>
              <div className="target-item">
                <span className="target-label">AI RISK FIELD</span>
                <span className="target-val text-amber font-mono">{activeTargetTelemetry.riskFieldKm}</span>
              </div>
            </div>
            {activeTargetTelemetry.facilityName && (
              <div className="target-facility-row">
                <span className="facility-icon">🏭</span>
                <span className="facility-name">{activeTargetTelemetry.facilityName}</span>
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
