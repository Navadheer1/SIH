import React, { useState, useEffect } from 'react';
import { getApiUrl } from '../config/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircle, faArrowsRotate, faSpinner } from '@fortawesome/free-solid-svg-icons';

interface CompactStatusStripProps {
  lastUpdated: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  onNavigateStatus?: () => void;
}

interface ServiceStatusMap {
  firms?: boolean;
  sentinel2?: boolean;
  database?: boolean;
  osm?: boolean;
}

export const CompactStatusStrip: React.FC<CompactStatusStripProps> = ({
  lastUpdated,
  onRefresh,
  refreshing = false,
  onNavigateStatus,
}) => {
  const [statuses, setStatuses] = useState<ServiceStatusMap>({
    firms: true,
    sentinel2: true,
    database: true,
    osm: true,
  });

  useEffect(() => {
    let mounted = true;
    const checkStatus = async () => {
      try {
        const res = await fetch(getApiUrl('/api/system/status'));
        if (res.ok) {
          const data = await res.json();
          if (mounted && data?.services) {
            setStatuses({
              firms: data.services.firms === 'CONFIGURED' || data.services.firms === 'UP',
              sentinel2: data.services.satellite === 'CONFIGURED' || data.services.satellite === 'UP' || data.services.satellite_hub === 'CONFIGURED',
              database: data.services.database === 'CONFIGURED' || data.services.database === 'UP',
              osm: data.services.osm === 'CONFIGURED' || data.services.osm === 'UP' || data.services.backend === 'UP',
            });
          }
        }
      } catch {
        // preserve graceful defaults
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="compact-status-strip" role="status" aria-label="System Connectivity Strip">
      <div className="status-strip-left" onClick={onNavigateStatus} style={{ cursor: onNavigateStatus ? 'pointer' : 'default' }}>
        <div className="status-pill-item" title={statuses.firms ? 'FIRMS: Connected' : 'FIRMS: Degraded'}>
          <span className="status-label">FIRMS</span>
          <FontAwesomeIcon
            icon={faCircle}
            className={`status-dot ${statuses.firms ? 'status-dot-ok' : 'status-dot-warn'}`}
          />
        </div>

        <span className="status-sep">|</span>

        <div className="status-pill-item" title={statuses.sentinel2 ? 'Sentinel-2: Connected' : 'Sentinel-2: Degraded'}>
          <span className="status-label">Sentinel-2</span>
          <FontAwesomeIcon
            icon={faCircle}
            className={`status-dot ${statuses.sentinel2 ? 'status-dot-ok' : 'status-dot-warn'}`}
          />
        </div>

        <span className="status-sep">|</span>

        <div className="status-pill-item" title={statuses.database ? 'Database: Connected' : 'Database: Degraded'}>
          <span className="status-label">Database</span>
          <FontAwesomeIcon
            icon={faCircle}
            className={`status-dot ${statuses.database ? 'status-dot-ok' : 'status-dot-warn'}`}
          />
        </div>

        <span className="status-sep">|</span>

        <div className="status-pill-item" title={statuses.osm ? 'OSM: Connected' : 'OSM: Degraded'}>
          <span className="status-label">OSM</span>
          <FontAwesomeIcon
            icon={faCircle}
            className={`status-dot ${statuses.osm ? 'status-dot-ok' : 'status-dot-warn'}`}
          />
        </div>
      </div>

      <div className="status-strip-right">
        <span className="status-updated-text">Last updated {lastUpdated}</span>
        {onRefresh && (
          <button
            type="button"
            className="status-sync-icon-btn"
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh operational telemetry"
          >
            <FontAwesomeIcon icon={refreshing ? faSpinner : faArrowsRotate} spin={refreshing} />
          </button>
        )}
      </div>
    </div>
  );
};
