import {
  faBolt,
  faCircleCheck,
  faClipboardList,
  faEye,
  faFileLines,
  faMagnifyingGlass,
  faPenToSquare,
  faSatellite,
  faTriangleExclamation,
  faTruckMedical,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useState, useEffect, useCallback } from 'react';
import { IncidentAuditItem, IncidentAuditTrailResponse } from '../types/hotspot';
import { getIncidentAuditTrail, recordIncidentAction } from '../config/api';

export interface IncidentAuditTimelineProps {
  observationId: string;
  refreshTrigger?: number;
  onActionCompleted?: () => void;
}

export const IncidentAuditTimeline: React.FC<IncidentAuditTimelineProps> = ({
  observationId,
  refreshTrigger = 0,
  onActionCompleted,
}) => {
  const [data, setData] = useState<IncidentAuditTrailResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Quick note input
  const [noteText, setNoteText] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [noteSuccess, setNoteSuccess] = useState<boolean>(false);

  const fetchTrail = useCallback(async () => {
    if (!observationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getIncidentAuditTrail(observationId, true);
      setData(res);
    } catch (err: any) {
      console.error('Failed to load incident audit trail:', err);
      setError(err.message || 'Audit trail unavailable.');
    } finally {
      setLoading(false);
    }
  }, [observationId]);

  useEffect(() => {
    fetchTrail();
  }, [fetchTrail, refreshTrigger]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim() || !observationId) return;

    setIsSubmitting(true);
    try {
      await recordIncidentAction(observationId, {
        action: 'ADD_NOTE',
        user: 'Dispatcher',
        notes: noteText.trim(),
      });
      setNoteText('');
      setNoteSuccess(true);
      setTimeout(() => setNoteSuccess(false), 3000);
      await fetchTrail();
      if (onActionCompleted) {
        onActionCompleted();
      }
    } catch (err: any) {
      console.error('Failed to add audit note:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatUtcDate = (val?: string | null): string => {
    if (!val) return 'Unavailable';
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return d.toISOString().replace('T', ' ').replace('.000Z', ' UTC').replace('Z', ' UTC');
      }
    } catch {
      // fallback
    }
    return val;
  };

  const getActionIcon = (action: string) => {
    switch (action?.toUpperCase()) {
      case 'HOTSPOT_DETECTED':
        return <FontAwesomeIcon icon={faSatellite} />;
      case 'ACKNOWLEDGE':
      case 'ACKNOWLEDGED':
        return <FontAwesomeIcon icon={faEye} />;
      case 'DISPATCH':
      case 'DISPATCHED':
        return <FontAwesomeIcon icon={faTruckMedical} />;
      case 'INVESTIGATE':
      case 'INVESTIGATING':
        return <FontAwesomeIcon icon={faMagnifyingGlass} />;
      case 'ESCALATE':
      case 'ESCALATED':
        return <FontAwesomeIcon icon={faBolt} />;
      case 'RESOLVE':
      case 'RESOLVED':
        return <FontAwesomeIcon icon={faCircleCheck} />;
      case 'DISMISS':
      case 'DISMISSED':
        return <FontAwesomeIcon icon={faXmark} />;
      case 'ADD_NOTE':
        return <FontAwesomeIcon icon={faPenToSquare} />;
      default:
        return <FontAwesomeIcon icon={faClipboardList} />;
    }
  };

  const getActorBadgeClass = (actorType: string) => {
    switch (actorType?.toUpperCase()) {
      case 'HUMAN_DISPATCHER':
        return 'actor-badge-human';
      case 'AUTOMATED_PIPELINE':
        return 'actor-badge-pipeline';
      default:
        return 'actor-badge-system';
    }
  };

  return (
    <div className="incident-audit-timeline-container" data-testid="incident-audit-timeline">
      <div className="timeline-header-bar">
        <div className="timeline-title-wrap">
          <span className="timeline-icon"><FontAwesomeIcon icon={faFileLines} /></span>
          <div>
            <h4 className="timeline-heading">Incident Lifecycle Audit Trail</h4>
            <p className="timeline-subheading">
              Immutable journal of automated sensor milestones & frontline operator triage actions
            </p>
          </div>
        </div>
        {data && (
          <span className="action-count-pill">
            {data.audit_trail.length} Lifecycle Events
          </span>
        )}
      </div>

      {/* Inline Quick Note Form */}
      <form className="audit-quick-note-form" onSubmit={handleAddNote}>
        <input
          type="text"
          className="audit-note-input"
          placeholder="Append operational intelligence note to this incident log..."
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          disabled={isSubmitting}
        />
        <button
          type="submit"
          className="btn-add-note"
          disabled={isSubmitting || !noteText.trim()}
        >
          {isSubmitting ? 'Saving...' : '+ Add Log Note'}
        </button>
      </form>
      {noteSuccess && <div className="note-saved-hint">Operational note appended to immutable audit log.</div>}

      {/* Loading state */}
      {loading && (
        <div className="timeline-loading-state">
          <div className="skeleton-spinner" style={{ width: 24, height: 24, margin: '0 auto 0.5rem' }} />
          <span>Loading chronological audit trail...</span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="timeline-error-box">
          <span><FontAwesomeIcon icon={faTriangleExclamation} /> {error}</span>
          <button type="button" className="btn-timeline-retry" onClick={fetchTrail}>
            Retry
          </button>
        </div>
      )}

      {/* Timeline Items List */}
      {data && !loading && (
        <div className="timeline-events-list">
          {data.audit_trail.length === 0 ? (
            <div className="empty-timeline-note">No actions recorded yet for this incident.</div>
          ) : (
            data.audit_trail.map((item: IncidentAuditItem) => (
              <div key={item.id} className="timeline-event-card">
                <div className="event-marker-col">
                  <div className="event-marker-icon">{getActionIcon(item.action)}</div>
                  <div className="event-connector-line" />
                </div>

                <div className="event-content-col">
                  <div className="event-top-row">
                    <div className="event-action-name">
                      <strong>{item.action.replace('_', ' ')}</strong>
                      {item.previous_status && item.previous_status !== item.new_status && (
                        <span className="status-transition-tag">
                          {item.previous_status} → {item.new_status}
                        </span>
                      )}
                    </div>
                    <span className="event-timestamp">{formatUtcDate(item.timestamp)}</span>
                  </div>

                  <div className="event-actor-row">
                    <span className={`actor-type-pill ${getActorBadgeClass(item.actor_type)}`}>
                      {item.actor_type.replace('_', ' ')}
                    </span>
                    <span className="actor-name">By: <strong>{item.actor}</strong></span>
                    {item.target_agency && (
                      <span className="target-agency-badge">
                        Assigned: <strong>{item.target_agency}</strong>
                      </span>
                    )}
                  </div>

                  {item.notes && <p className="event-notes-text">{item.notes}</p>}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
