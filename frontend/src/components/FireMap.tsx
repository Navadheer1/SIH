import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, useMap } from 'react-leaflet';
import {
  Hotspot,
  OsmFeature,
  PersistentCluster,
  ThermalAlert,
  ThreatZonesResponse,
  ExposedAsset,
} from '../types/hotspot';

interface FireMapProps {
  viewMode?: 'hotspots' | 'clusters';
  hotspots?: Hotspot[];
  clusters?: PersistentCluster[];
  activeAlerts?: ThermalAlert[];
  center?: [number, number];
  mapCenter?: [number, number];
  zoom?: number;
  mapZoom?: number;
  selectedHotspot?: Hotspot | null;
  onSelectHotspot?: (hotspot: Hotspot) => void;
  selectedCluster?: PersistentCluster | null;
  onSelectCluster?: (cluster: PersistentCluster) => void;
  selectedAlert?: ThermalAlert | null;
  onSelectAlert?: (alert: ThermalAlert) => void;
  nearbyFeatures?: OsmFeature[];
  threatZones?: ThreatZonesResponse | null;
  exposedAssets?: ExposedAsset[];
  onSelectAsset?: (asset: ExposedAsset) => void;
}

const MapViewController: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
};

export const FireMap: React.FC<FireMapProps> = ({
  viewMode = 'hotspots',
  hotspots = [],
  clusters = [],
  activeAlerts = [],
  center,
  mapCenter,
  zoom,
  mapZoom,
  selectedHotspot = null,
  onSelectHotspot = () => {},
  selectedCluster = null,
  onSelectCluster = () => {},
  selectedAlert = null,
  onSelectAlert = () => {},
  nearbyFeatures: _nearbyFeatures = [],
  threatZones = null,
  exposedAssets = [],
  onSelectAsset,
}) => {
  const effectiveCenter: [number, number] = center || mapCenter || [20.5937, 78.9629];
  const effectiveZoom: number = zoom || mapZoom || 5;
  // Layer Toggles
  const [showThreatZones, setShowThreatZones] = useState<boolean>(true);
  const [showCriticalAssets, setShowCriticalAssets] = useState<boolean>(true);
  const [showIndustrial, setShowIndustrial] = useState<boolean>(true);
  const [showHealthcare, setShowHealthcare] = useState<boolean>(true);
  const [showTransport, setShowTransport] = useState<boolean>(true);
  const [showEducation, setShowEducation] = useState<boolean>(true);
  const [showLegend, setShowLegend] = useState<boolean>(true);

  const getSeverity = (frp: number): 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' => {
    if (frp >= 50) return 'CRITICAL';
    if (frp >= 25) return 'HIGH';
    if (frp >= 10) return 'MODERATE';
    return 'LOW';
  };

  const getSeverityColor = (sev: string): string => {
    switch (sev) {
      case 'CRITICAL': return '#ef4444';
      case 'HIGH': return '#f97316';
      case 'MODERATE': return '#eab308';
      case 'LOW': return '#22c55e';
      default: return '#3b82f6';
    }
  };

  const getAssetColor = (cat: string): string => {
    switch (cat) {
      case 'HEALTHCARE': return '#ec4899'; // Pink
      case 'EDUCATION': return '#8b5cf6';  // Purple
      case 'INDUSTRIAL': return '#f59e0b'; // Amber
      case 'UTILITIES': return '#eab308';  // Yellow
      case 'TRANSPORT': return '#06b6d4';  // Cyan
      case 'SETTLEMENTS': return '#10b981';// Green
      default: return '#3b82f6';
    }
  };

  const getAssetIcon = (category: string): string => {
    switch (category) {
      case 'INDUSTRIAL': return '🏭';
      case 'HEALTHCARE': return '🏥';
      case 'EDUCATION': return '🎓';
      case 'TRANSPORT': return '🚆';
      case 'UTILITIES': return '⚡';
      case 'PUBLIC': return '🏛️';
      case 'SETTLEMENTS': return '🏘️';
      default: return '📍';
    }
  };

  // Selected Coordinates for Threat Zone Overlay
  const selectedLat = selectedAlert?.latitude ?? selectedHotspot?.latitude ?? selectedCluster?.center_latitude;
  const selectedLon = selectedAlert?.longitude ?? selectedHotspot?.longitude ?? selectedCluster?.center_longitude;

  const filteredAssets = exposedAssets.filter((asset) => {
    if (!showCriticalAssets && (asset.category === 'HEALTHCARE' || asset.category === 'INDUSTRIAL' || asset.category === 'UTILITIES')) return false;
    if (!showIndustrial && asset.category === 'INDUSTRIAL') return false;
    if (!showHealthcare && asset.category === 'HEALTHCARE') return false;
    if (!showTransport && asset.category === 'TRANSPORT') return false;
    if (!showEducation && asset.category === 'EDUCATION') return false;
    return true;
  });

  return (
    <div className="map-wrapper" style={{ position: 'relative' }}>
      {/* MAP LAYER CONTROLS FLOATING BAR */}
      <div className="map-layer-toggles-bar">
        <span className="layer-bar-title">MAP LAYERS:</span>
        <button
          type="button"
          className={`layer-toggle-btn ${showThreatZones ? 'active' : ''}`}
          onClick={() => setShowThreatZones(!showThreatZones)}
        >
          🎯 Threat Zones
        </button>
        <button
          type="button"
          className={`layer-toggle-btn ${showCriticalAssets ? 'active' : ''}`}
          onClick={() => setShowCriticalAssets(!showCriticalAssets)}
        >
          ⚡ Critical Assets
        </button>
        <button
          type="button"
          className={`layer-toggle-btn ${showIndustrial ? 'active' : ''}`}
          onClick={() => setShowIndustrial(!showIndustrial)}
        >
          🏭 Industrial
        </button>
        <button
          type="button"
          className={`layer-toggle-btn ${showHealthcare ? 'active' : ''}`}
          onClick={() => setShowHealthcare(!showHealthcare)}
        >
          🏥 Healthcare
        </button>
        <button
          type="button"
          className={`layer-toggle-btn ${showTransport ? 'active' : ''}`}
          onClick={() => setShowTransport(!showTransport)}
        >
          🛣️ Transport
        </button>
        <button
          type="button"
          className={`layer-toggle-btn ${showEducation ? 'active' : ''}`}
          onClick={() => setShowEducation(!showEducation)}
        >
          🎓 Education
        </button>
        <button
          type="button"
          className={`layer-toggle-btn ${showLegend ? 'active' : ''}`}
          onClick={() => setShowLegend(!showLegend)}
          style={{ marginLeft: 'auto', background: showLegend ? '#1e3a8a' : '#1f2937', color: '#ffffff' }}
        >
          📖 {showLegend ? 'Hide Legend' : 'Show Legend'}
        </button>
      </div>

      <MapContainer
        center={effectiveCenter}
        zoom={effectiveZoom}
        scrollWheelZoom={true}
        className="leaflet-container"
      >
        <MapViewController center={effectiveCenter} zoom={effectiveZoom} />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Satellite: NASA FIRMS / Sentinel-2'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* DYNAMIC THREAT ZONE OVERLAYS (Phase 2 & Phase 6H) */}
        {showThreatZones && threatZones && selectedLat && selectedLon && (
          <>
            {/* High Hazard Zone (Phase 6H or Legacy Inner) */}
            {((threatZones as any).high_hazard_zone || (threatZones as any).zones?.inner_zone) && (
              <Circle
                center={[selectedLat, selectedLon]}
                radius={
                  (threatZones as any).high_hazard_zone
                    ? (threatZones as any).high_hazard_zone.radius_meters
                    : ((threatZones as any).zones.inner_zone.radius_km || 0.3) * 1000
                }
                pathOptions={{
                  color: '#ef4444',
                  fillColor: '#ef4444',
                  fillOpacity: 0.22,
                  weight: 2,
                  dashArray: '6 6',
                }}
              >
                <Popup>
                  <strong>HIGH HAZARD ZONE (RED)</strong><br />
                  Radius: {(threatZones as any).high_hazard_zone?.radius_meters || 300} m<br />
                  {(threatZones as any).high_hazard_zone?.description || 'Immediate high-intensity combustion perimeter.'}
                </Popup>
              </Circle>
            )}

            {/* Moderate Hazard Zone (Phase 6H or Legacy Secondary) */}
            {((threatZones as any).moderate_hazard_zone || (threatZones as any).zones?.secondary_zone) && (
              <Circle
                center={[selectedLat, selectedLon]}
                radius={
                  (threatZones as any).moderate_hazard_zone
                    ? (threatZones as any).moderate_hazard_zone.radius_meters
                    : ((threatZones as any).zones.secondary_zone.radius_km || 0.8) * 1000
                }
                pathOptions={{
                  color: '#f97316',
                  fillColor: '#f97316',
                  fillOpacity: 0.14,
                  weight: 1.5,
                  dashArray: '4 4',
                }}
              >
                <Popup>
                  <strong>MODERATE HAZARD ZONE (ORANGE)</strong><br />
                  Radius: {(threatZones as any).moderate_hazard_zone?.radius_meters || 800} m<br />
                  {(threatZones as any).moderate_hazard_zone?.description || 'Secondary thermal radiation & heavy smoke plume corridor.'}
                </Popup>
              </Circle>
            )}

            {/* Precautionary Zone (Phase 6H or Legacy Monitoring) */}
            {((threatZones as any).precautionary_zone || (threatZones as any).zones?.monitoring_zone) && (
              <Circle
                center={[selectedLat, selectedLon]}
                radius={
                  (threatZones as any).precautionary_zone
                    ? (threatZones as any).precautionary_zone.radius_meters
                    : ((threatZones as any).zones.monitoring_zone.radius_km || 1.85) * 1000
                }
                pathOptions={{
                  color: '#eab308',
                  fillColor: '#eab308',
                  fillOpacity: 0.08,
                  weight: 1,
                  dashArray: '3 3',
                }}
              >
                <Popup>
                  <strong>PRECAUTIONARY BUFFER ZONE (YELLOW)</strong><br />
                  Radius: {(threatZones as any).precautionary_zone?.radius_meters || 1850} m<br />
                  {(threatZones as any).precautionary_zone?.description || 'Extended atmospheric dispersion & perimeter staging corridor.'}
                </Popup>
              </Circle>
            )}
          </>
        )}

        {/* EXPOSED ASSET MARKERS (Phase 2) */}
        {filteredAssets.map((asset, aIdx) => (
          <CircleMarker
            key={`asset-${asset.asset_name}-${aIdx}`}
            center={[asset.latitude, asset.longitude]}
            radius={8}
            eventHandlers={{
              click: () => onSelectAsset && onSelectAsset(asset),
            }}
            pathOptions={{
              color: '#ffffff',
              fillColor: getAssetColor(asset.category),
              fillOpacity: 0.9,
              weight: 2,
            }}
          >
            <Popup className="custom-popup">
              <div className="popup-container">
                <div className="popup-header" style={{ color: getAssetColor(asset.category) }}>
                  {getAssetIcon(asset.category)} {asset.asset_name}
                </div>
                <div className="popup-body">
                  <div className="popup-row">
                    <span className="popup-label">Category:</span>
                    <span className="popup-val">{asset.category}</span>
                  </div>
                  <div className="popup-row">
                    <span className="popup-label">Distance:</span>
                    <span className="popup-val highlight-frp">{asset.distance_km.toFixed(2)} km</span>
                  </div>
                  <div className="popup-row">
                    <span className="popup-label">Threat Zone:</span>
                    <span className="popup-val">{asset.threat_zone}</span>
                  </div>
                  <div className="popup-row">
                    <span className="popup-label">Exposure Status:</span>
                    <span className="popup-val" style={{ color: '#38bdf8' }}>{asset.status}</span>
                  </div>
                  {onSelectAsset && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{ marginTop: '0.5rem', width: '100%' }}
                      onClick={() => onSelectAsset(asset)}
                    >
                      🔍 Inspect Asset Details
                    </button>
                  )}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* ACTIVE ALERTS MARKERS OVERLAY */}
        {activeAlerts.map((alt) => {
          const isSelected = selectedAlert && selectedAlert.alert_id === alt.alert_id;
          const color = alt.risk_level === 'CRITICAL' ? '#ef4444' : '#f97316';
          const radius = isSelected ? 22 : 16;

          return (
            <CircleMarker
              key={`alert-${alt.alert_id}`}
              center={[alt.latitude, alt.longitude]}
              radius={radius}
              eventHandlers={{
                click: () => onSelectAlert(alt),
              }}
              pathOptions={{
                color: '#ffffff',
                fillColor: color,
                fillOpacity: 0.95,
                weight: isSelected ? 4 : 2.5,
              }}
            >
              <Popup className="custom-popup">
                <div className="popup-container">
                  <div className="popup-header" style={{ color: color }}>
                    🚨 ACTIVE INCIDENT ALERT ({alt.alert_id})
                  </div>
                  <div className="popup-body">
                    <div className="popup-row">
                      <span className="popup-label">Risk Priority:</span>
                      <span className="popup-val highlight-frp">{alt.risk_score} / 100 ({alt.risk_level})</span>
                    </div>
                    {alt.impact_score !== undefined && (
                      <div className="popup-row">
                        <span className="popup-label">Impact Score:</span>
                        <span className="popup-val highlight-frp">{alt.impact_score} / 100 ({alt.priority_index || 'P1'})</span>
                      </div>
                    )}
                    <div className="popup-row">
                      <span className="popup-label">Classification:</span>
                      <span className="popup-val">{alt.classification.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="popup-row">
                      <span className="popup-label">Status:</span>
                      <span className="popup-val">{alt.status}</span>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ marginTop: '0.5rem', width: '100%' }}
                      onClick={() => onSelectAlert(alt)}
                    >
                      ⚡ Open Incident & Impact Intelligence
                    </button>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* MODE 1: Single Hotspots View with Severity Levels */}
        {viewMode === 'hotspots' &&
          hotspots.map((spot, index) => {
            const severity = getSeverity(spot.frp);
            const color = getSeverityColor(severity);
            const isSelected =
              selectedHotspot &&
              selectedHotspot.latitude === spot.latitude &&
              selectedHotspot.longitude === spot.longitude;

            let baseRadius = 5;
            if (severity === 'CRITICAL') baseRadius = 11;
            else if (severity === 'HIGH') baseRadius = 8;
            else if (severity === 'MODERATE') baseRadius = 6;

            const radius = isSelected ? baseRadius + 7 : baseRadius;

            return (
              <CircleMarker
                key={`spot-${spot.latitude}-${spot.longitude}-${index}`}
                center={[spot.latitude, spot.longitude]}
                radius={radius}
                eventHandlers={{
                  click: () => onSelectHotspot(spot),
                }}
                pathOptions={{
                  color: isSelected ? '#ffffff' : color,
                  fillColor: color,
                  fillOpacity: isSelected ? 1.0 : (severity === 'CRITICAL' ? 0.95 : 0.8),
                  weight: isSelected ? 3.5 : (severity === 'CRITICAL' ? 2.5 : 1.5),
                }}
              >
                <Popup className="custom-popup">
                  <div className="popup-container">
                    <div className="popup-header" style={{ color }}>
                      🔥 THERMAL ANOMALY ({severity})
                    </div>
                    <div className="popup-body">
                      <div className="popup-row">
                        <span className="popup-label">Severity Level:</span>
                        <span className="popup-val highlight-frp">{severity}</span>
                      </div>
                      <div className="popup-row">
                        <span className="popup-label">Radiative Power:</span>
                        <span className="popup-val highlight-frp">{spot.frp.toFixed(1)} MW</span>
                      </div>
                      <div className="popup-row">
                        <span className="popup-label">Coordinates:</span>
                        <span className="popup-val">{spot.latitude.toFixed(3)}°N, {spot.longitude.toFixed(3)}°E</span>
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ marginTop: '0.6rem', width: '100%' }}
                        onClick={() => onSelectHotspot(spot)}
                      >
                        ⚡ Open Incident & Impact Intelligence
                      </button>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

        {/* MODE 2: Persistent Thermal Clusters View */}
        {viewMode === 'clusters' &&
          clusters.map((cluster, index) => {
            const isSelected =
              selectedCluster && selectedCluster.cluster_id === cluster.cluster_id;
            const radius = isSelected ? 20 : 12;

            return (
              <CircleMarker
                key={`cluster-${cluster.cluster_id}-${index}`}
                center={[cluster.center_latitude, cluster.center_longitude]}
                radius={radius}
                eventHandlers={{
                  click: () => onSelectCluster(cluster),
                }}
                pathOptions={{
                  color: isSelected ? '#ffffff' : '#ef4444',
                  fillColor: '#ef4444',
                  fillOpacity: isSelected ? 0.95 : 0.8,
                  weight: isSelected ? 3.5 : 2,
                }}
              >
                <Popup className="custom-popup">
                  <div className="popup-container">
                    <div className="popup-header">📡 PERSISTENT CLUSTER</div>
                    <div className="popup-body">
                      <div className="popup-row">
                        <span className="popup-label">Cluster ID:</span>
                        <span className="popup-val">{cluster.cluster_id}</span>
                      </div>
                      <div className="popup-row">
                        <span className="popup-label">Detections:</span>
                        <span className="popup-val">{cluster.observation_count} observations</span>
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ marginTop: '0.5rem', width: '100%' }}
                        onClick={() => onSelectCluster(cluster)}
                      >
                        ⚡ Open Incident & Impact Intelligence
                      </button>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
      </MapContainer>

      {/* FLOATING MAP LEGEND (Phase 6J Hardening) */}
      {showLegend && (
        <div className="map-legend-panel">
          <div className="legend-header">
            <span className="legend-title">🗺️ EOC MAP LEGEND</span>
            <button
              type="button"
              className="legend-close-btn"
              onClick={() => setShowLegend(false)}
              title="Close Legend"
            >
              ×
            </button>
          </div>
          <div className="legend-content">
            <div className="legend-section">
              <div className="legend-subtitle">THERMAL SEVERITY</div>
              <div className="legend-item"><span className="legend-dot" style={{ backgroundColor: '#ef4444' }}></span> Critical (&ge;50 MW)</div>
              <div className="legend-item"><span className="legend-dot" style={{ backgroundColor: '#f97316' }}></span> High (&ge;25 MW)</div>
              <div className="legend-item"><span className="legend-dot" style={{ backgroundColor: '#eab308' }}></span> Moderate (&ge;10 MW)</div>
              <div className="legend-item"><span className="legend-ring"></span> Selected Incident</div>
            </div>

            <div className="legend-section">
              <div className="legend-subtitle">SIMULATED THREAT ZONES</div>
              <div className="legend-item"><span className="legend-dash" style={{ borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.22)' }}></span> High Hazard (300m)</div>
              <div className="legend-item"><span className="legend-dash" style={{ borderColor: '#f97316', backgroundColor: 'rgba(249, 115, 22, 0.14)' }}></span> Moderate Hazard (800m)</div>
              <div className="legend-item"><span className="legend-dash" style={{ borderColor: '#eab308', backgroundColor: 'rgba(234, 179, 8, 0.08)' }}></span> Precautionary (1850m)</div>
            </div>

            <div className="legend-section">
              <div className="legend-subtitle">CRITICAL INFRASTRUCTURE</div>
              <div className="legend-item"><span className="legend-icon">🏭</span> Industrial / Fuel Depot</div>
              <div className="legend-item"><span className="legend-icon">⚡</span> Power Substation</div>
              <div className="legend-item"><span className="legend-icon">🏥</span> Hospital / Healthcare</div>
            </div>

            <div className="legend-disclaimer">
              ⚠️ Threat zones are simulation estimates — NOT official evacuation orders.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
