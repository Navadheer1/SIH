import { useEffect, useState, useCallback } from 'react';
import { FireMap } from './components/FireMap';
import { FilterBar } from './components/FilterBar';
import { TopBar } from './components/TopBar';
import { Sidebar, SidebarNavView } from './components/Sidebar';
import { IncidentIntelligencePanel } from './components/IncidentIntelligencePanel';
import { SystemPipelinePanel } from './components/SystemPipelinePanel';
import { ImpactAnalysisView } from './components/ImpactAnalysisView';
import { ResponseOperationsView } from './components/ResponseOperationsView';
import { AnalyticsView } from './components/AnalyticsView';
import { SettingsView } from './components/SettingsView';
import { PriorityTable } from './components/PriorityTable';
import { AlertStats } from './components/AlertStats';
import { AlertDashboard } from './components/AlertDashboard';
import { AlertHistory } from './components/AlertHistory';
import { InvestigationWorkspace } from './components/InvestigationWorkspace';
import { AssetDetailModal } from './components/AssetDetailModal';
import { Threat3DView } from './components/Threat3DView';
import { SpreadTimeline } from './components/SpreadTimeline';
import { WhatIfSimulator } from './components/WhatIfSimulator';
import { ScenarioComparisonModal } from './components/ScenarioComparisonModal';
import { ThreatModeToggle } from './components/ThreatModeToggle';
import {
  Hotspot,
  HotspotsApiResponse,
  HotspotContextResponse,
  PersistentCluster,
  PersistentClustersApiResponse,
  PriorityRankingItem,
  ThermalAlert,
  AlertStats as AlertStatsType,
  AuthorityRole,
  SystemPipelineEvent,
  ThreatZonesResponse,
  ExposedAsset,
  ImpactAssessmentResponse,
  PriorityIncidentItem,
  TimeHorizonKey,
  SpreadProjectionResponse,
  FutureImpactForecastResponse,
  SimulationResultResponse,
} from './types/hotspot';

