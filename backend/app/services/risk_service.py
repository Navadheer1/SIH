import time
import logging
from typing import Dict, Any, List, Tuple, Optional

from app.ml.feature_engineering import extract_features
from app.ml.classifier import classify_thermal_event

logger = logging.getLogger(__name__)


def _calculate_thermal_severity(frp: float, brightness: float, confidence_score: float) -> Tuple[float, Dict[str, float]]:
    """
    Calculate deterministic thermal severity component score (0 - 30 points):
    - FRP (0 - 50+ MW): up to 18 points
    - Brightness (300 - 360+ K): up to 7 points
    - Satellite Confidence (0.0 - 1.0): up to 5 points
    """
    frp_clamped = max(0.0, float(frp or 0.0))
    frp_contrib = min(18.0, (frp_clamped / 50.0) * 18.0)

    bright_clamped = max(300.0, min(360.0, float(brightness or 320.0)))
    bright_contrib = ((bright_clamped - 300.0) / 60.0) * 7.0

    conf_clamped = max(0.0, min(1.0, float(confidence_score or 0.5)))
    conf_contrib = conf_clamped * 5.0

    total_thermal = round(frp_contrib + bright_contrib + conf_contrib, 1)
    return min(30.0, total_thermal), {
        "frp_contrib": round(frp_contrib, 1),
        "brightness_contrib": round(bright_contrib, 1),
        "confidence_contrib": round(conf_contrib, 1),
    }


def _calculate_industrial_exposure(nearby_features: List[Dict[str, Any]]) -> Tuple[float, Optional[Dict[str, Any]]]:
    """
    Calculate deterministic industrial exposure score (0 - 25 points) with distance decay:
    - Distance decay:
      - 0.0 - 0.5 km: 1.0x (Extreme proximity)
      - 0.5 - 1.0 km: 0.85x (Very high)
      - 1.0 - 2.0 km: 0.65x (High)
      - 2.0 - 3.0 km: 0.45x (Moderate)
      - 3.0 - 5.0 km: 0.25x (Low but relevant)
      - > 5.0 km: 0.0x (Ignored)
    - Base hazard weight:
      - High-Hazard Petrochemical / Refinery / Chemical: 25.0 pts
      - Power Generation: 22.0 pts
      - Industrial Manufacturing / Steel: 20.0 pts
      - Warehouse / Storage: 14.0 pts
    """
    ind_features = [f for f in nearby_features if f.get("category") == "INDUSTRIAL" and f.get("distance_km", 999) <= 5.0]
    if not ind_features:
        return 0.0, None

    # Closest industrial facility dictates primary exposure
    closest = ind_features[0]
    dist = float(closest.get("distance_km", 5.0))

    if dist <= 0.5:
        decay = 1.0
    elif dist <= 1.0:
        decay = 0.85
    elif dist <= 2.0:
        decay = 0.65
    elif dist <= 3.0:
        decay = 0.45
    elif dist <= 5.0:
        decay = 0.25
    else:
        return 0.0, None

    typ_lower = (closest.get("type") or "").lower()
    if any(k in typ_lower for k in ["chemical", "petrochemical", "refinery", "fuel", "gas"]):
        base = 25.0
    elif "power" in typ_lower:
        base = 22.0
    elif any(k in typ_lower for k in ["steel", "manufacturing", "factory", "plant", "industrial"]):
        base = 20.0
    else:
        base = 15.0

    score = round(min(25.0, base * decay), 1)
    return score, closest


def _calculate_population_exposure(nearby_features: List[Dict[str, Any]]) -> Tuple[float, Optional[Dict[str, Any]], int]:
    """
    Calculate deterministic population & residential exposure score (0 - 20 points):
    - Evaluates settlements, villages, towns within 5.0 km
    - Distance decay:
      - 0.0 - 1.0 km: 1.0x
      - 1.0 - 2.5 km: 0.7x
      - 2.5 - 5.0 km: 0.4x
    - Multi-settlement accumulation: +2 pts per additional settlement up to max 20 pts.
    """
    res_features = [f for f in nearby_features if f.get("category") == "RESIDENTIAL" and f.get("distance_km", 999) <= 5.0]
    if not res_features:
        return 0.0, None, 0

    closest = res_features[0]
    dist = float(closest.get("distance_km", 5.0))

    if dist <= 1.0:
        decay = 1.0
    elif dist <= 2.5:
        decay = 0.70
    elif dist <= 5.0:
        decay = 0.40
    else:
        decay = 0.0

    base = 16.0
    settlement_count = len(res_features)
    cluster_bonus = min(4.0, max(0, settlement_count - 1) * 2.0)

    score = round(min(20.0, (base * decay) + cluster_bonus), 1)
    return score, closest, settlement_count


