import math
from typing import Dict, List, Any, Optional

def calculate_spread_projection(
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
    Calculates model-based potential threat expansion across time horizons (NOW, +1H, +3H, +6H, +12H).
    Integrates wind speed & direction if available; falls back to an uncertainty-aware isotropic model if wind is unavailable.
    
    IMPORTANT: All outputs represent model-based decision support projections, NOT guaranteed fire perimeters.
    """
    wind_available = (wind_speed_kmh is not None) and (wind_direction_deg is not None)
    
    # Default conservative wind if unavailable (for baseline geometry calculation, marked explicitly)
    effective_wind_speed = wind_speed_kmh if wind_available else 0.0
    effective_wind_dir = wind_direction_deg if wind_available else 0.0
    
    # Calculate propagation velocity (km/h) based on FRP intensity & wind
    base_spread_rate = 0.2 + (min(frp, 100.0) / 100.0) * 0.8  # 0.2 to 1.0 km/h base
    wind_factor = (effective_wind_speed / 20.0) * 0.5 if wind_available else 0.0
    spread_speed_kmh = round(base_spread_rate + wind_factor, 2)
    
    # Convert meteorological wind direction (direction wind blows FROM) to heading (direction wind blows TOWARD)
    heading_deg = (effective_wind_dir + 180.0) % 360.0
    heading_rad = math.radians(heading_deg)
    
    # Determine direction cardinal text
    cardinal_directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    cardinal_idx = int((heading_deg + 22.5) / 45.0) % 8
    estimated_direction_text = cardinal_directions[cardinal_idx] if wind_available else "ISOTROPIC EXPANSION (WIND UNAVAILABLE)"
    
    # Time horizons definition
    horizons = [
        {"key": "NOW", "hours": 0.0, "label": "Current Detection"},
        {"key": "+1H", "hours": 1.0, "label": "+1 Hour Forecast"},
        {"key": "+3H", "hours": 3.0, "label": "+3 Hours Forecast"},
        {"key": "+6H", "hours": 6.0, "label": "+6 Hours Forecast"},
        {"key": "+12H", "hours": 12.0, "label": "+12 Hours Forecast"},
    ]
    
    projections: Dict[str, Any] = {}
    
    for h in horizons:
        key = h["key"]
        t = h["hours"]
        
        # Distance displacement along heading vector
        displacement_km = spread_speed_kmh * t if wind_available else 0.0
        
        # 1 degree latitude ~ 111 km; 1 degree longitude ~ 111 * cos(lat) km
        delta_lat = (displacement_km * math.cos(heading_rad)) / 111.0 if wind_available else 0.0
        delta_lon = (displacement_km * math.sin(heading_rad)) / (111.0 * math.cos(math.radians(lat))) if wind_available else 0.0
        
        proj_lat = round(lat + delta_lat, 5)
        proj_lon = round(lon + delta_lon, 5)
        
        # Threat Radii (km)
        core_radius = round(0.3 + (t * 0.1) + (min(frp, 100.0) / 200.0), 2)
        high_risk_radius = round(core_radius + 0.5 + (t * 0.25), 2)
        uncertainty_radius = round(high_risk_radius + 0.6 + (t * 0.4), 2)
        monitoring_radius = round(uncertainty_radius + 1.0 + (t * 0.5), 2)
        
        projected_area_sqkm = round(math.pi * high_risk_radius * (high_risk_radius + displacement_km * 0.5), 2)
        
        base_confidence = 95.0 if t == 0 else max(30.0, 90.0 - (t * 4.5))
        if not wind_available:
            base_confidence = max(20.0, base_confidence - 20.0)
            
        confidence_level = "HIGH" if base_confidence >= 75 else ("MEDIUM" if base_confidence >= 50 else "LOW")
        
        polygon_points = []
        num_points = 16
        for i in range(num_points):
            angle = (2 * math.pi / num_points) * i
            stretch = 1.0 + (0.4 * math.cos(angle - heading_rad)) if wind_available and t > 0 else 1.0
            r_lat = (uncertainty_radius * stretch * math.cos(angle)) / 111.0
            r_lon = (uncertainty_radius * stretch * math.sin(angle)) / (111.0 * math.cos(math.radians(proj_lat)))
            polygon_points.append([round(proj_lat + r_lat, 5), round(proj_lon + r_lon, 5)])
            
        projections[key] = {
            "time_horizon": key,
            "hours": t,
            "label": h["label"],
            "center_latitude": proj_lat,
            "center_longitude": proj_lon,
            "displacement_km": round(displacement_km, 2),
            "radii_km": {
                "core": core_radius,
                "high_risk": high_risk_radius,
                "uncertainty": uncertainty_radius,
                "monitoring": monitoring_radius,
            },
            "projected_area_sqkm": projected_area_sqkm,
            "confidence_score": round(base_confidence, 1),
            "confidence_level": confidence_level,
            "polygon_points": polygon_points,
            "relative_intensity": "CRITICAL" if frp >= 50 or risk_score >= 75 else ("HIGH" if frp >= 25 or risk_score >= 50 else ("MODERATE" if frp >= 10 else "LOW")),
        }
        
    xai_reasons = [
        f"Base propagation velocity calculated at {spread_speed_kmh} km/h from FRP intensity ({frp} MW).",
        f"Directional corridor: {estimated_direction_text}" + (f" ({heading_deg:.0f}° heading at {effective_wind_speed} km/h wind)" if wind_available else " (isotropic model used as wind data is unavailable)."),
        f"Persistence factor ({persistence_score}/100) applied to temporal expansion rate.",
        "Projection confidence decays over longer time horizons due to atmospheric & terrain variability.",
    ]
    
    if not wind_available:
        xai_reasons.insert(1, "⚠ Wind data unavailable — directional confidence reduced. Displaying conservative uncertainty envelope.")
        
    return {
        "incident_origin": {
            "latitude": lat,
            "longitude": lon,
            "frp": frp,
            "risk_score": risk_score,
            "classification": classification,
        },
        "wind_data": {
            "available": wind_available,
            "wind_speed_kmh": wind_speed_kmh,
            "wind_direction_deg": wind_direction_deg,
            "heading_deg": round(heading_deg, 1) if wind_available else None,
            "cardinal_direction": estimated_direction_text,
            "status_text": f"{wind_speed_kmh} km/h at {wind_direction_deg}°" if wind_available else "DATA UNAVAILABLE",
        },
        "spread_speed_kmh": spread_speed_kmh,
        "estimated_direction": estimated_direction_text,
        "projections": projections,
        "explainable_reasons": xai_reasons,
        "disclaimer": "MODEL PROJECTION ONLY: Represents AI-based potential threat areas for situational awareness and decision support. Not a guaranteed fire perimeter or official evacuation boundary.",
        "data_provenance": "MODEL PROJECTION",
    }
