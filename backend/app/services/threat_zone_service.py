"""
Phase 2: Dynamic Threat Zone Generation Service

Calculates dynamic, multi-tier threat assessment zones around thermal anomalies based on:
- Fire Radiative Power (FRP in MW)
- Investigation Risk Score (0-100)
- AI Classification Context
- Spatial-Temporal Persistence
"""

import math
from typing import Dict, Any

def calculate_threat_zones(
    frp: float,
    risk_score: float = 50.0,
    severity: str = "MODERATE",
    classification: str = "THERMAL_EVENT",
    persistence_score: float = 0.0
) -> Dict[str, Any]:
    """
    Calculate dynamic radii (in km) for Inner, Secondary, and Monitoring threat zones.
    Does NOT use a static hardcoded radius for all events.
    """
    # Base Radii (in km)
    base_inner = 0.8
    base_secondary = 2.5
    base_monitoring = 4.5

    # FRP Scaling Factor (0.0 to 1.5)
    frp_factor = math.log1p(max(0.0, frp)) / 3.0

    # Risk Score Scaling (0.0 to 0.8)
    risk_factor = (max(0.0, min(100.0, risk_score)) / 100.0) * 0.8

    # Classification Multiplier
    class_multiplier = 1.25 if "INDUSTRIAL" in classification.upper() else 1.0

    # Persistence Scaling
    persistence_factor = (max(0.0, min(100.0, persistence_score)) / 100.0) * 0.3

    # Total Radius Multiplier
    multiplier = (1.0 + frp_factor + risk_factor + persistence_factor) * class_multiplier

    inner_radius = round(base_inner * multiplier, 2)
    secondary_radius = round(base_secondary * multiplier, 2)
    monitoring_radius = round(base_monitoring * multiplier, 2)

    # Caps for safety boundaries
    inner_radius = max(0.5, min(2.5, inner_radius))
    secondary_radius = max(1.5, min(5.0, secondary_radius))
    monitoring_radius = max(3.0, min(8.0, monitoring_radius))

    return {
        "zones": {
            "inner_zone": {
                "name": "Inner Tactical Zone",
                "radius_km": inner_radius,
                "color": "#ef4444",
                "fill_opacity": 0.25,
                "threat_level": "CRITICAL EXPOSURE",
                "description": "Immediate tactical isolation area. Flashover and thermal radiation hazard zone."
            },
            "secondary_zone": {
                "name": "Secondary Impact Zone",
                "radius_km": secondary_radius,
                "color": "#f59e0b",
                "fill_opacity": 0.15,
                "threat_level": "MODERATE EXPOSURE",
                "description": "Potentially affected surrounding perimeter. Airborne particulate and plume dispersion zone."
            },
            "monitoring_zone": {
                "name": "Perimeter Monitoring Zone",
                "radius_km": monitoring_radius,
                "color": "#38bdf8",
                "fill_opacity": 0.08,
                "threat_level": "MONITORING ZONE",
                "description": "Logistics and traffic control corridor. Requires authority observation."
            }
        },
        "factors_applied": {
            "frp_mw": frp,
            "risk_score": risk_score,
            "severity": severity,
            "classification": classification,
            "persistence_score": persistence_score,
            "scaling_multiplier": round(multiplier, 2)
        },
        "disclaimer": "AI-generated risk/impact assessment zones — NOT official government evacuation boundaries."
    }