def _calculate_critical_infrastructure_exposure(nearby_features: List[Dict[str, Any]]) -> Tuple[float, Optional[Dict[str, Any]]]:
    """
    Calculate critical infrastructure & utility exposure score (0 - 15 points):
    - Electrical substations, emergency fire stations, police, railway stations, airports, water facilities within 5.0 km.
    """
    crit_features = [f for f in nearby_features if f.get("category") in ["CRITICAL_INFRASTRUCTURE", "TRANSPORT"] and f.get("distance_km", 999) <= 5.0]
    if not crit_features:
        return 0.0, None

    closest = crit_features[0]
    dist = float(closest.get("distance_km", 5.0))

    if dist <= 1.0:
        decay = 1.0
    elif dist <= 2.5:
        decay = 0.70
    elif dist <= 5.0:
        decay = 0.40
    else:
        decay = 0.0

    cat = closest.get("category")
    base = 15.0 if cat == "CRITICAL_INFRASTRUCTURE" else 10.0
    score = round(min(15.0, base * decay), 1)
    return score, closest


def _calculate_healthcare_education_exposure(nearby_features: List[Dict[str, Any]]) -> Tuple[float, List[Dict[str, Any]]]:
    """
    Calculate healthcare and education exposure score (0 - 10 points):
    - Hospitals / clinics: 10.0 pts base * decay
    - Schools / universities: 7.0 pts base * decay
    """
    he_features = [f for f in nearby_features if f.get("category") in ["HEALTHCARE", "EDUCATION"] and f.get("distance_km", 999) <= 5.0]
    if not he_features:
        return 0.0, []

    closest = he_features[0]
    dist = float(closest.get("distance_km", 5.0))

    if dist <= 1.0:
        decay = 1.0
    elif dist <= 2.5:
        decay = 0.75
    elif dist <= 5.0:
        decay = 0.45
    else:
        decay = 0.0

    is_hospital = any(f.get("category") == "HEALTHCARE" for f in he_features)
    base = 10.0 if is_hospital else 7.0
    score = round(min(10.0, base * decay), 1)
    return score, he_features


def _determine_priority_level(total_score: int) -> str:
    """Map total risk score (0 - 100) to operational priority level."""
    if total_score >= 75:
        return "CRITICAL"
    elif total_score >= 50:
        return "HIGH"
    elif total_score >= 25:
        return "MODERATE"
    else:
        return "LOW"


def _generate_explainable_reasons(
    thermal_contrib: float,
    frp: float,
    ind_facility: Optional[Dict[str, Any]],
    ind_contrib: float,
    pop_facility: Optional[Dict[str, Any]],
    settlement_count: int,
    crit_facility: Optional[Dict[str, Any]],
    he_facilities: List[Dict[str, Any]],
    total_score: int,
    context_classification: str
) -> List[str]:
    """
    Generate clear, deterministic, explainable reasons for SIH operational dispatchers.
    Zero synthetic or fabricated statements.
    """
    reasons = []

    # 1. Industrial proximity reason
    if ind_facility:
        name = ind_facility.get("name") or "industrial facility"
        dist = ind_facility.get("distance_km")
        reasons.append(f"Thermal anomaly within {dist} km of industrial facility ({name})")
    
    # 2. Healthcare & Education
    hospitals = [f for f in he_facilities if f.get("category") == "HEALTHCARE"]
    schools = [f for f in he_facilities if f.get("category") == "EDUCATION"]
    if hospitals:
        h_name = hospitals[0].get("name") or "Hospital / Clinic"
        h_dist = hospitals[0].get("distance_km")
        reasons.append(f"Healthcare facility ({h_name}) within {h_dist} km operational radius")
    if schools:
        s_name = schools[0].get("name") or "Educational Institution"
        s_dist = schools[0].get("distance_km")
        reasons.append(f"Educational institution ({s_name}) within {s_dist} km operational radius")

    # 3. Population & Residential
    if pop_facility:
        p_name = pop_facility.get("name") or "Residential settlement"
        p_dist = pop_facility.get("distance_km")
        if settlement_count > 1:
            reasons.append(f"{settlement_count} residential settlements within 5 km (nearest: {p_name} at {p_dist} km)")
        else:
            reasons.append(f"Residential settlement ({p_name}) detected at {p_dist} km")

    # 4. Critical Infrastructure
    if crit_facility:
        c_name = crit_facility.get("name") or "Critical infrastructure"
        c_dist = crit_facility.get("distance_km")
        reasons.append(f"Critical infrastructure ({c_name}) located {c_dist} km from anomaly")

    # 5. Thermal severity
    if frp >= 40.0:
        reasons.append(f"Intense combustion radiometry (FRP: {frp:.1f} MW)")
    elif frp >= 15.0:
        reasons.append(f"Active fire radiative output (FRP: {frp:.1f} MW)")

    # 6. Fallback when no significant infrastructure is within 5 km
    if not ind_facility and not pop_facility and not he_facilities and not crit_facility:
        if context_classification == "FOREST":
            reasons.append("Thermal anomaly detected in forest / woodland terrain; no industrial assets within 5 km")
        elif context_classification == "AGRICULTURAL":
            reasons.append("Thermal anomaly detected in agricultural farmland; no industrial assets within 5 km")
        else:
            reasons.append("No significant mapped infrastructure detected within 5 km operational radius")

    return reasons


