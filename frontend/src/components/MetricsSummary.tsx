import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFire,
  faArrowsRotate,
  faIndustry,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';

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
    <section className="metrics-summary-section" aria-label="Thermal metrics summary">
      <div className="metrics-summary-grid">
        {/* CARD 1: THERMAL ANOMALIES */}
        <div
          className={`metric-kpi-card metric-card-thermal ${activeFilter === 'all' ? 'active-filter' : ''}`}
          onClick={() => onFilterClick && onFilterClick('all')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              onFilterClick && onFilterClick('all');
            }
          }}
        >
          <div className="kpi-card-header">
            <div className="kpi-icon-container icon-thermal">
              <FontAwesomeIcon icon={faFire} />
            </div>
            <span className="kpi-badge badge-firms">NASA FIRMS NRT</span>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-large-number">{loading ? '...' : totalHotspots}</span>
          </div>
          <div className="kpi-label-text">Thermal Anomalies</div>
          <p className="kpi-description">Active near-real-time satellite detections</p>
        </div>

        {/* CARD 2: PERSISTENT SOURCES */}
        <div
          className={`metric-kpi-card metric-card-persistent ${activeFilter === 'persistent' ? 'active-filter' : ''}`}
          onClick={() => onFilterClick && onFilterClick('persistent')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              onFilterClick && onFilterClick('persistent');
            }
          }}
        >
          <div className="kpi-card-header">
            <div className="kpi-icon-container icon-persistent">
              <FontAwesomeIcon icon={faArrowsRotate} />
            </div>
            <span className="kpi-badge badge-persistent">Recurrent / Flare</span>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-large-number">{loading ? '...' : persistentCount}</span>
          </div>
          <div className="kpi-label-text">Persistent Sources</div>
          <p className="kpi-description">Multi-day clusters & industrial flare pits</p>
        </div>

        {/* CARD 3: INDUSTRIAL CANDIDATES */}
        <div
          className={`metric-kpi-card metric-card-industrial ${activeFilter === 'industrial' ? 'active-filter' : ''}`}
          onClick={() => onFilterClick && onFilterClick('industrial')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              onFilterClick && onFilterClick('industrial');
            }
          }}
        >
          <div className="kpi-card-header">
            <div className="kpi-icon-container icon-industrial">
              <FontAwesomeIcon icon={faIndustry} />
            </div>
            <span className="kpi-badge badge-industrial">≤ 1.0 km Facility</span>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-large-number">{loading ? '...' : industrialCandidatesCount}</span>
          </div>
          <div className="kpi-label-text">Industrial Candidates</div>
          <p className="kpi-description">Proximity to refineries, power plants & mills</p>
        </div>

        {/* CARD 4: HIGH RISK INCIDENTS */}
        <div
          className={`metric-kpi-card metric-card-high-risk ${activeFilter === 'high_risk' ? 'active-filter' : ''}`}
          onClick={() => onFilterClick && onFilterClick('high_risk')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              onFilterClick && onFilterClick('high_risk');
            }
          }}
        >
          <div className="kpi-card-header">
            <div className="kpi-icon-container icon-risk">
              <FontAwesomeIcon icon={faTriangleExclamation} />
            </div>
            <span className="kpi-badge badge-critical">Risk ≥ 0.70</span>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-large-number">{loading ? '...' : highRiskCount}</span>
          </div>
          <div className="kpi-label-text">High Risk Incidents</div>
          <p className="kpi-description">Urgent operational triage required</p>
        </div>
      </div>
    </section>
  );
}
