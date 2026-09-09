interface MetricsSummaryProps {
  totalHotspots: number;
  persistentCount: number;
  industrialCandidatesCount: number;
  highRiskCount: number;
  loading?: boolean;
  onFilterClick?: (filterType: 'all' | 'persistent' | 'industrial' | 'high_risk') => void;
  activeFilter?: string;
}

export function MetricsSummary({
  totalHotspots,
  persistentCount,
  industrialCandidatesCount,
  highRiskCount,
  loading = false,
  onFilterClick,
  activeFilter = 'all',
}: MetricsSummaryProps) {
  return (
    <div className="metrics-summary-grid">
      {/* CARD 1: THERMAL ANOMALIES */}
      <div
        className={`metric-card metric-thermal ${activeFilter === 'all' ? 'active-filter' : ''}`}
        onClick={() => onFilterClick && onFilterClick('all')}
        role="button"
        tabIndex={0}
      >
        <div className="metric-header">
          <span className="metric-icon">🔥</span>
          <span className="metric-label">Thermal Anomalies</span>
        </div>
        <div className="metric-value-row">
          <span className="metric-value">{loading ? '...' : totalHotspots}</span>
          <span className="metric-badge badge-firms">NASA FIRMS NRT</span>
        </div>
        <div className="metric-subtext">Active Near-Real-Time satellite detections</div>
      </div>

      {/* CARD 2: PERSISTENT SOURCES */}
      <div
        className={`metric-card metric-persistent ${activeFilter === 'persistent' ? 'active-filter' : ''}`}
        onClick={() => onFilterClick && onFilterClick('persistent')}
        role="button"
        tabIndex={0}
      >
        <div className="metric-header">
          <span className="metric-icon">🔄</span>
          <span className="metric-label">Persistent Sources</span>
        </div>
        <div className="metric-value-row">
          <span className="metric-value">{loading ? '...' : persistentCount}</span>
          <span className="metric-badge badge-persistent">Recurrent / Flare</span>
        </div>
        <div className="metric-subtext">Multi-day clusters & industrial flare pits</div>
      </div>

      {/* CARD 3: INDUSTRIAL CANDIDATES */}
      <div
        className={`metric-card metric-industrial ${activeFilter === 'industrial' ? 'active-filter' : ''}`}
        onClick={() => onFilterClick && onFilterClick('industrial')}
        role="button"
        tabIndex={0}
      >
        <div className="metric-header">
          <span className="metric-icon">🏭</span>
          <span className="metric-label">Industrial Candidates</span>
        </div>
        <div className="metric-value-row">
          <span className="metric-value">{loading ? '...' : industrialCandidatesCount}</span>
          <span className="metric-badge badge-industrial">≤ 1.0 km Facility</span>
        </div>
        <div className="metric-subtext">Proximity to refineries, power plants & mills</div>
      </div>

      {/* CARD 4: HIGH RISK INCIDENTS */}
      <div
        className={`metric-card metric-high-risk ${activeFilter === 'high_risk' ? 'active-filter' : ''}`}
        onClick={() => onFilterClick && onFilterClick('high_risk')}
        role="button"
        tabIndex={0}
      >
        <div className="metric-header">
          <span className="metric-icon">🚨</span>
          <span className="metric-label">High Risk Incidents</span>
        </div>
        <div className="metric-value-row">
          <span className="metric-value">{loading ? '...' : highRiskCount}</span>
          <span className="metric-badge badge-critical">Risk ≥ 0.70</span>
        </div>
        <div className="metric-subtext">Urgent operational triage required</div>
      </div>
    </div>
  );
}