def calculate_risk_score(
    spot_or_cluster: Dict[str, Any],
    osm_context: Optional[Dict[str, Any]] = None,
    ai_classification: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Calculate an explainable Geospatial Threat & Priority Risk Score (0 - 100).
    Evaluates real 5 KM OpenStreetMap features, distance decay, and NASA FIRMS thermal radiometry:
      - Thermal Severity: 0 - 30 points
      - Industrial Exposure: 0 - 25 points
      - Population / Residential Exposure: 0 - 20 points
      - Critical Infrastructure & Utilities: 0 - 15 points
      - Healthcare & Education: 0 - 10 points
    Total Score is strictly deterministic and bounded to [0, 100].
    """
    now = time.time()

    # 1. Feature Extraction
    feature_dict, _ = extract_features(spot_or_cluster, osm_context)
    frp = float(feature_dict.get("frp", 0.0))
    brightness = float(feature_dict.get("brightness", 320.0))
    confidence_score = float(feature_dict.get("confidence_score", 0.5))

    # 2. Extract OSM features within 5 km
    ctx = osm_context or spot_or_cluster.get("industrial_context") or {}
    nearby_features = ctx.get("nearby_features", []) if isinstance(ctx, dict) else []
    # Strict 5 km enforcement
    valid_features = [f for f in nearby_features if f.get("distance_km", 999) <= 5.0]

    context_classification = ctx.get("context_classification", "UNCLASSIFIED") if isinstance(ctx, dict) else "UNCLASSIFIED"

    # 3. Calculate Component Scores
    thermal_score, thermal_breakdown = _calculate_thermal_severity(frp, brightness, confidence_score)
    ind_score, ind_closest = _calculate_industrial_exposure(valid_features)
    pop_score, pop_closest, settlement_count = _calculate_population_exposure(valid_features)
    crit_score, crit_closest = _calculate_critical_infrastructure_exposure(valid_features)
    he_score, he_list = _calculate_healthcare_education_exposure(valid_features)

    # 4. Total Bounded Score (0 - 100)
    raw_total = thermal_score + ind_score + pop_score + crit_score + he_score
    total_score = max(0, min(100, int(round(raw_total))))

    priority_level = _determine_priority_level(total_score)

    # 5. Closest Critical Entity overall
    critical_candidates = []
    if ind_closest:
        critical_candidates.append(ind_closest)
    if he_list:
        critical_candidates.append(he_list[0])
    if pop_closest:
        critical_candidates.append(pop_closest)
    if crit_closest:
        critical_candidates.append(crit_closest)

    critical_candidates.sort(key=lambda x: x.get("distance_km", 999))
    closest_critical = critical_candidates[0] if critical_candidates else None

    # 6. Classification resolution
    if ind_score >= 12.0:
        event_classification = "INDUSTRIAL_FIRE_CANDIDATE"
    elif pop_score >= 10.0:
        event_classification = "SETTLEMENT_PROXIMITY_THREAT"
    elif context_classification == "FOREST":
        event_classification = "FOREST_WILDFIRE_CANDIDATE"
    elif context_classification == "AGRICULTURAL":
        event_classification = "AGRICULTURAL_BURNING_CANDIDATE"
    elif valid_features:
        event_classification = "GENERAL_INFRASTRUCTURE_PROXIMITY"
    else:
        event_classification = "UNCLASSIFIED_OPEN_LAND"

    # 7. Generate Explainable Reasons
    reasons = _generate_explainable_reasons(
        thermal_contrib=thermal_score,
        frp=frp,
        ind_facility=ind_closest,
        ind_contrib=ind_score,
        pop_facility=pop_closest,
        settlement_count=settlement_count,
        crit_facility=crit_closest,
        he_facilities=he_list,
        total_score=total_score,
        context_classification=context_classification
    )

    return {
        "risk_score": total_score,
        "risk_level": priority_level,
        "priority": priority_level,
        "model_source": "GEOSPATIAL_PROXIMITY_ENGINE",
        "classification": event_classification,
        "closest_critical_asset": closest_critical,
        "exposed_assets_count": len(valid_features),
        "components": {
            "thermal_severity": thermal_score,
            "industrial_exposure": ind_score,
            "population_exposure": pop_score,
            "critical_infrastructure": crit_score,
            "healthcare_education": he_score,
        },
        "reasons": reasons,
        "calculated_at": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(now)),
    }
