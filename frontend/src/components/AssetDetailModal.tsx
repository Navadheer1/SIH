import React from 'react';
import { ExposedAsset } from '../types/hotspot';

interface AssetDetailModalProps {
  asset: ExposedAsset | null;
  onClose: () => void;
}

export const AssetDetailModal: React.FC<AssetDetailModalProps> = ({ asset, onClose }) => {
  if (!asset) return null;

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'HEALTHCARE': return '🏥';
      case 'EDUCATION': return '🎓';
      case 'INDUSTRIAL': return '🏭';
      case 'UTILITIES': return '⚡';
      case 'TRANSPORT': return '🛣️';
      case 'SETTLEMENTS': return '🏘️';
      default: return '🏛️';
    }
  };

  return (
    <div className="asset-detail-modal-backdrop" onClick={onClose}>
      <div className="asset-detail-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="asset-modal-header">
          <div className="asset-header-left">
            <span className="asset-cat-icon">{getCategoryIcon(asset.category)}</span>
            <div>
              <span className="asset-category-pill">{asset.category} ASSET</span>
              <h3 className="asset-name-title">{asset.asset_name}</h3>
            </div>
          </div>
          <button type="button" className="btn-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="asset-modal-body">
          <div className="asset-meta-grid">
            <div className="meta-box">
              <span className="m-label">EXPOSURE RATING</span>
              <span className={`m-val exposure-${asset.exposure_level.split(' ')[0].toLowerCase()}`}>
                {asset.exposure_level}
              </span>
            </div>

            <div className="meta-box">
              <span className="m-label">THREAT ZONE</span>
              <span className="m-val zone-val">{asset.threat_zone}</span>
            </div>

            <div className="meta-box">
              <span className="m-label">GEODESIC DISTANCE</span>
              <span className="m-val highlight-dist">{asset.distance_km.toFixed(2)} km</span>
            </div>

            <div className="meta-box">
              <span className="m-label">COORDINATES</span>
              <span className="m-val mono">{asset.latitude.toFixed(4)}°N, {asset.longitude.toFixed(4)}°E</span>
            </div>

            <div className="meta-box">
              <span className="m-label">OPERATIONAL STATUS</span>
              <span className="m-val status-val">{asset.status}</span>
            </div>

            <div className="meta-box">
              <span className="m-label">DATA PROVENANCE</span>
              <span className="m-val source-val">🟢 {asset.data_source}</span>
            </div>
          </div>

          <div className="asset-modal-disclaimer">
            ℹ️ <em>Potentially exposed asset within AI-calculated threat perimeter. No physical structural damage is claimed.</em>
          </div>
        </div>
      </div>
    </div>
  );
};
