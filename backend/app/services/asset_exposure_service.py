"""
Phase 2: Asset Exposure Analysis Service

Categorizes nearby OpenStreetMap geospatial features into emergency asset classes
and evaluates exposure status against dynamic threat zones.
"""

from typing import List, Dict, Any, Optional
from app.services.osm_service import haversine_distance_km

def categorize_asset_type(feature_name: str, feature_type: str, category: str) -> str:
    """Classify an OSM feature into one of 7 standardized disaster asset categories."""
    fn = (feature_name or "").lower()
    ft = (feature_type or "").lower()
    cat = (category or "").lower()
    combined = f"{fn} {ft} {cat}"

    if any(k in combined for k in ["hospital", "clinic", "health", "pharmacy", "medical", "ambulance"]):
        return "HEALTHCARE"
    if any(k in combined for k in ["school", "university", "college", "kindergarten", "academy", "institute"]):
        return "EDUCATION"
    if any(k in combined for k in ["refinery", "factory", "industrial", "chemical", "warehouse", "manufacturing", "plant", "storage", "mill"]):
        return "INDUSTRIAL"
    if any(k in combined for k in ["power", "substation", "generator", "electric", "utility", "water_works", "fuel", "gas", "pipeline"]):
        return "UTILITIES"
    if any(k in combined for k in ["road", "highway", "motorway", "trunk", "primary", "railway", "rail", "station", "airport", "aeroway", "bridge"]):
        return "TRANSPORT"
    if any(k in combined for k in ["residential", "housing", "village", "suburb", "apartments", "settlement", "neighborhood"]):
        return "SETTLEMENTS"
    
    return "PUBLIC"


def analyze_asset_exposure(
    hotspot_lat: float,
    hotspot_lon: float,
    nearby_features: List[Dict[str, Any]],
    threat_zones: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Analyze nearby OSM features against calculated threat zones.
    Returns categorized exposed assets, counts, and nearest critical asset.
    """
    inner_r = threat_zones["zones"]["inner_zone"]["radius_km"]
    secondary_r = threat_zones["zones"]["secondary_zone"]["radius_km"]

    exposed_assets: List[Dict[str, Any]] = []

    category_counts = {
        "INDUSTRIAL": 0,
        "HEALTHCARE": 0,
        "EDUCATION": 0,
        "TRANSPORT": 0,
        "UTILITIES": 0,
        "SETTLEMENTS": 0,
        "PUBLIC": 0
    }

    nearest_critical_asset: Optional[Dict[str, Any]] = None
    min_critical_dist = 999.0

    for feat in nearby_features:
        lat = feat.get("latitude", 0.0)
        lon = feat.get("longitude", 0.0)
        name = feat.get("name") or "Geospatial Infrastructure Point"
        feat_type = feat.get("type", "urban")
        category_raw = feat.get("category", "infrastructure")

        # Compute distance if not present
        dist_km = feat.get("distance_km")
        if dist_km is None and lat and lon:
            dist_km = haversine_distance_km(hotspot_lat, hotspot_lon, lat, lon)
        elif dist_km is None:
            dist_km = 2.5

        dist_km = round(dist_km, 2)
        # Strict 5 km cutoff: features beyond 5.0 km must not be included
        if dist_km > 5.0:
            continue

        asset_cat = categorize_asset_type(name, feat_type, category_raw)

        # Determine Zone & Exposure Level
        if dist_km <= inner_r:
            zone_name = "Inner Zone"
            exposure_level = "HIGH EXPOSURE"
        elif dist_km <= secondary_r:
            zone_name = "Secondary Zone"
            exposure_level = "MODERATE EXPOSURE"
        else:
            zone_name = "Monitoring Zone"
            exposure_level = "MONITORING EXPOSURE"

        asset_record = {
            "asset_name": name,
            "category": asset_cat,
            "raw_type": feat_type,
            "latitude": lat,
            "longitude": lon,
            "distance_km": dist_km,
            "threat_zone": zone_name,
            "exposure_level": exposure_level,
            "status": "Within Risk Zone",
            "data_source": "OpenStreetMap"
        }

        exposed_assets.append(asset_record)
        category_counts[asset_cat] = category_counts.get(asset_cat, 0) + 1

        # Track nearest critical asset (Healthcare, Refinery, Utility, School)
        if asset_cat in ["HEALTHCARE", "INDUSTRIAL", "UTILITIES", "EDUCATION"]:
            if dist_km < min_critical_dist:
                min_critical_dist = dist_km
                nearest_critical_asset = asset_record

    # Sort exposed assets by distance
    exposed_assets.sort(key=lambda x: x["distance_km"])

    critical_total = (
        category_counts["HEALTHCARE"] +
        category_counts["INDUSTRIAL"] +
        category_counts["UTILITIES"] +
        category_counts["EDUCATION"]
    )

    return {
        "total_exposed_assets": len(exposed_assets),
        "critical_infrastructure_count": critical_total,
        "category_counts": category_counts,
        "nearest_critical_asset": nearest_critical_asset,
        "exposed_assets": exposed_assets,
        "data_provenance": "OpenStreetMap Geospatial Infrastructure"
    }