export function App() {
  const [region, setRegion] = useState<string>('india');
  const [customBbox, setCustomBbox] = useState<string>('');
  const [viewMode, setViewMode] = useState<'hotspots' | 'clusters'>('hotspots');
  const [sidebarView, setSidebarView] = useState<SidebarNavView>('command_center');
  const [authorityRole, setAuthorityRole] = useState<AuthorityRole>('SEOC_DIRECTOR');

  // Phase 3 Map Viewport & Timeline Horizon State
  const [mapMode, setMapMode] = useState<'2D' | '3D'>('2D');
  const [timeHorizon, setTimeHorizon] = useState<TimeHorizonKey>('NOW');
  const [spreadProjection, setSpreadProjection] = useState<SpreadProjectionResponse | null>(null);
  const [futureForecast, setFutureForecast] = useState<FutureImpactForecastResponse | null>(null);
  const [simulationResult, setSimulationResult] = useState<SimulationResultResponse | null>(null);
  const [showWhatIfDrawer, setShowWhatIfDrawer] = useState<boolean>(false);
  const [showComparisonModal, setShowComparisonModal] = useState<boolean>(false);
  const [_loadingSpread, setLoadingSpread] = useState<boolean>(false);
  const [loadingSimulation, setLoadingSimulation] = useState<boolean>(false);

  // Single Hotspots State
  const [hotspotsData, setHotspotsData] = useState<HotspotsApiResponse | null>(null);
  const [loadingHotspots, setLoadingHotspots] = useState<boolean>(false);
  const [hotspotsError, setHotspotsError] = useState<string | null>(null);
  const [selectedHotspot, setSelectedHotspot] = useState<Hotspot | null>(null);

  // Persistent Clusters State
  const [clustersData, setClustersData] = useState<PersistentClustersApiResponse | null>(null);
  const [loadingClusters, setLoadingClusters] = useState<boolean>(false);
  const [selectedCluster, setSelectedCluster] = useState<PersistentCluster | null>(null);

  // Priority Ranking State
  const [priorityItems, setPriorityItems] = useState<PriorityRankingItem[]>([]);
  const [loadingPriority, setLoadingPriority] = useState<boolean>(false);

  // Phase 2 Dynamic Priority Leaderboard State
  const [phase2PriorityItems, setPhase2PriorityItems] = useState<PriorityIncidentItem[]>([]);
  const [loadingPhase2Priority, setLoadingPhase2Priority] = useState<boolean>(false);

  // Phase 2 Impact Assessment & Threat Zones State
  const [threatZones, setThreatZones] = useState<ThreatZonesResponse | null>(null);
  const [exposedAssets, setExposedAssets] = useState<ExposedAsset[]>([]);
  const [impactAssessment, setImpactAssessment] = useState<ImpactAssessmentResponse | null>(null);
  const [selectedAssetForModal, setSelectedAssetForModal] = useState<ExposedAsset | null>(null);

  // Alert State
  const [alerts, setAlerts] = useState<ThermalAlert[]>([]);
  const [alertStats, setAlertStats] = useState<AlertStatsType | null>(null);
  const [loadingAlerts, setLoadingAlerts] = useState<boolean>(false);
  const [selectedAlert, setSelectedAlert] = useState<ThermalAlert | null>(null);

  // OSM Context State
  const [contextData, setContextData] = useState<HotspotContextResponse | null>(null);
  const [_loadingContext, setLoadingContext] = useState<boolean>(false);
  const [_contextError, setContextError] = useState<string | null>(null);

  // Full Multi-Modal Investigation Workspace Modal State
  const [showFullWorkspace, setShowFullWorkspace] = useState<boolean>(false);
  const [investigationEvent, setInvestigationEvent] = useState<{
    alert?: ThermalAlert | null;
    hotspot?: Hotspot | null;
    cluster?: PersistentCluster | null;
  } | null>(null);

  // System Pipeline Activity Events (Real Stream)
  const [lastUpdated, setLastUpdated] = useState<string>(new Date().toUTCString().slice(17, 25) + ' UTC');
  const [pipelineEvents, setPipelineEvents] = useState<SystemPipelineEvent[]>([
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString(),
      stage: 'PLATFORM_BOOT',
      description: 'EOC Disaster Intelligence Platform initialized. Ingestion engine standing by.',
      type: 'info',
    },
  ]);

  const addPipelineEvent = useCallback((stage: string, description: string, type: 'info' | 'success' | 'warning' | 'alert' = 'info') => {
    const newEvent: SystemPipelineEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toLocaleTimeString(),
      stage,
      description,
      type,
    };
    setPipelineEvents((prev) => [newEvent, ...prev.slice(0, 19)]);
  }, []);

  // Map viewport state
  const [mapCenter, setMapCenter] = useState<[number, number]>([20.5937, 78.9629]); // India center
  const [mapZoom, setMapZoom] = useState<number>(5);

  // Fetch FIRMS Hotspots
  const loadHotspots = useCallback(async (selectedRegion: string, bboxStr: string) => {
    setLoadingHotspots(true);
    setHotspotsError(null);
    try {
      let url = `http://127.0.0.1:8000/api/hotspots?region=${selectedRegion}`;
      if (selectedRegion === 'custom' && bboxStr) {
        url += `&bbox=${encodeURIComponent(bboxStr)}`;
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
      const data: HotspotsApiResponse = await response.json();
      setHotspotsData(data);
      setLastUpdated(new Date().toUTCString().slice(17, 25) + ' UTC');

      addPipelineEvent(
        'NASA_FIRMS_INGEST',
        `Synchronized ${data.count} thermal anomalies for region '${data.region}' via NASA FIRMS orbit feed.`,
        'success'
      );

      if (data.hotspots.length > 0 && selectedRegion === 'andhra_pradesh') {
        setMapCenter([15.9129, 79.74]);
        setMapZoom(7);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to connect to backend';
      setHotspotsError(message);
      addPipelineEvent('FIRMS_ERROR', `Failed to retrieve NASA FIRMS telemetry: ${message}`, 'warning');
    } finally {
      setLoadingHotspots(false);
    }
  }, [addPipelineEvent]);

  // Fetch Persistent Clusters
  const loadClusters = useCallback(async (selectedRegion: string, bboxStr: string) => {
    setLoadingClusters(true);
    try {
      let url = `http://127.0.0.1:8000/api/persistent-hotspots?region=${selectedRegion}`;
      if (selectedRegion === 'custom' && bboxStr) {
        url += `&bbox=${encodeURIComponent(bboxStr)}`;
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
      const data: PersistentClustersApiResponse = await response.json();
      setClustersData(data);

      addPipelineEvent(
        'SPATIAL_CLUSTERING',
        `Clustering analysis completed: identified ${data.persistent_cluster_count} persistent thermal clusters.`,
        'info'
      );
    } catch {
      // Background catch
    } finally {
      setLoadingClusters(false);
    }
  }, [addPipelineEvent]);

  // Fetch Impact Intelligence (Phase 2)
  const fetchImpactData = async (lat: number, lon: number, frp: number, persistenceScore: number = 0, riskScore?: number) => {
    try {
      let url = `http://127.0.0.1:8000/api/incidents/impact?lat=${lat}&lon=${lon}&frp=${frp}&persistence_score=${persistenceScore}`;
      if (riskScore !== undefined) {
        url += `&risk_score=${riskScore}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setThreatZones(data.threat_zones || null);
        setExposedAssets(data.exposed_assets || []);
        setImpactAssessment(data.impact_assessment || null);
      }
    } catch {
      // Background impact fetch catch
    }
  };

  // Fetch Fire Spread Intelligence & Future Forecast (Phase 3)
  const fetchSpreadAndForecastData = async (lat: number, lon: number, frp: number, persistenceScore: number = 0, riskScore?: number) => {
    setLoadingSpread(true);
    try {
      let spreadUrl = `http://127.0.0.1:8000/api/incidents/spread?lat=${lat}&lon=${lon}&frp=${frp}&persistence_score=${persistenceScore}`;
      let forecastUrl = `http://127.0.0.1:8000/api/incidents/future-impact?lat=${lat}&lon=${lon}&frp=${frp}&persistence_score=${persistenceScore}`;
      if (riskScore !== undefined) {
        spreadUrl += `&risk_score=${riskScore}`;
        forecastUrl += `&risk_score=${riskScore}`;
      }
      const [sRes, fRes] = await Promise.all([
        fetch(spreadUrl),
        fetch(forecastUrl),
      ]);
      if (sRes.ok) setSpreadProjection(await sRes.json());
      if (fRes.ok) setFutureForecast(await fRes.json());
    } catch {
      // Background spread fetch catch
    } finally {
      setLoadingSpread(false);
    }
  };

  // Run What-If Scenario Simulation (Phase 3)
  const handleRunSimulation = async (params: { sim_wind_speed?: number; sim_wind_direction?: number; sim_frp?: number; sim_persistence?: number }) => {
    const lat = selectedAlert?.latitude ?? selectedHotspot?.latitude ?? selectedCluster?.center_latitude ?? 20.5937;
    const lon = selectedAlert?.longitude ?? selectedHotspot?.longitude ?? selectedCluster?.center_longitude ?? 78.9629;
    const frp = selectedAlert?.frp ?? selectedHotspot?.frp ?? selectedCluster?.total_frp ?? 30.0;
    const persistence = selectedAlert?.persistence_score ?? selectedCluster?.persistence_score ?? 0;
    const risk = selectedAlert?.risk_score ?? 50.0;

    setLoadingSimulation(true);
    try {
      let url = `http://127.0.0.1:8000/api/incidents/simulate?lat=${lat}&lon=${lon}&live_frp=${frp}&live_persistence_score=${persistence}&live_risk_score=${risk}`;
      if (params.sim_wind_speed !== undefined) url += `&sim_wind_speed=${params.sim_wind_speed}`;
      if (params.sim_wind_direction !== undefined) url += `&sim_wind_direction=${params.sim_wind_direction}`;
      if (params.sim_frp !== undefined) url += `&sim_frp=${params.sim_frp}`;
      if (params.sim_persistence !== undefined) url += `&sim_persistence=${params.sim_persistence}`;

      const res = await fetch(url, { method: 'POST' });
      if (res.ok) {
        const data: SimulationResultResponse = await res.json();
        setSimulationResult(data);
        setShowComparisonModal(true);
        addPipelineEvent('WHATIF_SIMULATION', 'What-If scenario simulation executed. Results compared against live conditions in 3D.', 'info');
      }
    } catch {
      // Simulation failure
    } finally {
      setLoadingSimulation(false);
    }
  };

  // Fetch Priority Ranking Leaderboard
  const loadPriorityRanking = useCallback(async (selectedRegion: string) => {
    setLoadingPriority(true);
    setLoadingPhase2Priority(true);
    try {
      const url = `http://127.0.0.1:8000/api/hotspots/priority-ranking?region=${selectedRegion}&limit=10`;
      const response = await fetch(url);
      if (response.ok) {
        const json = await response.json();
        setPriorityItems(json.priority_events || []);
      }

      const p2Url = `http://127.0.0.1:8000/api/incidents/priority?region=${selectedRegion}&limit=15`;
      const p2Response = await fetch(p2Url);
      if (p2Response.ok) {
        const p2Json = await p2Response.json();
        setPhase2PriorityItems(p2Json.priority_incidents || []);
      }
    } catch {
      // Background priority loading catch
    } finally {
      setLoadingPriority(false);
      setLoadingPhase2Priority(false);
    }
  }, []);

  // Fetch & Evaluate Alerts
  const loadAlertsAndStats = useCallback(async (selectedRegion: string) => {
    setLoadingAlerts(true);
    try {
      // Step 1: Trigger background evaluation
      await fetch(`http://127.0.0.1:8000/api/alerts/evaluate?region=${selectedRegion}`, { method: 'POST' });

      // Step 2: Fetch all alerts & stats
      const [alertsRes, statsRes] = await Promise.all([
        fetch(`http://127.0.0.1:8000/api/alerts?limit=100`),
        fetch(`http://127.0.0.1:8000/api/alerts/stats`),
      ]);

      if (alertsRes.ok && statsRes.ok) {
        const alertsJson = await alertsRes.json();
        const statsJson = await statsRes.json();
        const fetchedAlerts: ThermalAlert[] = alertsJson.alerts || [];
        setAlerts(fetchedAlerts);
        setAlertStats(statsJson);

        const criticalCount = fetchedAlerts.filter((a) => a.risk_level === 'CRITICAL').length;
        addPipelineEvent(
          'INCIDENT_EVALUATION',
          `Incident triage completed: ${fetchedAlerts.length} incidents logged (${criticalCount} critical alerts active).`,
          criticalCount > 0 ? 'alert' : 'info'
        );
      }
    } catch {
      // Background alert catch
    } finally {
      setLoadingAlerts(false);
    }
  }, [addPipelineEvent]);

  // Initial Load & Filter Changes
  useEffect(() => {
    loadHotspots(region, customBbox);
    loadClusters(region, customBbox);
    loadPriorityRanking(region);
    loadAlertsAndStats(region);
  }, [region, customBbox, loadHotspots, loadClusters, loadPriorityRanking, loadAlertsAndStats]);

  // Handle Alert Status Change Action
  const handleAlertStatusChange = async (
    alertId: string,
    action: 'acknowledge' | 'investigate' | 'resolve' | 'dismiss',
    notes?: string
  ) => {
    try {
      let url = `http://127.0.0.1:8000/api/alerts/${alertId}/${action}`;
      if (notes) {
        url += `?notes=${encodeURIComponent(notes)}`;
      }
      const res = await fetch(url, { method: 'POST' });
      if (res.ok) {
        const updatedAlert: ThermalAlert = await res.json();
        setAlerts((prev) => prev.map((a) => (a.alert_id === alertId ? updatedAlert : a)));
        if (selectedAlert && selectedAlert.alert_id === alertId) {
          setSelectedAlert(updatedAlert);
        }
        if (investigationEvent && investigationEvent.alert?.alert_id === alertId) {
          setInvestigationEvent({ ...investigationEvent, alert: updatedAlert });
        }

        addPipelineEvent(
          'AUTHORITY_ACTION',
          `Incident ${alertId} transitioned via '${action.toUpperCase()}' by authority officer.`,
          'success'
        );

        // Refresh stats
        const statsRes = await fetch(`http://127.0.0.1:8000/api/alerts/stats`);
        if (statsRes.ok) {
          setAlertStats(await statsRes.json());
        }
      }
    } catch {
      // Handle alert action failure
    }
  };

  // Handle Hotspot Click
  const handleSelectHotspot = async (hotspot: Hotspot) => {
    setSelectedHotspot(hotspot);
    setSelectedCluster(null);
    setSelectedAlert(null);
    setInvestigationEvent({ hotspot });
    setContextData(null);
    setContextError(null);
    setLoadingContext(true);
    setThreatZones(null);
    setExposedAssets([]);
    setImpactAssessment(null);
    setMapCenter([hotspot.latitude, hotspot.longitude]);
    setMapZoom(11);

    addPipelineEvent(
      'ANOMALY_SELECTED',
      `Inspecting anomaly at ${hotspot.latitude.toFixed(3)}°N, ${hotspot.longitude.toFixed(3)}°E (FRP: ${hotspot.frp} MW).`,
      'info'
    );

    fetchImpactData(hotspot.latitude, hotspot.longitude, hotspot.frp, 0);
    fetchSpreadAndForecastData(hotspot.latitude, hotspot.longitude, hotspot.frp, 0);

    try {
      const url = `http://127.0.0.1:8000/api/hotspots/context?lat=${hotspot.latitude}&lon=${hotspot.longitude}&radius_km=5.0`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
      const data: HotspotContextResponse = await response.json();
      setContextData(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to retrieve OSM context';
      setContextError(message);
    } finally {
      setLoadingContext(false);
    }
  };

  // Handle Cluster Click
  const handleSelectCluster = (cluster: PersistentCluster) => {
    setSelectedCluster(cluster);
    setSelectedHotspot(null);
    setSelectedAlert(null);
    setInvestigationEvent({ cluster });
    setContextData(null);
    setThreatZones(null);
    setExposedAssets([]);
    setImpactAssessment(null);
    setMapCenter([cluster.center_latitude, cluster.center_longitude]);
    setMapZoom(12);

    addPipelineEvent(
      'CLUSTER_SELECTED',
      `Inspecting persistent cluster #${cluster.cluster_id} (Score: ${cluster.persistence_score}/100).`,
      'info'
    );

    fetchImpactData(cluster.center_latitude, cluster.center_longitude, cluster.total_frp || 0, cluster.persistence_score);
    fetchSpreadAndForecastData(cluster.center_latitude, cluster.center_longitude, cluster.total_frp || 0, cluster.persistence_score);
  };

  // Handle Alert Click
  const handleSelectAlert = (alertItem: ThermalAlert) => {
    setSelectedAlert(alertItem);
    setSelectedHotspot(null);
    setSelectedCluster(null);
    setInvestigationEvent({ alert: alertItem });
    setContextData(null);
    setThreatZones(null);
    setExposedAssets([]);
    setImpactAssessment(null);
    setMapCenter([alertItem.latitude, alertItem.longitude]);
    addPipelineEvent(
      'INCIDENT_SELECTED',
      `Viewing incident alert ${alertItem.alert_id} (${alertItem.risk_level} • Risk: ${alertItem.risk_score}/100).`,
      'alert'
    );

    fetchImpactData(alertItem.latitude, alertItem.longitude, alertItem.frp || 0, alertItem.persistence_score || 50, alertItem.risk_score);
    fetchSpreadAndForecastData(alertItem.latitude, alertItem.longitude, alertItem.frp || 0, alertItem.persistence_score || 50, alertItem.risk_score);
  };

  // Handle Priority Table Click
  const handleSelectPriorityEvent = (item: PriorityRankingItem) => {
    setViewMode('clusters');
    setMapCenter([item.latitude, item.longitude]);
    setMapZoom(12);

    if (clustersData) {
      const targetCluster = clustersData.clusters.find((c) => c.cluster_id === item.cluster_id);
      if (targetCluster) {
        setSelectedCluster(targetCluster);
        setSelectedHotspot(null);
        setInvestigationEvent({ cluster: targetCluster });
      }
    }
  };

  // SIH Demo Investigation Launcher
  const handleDemoInvestigation = async () => {
    let targetAlert = alerts.find((a) => a.risk_level === 'CRITICAL' || a.risk_score >= 60) || alerts[0];

    if (!targetAlert) {
      try {
        const res = await fetch('http://127.0.0.1:8000/api/alerts?limit=10');
        if (res.ok) {
          const json = await res.json();
          const fetchedAlerts: ThermalAlert[] = json.alerts || [];
          if (fetchedAlerts.length > 0) {
            targetAlert = fetchedAlerts.find((a) => a.risk_level === 'CRITICAL' || a.risk_score >= 60) || fetchedAlerts[0];
            setAlerts(fetchedAlerts);
          }
        }
      } catch {
        // Fallback to cluster
      }
    }

    if (targetAlert) {
      setSelectedAlert(targetAlert);
      setSelectedHotspot(null);
      setSelectedCluster(null);
      setInvestigationEvent({ alert: targetAlert });
      setMapCenter([targetAlert.latitude, targetAlert.longitude]);
      setMapZoom(12);
      setSidebarView('command_center');
      addPipelineEvent(
        'DEMO_DISPATCH',
        `Demo investigation launched for critical incident ${targetAlert.alert_id}.`,
        'alert'
      );
      return;
    }

    if (clustersData && clustersData.clusters.length > 0) {
      const targetCluster = [...clustersData.clusters].sort((a, b) => b.persistence_score - a.persistence_score)[0];
      setSelectedCluster(targetCluster);
      setSelectedAlert(null);
      setSelectedHotspot(null);
      setInvestigationEvent({ cluster: targetCluster });
      setMapCenter([targetCluster.center_latitude, targetCluster.center_longitude]);
      setMapZoom(12);
      setSidebarView('command_center');
      return;
    }

    if (hotspotsData && hotspotsData.hotspots.length > 0) {
      const targetSpot = [...hotspotsData.hotspots].sort((a, b) => b.frp - a.frp)[0];
      setSelectedHotspot(targetSpot);
      setSelectedAlert(null);
      setSelectedCluster(null);
      setInvestigationEvent({ hotspot: targetSpot });
      setMapCenter([targetSpot.latitude, targetSpot.longitude]);
      setMapZoom(12);
      setSidebarView('command_center');
      return;
    }
  };

  const handleRefresh = () => {
    loadHotspots(region, customBbox);
    loadClusters(region, customBbox);
    loadPriorityRanking(region);
    loadAlertsAndStats(region);
  };

  const activeCriticalAlerts = alerts.filter(
    (a) => (a.risk_level === 'CRITICAL' || a.risk_score >= 70) && (a.status === 'NEW' || a.status === 'ACKNOWLEDGED' || a.status === 'INVESTIGATING')
  );

  const activeUnresolvedAlerts = alerts.filter(
    (a) => a.status === 'NEW' || a.status === 'ACKNOWLEDGED' || a.status === 'INVESTIGATING'
  );

  const resolvedAlerts = alerts.filter((a) => a.status === 'RESOLVED' || a.status === 'DISMISSED');

  const isAnyItemSelected = Boolean(selectedHotspot || selectedCluster || selectedAlert);

  return (
    <div className="eoc-app-container">
      {/* 1. TOP BAR */}
      <TopBar
        lastUpdated={lastUpdated}
        backendOnline={!hotspotsError}
        activeCriticalAlertsCount={activeCriticalAlerts.length}
        currentRole={authorityRole}
        onRoleChange={setAuthorityRole}
        onLaunchDemo={handleDemoInvestigation}
      />

      {/* 2. BODY LAYOUT: SIDEBAR + MAIN STAGE */}
      <div className="eoc-body-layout">
        {/* Left Operational Sidebar */}
        <Sidebar
          activeView={sidebarView}
          onViewChange={setSidebarView}
          activeIncidentsCount={activeUnresolvedAlerts.length}
          hotspotsCount={hotspotsData?.count || 0}
          criticalAlertsCount={activeCriticalAlerts.length}
          resolvedIncidentsCount={resolvedAlerts.length}
        />

        {/* Main Operational Viewport */}
        <main className="eoc-main-stage">
          {/* VIEW 1: COMMAND CENTER (Default EOC Dashboard) */}
          {sidebarView === 'command_center' && (
            <div className="command-center-layout">
              {/* Alert Stats KPI Bar */}
              <AlertStats stats={alertStats} loading={loadingAlerts} />

              {/* Filter & Telemetry Controls */}
              <FilterBar
                viewMode={viewMode}
                onViewModeChange={(mode) => {
                  setViewMode(mode);
                  setSelectedHotspot(null);
                  setSelectedCluster(null);
                }}
                region={region}
                onRegionChange={setRegion}
                customBbox={customBbox}
                onCustomBboxChange={setCustomBbox}
                onApplyCustomBbox={handleRefresh}
                onRefresh={handleRefresh}
                loading={loadingHotspots || loadingClusters}
                count={viewMode === 'hotspots' ? (hotspotsData?.count || 0) : (clustersData?.persistent_cluster_count || 0)}
              />

              {/* Viewport Mode Switcher: 2D MAP vs 3D THREAT VIEW */}
              <ThreatModeToggle mode={mapMode} onModeChange={setMapMode} />

              {/* Map / 3D Stage + Intelligence Split Layout */}
              <div className="map-and-intel-split">
                <div className={`map-container-frame ${isAnyItemSelected ? 'intel-open' : 'intel-closed'}`}>
                  {mapMode === '2D' ? (
                    <FireMap
                      viewMode={viewMode}
                      hotspots={hotspotsData?.hotspots || []}
                      clusters={clustersData?.clusters || []}
                      activeAlerts={activeUnresolvedAlerts}
                      center={mapCenter}
                      zoom={mapZoom}
                      selectedHotspot={selectedHotspot}
                      onSelectHotspot={handleSelectHotspot}
                      selectedCluster={selectedCluster}
                      onSelectCluster={handleSelectCluster}
                      selectedAlert={selectedAlert}
                      onSelectAlert={handleSelectAlert}
                      nearbyFeatures={contextData?.nearby_features || []}
                      threatZones={threatZones}
                      exposedAssets={exposedAssets}
                      onSelectAsset={(asset) => setSelectedAssetForModal(asset)}
                    />
                  ) : (
                    <Threat3DView
                      latitude={selectedAlert?.latitude ?? selectedHotspot?.latitude ?? selectedCluster?.center_latitude ?? mapCenter[0]}
                      longitude={selectedAlert?.longitude ?? selectedHotspot?.longitude ?? selectedCluster?.center_longitude ?? mapCenter[1]}
                      frp={selectedAlert?.frp ?? selectedHotspot?.frp ?? selectedCluster?.total_frp ?? 35.0}
                      spreadProjection={spreadProjection}
                      timeHorizon={timeHorizon}
                      exposedAssets={exposedAssets}
                      onSelectAsset={(asset) => setSelectedAssetForModal(asset)}
                      isSimulation={Boolean(simulationResult)}
                    />
                  )}

                  {/* Time Horizon Progression Timeline Bar */}
                  <SpreadTimeline
                    currentHorizon={timeHorizon}
                    onHorizonChange={setTimeHorizon}
                    confidenceScore={spreadProjection?.projections?.[timeHorizon]?.confidence_score}
                    confidenceLevel={spreadProjection?.projections?.[timeHorizon]?.confidence_level}
                    projectedAreaSqkm={spreadProjection?.projections?.[timeHorizon]?.projected_area_sqkm}
                  />
                </div>

                {/* Incident Intelligence Panel (Opens when any item is selected) */}
                {isAnyItemSelected && (
                  <IncidentIntelligencePanel
                    hotspot={selectedHotspot}
                    cluster={selectedCluster}
                    alert={selectedAlert}
                    contextData={contextData}
                    impactAssessment={impactAssessment}
                    threatZones={threatZones}
                    exposedAssets={exposedAssets}
                    spreadProjection={spreadProjection}
                    futureForecast={futureForecast}
                    onClose={() => {
                      setSelectedHotspot(null);
                      setSelectedCluster(null);
                      setSelectedAlert(null);
                      setThreatZones(null);
                      setExposedAssets([]);
                      setImpactAssessment(null);
                      setSpreadProjection(null);
                      setFutureForecast(null);
                    }}
                    onStatusChange={handleAlertStatusChange}
                    onOpenFullInvestigation={() => setShowFullWorkspace(true)}
                    onSelectAsset={(asset) => setSelectedAssetForModal(asset)}
                    onOpen3DView={() => setMapMode('3D')}
                    onOpenWhatIf={() => setShowWhatIfDrawer(true)}
                  />
                )}
              </div>

              {/* Bottom Operational Intelligence Dock: Active Queue + Real Pipeline Log */}
              <div className="bottom-intelligence-dock">
                <div className="dock-left-queue">
                  <div className="dock-section-header">
                    <span className="dock-icon">🚨</span>
                    <h4>Active Emergency Incident Triage Queue ({activeUnresolvedAlerts.length})</h4>
                  </div>
                  <AlertDashboard
                    alerts={activeUnresolvedAlerts}
                    loading={loadingAlerts}
                    onSelectAlert={handleSelectAlert}
                    onStatusChange={handleAlertStatusChange}
                  />
                </div>

                <div className="dock-right-pipeline">
                  <SystemPipelinePanel
                    events={pipelineEvents}
                    hotspotCount={hotspotsData?.count || 0}
                    alertCount={activeUnresolvedAlerts.length}
                    onRefreshPipeline={handleRefresh}
                  />
                </div>
              </div>
            </div>
          )}

          {/* VIEW 2: LIVE INCIDENTS */}
          {sidebarView === 'live_incidents' && (
            <div className="subview-wrapper">
              <AlertStats stats={alertStats} loading={loadingAlerts} />
              <div className="subview-header">
                <h2>🚨 Live Incident Triage & Operational Queue</h2>
                <p>Real-time thermal alerts categorized by risk severity and operational lifecycle state.</p>
              </div>
              <AlertDashboard
                alerts={activeUnresolvedAlerts}
                loading={loadingAlerts}
                onSelectAlert={(a) => {
                  handleSelectAlert(a);
                  setSidebarView('command_center');
                }}
                onStatusChange={handleAlertStatusChange}
              />
            </div>
          )}

          {/* VIEW 3: HOTSPOT INTELLIGENCE */}
          {sidebarView === 'hotspot_intelligence' && (
            <div className="subview-wrapper">
              <div className="subview-header">
                <h2>🛰️ Raw NASA FIRMS Hotspots & Persistent Clusters</h2>
                <p>Direct satellite radiometry from VIIRS and MODIS orbital passes with temporal clustering metrics.</p>
              </div>
              <PriorityTable
                items={priorityItems}
                loading={loadingPriority}
                onSelectEvent={(item) => {
                  handleSelectPriorityEvent(item);
                  setSidebarView('command_center');
                }}
              />
            </div>
          )}

          {/* VIEW 4: IMPACT ANALYSIS */}
          {sidebarView === 'impact_analysis' && (
            <div className="subview-wrapper">
              <ImpactAnalysisView
                alerts={alerts}
                priorityItems={phase2PriorityItems}
                loadingPriority={loadingPhase2Priority}
                onSelectAlert={(a) => {
                  handleSelectAlert(a);
                  setSidebarView('command_center');
                }}
                onSelectPriorityIncident={(item) => {
                  setViewMode('clusters');
                  setMapCenter([item.latitude, item.longitude]);
                  setMapZoom(12);
                  fetchImpactData(item.latitude, item.longitude, item.frp, 50, item.risk_score);
                  setSidebarView('command_center');
                }}
              />
            </div>
          )}

          {/* VIEW 5: ALERTS */}
          {sidebarView === 'alerts' && (
            <div className="subview-wrapper">
              <div className="subview-header">
                <h2>🚨 Emergency Operations Alert Center</h2>
                <p>Internal authority alerting queue with multi-level operational verification.</p>
              </div>
              <AlertDashboard
                alerts={alerts}
                loading={loadingAlerts}
                onSelectAlert={(a) => {
                  handleSelectAlert(a);
                  setSidebarView('command_center');
                }}
                onStatusChange={handleAlertStatusChange}
              />
            </div>
          )}

          {/* VIEW 6: RESPONSE OPERATIONS */}
          {sidebarView === 'response_operations' && (
            <div className="subview-wrapper">
              <ResponseOperationsView />
            </div>
          )}

          {/* VIEW 7: INCIDENT HISTORY */}
          {sidebarView === 'incident_history' && (
            <div className="subview-wrapper">
              <div className="subview-header">
                <h2>📜 Incident Audit History & Operational Closures</h2>
                <p>Permanent record of verified, resolved, and dismissed thermal incidents with closure notes.</p>
              </div>
              <AlertHistory
                alerts={alerts}
                loading={loadingAlerts}
                onSelectAlert={(a: ThermalAlert) => {
                  handleSelectAlert(a);
                  setSidebarView('command_center');
                }}
              />
            </div>
          )}

          {/* VIEW 8: ANALYTICS */}
          {sidebarView === 'analytics' && (
            <div className="subview-wrapper">
              <AnalyticsView
                hotspots={hotspotsData?.hotspots || []}
                alerts={alerts}
              />
            </div>
          )}

          {/* VIEW 9: SETTINGS */}
          {sidebarView === 'settings' && (
            <div className="subview-wrapper">
              <SettingsView
                region={region}
                onRegionChange={setRegion}
                customBbox={customBbox}
                onCustomBboxChange={setCustomBbox}
                onApplyCustomBbox={handleRefresh}
                onRefresh={handleRefresh}
              />
            </div>
          )}
        </main>
      </div>

      {/* FULL MULTI-MODAL INVESTIGATION WORKSPACE MODAL */}
      {showFullWorkspace && investigationEvent && (
        <div className="investigation-workspace-modal-overlay">
          <InvestigationWorkspace
            alert={investigationEvent.alert}
            hotspot={investigationEvent.hotspot}
            cluster={investigationEvent.cluster}
            onStatusChange={handleAlertStatusChange}
            onClose={() => setShowFullWorkspace(false)}
          />
        </div>
      )}

      {/* PHASE 2 ASSET DETAIL MODAL DRAWER */}
      {selectedAssetForModal && (
        <AssetDetailModal
          asset={selectedAssetForModal}
          onClose={() => setSelectedAssetForModal(null)}
        />
      )}

      {/* PHASE 3 WHAT-IF SIMULATOR DRAWER */}
      {showWhatIfDrawer && (
        <div className="whatif-drawer-modal-overlay">
          <div className="whatif-drawer-content">
            <button type="button" className="btn-close-drawer" onClick={() => setShowWhatIfDrawer(false)}>
              ✕ CLOSE SIMULATOR
            </button>
            <WhatIfSimulator
              liveWindSpeed={spreadProjection?.wind_data?.wind_speed_kmh}
              liveWindDirection={spreadProjection?.wind_data?.wind_direction_deg}
              liveFrp={selectedAlert?.frp ?? selectedHotspot?.frp ?? selectedCluster?.total_frp ?? 35.0}
              livePersistence={selectedAlert?.persistence_score ?? selectedCluster?.persistence_score ?? 50.0}
              onRunSimulation={handleRunSimulation}
              onResetSimulation={() => {
                setSimulationResult(null);
                setShowComparisonModal(false);
              }}
              loading={loadingSimulation}
              simulationResult={simulationResult}
            />
          </div>
        </div>
      )}

      {/* PHASE 3 SCENARIO COMPARISON MODAL */}
      {showComparisonModal && simulationResult && (
        <ScenarioComparisonModal
          simulationResult={simulationResult}
          onClose={() => setShowComparisonModal(false)}
        />
      )}

      {/* Footer */}
      <footer className="eoc-footer">
        <div className="footer-left">
          <span>SIH Problem Statement 26162</span>
          <span className="divider">•</span>
          <span>Disaster Management Authority & Emergency Operations Center</span>
        </div>
        <div className="footer-right">
          <span>Sensors: NASA FIRMS (VIIRS/MODIS) • OpenStreetMap • Sentinel-2 L2A</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
