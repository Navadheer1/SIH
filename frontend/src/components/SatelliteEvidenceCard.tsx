import React, { useState } from 'react';
import { FusedEvidenceResponse, SatelliteEvidence } from '../types/hotspot';
import { getAssetUrl } from '../config/api';

interface SatelliteEvidenceCardProps {
  fusedEvidence?: FusedEvidenceResponse | null;
  satelliteData?: SatelliteEvidence | null;
  observationId?: string | null;
  coordinates?: { lat: number; lon: number } | null;
  loading?: boolean;
}

export const SatelliteEvidenceCard: React.FC<SatelliteEvidenceCardProps> = ({
  fusedEvidence,
  satelliteData,
  observationId,
  coordinates,
  loading = false,
}) => {
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [showGradCam, setShowGradCam] = useState<boolean>(false);

  const sat: SatelliteEvidence | undefined = satelliteData || fusedEvidence?.evidence?.satellite || undefined;
  const isAvailable = Boolean(sat?.image_available || sat?.available);
  const isSynthetic = Boolean(sat?.is_synthetic);

  // Format UTC date cleanly
  const formatAcquisitionDate = (dateStr?: string | null): string => {
    if (!dateStr) return 'Pending Overpass';
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const day = d.getUTCDate().toString().padStart(2, '0');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const mon = months[d.getUTCMonth()];
        const year = d.getUTCFullYear();
        const hours = d.getUTCHours().toString().padStart(2, '0');
        const mins = d.getUTCMinutes().toString().padStart(2, '0');
        return `${day} ${mon} ${year}, ${hours}:${mins} UTC`;
      }
    } catch {
      // fallback
    }
    return dateStr;
  };

  if (loading) {
    return (
      <div className="satellite-evidence-card loading-skeleton">
        <div className="skeleton-title">
          <span>🛰️</span> Querying Copernicus STAC Catalog & Sentinel Hub...
        </div>
      </div>
    );
  }

  const cloudCover = sat?.cloud_cover != null ? Number(sat.cloud_cover) : (sat?.cloud_percentage != null ? Number(sat.cloud_percentage) : null);
  const rawAcqDate = sat?.satellite_acquired_at || sat?.captured_at;
  const formattedDate = formatAcquisitionDate(rawAcqDate);
  const providerName = sat?.source || 'Copernicus Data Space';
  const productName = sat?.product || 'Sentinel-2 L2A';
  const obsId = observationId || sat?.observation_id || 'N/A';
  const latVal = coordinates?.lat ?? sat?.latitude ?? 22.6789;
  const lonVal = coordinates?.lon ?? sat?.longitude ?? 80.54321;
  const imageUrl = sat?.image_url ? getAssetUrl(sat.image_url) : null;
  const satClass = (sat as any)?.class || (sat as any)?.class_name || (sat as any)?.candidate_class;
  const satConf = (sat as any)?.confidence;
  const satQuality = (sat as any)?.quality || (cloudCover !== null ? (cloudCover >= 70 ? 'VERY_HIGH_CLOUD' : cloudCover >= 50 ? 'HIGH_CLOUD' : cloudCover >= 30 ? 'MODERATE' : 'GOOD') : 'UNAVAILABLE');
  const temporalOffset = (sat as any)?.time_difference_hours;

  // Cloud cover category
  const getCloudCoverStatus = () => {
    if (satQuality === 'VERY_HIGH_CLOUD' || (cloudCover !== null && cloudCover >= 70)) {
      return {
        level: 'VERY_HIGH',
        label: 'VERY HIGH CLOUD COVER',
        warning: 'High cloud cover limits optical evidence quality. CNN evidence down-weighted.',
        badgeClass: 'cloud-badge-high',
        boxClass: 'cloud-box-high'
      };
    }
    if (satQuality === 'HIGH_CLOUD' || (cloudCover !== null && cloudCover >= 50)) {
      return {
        level: 'HIGH',
        label: 'HIGH CLOUD COVER',
        warning: 'High cloud cover limits optical evidence quality.',
        badgeClass: 'cloud-badge-high',
        boxClass: 'cloud-box-high'
      };
    }
    if (satQuality === 'MODERATE' || (cloudCover !== null && cloudCover >= 30)) {
      return {
        level: 'MODERATE',
        label: 'MODERATE CLOUD COVER',
        warning: 'Partial cloud obscuration possible.',
        badgeClass: 'cloud-badge-moderate',
        boxClass: 'cloud-box-moderate'
      };
    }
    if (cloudCover !== null) {
      return {
        level: 'LOW',
        label: 'LOW CLOUD COVER',
        warning: 'Clear optical atmosphere.',
        badgeClass: 'cloud-badge-low',
        boxClass: 'cloud-box-low'
      };
    }
    return null;
  };

  const cloudStatus = getCloudCoverStatus();

  return (
    <>
      <div className="satellite-evidence-card">
        {/* CARD TOP BAR */}
        <div className="sat-card-header">
          <div className="sat-title-group">
            <span className="sat-icon">🛰️</span>
            <div className="sat-title-column">
              <h4 className="sat-title-text">SENTINEL-2 OPTICAL EVIDENCE</h4>
              <span className="sat-provenance-sub">
                {providerName} • {productName}
              </span>
            </div>
          </div>

          <div className="sat-status-badge-container">
            {isAvailable && !isSynthetic ? (
              <span className="sat-badge-available">
                ✓ REAL IMAGE AVAILABLE
              </span>
            ) : isSynthetic ? (
              <span className="sat-badge-synthetic">
                ⚠️ SYNTHETIC TEST DATA
              </span>
            ) : (
              <span className="sat-badge-unavailable">
                ✖ NOT AVAILABLE
              </span>
            )}
          </div>
        </div>

        {/* METADATA GRID */}
        <div className="sat-meta-grid-2x2">
          <div className="sat-meta-item">
            <span className="sat-meta-label">Optical Classification</span>
            <span className="sat-meta-val highlight-sat-class">
              {satClass ? satClass.replace('_', ' ') : 'Pending Model'}
              {satConf ? ` (${(satConf * 100).toFixed(0)}%)` : ''}
            </span>
          </div>
          <div className="sat-meta-item">
            <span className="sat-meta-label">Atmospheric Quality</span>
            <span className="sat-meta-val">
              {satQuality.replace('_', ' ')}
            </span>
          </div>
          <div className="sat-meta-item">
            <span className="sat-meta-label">Optical Acquisition</span>
            <span className="sat-meta-val">{formattedDate}</span>
          </div>
          <div className="sat-meta-item">
            <span className="sat-meta-label">Temporal Offset</span>
            <span className="sat-meta-val">
              {temporalOffset != null ? `${Math.abs(temporalOffset).toFixed(1)} hrs ${temporalOffset >= 0 ? 'after' : 'before'} FIRMS` : (cloudCover !== null ? `${cloudCover.toFixed(1)}% Cloud` : 'N/A')}
            </span>
          </div>
        </div>

        {/* CLOUD COVER WARNING BANNER */}
        {cloudStatus && (
          <div className={`sat-cloud-banner ${cloudStatus.boxClass}`}>
            <div className="cloud-banner-top">
              <span className={`cloud-tag ${cloudStatus.badgeClass}`}>
                {cloudStatus.label}
              </span>
              <span className="cloud-percent-val">{cloudCover !== null ? `${cloudCover.toFixed(1)}%` : satQuality}</span>
            </div>
            <div className="cloud-banner-desc">
              {cloudStatus.warning} <span className="cloud-disclaimer">(Cloud cover limits optical evidence, but does not determine whether a fire exists)</span>
            </div>
          </div>
        )}

        {/* IMAGE PREVIEW OR UNAVAILABLE STATE */}
        {isAvailable && imageUrl ? (
          <div className="sat-image-presentation-box">
            <div className="sat-image-frame">
              <img
                src={imageUrl}
                alt="Copernicus Sentinel-2 True-Color Optical Acquisition"
                className={`sat-optical-preview-img ${showGradCam ? 'gradcam-active' : ''}`}
                onClick={() => setIsModalOpen(true)}
              />
              {showGradCam && (
                <div className="gradcam-overlay-sim">
                  <div className="gradcam-core-pulse" />
                  <span className="gradcam-tag">🔥 Thermal Focus Overlay</span>
                </div>
              )}
            </div>

            <div className="sat-image-actions">
              <button
                type="button"
                className="btn-open-full-image"
                onClick={() => setIsModalOpen(true)}
              >
                🔍 Open Full Image
              </button>

              {sat?.gradcam_overlay_path && (
                <button
                  type="button"
                  className="btn-toggle-gradcam"
                  onClick={() => setShowGradCam(!showGradCam)}
                >
                  {showGradCam ? '👁️ Raw Optical' : '🔥 Focus Heatmap'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="sat-unavailable-presentation-box">
            <div className="unavail-icon">🛰️</div>
            <div className="unavail-title">NOT AVAILABLE</div>
            <p className="unavail-message">
              {sat?.error_message ||
                sat?.visual_evidence ||
                'No suitable Sentinel-2 acquisition was found for this observation.'}
            </p>
          </div>
        )}

        {/* EDUCATIONAL EVIDENCE DISTINCTION EXPLANATION */}
        <div className="sat-distinction-footer">
          <div className="distinction-badges-row">
            <span className="distinction-pill pill-optical">Optical supporting evidence</span>
            <span className="distinction-pill pill-not-thermal">Not a thermal fire confirmation</span>
          </div>
          <div className="distinction-expl-text">
            ℹ️ <strong>NASA FIRMS</strong> provides the thermal anomaly detection. <strong>Sentinel-2</strong> provides optical imagery for visual context.
          </div>
        </div>
      </div>

      {/* LIGHTBOX / FULL IMAGE MODAL */}
      {isModalOpen && imageUrl && (
        <div className="sat-lightbox-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="sat-lightbox-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-header">
              <div className="lightbox-title-group">
                <span className="lightbox-icon">🛰️</span>
                <div>
                  <h3 className="lightbox-title">SENTINEL-2 OPTICAL EVIDENCE</h3>
                  <span className="lightbox-subtitle">{providerName} • {productName}</span>
                </div>
              </div>
              <button
                type="button"
                className="lightbox-close-btn"
                onClick={() => setIsModalOpen(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <div className="lightbox-body">
              {/* LARGE IMAGE VIEW */}
              <div className="lightbox-image-container">
                <img
                  src={imageUrl}
                  alt="Full-resolution Sentinel-2 Optical Raster"
                  className="lightbox-image"
                />
              </div>

              {/* METADATA INSPECTOR */}
              <div className="lightbox-details-panel">
                <h4 className="details-header">Observation & Acquisition Provenance</h4>
                <div className="details-grid">
                  <div className="detail-item">
                    <span className="detail-label">Observation ID</span>
                    <strong className="detail-val detail-mono">{obsId}</strong>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Coordinates</span>
                    <strong className="detail-val detail-mono">
                      {latVal.toFixed(4)}°N, {lonVal.toFixed(4)}°E
                    </strong>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Acquisition</span>
                    <strong className="detail-val">{formattedDate}</strong>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Cloud Cover</span>
                    <strong className="detail-val">
                      {cloudCover !== null ? `${cloudCover.toFixed(2)}%` : 'N/A'}
                    </strong>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Product</span>
                    <strong className="detail-val">{productName}</strong>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Provider</span>
                    <strong className="detail-val">{providerName}</strong>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Sensor Type</span>
                    <strong className="detail-val">MSI Multi-Spectral Optical (10m GSD)</strong>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Spectral Composite</span>
                    <strong className="detail-val">True-Color (B04 Red, B03 Green, B02 Blue)</strong>
                  </div>
                </div>

                {cloudStatus && cloudStatus.level === 'HIGH' && (
                  <div className="lightbox-cloud-alert">
                    ⚠️ <strong>HIGH CLOUD COVER ({cloudCover?.toFixed(1)}%):</strong> {cloudStatus.warning} Visual optical features may be obscured.
                  </div>
                )}

                <div className="lightbox-disclaimer-box">
                  <strong>ℹ️ Critical Evidence Distinction:</strong>
                  <p>
                    This Sentinel-2 True-Color image represents reflected sunlight captured during daylight overpass. It is provided strictly as <em>visual supporting context</em> for surface features and land use. Thermal detection and radiative energy are measured independently by <strong>NASA FIRMS</strong> (VIIRS/MODIS sensors).
                  </p>
                </div>
              </div>
            </div>

            <div className="lightbox-footer">
              <span className="lightbox-source-tag">Copernicus Data Space Ecosystem • Level-2A BOA Reflectance</span>
              <button
                type="button"
                className="btn-lightbox-close"
                onClick={() => setIsModalOpen(false)}
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
