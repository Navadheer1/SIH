import React, { useState, useEffect } from 'react';
import { TimeHorizonKey } from '../types/hotspot';

interface SpreadTimelineProps {
  currentHorizon: TimeHorizonKey;
  onHorizonChange: (horizon: TimeHorizonKey) => void;
  confidenceScore?: number;
  confidenceLevel?: string;
  projectedAreaSqkm?: number;
}

export const SpreadTimeline: React.FC<SpreadTimelineProps> = ({
  currentHorizon,
  onHorizonChange,
  confidenceScore,
  confidenceLevel,
  projectedAreaSqkm,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const horizons: { key: TimeHorizonKey; label: string }[] = [
    { key: 'NOW', label: 'NOW' },
    { key: '+1H', label: '+1 HOUR' },
    { key: '+3H', label: '+3 HOURS' },
    { key: '+6H', label: '+6 HOURS' },
    { key: '+12H', label: '+12 HOURS' },
  ];

  // Auto-play timeline progression effect
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      onHorizonChange(
        currentHorizon === 'NOW'
          ? '+1H'
          : currentHorizon === '+1H'
          ? '+3H'
          : currentHorizon === '+3H'
          ? '+6H'
          : currentHorizon === '+6H'
          ? '+12H'
          : 'NOW'
      );
    }, 2500);

    return () => clearInterval(interval);
  }, [isPlaying, currentHorizon, onHorizonChange]);

  return (
    <div className="spread-timeline-dock">
      <div className="timeline-header-meta">
        <div className="tl-title-group">
          <span className="tl-icon">⏱️</span>
          <span className="tl-title font-bold">TIME-BASED THREAT PROJECTION HORIZON</span>
        </div>
        <div className="tl-badges-group">
          {projectedAreaSqkm !== undefined && (
            <span className="tl-badge badge-area">
              PROJECTED AREA: <strong>{projectedAreaSqkm.toFixed(1)} km²</strong>
            </span>
          )}
          {confidenceScore !== undefined && (
            <span className={`tl-badge badge-conf level-${(confidenceLevel || 'medium').toLowerCase()}`}>
              CONFIDENCE: <strong>{confidenceScore.toFixed(0)}% ({confidenceLevel})</strong>
            </span>
          )}
        </div>
      </div>

      <div className="timeline-controls-row">
        {/* Playback Controls */}
        <div className="playback-btn-group">
          <button
            type="button"
            className={`btn-playback ${isPlaying ? 'playing' : ''}`}
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? 'Pause Timeline' : 'Play Timeline Progression'}
          >
            {isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
          </button>
          <button
            type="button"
            className="btn-playback btn-reset"
            onClick={() => {
              setIsPlaying(false);
              onHorizonChange('NOW');
            }}
            title="Reset to NOW"
          >
            🔄 RESET
          </button>
        </div>

        {/* Horizons Selector Pills */}
        <div className="horizon-pills-bar">
          {horizons.map((h) => (
            <button
              key={h.key}
              type="button"
              className={`pill-horizon ${currentHorizon === h.key ? 'active' : ''}`}
              onClick={() => {
                setIsPlaying(false);
                onHorizonChange(h.key);
              }}
            >
              <span className="pill-dot" />
              <span className="pill-text">{h.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
