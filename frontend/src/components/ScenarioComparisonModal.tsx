import React from 'react';
import { SimulationResultResponse } from '../types/hotspot';

interface ScenarioComparisonModalProps {
  simulationResult: SimulationResultResponse;
  onClose: () => void;
}

export const ScenarioComparisonModal: React.FC<ScenarioComparisonModalProps> = ({
  simulationResult,
  onClose,
}) => {
  const summary = simulationResult.comparison_summary;
  const live = summary.live_conditions;
  const sim = summary.simulated_conditions;
  const deltas = summary.deltas;

  return (
    <div className="scenario-modal-backdrop">
      <div className="scenario-modal-content">
        <div className="scenario-modal-header">
          <div className="title-group">
            <span className="header-icon">⚖️</span>
            <h3 className="modal-title">Scenario Comparison: Live Conditions vs Simulated Scenario</h3>
          </div>
          <button type="button" className="btn-close-modal" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="scenario-modal-body">
          <div className="isolation-notice">
            🔒 <strong>Simulation Verification:</strong> Live data remains untouched. This delta evaluation provides decision support for potential extreme weather and fire escalation scenarios.
          </div>

          <table className="comparison-table">
            <thead>
              <tr>
                <th>PARAMETER / METRIC (+3H)</th>
                <th>LIVE CONDITIONS</th>
                <th>SIMULATED SCENARIO</th>
                <th>DELTA / IMPACT</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="param-title">Wind Telemetry</td>
                <td>{live.wind_speed_kmh ?? 'N/A'} km/h @ {live.wind_direction_deg ?? 'N/A'}°</td>
                <td className="highlight-sim">{sim.wind_speed_kmh} km/h @ {sim.wind_direction_deg}°</td>
                <td>{sim.wind_speed_kmh > (live.wind_speed_kmh || 0) ? 'Increased Wind Speed' : 'Custom Vector'}</td>
              </tr>
              <tr>
                <td className="param-title">Thermal FRP Intensity</td>
                <td>{live.frp} MW</td>
                <td className="highlight-sim">{sim.frp} MW</td>
                <td>+{(sim.frp - live.frp).toFixed(1)} MW</td>
              </tr>
              <tr>
                <td className="param-title">Dynamic Impact Score</td>
                <td>{live.impact_score} / 100</td>
                <td className="highlight-sim">{sim.impact_score} / 100</td>
                <td className={deltas.delta_impact_score > 0 ? 'text-red' : ''}>
                  {deltas.delta_impact_score > 0 ? '+' : ''}{deltas.delta_impact_score} pts
                </td>
              </tr>
              <tr>
                <td className="param-title">Potentially Exposed Assets</td>
                <td>{live.exposed_assets} assets</td>
                <td className="highlight-sim">{sim.exposed_assets} assets</td>
                <td className={deltas.delta_exposed_assets > 0 ? 'text-red' : ''}>
                  {deltas.delta_exposed_assets > 0 ? '+' : ''}{deltas.delta_exposed_assets} assets
                </td>
              </tr>
              <tr>
                <td className="param-title">Projected Threat Area</td>
                <td>{live.projected_area_sqkm} km²</td>
                <td className="highlight-sim">{sim.projected_area_sqkm} km²</td>
                <td>+{deltas.delta_projected_area_sqkm} km²</td>
              </tr>
              <tr>
                <td className="param-title">Dispatch Priority Index</td>
                <td>
                  <span className={`p-pill p-${(live.priority_index || 'p1').toLowerCase()}`}>
                    {live.priority_index}
                  </span>
                </td>
                <td>
                  <span className={`p-pill p-${(sim.priority_index || 'p1').toLowerCase()}`}>
                    {sim.priority_index}
                  </span>
                </td>
                <td>{sim.priority_index !== live.priority_index ? 'Priority Shifted' : 'Unchanged'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="scenario-modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close Comparison
          </button>
        </div>
      </div>
    </div>
  );
};
