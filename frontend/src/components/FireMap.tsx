import {
  faBolt,
  faBookOpen,
  faFire,
  faHospital,
  faIndustry,
  faMagnifyingGlass,
  faMap,
  faSatellite,
  faTriangleExclamation,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Circle, Polyline, Popup, useMap } from 'react-leaflet';
import {
  Hotspot,
  OsmFeature,
  PersistentCluster,
  ThermalAlert,
  ThreatZonesResponse,
  ExposedAsset,
  PriorityRankingItem,
} from '../types/hotspot';
import { filterThermalPointsInsideIndia, isPointInsideIndia } from '../utils/geoUtils';

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
  selectedPriorityIncident?: PriorityRankingItem | null;
  onSelectPriorityIncident?: (incident: PriorityRankingItem) => void;
  nearbyFeatures?: OsmFeature[];
  threatZones?: ThreatZonesResponse | null;
  exposedAssets?: ExposedAsset[];
  onSelectAsset?: (asset: ExposedAsset) => void;
  basemap?: 'standard' | 'satellite';
  onBasemapChange?: (mode: 'standard' | 'satellite') => void;
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
  selectedPriorityIncident = null,
  onSelectPriorityIncident: _onSelectPriorityIncident,
  nearbyFeatures: _nearbyFeatures = [],
  threatZones = null,
  exposedAssets = [],
  onSelectAsset,
  basemap = 'standard',
  onBasemapChange,
}) => {
  const effectiveCenter: [number, number] = center || mapCenter || [20.5937, 78.9629];
  const effectiveZoom: number = zoom || mapZoom || 5;

  // Filter thermal hotspots strictly within India's boundary polygon
  const indiaHotspots = React.useMemo(() => {
    return filterThermalPointsInsideIndia(hotspots);
  }, [hotspots]);

  // Filter persistent clusters with center coordinates inside India
  const indiaClusters = React.useMemo(() => {
    return clusters.filter((c) => c && isPointInsideIndia(c.center_latitude, c.center_longitude));
  }, [clusters]);

  // Filter active alerts with coordinates inside India
  const indiaAlerts = React.useMemo(() => {
    return activeAlerts.filter((a) => a && isPointInsideIndia(a.latitude, a.longitude));
  }, [activeAlerts]);

  // Basemap Switcher State (Standard vs Satellite)
  const [internalBasemap, setInternalBasemap] = useState<'standard' | 'satellite'>(basemap);
  const activeBasemap = basemap || internalBasemap;

  const handleBasemapToggle = (mode: 'standard' | 'satellite') => {
    setInternalBasemap(mode);
    if (onBasemapChange) {
      onBasemapChange(mode);
    }
  };

  const mapboxToken = (import.meta as any).env?.VITE_MAPBOX_ACCESS_TOKEN || '';

  // Layer Toggles
  const [showThreatZones] = useState<boolean>(true);
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
      case 'INDUSTRIAL': return 'Industrial';
      case 'HEALTHCARE': return 'Healthcare';
      case 'EDUCATION': return 'Education';
      case 'TRANSPORT': return 'Transport';
      case 'UTILITIES': return 'Utilities';
      case 'PUBLIC': return 'Public';
      case 'SETTLEMENTS': return 'Settlements';
      default: return 'Asset';
    }
  };

  // Selected Coordinates for Threat Zone & 5 KM Threat Radius Overlay
  const selectedLat = selectedPriorityIncident?.latitude ?? selectedAlert?.latitude ?? selectedHotspot?.latitude ?? selectedCluster?.center_latitude;
  const selectedLon = selectedPriorityIncident?.longitude ?? selectedAlert?.longitude ?? selectedHotspot?.longitude ?? selectedCluster?.center_longitude;

  // Real 5 KM nearby features from Priority Incident or direct prop
  const activeNearbyFeatures: OsmFeature[] = (selectedPriorityIncident?.nearby_features || _nearbyFeatures || []).filter(
    (f) => f.distance_km <= 5.0 && f.latitude && f.longitude
  );
  const closestAsset = selectedPriorityIncident?.closest_critical_asset || (activeNearbyFeatures.length > 0 ? activeNearbyFeatures[0] : null);

  const filteredAssets = exposedAssets;

  return (
    <div className="map-wrapper" style={{ position: 'relative' }}>
      {/* MAP LAYER & BASEMAP CONTROLS FLOATING BAR */}
      <div className="map-layer-toggles-bar">
        {/* BASEMAP SWITCHER */}
        <div className="basemap-switch-controls" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <span className="layer-bar-title" style={{ fontWeight: 700, fontSize: '11px', color: '#334155' }}>BASEMAP:</span>
          <button
            type="button"
            className={`layer-toggle-btn ${activeBasemap === 'standard' ? 'active' : ''}`}
            onClick={() => handleBasemapToggle('standard')}
            title="Switch to Standard Street Basemap"
          >
            <FontAwesomeIcon icon={faMap} /> STANDARD
          </button>
          <button
            type="button"
            className={`layer-toggle-btn ${activeBasemap === 'satellite' ? 'active' : ''}`}
            onClick={() => handleBasemapToggle('satellite')}
            title="Switch to Mapbox / Satellite Imagery"
          >
            <FontAwesomeIcon icon={faSatellite} /> SATELLITE
          </button>
        </div>

        <button
          type="button"
          className={`layer-toggle-btn ${showLegend ? 'active' : ''}`}
          onClick={() => setShowLegend(!showLegend)}
          style={{ marginLeft: 'auto' }}
        >
          <FontAwesomeIcon icon={faBookOpen} /> {showLegend ? 'Hide Legend' : 'Show Legend'}
        </button>
      </div>

      <MapContainer
        center={effectiveCenter}
        zoom={effectiveZoom}
        scrollWheelZoom={true}
        className="leaflet-container"
      >
        <MapViewController center={effectiveCenter} zoom={effectiveZoom} />

        {/* DYNAMIC BASEMAP TILE LAYER */}
        {activeBasemap === 'standard' ? (
          <TileLayer
            key="standard-basemap"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        ) : (
          <>
            <TileLayer
              key="satellite-basemap"
              attribution='Tiles &copy; Esri, Mapbox &mdash; DigitalGlobe, GeoEye, Earthstar Geographics'
              url={
                mapboxToken
                  ? `https://api.mapbox.com/styles/v1/mapbox/standard-satellite/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`
                  : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
              }
              maxZoom={19}
            />
            {!mapboxToken && (
              <TileLayer
                key="satellite-reference-labels"
                attribution='&copy; Esri Reference'
                url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
              />
            )}
          </>
        )}

        {/* 5 KM OPERATIONAL THREAT RADIUS BUFFER (Green dashed ring) */}
        {selectedLat && selectedLon && (
          <Circle
            center={[selectedLat, selectedLon]}
            radius={5000}
            pathOptions={{
              color: '#059669',
              fillColor: '#10b981',
              fillOpacity: 0.04,
              weight: 1.5,
              dashArray: '5 5',
            }}
          >
            <Popup>
              <div style={{ padding: '4px', minWidth: '180px' }}>
                <strong style={{ color: '#059669', fontSize: '13px' }}>5.0 KM Threat Exposure Buffer</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#475569' }}>
                  Maximum operational analysis radius for critical infrastructure proximity evaluation.
                </p>
                {activeNearbyFeatures.length > 0 && (
                  <div style={{ marginTop: '6px', fontSize: '11px', fontWeight: 600, color: '#0f172a' }}>
                    {activeNearbyFeatures.length} verified infrastructure assets detected.
                  </div>
                )}
              </div>
            </Popup>
          </Circle>
        )}

        {/* 5 KM NEARBY INFRASTRUCTURE MARKERS & PROXIMITY VECTORS */}
        {activeNearbyFeatures.map((feat, fIdx) => {
          const isClosest = closestAsset && (closestAsset.osm_id === feat.osm_id || closestAsset.name === feat.name);
          const featColor = getAssetColor(feat.category);

          return (
            <React.Fragment key={`osm-feat-${feat.osm_id || fIdx}`}>
              <CircleMarker
                center={[feat.latitude, feat.longitude]}
                radius={isClosest ? 8 : 6}
                pathOptions={{
                  color: isClosest ? '#ef4444' : '#ffffff',
                  fillColor: featColor,
                  fillOpacity: 0.9,
                  weight: isClosest ? 2.5 : 1.5,
                }}
              >
                <Popup>
                  <div style={{ padding: '4px', minWidth: '190px' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: featColor }}>
                      {feat.name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      {feat.type} • {feat.category}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '6px', color: '#0f172a' }}>
                      Distance: <span style={{ color: '#dc2626' }}>{feat.distance_km.toFixed(2)} km</span> from hotspot
                    </div>
                    {isClosest && (
                      <div style={{ marginTop: '4px', fontSize: '11px', color: '#b91c1c', fontWeight: 700 }}>
                        Closest Critical Facility
                      </div>
                    )}
                    <div style={{ marginTop: '6px', fontSize: '10px', color: '#94a3b8' }}>
                      Source: OpenStreetMap Ground Truth
                    </div>
                  </div>
                </Popup>
              </CircleMarker>

              {/* Proximity threat vectors: Dashed connection line from hotspot to critical asset */}
              {isClosest && selectedLat && selectedLon && (
                <Polyline
                  positions={[[selectedLat, selectedLon], [feat.latitude, feat.longitude]]}
                  pathOptions={{
                    color: '#ef4444',
                    weight: 2,
                    dashArray: '4 4',
                  }}
                />
              )}
            </React.Fragment>
          );
        })}

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
                      <FontAwesomeIcon icon={faMagnifyingGlass} /> Inspect Asset Details
                    </button>
                  )}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* ACTIVE ALERTS MARKERS OVERLAY */}
        {indiaAlerts.map((alt) => {
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
                    <FontAwesomeIcon icon={faTriangleExclamation} /> ACTIVE INCIDENT ALERT ({alt.alert_id})
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
                      <FontAwesomeIcon icon={faBolt} /> Open Incident & Impact Intelligence
                    </button>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* MODE 1: Single Hotspots View with Severity Levels */}
        {viewMode === 'hotspots' &&
          indiaHotspots.map((spot, index) => {
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
                      <FontAwesomeIcon icon={faFire} /> THERMAL ANOMALY ({severity})
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
                        <FontAwesomeIcon icon={faBolt} /> Open Incident & Impact Intelligence
                      </button>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

        {/* MODE 2: Persistent Thermal Clusters View */}
        {viewMode === 'clusters' &&
          indiaClusters.map((cluster, index) => {
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
                    <div className="popup-header"><FontAwesomeIcon icon={faSatellite} /> PERSISTENT CLUSTER</div>
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
                        <FontAwesomeIcon icon={faBolt} /> Open Incident & Impact Intelligence
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
            <span className="legend-title"><FontAwesomeIcon icon={faMap} /> EOC MAP LEGEND</span>
            <button
              type="button"
              className="legend-close-btn"
              onClick={() => setShowLegend(false)}
              title="Close Legend"
            >
                <FontAwesomeIcon icon={faXmark} />
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
              <div className="legend-item"><FontAwesomeIcon icon={faIndustry} className="mr-1" /> Industrial / Fuel Depot</div>
              <div className="legend-item"><FontAwesomeIcon icon={faBolt} className="mr-1" /> Power Substation</div>
              <div className="legend-item"><FontAwesomeIcon icon={faHospital} className="mr-1" /> Hospital / Healthcare</div>
            </div>

            <div className="legend-disclaimer">
              Threat zones are simulation estimates — NOT official evacuation orders.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
