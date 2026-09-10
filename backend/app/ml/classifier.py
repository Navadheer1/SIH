from typing import Dict, Any, List, Tuple
import numpy as np

from app.ml.feature_engineering import extract_features
from app.ml.model_manager import load_model

PROTOTYPE_VERSION = "prototype-1.0"

# Target prototype classification categories
CATEGORIES = [
    "INDUSTRIAL_FIRE_CANDIDATE",
    "PERSISTENT_THERMAL_SOURCE",
    "AGRICULTURAL_BURNING_CANDIDATE",
    "WILDFIRE_CANDIDATE",
    "GAS_FLARE_CANDIDATE",
    "UNCERTAIN"
]


def _generate_supporting_indicators(fd: Dict[str, Any], classification: str) -> List[str]:
    """
    Generate human-readable supporting indicators explaining why the classifier
    produced the given prediction (Explainable AI).
    """
    indicators: List[str] = []

    # FRP Indicator
    frp = fd["frp"]
    if frp >= 40.0:
        indicators.append(f"High Fire Radiative Power (FRP: {frp} MW)")
    elif frp >= 15.0:
        indicators.append(f"Moderate Fire Radiative Power (FRP: {frp} MW)")
    else:
        indicators.append(f"Low Fire Radiative Power (FRP: {frp} MW)")

    # Satellite Confidence Indicator
    conf = fd["confidence_score"]
    if conf >= 0.8:
        indicators.append("High satellite detection confidence score")
    elif conf >= 0.5:
        indicators.append("Nominal satellite detection confidence score")

    # Industrial Proximity Indicator
    dist = fd["industrial_distance_km"]
    is_ind = fd["is_industrial_zone"]
    if is_ind == 1 or dist <= 1.0:
        indicators.append(f"Industrial facility mapped within {dist} km")
    elif dist <= 3.0:
        indicators.append(f"Located near industrial zone ({dist} km)")
    else:
        indicators.append(f"No industrial facilities within immediate vicinity ({dist} km)")

    # Persistence & Temporal Indicators
    score = fd["persistence_score"]
    obs = fd["observation_count"]
    dur = fd["duration_hours"]

    if score >= 60:
        indicators.append(f"High Persistence Score ({score} / 100)")
    elif score >= 30:
        indicators.append(f"Moderate Persistence Score ({score} / 100)")

    if obs > 1:
        indicators.append(f"Detected across {obs} satellite observations")
    
    if dur > 2.0:
        indicators.append(f"Sustained thermal activity over {dur} hours")

    return indicators


def _prototype_rule_engine_predict(fd: Dict[str, Any], context_class: str = "") -> Tuple[str, int]:
    """
    Prototype Rule Engine Fallback when no trained ML model artifact is present.
    Deterministic, transparent classification based on spatial-temporal rules.
    """
    frp = fd["frp"]
    dist = fd["industrial_distance_km"]
    is_ind = fd["is_industrial_zone"]
    score = fd["persistence_score"]
    obs = fd["observation_count"]
    dur = fd["duration_hours"]

    # Rule 1: High FRP + Close Industrial Proximity + High Persistence -> INDUSTRIAL_FIRE_CANDIDATE
    if frp >= 40.0 and (dist <= 2.5 or is_ind == 1) and score >= 60:
        return ("INDUSTRIAL_FIRE_CANDIDATE", 87)

    # Rule 2: High Persistence Score or Recurring Detections -> PERSISTENT_THERMAL_SOURCE
    if score >= 60 or (dist <= 2.5 and obs >= 3):
        return ("PERSISTENT_THERMAL_SOURCE", 85)

    # Rule 3: Moderate FRP + Close Industrial Proximity -> GAS_FLARE_CANDIDATE
    if dist <= 1.5 and frp < 30.0 and score >= 30:
        return ("GAS_FLARE_CANDIDATE", 78)

    # Rule 3b: Industrial Zone or direct containment -> INDUSTRIAL_FIRE_CANDIDATE or PERSISTENT_THERMAL_SOURCE
    if is_ind == 1 or dist <= 2.5:
        if score >= 40 or obs >= 2:
            return ("PERSISTENT_THERMAL_SOURCE", 82)
        return ("INDUSTRIAL_FIRE_CANDIDATE", 80)

    # Rule 4: Verified Agricultural Context
    if "AGRICULTURAL" in context_class.upper():
        return ("AGRICULTURAL_BURNING_CANDIDATE", 75)

    # Rule 5: Verified Wildfire / Environmental Context
    if "WILDFIRE" in context_class.upper() or "FOREST" in context_class.upper() or "ENVIRONMENTAL" in context_class.upper():
        return ("WILDFIRE_CANDIDATE", 72)

    # Fallback Rule: UNCERTAIN (Never guess Wildfire without supporting spatial or optical data)
    return ("UNCERTAIN", 50)


def classify_thermal_event(
    spot_or_cluster: Dict[str, Any],
    osm_context: Any = None
) -> Dict[str, Any]:
    """
    Execute AI classification for a thermal hotspot or cluster.
    Uses trained scikit-learn model if binary is present, or transparent PROTOTYPE_RULE_ENGINE fallback.
    Returns prediction, confidence percentage, supporting indicators, and raw feature dictionary.
    """
    feature_dict, feature_vector = extract_features(spot_or_cluster, osm_context)
    model, model_status = load_model()

    ctx = osm_context or spot_or_cluster.get("industrial_context")
    ctx_class = ""
    if isinstance(ctx, dict):
        ctx_class = str(ctx.get("context_classification") or ctx.get("context") or "")

    if model_status == "trained" and model is not None:
        try:
            X = np.array([feature_vector])
            prediction = str(model.predict(X)[0])
            
            if hasattr(model, "predict_proba"):
                probs = model.predict_proba(X)[0]
                confidence_pct = int(round(float(np.max(probs)) * 100))
            else:
                confidence_pct = 80
            
            model_source = "ML_MODEL"
        except Exception:
            prediction, confidence_pct = _prototype_rule_engine_predict(feature_dict, ctx_class)
            model_source = "PROTOTYPE_RULE_ENGINE"
    else:
        prediction, confidence_pct = _prototype_rule_engine_predict(feature_dict, ctx_class)
        model_source = "PROTOTYPE_RULE_ENGINE"

    # Safety Guardrail: Hotspots located directly inside or <= 2.5 km from an industrial zone CANNOT be WILDFIRE or AGRICULTURAL_BURNING
    if (feature_dict.get("is_industrial_zone") == 1 or feature_dict.get("industrial_distance_km", 10.0) <= 2.5) and prediction in ["WILDFIRE_CANDIDATE", "AGRICULTURAL_BURNING_CANDIDATE"]:
        prediction = "INDUSTRIAL_FIRE_CANDIDATE"
        confidence_pct = max(75, confidence_pct)
        model_source = f"{model_source}_SAFETY_OVERRIDE"

    supporting_indicators = _generate_supporting_indicators(feature_dict, prediction)

    return {
        "classification": prediction,
        "confidence_percentage": confidence_pct,
        "model_source": model_source,
        "model_status": model_status,
        "model_version": PROTOTYPE_VERSION,
        "supporting_indicators": supporting_indicators,
        "features": feature_dict
    }
