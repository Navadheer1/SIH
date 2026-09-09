import {
  faArrowsRotate,
  faChartSimple,
  faFlask,
  faLock,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useState } from 'react';
import { SimulationResultResponse } from '../types/hotspot';

interface WhatIfSimulatorProps {
  liveWindSpeed?: number | null;
  liveWindDirection?: number | null;
  liveFrp: number;
  livePersistence: number;
  onRunSimulation: (scenario: {
    sim_wind_speed?: number;
    sim_wind_direction?: number;
    sim_frp?: number;
    sim_persistence?: number;
  }) => void;
  onResetSimulation: () => void;
  loading: boolean;
  simulationResult?: SimulationResultResponse | null;
}

export const WhatIfSimulator: React.FC<WhatIfSimulatorProps> = ({
  liveWindSpeed = 14,
  liveWindDirection = 248,
  liveFrp,
  livePersistence,
  onRunSimulation,
  onResetSimulation,
  loading,
  simulationResult,
}) => {
  const [simWindSpeed, setSimWindSpeed] = useState<number>(liveWindSpeed || 20);
  const [simWindDirection, setSimWindDirection] = useState<number>(liveWindDirection || 270);
  const [simFrpMultiplier, setSimFrpMultiplier] = useState<number>(1.5);
  const [simPersistence, setSimPersistence] = useState<number>(Math.min(100, livePersistence + 20));

  const computedSimFrp = round(liveFrp * simFrpMultiplier, 1);

  function round(val: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(val * factor) / factor;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRunSimulation({
      sim_wind_speed: simWindSpeed,
      sim_wind_direction: simWindDirection,
      sim_frp: computedSimFrp,
      sim_persistence: simPersistence,
    });
  };

  return (
    <div className="whatif-simulator-card">
      <div className="sim-card-header">
        <span className="sim-icon"><FontAwesomeIcon icon={faFlask} /></span>
        <h4 className="sim-title">WHAT-IF SCENARIO SIMULATOR</h4>
        <span className="isolation-badge">ISOLATED SIMULATION</span>
      </div>

      <div className="sim-isolation-banner">
        <FontAwesomeIcon icon={faLock} /> <em><strong>Simulation Isolation Guarantee:</strong> Runs model-based what-if scenarios in memory. Does NOT modify live alerts or backend state.</em>
      </div>

      <form onSubmit={handleSubmit} className="sim-form-grid">
        {/* Wind Speed Control */}
        <div className="sim-control-group">
          <label className="sim-label">
            <span>Wind Speed (km/h)</span>
            <span className="val-pill">{simWindSpeed} km/h</span>
          </label>
          <input
            type="range"
            min="0"
            max="60"
            step="1"
            value={simWindSpeed}
            onChange={(e) => setSimWindSpeed(Number(e.target.value))}
            className="sim-slider"
          />
          <div className="sim-meta-sub">Live: {liveWindSpeed ?? 'Unavailable'} km/h</div>
        </div>

        {/* Wind Direction Control */}
        <div className="sim-control-group">
          <label className="sim-label">
            <span>Wind Direction (°)</span>
            <span className="val-pill">{simWindDirection}° ({getCardinal(simWindDirection)})</span>
          </label>
          <input
            type="range"
            min="0"
            max="360"
            step="5"
            value={simWindDirection}
            onChange={(e) => setSimWindDirection(Number(e.target.value))}
            className="sim-slider"
          />
          <div className="sim-meta-sub">Live: {liveWindDirection ?? 'Unavailable'}°</div>
        </div>

        {/* FRP Multiplier Control */}
        <div className="sim-control-group">
          <label className="sim-label">
            <span>Thermal FRP Multiplier</span>
            <span className="val-pill">{simFrpMultiplier}x ({computedSimFrp} MW)</span>
          </label>
          <input
            type="range"
            min="1.0"
            max="3.0"
            step="0.1"
            value={simFrpMultiplier}
            onChange={(e) => setSimFrpMultiplier(Number(e.target.value))}
            className="sim-slider"
          />
          <div className="sim-meta-sub">Live: {liveFrp} MW</div>
        </div>

        {/* Persistence Score Control */}
        <div className="sim-control-group">
          <label className="sim-label">
            <span>Persistence Score</span>
            <span className="val-pill">{simPersistence} / 100</span>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={simPersistence}
            onChange={(e) => setSimPersistence(Number(e.target.value))}
            className="sim-slider"
          />
          <div className="sim-meta-sub">Live: {livePersistence} / 100</div>
        </div>

        {/* Actions Row */}
        <div className="sim-actions-row">
          <button type="submit" className="btn-run-sim" disabled={loading}>
            {loading ? 'Running What-If Model...' : 'RUN WHAT-IF SIMULATION'}
          </button>
          <button type="button" className="btn-reset-sim" onClick={onResetSimulation}>
            <FontAwesomeIcon icon={faArrowsRotate} /> RESET TO LIVE
          </button>
        </div>
      </form>

      {/* Quick Simulation Results Summary */}
      {simulationResult && (
        <div className="sim-results-summary-card">
          <div className="summary-header">
            <span className="res-title"><FontAwesomeIcon icon={faChartSimple} /> SIMULATED SCENARIO RESULTS (+3H)</span>
            <span className={`escalation-badge ${simulationResult.comparison_summary.deltas.impact_escalated ? 'escalated' : 'stable'}`}>
              {simulationResult.comparison_summary.deltas.impact_escalated ? 'IMPACT ESCALATED' : 'STABLE THREAT'}
            </span>
          </div>

          <div className="summary-deltas-grid">
            <div className="delta-box">
              <span className="d-label">IMPACT SCORE DELTA</span>
              <span className={`d-val ${simulationResult.comparison_summary.deltas.delta_impact_score > 0 ? 'pos' : 'zero'}`}>
                {simulationResult.comparison_summary.deltas.delta_impact_score > 0 ? '+' : ''}
                {simulationResult.comparison_summary.deltas.delta_impact_score} pts
              </span>
            </div>

            <div className="delta-box">
              <span className="d-label">ADDITIONAL ASSETS EXPOSED</span>
              <span className={`d-val ${simulationResult.comparison_summary.deltas.delta_exposed_assets > 0 ? 'pos' : 'zero'}`}>
                {simulationResult.comparison_summary.deltas.delta_exposed_assets > 0 ? '+' : ''}
                {simulationResult.comparison_summary.deltas.delta_exposed_assets} assets
              </span>
            </div>

            <div className="delta-box">
              <span className="d-label">THREAT AREA DISPLACEMENT</span>
              <span className="d-val">
                +{simulationResult.comparison_summary.deltas.delta_projected_area_sqkm} km²
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function getCardinal(angle: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.floor((angle + 22.5) / 45) % 8;
  return dirs[idx];
}
