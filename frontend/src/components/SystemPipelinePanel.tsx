import React from 'react';
import { SystemPipelineEvent } from '../types/hotspot';

interface SystemPipelinePanelProps {
  events: SystemPipelineEvent[];
  hotspotCount: number;
  alertCount: number;
  onRefreshPipeline: () => void;
}

export const SystemPipelinePanel: React.FC<SystemPipelinePanelProps> = ({
  events,
  hotspotCount,
  alertCount,
  onRefreshPipeline,
}) => {
  return (
    <div className="system-pipeline-panel">
      <div className="pipeline-panel-header">
        <div className="header-left">
          <span className="pulse-dot" />
          <h4 className="pipeline-title">Data Pipeline & System Activity Log</h4>
          <span className="pipeline-sub">Real-Time Ingestion • Multi-Modal Processing • Incident Creation</span>
        </div>
        <div className="header-right">
          <span className="telemetry-badge">📡 {hotspotCount} Telemetry Feeds</span>
          <span className="telemetry-badge alert-badge">🚨 {alertCount} Active Incidents</span>
          <button
            type="button"
            className="btn-refresh-pipeline"
            onClick={onRefreshPipeline}
            title="Trigger pipeline synchronization"
          >
            ↻ Resync
          </button>
        </div>
      </div>

      <div className="pipeline-events-scroller">
        {events.map((evt) => (
          <div key={evt.id} className={`pipeline-event-row event-${evt.type}`}>
            <span className="event-time mono">{evt.timestamp}</span>
            <span className="event-stage">{evt.stage}</span>
            <span className="event-desc">{evt.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
