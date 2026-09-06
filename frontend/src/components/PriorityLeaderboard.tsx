import React, { useState } from 'react';
import { PriorityIncidentItem } from '../types/hotspot';

interface PriorityLeaderboardProps {
  items: PriorityIncidentItem[];
  loading: boolean;
  onSelectIncident: (item: PriorityIncidentItem) => void;
}

export const PriorityLeaderboard: React.FC<PriorityLeaderboardProps> = ({
  items,
  loading,
  onSelectIncident,
}) => {
  const [sortBy, setSortBy] = useState<'priority' | 'impact' | 'risk' | 'assets'>('priority');

  const pRank = { P1: 1, P2: 2, P3: 3, P4: 4 };

  const sortedItems = [...items].sort((a, b) => {
    if (sortBy === 'priority') {
      const pDiff = (pRank[a.priority_index] || 4) - (pRank[b.priority_index] || 4);
      if (pDiff !== 0) return pDiff;
      return b.impact_score - a.impact_score;
    }
    if (sortBy === 'impact') return b.impact_score - a.impact_score;
    if (sortBy === 'risk') return b.risk_score - a.risk_score;
    if (sortBy === 'assets') return b.exposed_assets_count - a.exposed_assets_count;
    return 0;
  });

  return (
    <div className="priority-leaderboard-container">
      <div className="leaderboard-header-bar">
        <div>
          <h3 className="leaderboard-title">🚨 Emergency Dispatch Priority Index Leaderboard (P1 - P4)</h3>
          <p className="leaderboard-sub">
            Ranks thermal incidents combining Investigation Risk Score, Dynamic Impact Score, and Exposed Infrastructure.
          </p>
        </div>

        {/* Sort Controls */}
        <div className="sort-controls-group">
          <span className="sort-label">SORT BY:</span>
          <button
            type="button"
            className={`btn-sort ${sortBy === 'priority' ? 'active' : ''}`}
            onClick={() => setSortBy('priority')}
          >
            Priority Index (P1)
          </button>
          <button
            type="button"
            className={`btn-sort ${sortBy === 'impact' ? 'active' : ''}`}
            onClick={() => setSortBy('impact')}
          >
            Impact Score
          </button>
          <button
            type="button"
            className={`btn-sort ${sortBy === 'risk' ? 'active' : ''}`}
            onClick={() => setSortBy('risk')}
          >
            Risk Score
          </button>
          <button
            type="button"
            className={`btn-sort ${sortBy === 'assets' ? 'active' : ''}`}
            onClick={() => setSortBy('assets')}
          >
            Exposed Assets
          </button>
        </div>
      </div>

      {loading ? (
        <div className="leaderboard-loading">
          <span className="spinner-dot" /> Calculating dynamic priority index leaderboard...
        </div>
      ) : sortedItems.length === 0 ? (
        <div className="leaderboard-empty">
          <span>No persistent thermal incidents currently requiring emergency priority dispatch.</span>
        </div>
      ) : (
        <div className="leaderboard-table-scroller">
          <table className="priority-table">
            <thead>
              <tr>
                <th>RANK</th>
                <th>PRIORITY</th>
                <th>INCIDENT ID</th>
                <th>COORDINATES</th>
                <th>FRP (MW)</th>
                <th>RISK SCORE</th>
                <th>IMPACT SCORE</th>
                <th>EXPOSED ASSETS</th>
                <th>NEAREST CRITICAL ASSET</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item, idx) => (
                <tr
                  key={item.cluster_id || idx}
                  className={`priority-row p-level-${item.priority_index.toLowerCase()}`}
                  onClick={() => onSelectIncident(item)}
                >
                  <td className="rank-cell">#{idx + 1}</td>
                  <td className="p-tag-cell">
                    <span className={`p-pill p-${item.priority_index.toLowerCase()}`}>
                      {item.priority_index}
                    </span>
                  </td>
                  <td className="id-cell mono">{item.cluster_id}</td>
                  <td className="coord-cell mono">
                    {item.latitude.toFixed(3)}°N, {item.longitude.toFixed(3)}°E
                  </td>
                  <td className="frp-cell highlight-frp">{item.frp.toFixed(1)} MW</td>
                  <td className="risk-cell font-bold">{item.risk_score} / 100</td>
                  <td className="impact-cell font-bold">{item.impact_score} / 100</td>
                  <td className="assets-cell">
                    <span className="assets-badge">
                      {item.exposed_assets_count} Assets ({item.critical_infrastructure_count} Critical)
                    </span>
                  </td>
                  <td className="nearest-cell">
                    {item.nearest_critical_asset ? (
                      <span className="nearest-text" title={item.nearest_critical_asset.asset_name}>
                        {item.nearest_critical_asset.asset_name} ({item.nearest_critical_asset.distance_km.toFixed(1)} km)
                      </span>
                    ) : (
                      <span className="subtle-none">None within 5km</span>
                    )}
                  </td>
                  <td className="action-cell">
                    <button
                      type="button"
                      className="btn-table-inspect"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectIncident(item);
                      }}
                    >
                      ⚡ Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
