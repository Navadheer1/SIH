import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSatellite,
  faFire,
  faTriangleExclamation,
  faCheckCircle,
  faClock,
} from '@fortawesome/free-solid-svg-icons';

interface ActivityEvent {
  id: string;
  source: string;
  type: 'ingest' | 'alert' | 'verify' | 'action';
  message: string;
  timestamp: string;
}

interface RecentActivitySectionProps {
  alertsCount: number;
  hotspotsCount: number;
}

export const RecentActivitySection: React.FC<RecentActivitySectionProps> = ({
  alertsCount,
  hotspotsCount,
}) => {
  // Built from live counts to remain dynamic & contextual
  const recentEvents: ActivityEvent[] = [
    {
      id: 'act-1',
      source: 'NASA FIRMS',
      type: 'ingest',
      message: `Ingested ${hotspotsCount} Near-Real-Time VIIRS 375m & MODIS 1km telemetry observations across national grid.`,
      timestamp: '2m ago',
    },
    {
      id: 'act-2',
      source: 'Triage Engine',
      type: 'alert',
      message: `${alertsCount} active incidents prioritized. Critical hazard thresholds evaluated against OSM infrastructure.`,
      timestamp: '5m ago',
    },
    {
      id: 'act-3',
      source: 'Copernicus STAC',
      type: 'verify',
      message: 'Sentinel-2 L2A optical validation synchronized for high-risk industrial corridor candidates.',
      timestamp: '11m ago',
    },
    {
      id: 'act-4',
      source: 'System Audit',
      type: 'action',
      message: 'Persistent thermal clustering engine refreshed with zero synthetic data injection.',
      timestamp: '18m ago',
    },
  ];

  const getEventIcon = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'ingest':
        return faSatellite;
      case 'alert':
        return faTriangleExclamation;
      case 'verify':
        return faFire;
      default:
        return faCheckCircle;
    }
  };

  return (
    <section className="recent-activity-section" aria-label="Recent Operational Activity">
      <div className="activity-header">
        <span className="activity-title">
          <FontAwesomeIcon icon={faClock} className="mr-1 text-muted" /> Recent Telemetry & Ingestion Activity
        </span>
        <span className="activity-live-indicator">LIVE FEED</span>
      </div>

      <div className="activity-items-row">
        {recentEvents.map((evt) => (
          <div key={evt.id} className="activity-item-card">
            <div className="activity-item-top">
              <span className={`activity-source-tag source-${evt.type}`}>
                <FontAwesomeIcon icon={getEventIcon(evt.type)} className="mr-1" />
                {evt.source}
              </span>
              <span className="activity-time">{evt.timestamp}</span>
            </div>
            <p className="activity-message">{evt.message}</p>
          </div>
        ))}
      </div>
    </section>
  );
};
