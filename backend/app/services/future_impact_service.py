from typing import Dict, List, Any, Optional
from app.services.fire_spread_service import calculate_spread_projection
from app.services.asset_exposure_service import analyze_asset_exposure
from app.services.impact_service import calculate_impact_assessment
from app.services.osm_service import fetch_hotspot_osm_context

async def calculate_future_impact_forecast(
    lat: float,
    lon: float,
    frp: float,
    persistence_score: float = 0.0,
    risk_score: float = 50.0,
    classification: str = "INDUSTRIAL_FIRE",
    wind_speed_kmh: Optional[float] = None,
    wind_direction_deg: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Computes time-series future asset exposure, future impact scores, and priority indices across time horizons.
    Detects potential threat escalation (e.g. MODERATE -> CRITICAL at +3H).
    """
    # Step 1: Calculate fire spread forecast
    spread_data = calculate_spread_projection(
        lat=lat,
        lon=lon,
        frp=frp,
        persistence_score=persistence_score,
        risk_score=risk_score,
        classification=classification,
        wind_speed_kmh=wind_speed_kmh,
        wind_direction_deg=wind_direction_deg,
    )
    
    # Step 2: Fetch baseline OSM features
    osm_context = await fetch_hotspot_osm_context(lat=lat, lon=lon, radius_km=10.0)
    nearby_features = osm_context.get("nearby_features", [])
    
    time_series_forecast = {}
    escalation_detected = False
    escalation_reasons = []
    
    initial_priority = None
    latest_priority = None
    
    for key, proj in spread_data["projections"].items():
        proj_lat = proj["center_latitude"]
        proj_lon = proj["center_longitude"]
        radii = proj["radii_km"]
        
        # Build mock threat zones structure for asset exposure engine
        t_zones = {
            "zones": {
                "inner_zone": {"radius_km": radii["core"]},
                "secondary_zone": {"radius_km": radii["high_risk"]},
                "monitoring_zone": {"radius_km": radii["uncertainty"]},
            }
        }
        
        # Evaluate asset exposure at projected location
        asset_analysis = analyze_asset_exposure(
            hotspot_lat=proj_lat,
            hotspot_lon=proj_lon,
            nearby_features=nearby_features,
            threat_zones=t_zones,
        )
        
        # Compute impact assessment at projected location
        impact_analysis = calculate_impact_assessment(
            frp=frp,
            risk_score=risk_score,
            persistence_score=persistence_score,
            asset_analysis=asset_analysis,
            classification=classification,
        )
        
        curr_p = impact_analysis["priority_index"]
        if initial_priority is None:
            initial_priority = curr_p
        latest_priority = curr_p
        
        time_series_forecast[key] = {
            "time_horizon": key,
            "hours": proj["hours"],
            "center_latitude": proj_lat,
            "center_longitude": proj_lon,
            "projected_area_sqkm": proj["projected_area_sqkm"],
            "confidence_score": proj["confidence_score"],
            "confidence_level": proj["confidence_level"],
            "total_exposed_assets": asset_analysis["total_exposed_assets"],
            "critical_infrastructure_count": asset_analysis["critical_infrastructure_count"],
            "impact_score": impact_analysis["impact_score"],
            "impact_level": impact_analysis["impact_level"],
            "priority_index": curr_p,
            "priority_label": impact_analysis["priority_label"],
            "nearest_critical_asset": asset_analysis.get("nearest_critical_asset"),
            "exposed_assets": asset_analysis["exposed_assets"][:5],  # top 5
        }
        
    # Check for escalation
    p_rank = {"P1": 1, "P2": 2, "P3": 3, "P4": 4}
    if p_rank.get(latest_priority, 4) < p_rank.get(initial_priority, 4):
        escalation_detected = True
        escalation_reasons.append(
            f"Threat Priority projected to escalate from {initial_priority} to {latest_priority} over 12-hour horizon."
        )
        
    now_exp = time_series_forecast.get("NOW", {}).get("total_exposed_assets", 0)
    h12_exp = time_series_forecast.get("+12H", {}).get("total_exposed_assets", 0)
    if h12_exp > now_exp:
        escalation_reasons.append(
            f"Exposed asset count projected to increase from {now_exp} to {h12_exp} potential assets."
        )
        
    return {
        "incident_origin": spread_data["incident_origin"],
        "wind_data": spread_data["wind_data"],
        "spread_speed_kmh": spread_data["spread_speed_kmh"],
        "estimated_direction": spread_data["estimated_direction"],
        "time_series_forecast": time_series_forecast,
        "escalation": {
            "detected": escalation_detected,
            "initial_priority": initial_priority,
            "projected_12h_priority": latest_priority,
            "reasons": escalation_reasons if escalation_reasons else ["Threat progression remains stable within baseline perimeter."],
        },
        "explainable_reasons": spread_data["explainable_reasons"],
        "disclaimer": spread_data["disclaimer"],
        "data_provenance": "MODEL PROJECTION",
    }
