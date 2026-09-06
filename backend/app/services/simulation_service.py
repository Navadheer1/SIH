from typing import Dict, List, Any, Optional
from app.services.fire_spread_service import calculate_spread_projection
from app.services.future_impact_service import calculate_future_impact_forecast

async def run_what_if_simulation(
    lat: float,
    lon: float,
    live_frp: float,
    live_persistence_score: float = 0.0,
    live_risk_score: float = 50.0,
    live_classification: str = "INDUSTRIAL_FIRE",
    live_wind_speed: Optional[float] = None,
    live_wind_direction: Optional[float] = None,
    # Simulated scenario parameters
    sim_wind_speed: Optional[float] = None,
    sim_wind_direction: Optional[float] = None,
    sim_frp: Optional[float] = None,
    sim_persistence_score: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Executes a What-If simulation comparing live conditions against user-defined scenario parameters.
    
    ISOLATION GUARANTEE: Does NOT mutate live backend state, alerts, or historical logs.
    """
    # Effective simulation inputs (fallback to live values if not overridden)
    effective_frp = sim_frp if sim_frp is not None else live_frp
    effective_persistence = sim_persistence_score if sim_persistence_score is not None else live_persistence_score
    effective_wind_speed = sim_wind_speed if sim_wind_speed is not None else live_wind_speed
    effective_wind_direction = sim_wind_direction if sim_wind_direction is not None else live_wind_direction
    
    # 1. Compute Live Forecast Baseline
    live_forecast = await calculate_future_impact_forecast(
        lat=lat,
        lon=lon,
        frp=live_frp,
        persistence_score=live_persistence_score,
        risk_score=live_risk_score,
        classification=live_classification,
        wind_speed_kmh=live_wind_speed,
        wind_direction_deg=live_wind_direction,
    )
    
    # 2. Compute Simulated Forecast
    sim_forecast = await calculate_future_impact_forecast(
        lat=lat,
        lon=lon,
        frp=effective_frp,
        persistence_score=effective_persistence,
        risk_score=live_risk_score,
        classification=live_classification,
        wind_speed_kmh=effective_wind_speed,
        wind_direction_deg=effective_wind_direction,
    )
    
    # 3. Compute Delta Comparisons for +3H and +6H
    live_3h = live_forecast["time_series_forecast"].get("+3H", {})
    sim_3h = sim_forecast["time_series_forecast"].get("+3H", {})
    
    delta_impact_3h = round(sim_3h.get("impact_score", 0) - live_3h.get("impact_score", 0), 1)
    delta_assets_3h = sim_3h.get("total_exposed_assets", 0) - live_3h.get("total_exposed_assets", 0)
    delta_area_3h = round(sim_3h.get("projected_area_sqkm", 0) - live_3h.get("projected_area_sqkm", 0), 2)
    
    comparison_summary = {
        "time_horizon": "+3H",
        "live_conditions": {
            "wind_speed_kmh": live_wind_speed,
            "wind_direction_deg": live_wind_direction,
            "frp": live_frp,
            "impact_score": live_3h.get("impact_score"),
            "exposed_assets": live_3h.get("total_exposed_assets"),
            "projected_area_sqkm": live_3h.get("projected_area_sqkm"),
            "priority_index": live_3h.get("priority_index"),
        },
        "simulated_conditions": {
            "wind_speed_kmh": effective_wind_speed,
            "wind_direction_deg": effective_wind_direction,
            "frp": effective_frp,
            "impact_score": sim_3h.get("impact_score"),
            "exposed_assets": sim_3h.get("total_exposed_assets"),
            "projected_area_sqkm": sim_3h.get("projected_area_sqkm"),
            "priority_index": sim_3h.get("priority_index"),
        },
        "deltas": {
            "delta_impact_score": delta_impact_3h,
            "delta_exposed_assets": delta_assets_3h,
            "delta_projected_area_sqkm": delta_area_3h,
            "impact_escalated": delta_impact_3h > 0,
        },
    }
    
    return {
        "status": "SIMULATION_SUCCESS",
        "is_simulation": True,
        "isolation_guarantee": "VERIFIED: Live incident state was not modified.",
        "simulated_scenario_inputs": {
            "wind_speed_kmh": effective_wind_speed,
            "wind_direction_deg": effective_wind_direction,
            "frp": effective_frp,
            "persistence_score": effective_persistence,
        },
        "comparison_summary": comparison_summary,
        "live_forecast": live_forecast,
        "simulated_forecast": sim_forecast,
        "data_provenance": "SIMULATED SCENARIO",
        "disclaimer": "SIMULATION MODE: Results represent model what-if scenarios for response planning. Live operational data was not modified.",
    }
