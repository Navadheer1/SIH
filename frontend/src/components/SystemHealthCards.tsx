import { useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '../config/api';
import { SystemStatusResponse } from '../types/hotspot';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSatellite,
  faDatabase,
  faIndustry,
  faBolt,
  faSpinner,
  faCircle,
  faCircleCheck,
  faCircleExclamation,
  faCircleXmark,
} from '@fortawesome/free-solid-svg-icons';

interface SystemHealthCardsProps {
  onRefreshTrigger?: () => void;
  compact?: boolean;
}

export function SystemHealthCards({ onRefreshTrigger, compact = false }: SystemHealthCardsProps) {
  const [statusData, setStatusData] = useState<SystemStatusResponse | null>(null);
  const [probing, setProbing] = useState<boolean>(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async (checkConnectivity: boolean = false) => {
    if (checkConnectivity) setProbing(true);
    setError(null);
    try {
      const url = getApiUrl(`/api/system/status${checkConnectivity ? '?check_connectivity=true' : ''}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SystemStatusResponse = await res.json();
      setStatusData(data);
      setLastChecked(new Date().toLocaleTimeString());
      if (checkConnectivity && onRefreshTrigger) {
        onRefreshTrigger();
      }
    } catch (err: any) {
      console.error('Failed to fetch system status:', err);
      setError(err.message || 'Failed to query system status');
    } finally {
      if (checkConnectivity) setProbing(false);
    }
  }, [onRefreshTrigger]);

  useEffect(() => {
    fetchStatus(false);
    const interval = setInterval(() => fetchStatus(false), 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const getStatusBadge = (status?: string, configured?: boolean) => {
    if (!status) {
      return {
        label: 'Checking',
        cls: 'health-badge-checking',
        icon: faCircle,
      };
    }
    const s = status.toUpperCase();
    if (s === 'REACHABLE' || s === 'CONNECTED' || s === 'HEALTHY' || s === 'UP' || s === 'OPERATIONAL') {
      return {
        label: 'Operational',
        cls: 'health-badge-operational',
        icon: faCircleCheck,
      };
    }
    if (s === 'CONFIGURED' || s === 'RUNNING') {
      return {
        label: 'Operational',
        cls: 'health-badge-operational',
        icon: faCircleCheck,
      };
    }
    if (s === 'TESTING' || s === 'DEGRADED' || s === 'STALE') {
      return {
        label: s,
        cls: 'health-badge-degraded',
        icon: faCircleExclamation,
      };
    }
    if (s === 'UNREACHABLE' || s === 'NOT_CONFIGURED' || s === 'INVALID_CREDENTIAL' || s === 'DOWN' || s === 'ERROR') {
      return {
        label: s === 'NOT_CONFIGURED' ? 'Not Configured' : 'Offline',
        cls: 'health-badge-offline',
        icon: faCircleXmark,
      };
    }
    return {
      label: configured ? 'Operational' : 'Offline',
      cls: configured ? 'health-badge-operational' : 'health-badge-offline',
      icon: configured ? faCircleCheck : faCircleXmark,
    };
  };

  const firmsBadge = getStatusBadge(statusData?.services?.firms, statusData?.details?.firms?.configured);
  const dbBadge = getStatusBadge(statusData?.services?.database, statusData?.details?.database?.configured);
  const satBadge = getStatusBadge(statusData?.services?.satellite, statusData?.details?.satellite?.configured);
  const backendBadge = getStatusBadge(statusData?.services?.backend, true);

  return (
    <section className={`system-health-section ${compact ? 'compact' : ''}`} aria-labelledby="system-health-title">
      <div className="health-section-header">
        <div className="health-header-titles">
          <div className="health-title-row">
            <h2 id="system-health-title" className="health-title">Live System Health</h2>
            {lastChecked && <span className="health-last-probed">Checked at {lastChecked}</span>}
          </div>
          <p className="health-subtitle">Monitor the health of satellite, database, mapping and backend services.</p>
        </div>

        <button
          type="button"
          className="btn-test-connectivity"
          onClick={() => fetchStatus(true)}
          disabled={probing}
          title="Actively probe all integrated external APIs and database endpoints"
        >
          <FontAwesomeIcon icon={probing ? faSpinner : faBolt} spin={probing} className="btn-icon-mr" />
          <span>{probing ? 'Probing Services...' : 'Test Connectivity'}</span>
        </button>
      </div>

      {error && (
        <div className="health-error-alert">
          <FontAwesomeIcon icon={faCircleExclamation} className="error-alert-icon" />
          <span>Status check error: {error}</span>
        </div>
      )}

      <div className="health-cards-grid">
        {/* CARD 1: NASA FIRMS */}
        <div className="health-card">
          <div className="health-card-main">
            <div className="health-icon-box icon-firms">
              <FontAwesomeIcon icon={faSatellite} />
            </div>
            <div className="health-card-details">
              <div className="health-card-top-row">
                <h3 className="health-card-name">NASA FIRMS</h3>
                <span className={`health-status-badge ${firmsBadge.cls}`}>
                  <FontAwesomeIcon icon={firmsBadge.icon} className="status-dot-icon" />
                  <span>{firmsBadge.label}</span>
                </span>
              </div>
              <p className="health-card-desc">
                {statusData?.details?.firms?.latency_ms != null
                  ? `${statusData.details.firms.latency_ms} ms latency • Active`
                  : 'VIIRS / MODIS Thermal'}
              </p>
            </div>
          </div>
        </div>

        {/* CARD 2: DATABASE */}
        <div className="health-card">
          <div className="health-card-main">
            <div className="health-icon-box icon-db">
              <FontAwesomeIcon icon={faDatabase} />
            </div>
            <div className="health-card-details">
              <div className="health-card-top-row">
                <h3 className="health-card-name">Database</h3>
                <span className={`health-status-badge ${dbBadge.cls}`}>
                  <FontAwesomeIcon icon={dbBadge.icon} className="status-dot-icon" />
                  <span>{dbBadge.label}</span>
                </span>
              </div>
              <p className="health-card-desc">
                {statusData?.details?.database?.latency_ms != null
                  ? `${statusData.details.database.latency_ms} ms • Supabase PostgreSQL`
                  : statusData?.details?.storage || 'Supabase PostgreSQL'}
              </p>
            </div>
          </div>
        </div>

        {/* CARD 3: COPERNICUS SENTINEL-2 */}
        <div className="health-card">
          <div className="health-card-main">
            <div className="health-icon-box icon-sat">
              <FontAwesomeIcon icon={faSatellite} />
            </div>
            <div className="health-card-details">
              <div className="health-card-top-row">
                <h3 className="health-card-name">Copernicus Sentinel-2</h3>
                <span className={`health-status-badge ${satBadge.cls}`}>
                  <FontAwesomeIcon icon={satBadge.icon} className="status-dot-icon" />
                  <span>{satBadge.label}</span>
                </span>
              </div>
              <p className="health-card-desc">
                {statusData?.details?.satellite?.latency_ms != null
                  ? `${statusData.details.satellite.latency_ms} ms • Optical Patches`
                  : 'Optical L2A Evidence'}
              </p>
            </div>
          </div>
        </div>

        {/* CARD 4: BACKEND & OSM */}
        <div className="health-card">
          <div className="health-card-main">
            <div className="health-icon-box icon-backend">
              <FontAwesomeIcon icon={faIndustry} />
            </div>
            <div className="health-card-details">
              <div className="health-card-top-row">
                <h3 className="health-card-name">Backend & OSM</h3>
                <span className={`health-status-badge ${backendBadge.cls}`}>
                  <FontAwesomeIcon icon={backendBadge.icon} className="status-dot-icon" />
                  <span>{backendBadge.label}</span>
                </span>
              </div>
              <p className="health-card-desc">Overpass & Fusion Engine</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
