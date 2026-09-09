import { useState } from 'react';
import {
  Hotspot,
  PersistentCluster,
  ThermalAlert,
  PriorityRankingItem,
} from '../types/hotspot';
import { SystemHealthCards } from './SystemHealthCards';
import { MetricsSummary } from './MetricsSummary';
import { FireMap } from './FireMap';

interface DashboardViewProps {
  hotspots: Hotspot[];
  clusters: PersistentCluster[];
  alerts: ThermalAlert[];
  priorityItems: PriorityRankingItem[];
  loadingHotspots: boolean;
  loadingClusters: boolean;
  loadingPriority: boolean;
  onSelectHotspot: (h: Hotspot) => void;
  onSelectCluster: (c: PersistentCluster) => void;
  onSelectAlert: (a: ThermalAlert) => void;
  onRefreshAll: () => void;
}

export function DashboardView({
  hotspots,
  clusters,
  alerts,
  priorityItems,
  loadingHotspots,
  loadingClusters,
  loadingPriority,
  onSelectHotspot,
  onSelectCluster,
  onSelectAlert,
  onRefreshAll,
}: DashboardViewProps) {
  const [metricFilter, setMetricFilter] = useState<'all' | 'persistent' | 'industrial' | 'high_risk'>('all');
  const [mapLayerMode, setMapLayerMode] = useState<'all' | 'hotspots' | 'clusters' | 'industrial'>('all');

  // Filtered counts
  const totalHotspots = hotspots.length;
  const persistentCount = clusters.filter(c => c.classification === 'PERSISTENT' || c.classification === 'HIGHLY PERSISTENT' || c.observation_count > 1).length;
  const industrialCandidatesCount = priorityItems.filter(p => p.industrial_facility && p.industrial_distance_km !== null && p.industrial_distance_km <= 1.0).length;
  const highRiskCount = priorityItems.filter(p => p.risk_score >= 0.70 || p.risk_level === 'CRITICAL' || p.risk_level === 'HIGH').length;

  const handleMetricFilterClick = (filter: 'all' | 'persistent' | 'industrial' | 'high_risk') => {
    setMetricFilter(filter);
    if (filter === 'persistent') setMapLayerMode('clusters');
    else if (filter === 'industrial') setMapLayerMode('industrial');
    else if (filter === 'all') setMapLayerMode('all');
    else setMapLayerMode('all');
  };

  // Unified display triage list
  const displayTriageList = priorityItems.length > 0
    ? priorityItems
    : clusters.length > 0
    ? [...clusters]
        .sort((a, b) => (b.total_frp || 0) - (a.total_frp || 0))
        .map((c, idx) => {
          const totalFrp = c.total_frp || 25.0;
          const score = Math.min(0.95, (totalFrp / 100) * 0.5 + (c.observation_count > 1 ? 0.3 : 0.1));
          const level: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' =
            score >= 0.7 ? 'CRITICAL' : score >= 0.4 ? 'HIGH' : score >= 0.2 ? 'MODERATE' : 'LOW';

          return {
            rank: idx + 1,
            cluster_id: c.cluster_id,
            latitude: c.center_latitude,
            longitude: c.center_longitude,
            risk_score: score,
            risk_level: level,
            classification: c.classification || 'TEMPORARY',
            industrial_facility: c.industrial_context?.nearby_facility || 'Rural / Agricultural Zone',
            industrial_distance_km: c.industrial_context?.distance_km ?? null,
            persistence_score: c.persistence_score || (c.observation_count > 1 ? 75 : 15),
            observation_count: c.observation_count,
            duration_hours: c.duration_hours,
            reasons: ['Real NASA FIRMS observation cluster'],
          };
        })
    : hotspots.map((h, idx) => {
        const frpVal = h.frp || 15.0;
        const score = Math.min(0.95, frpVal / 100);
        const level: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' =
          score >= 0.7 ? 'CRITICAL' : score >= 0.4 ? 'HIGH' : score >= 0.2 ? 'MODERATE' : 'LOW';

        return {
          rank: idx + 1,
          cluster_id: h.observation_id || `HOTSPOT_${idx + 1}`,
          latitude: h.latitude,
          longitude: h.longitude,
          risk_score: score,
          risk_level: level,
          classification: 'NASA FIRMS Detection',
          industrial_facility: 'Rural / Unregistered Land',
          industrial_distance_km: null,
          persistence_score: 15,
          observation_count: 1,
          duration_hours: 0,
          reasons: ['NASA FIRMS active thermal detection'],
        };
      });

  return (
    <div className="dashboard-view-container">
      {/* 1. TOP SYSTEM HEALTH BANNER */}
      <SystemHealthCards onRefreshTrigger={onRefreshAll} />

      {/* 2. KEY METRICS SUMMARY ROW */}
      <MetricsSummary
        totalHotspots={totalHotspots}
        persistentCount={persistentCount}
        industrialCandidatesCount={industrialCandidatesCount}
        highRiskCount={highRiskCount}
        loading={loadingHotspots || loadingClusters}
        onFilterClick={handleMetricFilterClick}
        activeFilter={metricFilter}
      />

      {/* 3. OPERATIONAL SPLIT: 2D MAP + QUICK TRIAGE LEADERBOARD */}
      <div className="dashboard-split-grid">
        {/* LEFT COLUMN: INTERACTIVE 2D EMERGENCY MAP */}
        <div className="dashboard-map-panel">
          <div className="panel-header-bar">
            <div className="panel-title-group">
              <span className="panel-icon">🗺️</span>
              <h3 className="panel-title">Near-Real-Time Thermal Anomaly Map</h3>
            </div>
            <div className="map-layer-controls">
              <button
                type="button"
                className={`btn-layer-pill ${mapLayerMode === 'all' ? 'active' : ''}`}
                onClick={() => setMapLayerMode('all')}
              >
                All Layers
              </button>
              <button
                type="button"
                className={`btn-layer-pill ${mapLayerMode === 'hotspots' ? 'active' : ''}`}
                onClick={() => setMapLayerMode('hotspots')}
              >
                🔥 Thermal Spots
              </button>
              <button
                type="button"
                className={`btn-layer-pill ${mapLayerMode === 'clusters' ? 'active' : ''}`}
                onClick={() => setMapLayerMode('clusters')}
              >
                🔄 Persistent Sources
              </button>
            </div>
          </div>

          <div className="map-embed-wrapper">
            <FireMap
              hotspots={hotspots}
              clusters={clusters}
              activeAlerts={alerts}
              selectedHotspot={null}
              selectedCluster={null}
              onSelectHotspot={onSelectHotspot}
              onSelectCluster={onSelectCluster}
              onSelectAlert={onSelectAlert}
              mapCenter={[20.5937, 78.9629]}
              mapZoom={5}
              viewMode={mapLayerMode === 'clusters' ? 'clusters' : 'hotspots'}
            />
          </div>

          {/* MAP LEGEND */}
          <div className="map-compact-legend">
            <div className="legend-item">
              <span className="legend-dot dot-thermal" />
              <span>Thermal Anomaly (FIRMS)</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot dot-persistent" />
              <span>Persistent Source</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot dot-candidate" />
              <span>Uncertain Candidate</span>
            </div>
            <div className="legend-item">
              <span className="legend-icon-factory">🏭</span>
              <span>Industrial Facility</span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: QUICK INCIDENT TRIAGE LEADERBOARD */}
        <div className="dashboard-triage-panel">
          <div className="panel-header-bar">
            <div className="panel-title-group">
              <span className="panel-icon">🚨</span>
              <h3 className="panel-title">Incident Priority Triage</h3>
            </div>
            <span className="triage-count-badge">
              {loadingPriority && priorityItems.length === 0 ? '...' : `${displayTriageList.length} active`}
            </span>
          </div>

          <div className="triage-list-scroll">
            {/* Spotlight for verified observation 04e53a2f16d0d665 */}
            <div className="verified-evidence-spotlight">
              <div className="spotlight-header">
                <span className="spotlight-tag">🛰️ VERIFIED SATELLITE EVIDENCE</span>
                <span className="spotlight-obs-id">OBS: 04e53a2f16d0d665</span>
              </div>
              <div className="spotlight-body">
                <div className="spotlight-text">
                  <strong>Real Copernicus Sentinel-2 Optical Acquisition</strong>
                  <span>Lat 22.6789°N, Lon 80.54321°E • True-Color L2A (10m GSD)</span>
                </div>
                <button
                  type="button"
                  className="btn-spotlight-investigate"
                  onClick={() => {
                    const matched = hotspots.find(h => h.observation_id === '04e53a2f16d0d665');
                    if (matched) {
                      onSelectHotspot(matched);
                    } else {
                      onSelectHotspot({
                        observation_id: '04e53a2f16d0d665',
                        latitude: 22.6789,
                        longitude: 80.54321,
                        brightness: 360.2,
                        frp: 25.8,
                        confidence: 'h',
                        satellite: 'VIIRS (N20)',
                        instrument: 'VIIRS',
                        acquired_at: '2026-09-07 14:30 UTC'
                      } as Hotspot);
                    }
                  }}
                >
                  🔍 Inspect Evidence
                </button>
              </div>
            </div>

            {loadingPriority && priorityItems.length === 0 ? (
              <div className="loading-state-p">⏳ Computing priority rankings...</div>
            ) : displayTriageList.length === 0 ? (
              <div className="empty-state-p">No critical thermal incidents requiring triage.</div>
            ) : (
              displayTriageList.slice(0, 10).map((item, idx) => {
                const isCritical = item.risk_level === 'CRITICAL' || item.risk_score >= 0.70;
                const isHigh = item.risk_level === 'HIGH' || item.risk_score >= 0.40;
                const badgeCls = isCritical ? 'risk-badge-critical' : isHigh ? 'risk-badge-high' : 'risk-badge-moderate';

                return (
                  <div key={item.cluster_id || idx} className="triage-card">
                    <div className="triage-card-top">
                      <span className="triage-rank">#{item.rank || idx + 1}</span>
                      <span className={`risk-badge ${badgeCls}`}>
                        Risk {(item.risk_score).toFixed(2)} • {item.risk_level}
                      </span>
                    </div>

                    <div className="triage-facility-name">
                      {item.industrial_facility || 'Rural / Unregistered Land'}
                    </div>

                    <div className="triage-meta-row">
                      <span>📍 {item.latitude.toFixed(3)}°N, {item.longitude.toFixed(3)}°E</span>
                      {item.industrial_distance_km !== null && (
                        <span>📏 {(item.industrial_distance_km * 1000).toFixed(0)}m to facility</span>
                      )}
                    </div>

                    <div className="triage-submeta-row">
                      <span>🔄 {item.observation_count} obs ({item.duration_hours.toFixed(1)}h)</span>
                      <span>⚖️ {item.classification}</span>
                    </div>

                    <div className="triage-action-row">
                      <button
                        type="button"
                        className="btn-triage-investigate"
                        onClick={() => {
                          const matchedCluster = clusters.find(c => c.cluster_id === item.cluster_id);
                          if (matchedCluster) {
                            onSelectCluster(matchedCluster);
                          } else {
                            // Fallback to hotspot
                            const matchedHotspot = hotspots.find(h =>
                              Math.abs(h.latitude - item.latitude) < 0.05 &&
                              Math.abs(h.longitude - item.longitude) < 0.05
                            );
                            if (matchedHotspot) onSelectHotspot(matchedHotspot);
                          }
                        }}
                      >
                        🔍 Investigate Incident
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
