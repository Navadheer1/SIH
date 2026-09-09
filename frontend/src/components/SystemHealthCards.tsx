import { useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '../config/api';
import { SystemStatusResponse } from '../types/hotspot';

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
    if (!status) return { dot: '⚪', label: 'CHECKING', cls: 'status-unknown' };
    const s = status.toUpperCase();
    if (s === 'REACHABLE' || s === 'CONNECTED' || s === 'HEALTHY' || s === 'UP' || s === 'OPERATIONAL') {
      return { dot: '🟢', label: 'CONNECTED', cls: 'status-connected' };
    }
    if (s === 'CONFIGURED' || s === 'RUNNING') {
      return { dot: '🟢', label: 'CONFIGURED', cls: 'status-configured' };
    }
    if (s === 'TESTING' || s === 'DEGRADED' || s === 'STALE') {
      return { dot: '🟡', label: s, cls: 'status-degraded' };
    }
    if (s === 'UNREACHABLE' || s === 'NOT_CONFIGURED' || s === 'INVALID_CREDENTIAL' || s === 'DOWN' || s === 'ERROR') {
      return { dot: '🔴', label: s === 'NOT_CONFIGURED' ? 'NOT CONFIGURED' : 'OFFLINE', cls: 'status-offline' };
    }
    return { dot: configured ? '🟢' : '🔴', label: s, cls: configured ? 'status-configured' : 'status-offline' };
  };

  const firmsBadge = getStatusBadge(statusData?.services?.firms, statusData?.details?.firms?.configured);
  const dbBadge = getStatusBadge(statusData?.services?.database, statusData?.details?.database?.configured);
  const satBadge = getStatusBadge(statusData?.services?.satellite, statusData?.details?.satellite?.configured);
  const backendBadge = getStatusBadge(statusData?.services?.backend, true);

  return (
    <div className={`system-health-banner ${compact ? 'compact' : ''}`}>
      <div className="health-banner-header">
        <div className="health-title-group">
          <span className="health-icon">⚡</span>
          <span className="health-title">LIVE SYSTEM HEALTH</span>
          {lastChecked && <span className="health-timestamp">Last probed: {lastChecked}</span>}
        </div>
        <button
          type="button"
          className="btn-probe-status"
          onClick={() => fetchStatus(true)}
          disabled={probing}
        >
          {probing ? '🔄 Probing APIs...' : '⚡ Test Connectivity'}
        </button>
      </div>

      {error && <div className="health-error-inline">⚠️ Status check error: {error}</div>}

      <div className="health-cards-grid">
        {/* CARD 1: NASA FIRMS */}
        <div className={`health-card ${firmsBadge.cls}`}>
          <div className="card-top">
            <span className="card-icon">🔥</span>
            <span className="card-name">NASA FIRMS</span>
            <span className="status-indicator">{firmsBadge.dot}</span>
          </div>
          <div className="card-meta">
            <span className="badge-text">{firmsBadge.label}</span>
            <span className="sub-text">
              {statusData?.details?.firms?.latency_ms != null
                ? `${statusData.details.firms.latency_ms} ms ping`
                : 'VIIRS/MODIS Thermal'}
            </span>
          </div>
        </div>

        {/* CARD 2: DATABASE */}
        <div className={`health-card ${dbBadge.cls}`}>
          <div className="card-top">
            <span className="card-icon">🗄️</span>
            <span className="card-name">DATABASE</span>
            <span className="status-indicator">{dbBadge.dot}</span>
          </div>
          <div className="card-meta">
            <span className="badge-text">{dbBadge.label}</span>
            <span className="sub-text">
              {statusData?.details?.database?.latency_ms != null
                ? `${statusData.details.database.latency_ms} ms • Supabase`
                : statusData?.details?.storage || 'Supabase PostgreSQL'}
            </span>
          </div>
        </div>

        {/* CARD 3: COPERNICUS SENTINEL-2 */}
        <div className={`health-card ${satBadge.cls}`}>
          <div className="card-top">
            <span className="card-icon">🛰️</span>
            <span className="card-name">COPERNICUS S2</span>
            <span className="status-indicator">{satBadge.dot}</span>
          </div>
          <div className="card-meta">
            <span className="badge-text">{satBadge.label}</span>
            <span className="sub-text">
              {statusData?.details?.satellite?.latency_ms != null
                ? `${statusData.details.satellite.latency_ms} ms • CDSE`
                : 'Optical L2A Evidence'}
            </span>
          </div>
        </div>

        {/* CARD 4: BACKEND / OSM */}
        <div className={`health-card ${backendBadge.cls}`}>
          <div className="card-top">
            <span className="card-icon">🏭</span>
            <span className="card-name">BACKEND & OSM</span>
            <span className="status-indicator">{backendBadge.dot}</span>
          </div>
          <div className="card-meta">
            <span className="badge-text">{backendBadge.label}</span>
            <span className="sub-text">Overpass & Fusion Engine</span>
          </div>
        </div>
      </div>
    </div>
  );
}
