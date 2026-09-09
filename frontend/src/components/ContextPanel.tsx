import {
  faBolt,
  faCircleQuestion,
  faHouse,
  faIndustry,
  faTriangleExclamation,
  faWheatAwn,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect, useState } from 'react';
import { Hotspot, HotspotContextResponse, AiClassificationResponse, RiskScoreResponse, FusedEvidenceResponse } from '../types/hotspot';
import { getApiUrl } from '../config/api';
import { AiClassificationCard } from './AiClassificationCard';
import { RiskScoreCard } from './RiskScoreCard';
import { SatelliteEvidenceCard } from './SatelliteEvidenceCard';

interface ContextPanelProps {
  selectedHotspot: Hotspot | null;
  contextData: HotspotContextResponse | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onOpenInvestigation?: (hotspot: Hotspot) => void;
}


export const ContextPanel: React.FC<ContextPanelProps> = ({
  selectedHotspot,
  contextData,
  loading,
  error,
  onClose,
  onOpenInvestigation,
}) => {

  const [aiData, setAiData] = useState<AiClassificationResponse | null>(null);
  const [riskData, setRiskData] = useState<RiskScoreResponse | null>(null);
  const [fusedEvidence, setFusedEvidence] = useState<FusedEvidenceResponse | null>(null);
  const [panelLoading, setPanelLoading] = useState<boolean>(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedHotspot) return;

    const fetchAiAndRisk = async () => {
      setPanelLoading(true);
      setPanelError(null);
      try {
        const queryParams = `lat=${selectedHotspot.latitude}&lon=${selectedHotspot.longitude}&frp=${selectedHotspot.frp}&brightness=${selectedHotspot.brightness}&confidence=${selectedHotspot.confidence}`;
        
        const [aiRes, riskRes, satRes] = await Promise.all([
          fetch(getApiUrl(`/api/hotspots/classify?${queryParams}`)),
          fetch(getApiUrl(`/api/hotspots/risk?${queryParams}`)),
          fetch(getApiUrl(`/api/satellite/evidence?${queryParams}`))
        ]);

        if (!aiRes.ok || !riskRes.ok) {
          throw new Error('API server error');
        }

        const aiJson: AiClassificationResponse = await aiRes.json();
        const riskJson: RiskScoreResponse = await riskRes.json();
        const satJson: FusedEvidenceResponse = satRes.ok ? await satRes.json() : null;

        setAiData(aiJson);
        setRiskData(riskJson);
        setFusedEvidence(satJson);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unable to fetch evaluation';
        setPanelError(msg);
      } finally {
        setPanelLoading(false);
      }
    };

    fetchAiAndRisk();
  }, [selectedHotspot]);

  if (!selectedHotspot) return null;

  const getClassificationBadge = (classification: string) => {
    switch (classification) {
      case 'INDUSTRIAL':
        return <span className="ctx-badge badge-industrial"><FontAwesomeIcon icon={faIndustry} /> INDUSTRIAL ZONE</span>;
      case 'URBAN':
        return <span className="ctx-badge badge-urban"><FontAwesomeIcon icon={faHouse} /> URBAN AREA</span>;
      case 'RURAL_OR_AGRICULTURAL':
        return <span className="ctx-badge badge-rural"><FontAwesomeIcon icon={faWheatAwn} /> RURAL / AGRICULTURAL</span>;
      default:
        return <span className="ctx-badge badge-unknown"><FontAwesomeIcon icon={faCircleQuestion} /> UNKNOWN CONTEXT</span>;
    }
  };

  const getFeatureIcon = (type: string) => {
    switch (type) {
      case 'industrial':
        return 'Industrial';
      case 'power':
        return 'Substation';
      case 'urban':
        return 'Residential';
      case 'road':
        return 'Highway';
      default:
        return 'Infrastructure';
    }
  };

  return (
    <div className="context-panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Location Context</h3>
          <p className="panel-subtitle">OpenStreetMap Proximity & Satellite Intelligence</p>
        </div>
        <button className="panel-close-btn" onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className="panel-body">
        {/* Hotspot Summary Card */}
        <div className="hotspot-summary-card">
          <div className="summary-row">
            <span className="summary-label">Target Hotspot:</span>
            <span className="summary-val">{selectedHotspot.satellite} ({selectedHotspot.instrument})</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">Coordinates:</span>
            <span className="summary-val">{selectedHotspot.latitude.toFixed(4)}, {selectedHotspot.longitude.toFixed(4)}</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">FRP / Brightness:</span>
            <span className="summary-val highlight-frp">{selectedHotspot.frp} MW / {selectedHotspot.brightness} K</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">Acquired:</span>
            <span className="summary-val">{selectedHotspot.acquired_at || (selectedHotspot.acq_date ? `${selectedHotspot.acq_date} ${selectedHotspot.acq_time} UTC` : 'Observation timestamp')}</span>
          </div>

        </div>

        {onOpenInvestigation && (
          <button
            type="button"
            className="btn-open-workspace"
            onClick={() => onOpenInvestigation(selectedHotspot)}
          >
            <FontAwesomeIcon icon={faBolt} /> Open Full Investigation Workspace
          </button>
        )}

        {/* Phase 8 Satellite Image Evidence */}
        <SatelliteEvidenceCard
          fusedEvidence={fusedEvidence}
          loading={panelLoading}
        />

        {/* Risk Priority Score Card */}
        <RiskScoreCard
          riskData={riskData}
          loading={panelLoading}
          error={panelError}
        />

        {/* Explainable AI Classification Card */}
        <AiClassificationCard
          classificationData={aiData}
          loading={panelLoading}
          error={panelError}
        />

        {/* Loading State */}
        {loading && (
          <div className="panel-loading">
            <div className="spinner-small" />
            <span>Querying OpenStreetMap nearby features...</span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="panel-error">
            <span><FontAwesomeIcon icon={faTriangleExclamation} /> {error}</span>
          </div>
        )}

        {/* Context Content */}
        {!loading && !error && contextData && (
          <>
            <div className="classification-section">
              <span className="section-label">Geospatial Context:</span>
              {getClassificationBadge(contextData.context_classification)}
            </div>

            <div className="features-section">
              <div className="section-header">
                <span>Nearby Features ({contextData.search_radius_km} km radius)</span>
                <span className="feature-count">{contextData.facility_count} found</span>
              </div>

              {contextData.nearby_features.length === 0 ? (
                <p className="no-features-text">No major industrial or urban features mapped in OSM within {contextData.search_radius_km} km.</p>
              ) : (
                <div className="features-list">
                  {contextData.nearby_features.map((feature, index) => (
                    <div key={`${feature.osm_id}-${index}`} className={`feature-item feature-type-${feature.type}`}>
                      <div className="feature-icon">{getFeatureIcon(feature.type)}</div>
                      <div className="feature-info">
                        <div className="feature-name">{feature.name}</div>
                        <div className="feature-meta">
                          <span className="feature-cat">{feature.category.replace('_', ' ')}</span>
                          <span className="feature-dist">{feature.distance_km} km away</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
