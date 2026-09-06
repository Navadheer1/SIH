"""
Phase 2: Impact Score & Priority Index Engine

Calculates normalized Impact Score (0-100), Priority Index (P1-P4),
component weight breakdown, and explainable impact summary.
"""

from typing import Dict, Any, List

def calculate_impact_assessment(
    frp: float,
    risk_score: float,
    persistence_score: float,
    asset_analysis: Dict[str, Any],
    classification: str = "THERMAL_EVENT"
) -> Dict[str, Any]:
    """
    Compute Impact Score (0-100), Impact Level, Priority Index (P1-P4),
    component breakdown, and XAI impact explanation.
    """
    total_assets = asset_analysis.get("total_exposed_assets", 0)
    cat_counts = asset_analysis.get("category_counts", {})
    critical_count = asset_analysis.get("critical_infrastructure_count", 0)
    nearest_critical = asset_analysis.get("nearest_critical_asset")

    # 1. Asset Exposure Score (0 - 30 pts)
    exposure_pts = min(30.0, (total_assets * 2.5) + (critical_count * 3.5))

    # 2. Infrastructure Criticality Score (0 - 25 pts)
    healthcare_pts = cat_counts.get("HEALTHCARE", 0) * 8.0
    industrial_pts = cat_counts.get("INDUSTRIAL", 0) * 5.0
    utility_pts = cat_counts.get("UTILITIES", 0) * 6.0
    education_pts = cat_counts.get("EDUCATION", 0) * 4.0
    criticality_pts = min(25.0, healthcare_pts + industrial_pts + utility_pts + education_pts)

    # 3. Fire Radiative Severity Score (0 - 20 pts)
    severity_pts = min(20.0, (frp / 60.0) * 20.0)

    # 4. Spatial-Temporal Persistence Score (0 - 15 pts)
    persistence_pts = min(15.0, (persistence_score / 100.0) * 15.0)

    # 5. Industrial Hazard Context Score (0 - 10 pts)
    hazard_pts = 10.0 if "INDUSTRIAL" in classification.upper() else 4.0

    # Total Normalized Impact Score (0 - 100)
    raw_impact = exposure_pts + criticality_pts + severity_pts + persistence_pts + hazard_pts
    impact_score = round(min(100.0, max(0.0, raw_impact)), 1)

    # Impact Level Categorization
    if impact_score >= 75.0:
        impact_level = "CRITICAL"
    elif impact_score >= 50.0:
        impact_level = "HIGH"
    elif impact_score >= 25.0:
        impact_level = "MODERATE"
    else:
        impact_level = "LOW"

    # Priority Index Calculation (P1, P2, P3, P4)
    # P1: Immediate dispatch priority
    if impact_score >= 75.0 or risk_score >= 75.0 or (nearest_critical and nearest_critical.get("distance_km", 99) <= 1.5):
        priority_index = "P1"
        priority_label = "P1 — CRITICAL DISPATCH"
        priority_description = "Immediate emergency response dispatch recommended. High infrastructure exposure."
    elif impact_score >= 50.0 or risk_score >= 50.0 or critical_count >= 3:
        priority_index = "P2"
        priority_label = "P2 — HIGH PRIORITY"
        priority_description = "Rapid ground verification required. Multiple nearby assets identified."
    elif impact_score >= 25.0 or risk_score >= 25.0:
        priority_index = "P3"
        priority_label = "P3 — MODERATE PRIORITY"
        priority_description = "Standard operational monitoring. Precautionary assessment suggested."
    else:
        priority_index = "P4"
        priority_label = "P4 — LOW PRIORITY"
        priority_description = "Routine satellite surveillance. Low potential impact."

    # Dynamic "Why This Incident Matters" Explainable Impact Reasons
    impact_reasons: List[str] = []
    if frp >= 30.0:
        impact_reasons.append(f"High Fire Radiative Power ({frp:.1f} MW) indicates intense combustion core.")
    if persistence_score >= 40.0:
        impact_reasons.append(f"Persistent hotspot pattern observed across multiple orbital satellite passes ({persistence_score:.0f}/100).")
    if cat_counts.get("INDUSTRIAL", 0) > 0:
        impact_reasons.append(f"{cat_counts['INDUSTRIAL']} industrial facility asset(s) identified within risk zone.")
    if cat_counts.get("HEALTHCARE", 0) > 0:
        impact_reasons.append(f"{cat_counts['HEALTHCARE']} healthcare/hospital asset(s) located within exposure perimeter.")
    if cat_counts.get("UTILITIES", 0) > 0:
        impact_reasons.append(f"{cat_counts['UTILITIES']} power/utility infrastructure node(s) nearby.")
    if cat_counts.get("TRANSPORT", 0) > 0:
        impact_reasons.append(f"Transportation logistics corridor within {asset_analysis.get('exposed_assets', [{}])[0].get('distance_km', 2.0):.1f} km.")
    if total_assets == 0:
        impact_reasons.append("No major OSM infrastructure assets identified within 5.0 km radius.")

    summary_statement = (
        "Potential for significant infrastructure exposure. Priority assessment recommended."
        if impact_score >= 50.0 else
        "Localized thermal signature with moderate infrastructure exposure."
    )

    return {
        "impact_score": impact_score,
        "impact_level": impact_level,
        "priority_index": priority_index,
        "priority_label": priority_label,
        "priority_description": priority_description,
        "components": {
            "asset_exposure": round(exposure_pts, 1),
            "infrastructure_criticality": round(criticality_pts, 1),
            "fire_severity": round(severity_pts, 1),
            "persistence": round(persistence_pts, 1),
            "industrial_context": round(hazard_pts, 1)
        },
        "max_component_weights": {
            "asset_exposure": 30.0,
            "infrastructure_criticality": 25.0,
            "fire_severity": 20.0,
            "persistence": 15.0,
            "industrial_context": 10.0
        },
        "explainable_reasons": impact_reasons,
        "summary_statement": summary_statement
    }
