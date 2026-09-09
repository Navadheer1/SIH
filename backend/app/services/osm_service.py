import os
import math
import time
import logging
from typing import List, Dict, Any, Tuple, Optional
import httpx

logger = logging.getLogger(__name__)

# Default search radius in kilometers (strictly 5.0 km maximum operational analysis radius)
DEFAULT_SEARCH_RADIUS_KM = float(os.getenv("OSM_SEARCH_RADIUS_KM", "5.0"))

# User-Agent header required by OpenStreetMap usage policies
USER_AGENT = "SIH-26162-FireIntelligence/1.0 (contact: github.com/sih26162-threat-engine)"

# Overpass API endpoints for resilient multi-server failover
OVERPASS_SERVERS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
]

# In-memory context cache: (round_lat, round_lon, radius_km) -> {"timestamp": float, "data": dict}
_context_cache: Dict[Tuple[float, float, float], Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 1800  # 30 minutes cache TTL for OSM data


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance between two points on Earth
    using the Haversine formula. Returns distance in kilometers rounded to 2 decimals.
    """
    R = 6371.0088  # Mean Earth radius in km

    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R * c, 2)


def _categorize_osm_tags(tags: Dict[str, str]) -> Tuple[str, str, int]:
    """
    Categorize real OpenStreetMap tags into standardized disaster intelligence categories:
    - INDUSTRIAL: factories, refineries, chemical plants, warehouses, power plants, substations
    - HEALTHCARE: hospitals, clinics, medical centers
    - EDUCATION: schools, colleges, universities
    - RESIDENTIAL: residential areas, housing, apartments, villages, settlements
    - TRANSPORT: railway stations, airports, major roads, bridges
    - CRITICAL_INFRASTRUCTURE: emergency services, fire stations, police, power, water
    - ENVIRONMENTAL: forests, agricultural land, nature reserves, wetlands

    Returns: (category, specific_type, severity_weight_0_to_10)
    """
    amenity = (tags.get("amenity") or "").lower()
    industrial = (tags.get("industrial") or "").lower()
    landuse = (tags.get("landuse") or "").lower()
    power = (tags.get("power") or "").lower()
    railway = (tags.get("railway") or "").lower()
    aeroway = (tags.get("aeroway") or "").lower()
    highway = (tags.get("highway") or "").lower()
    place = (tags.get("place") or "").lower()
    natural = (tags.get("natural") or "").lower()
    man_made = (tags.get("man_made") or "").lower()
    name = (tags.get("name") or "").lower()

    combined = f"{amenity} {industrial} {landuse} {power} {railway} {place} {natural} {man_made} {name}"

    # 1. HEALTHCARE (Top vulnerability)
    if amenity in ["hospital", "clinic", "doctors"] or any(k in combined for k in ["hospital", "clinic", "medical center", "dispensary"]):
        return ("HEALTHCARE", "Hospital / Medical Center", 10)

    # 2. EDUCATION
    if amenity in ["school", "college", "university", "kindergarten"] or any(k in combined for k in ["school", "college", "university", "academy", "vidyalaya"]):
        return ("EDUCATION", "School / Educational Institution", 8)

    # 3. EMERGENCY SERVICES
    if amenity in ["fire_station", "police", "ambulance_station"]:
        return ("CRITICAL_INFRASTRUCTURE", "Emergency Services / Fire Station", 9)

    # 4. INDUSTRIAL & CHEMICAL HAZARDS
    if any(k in combined for k in ["refinery", "chemical", "petrochemical", "gas plant", "fuel depot", "oil terminal"]):
        return ("INDUSTRIAL", "High-Hazard Petrochemical / Chemical Plant", 10)
    if power in ["plant", "generator"] or "power plant" in combined:
        return ("INDUSTRIAL", "Power Generation Facility", 9)
    if power in ["substation"] or "substation" in combined:
        return ("CRITICAL_INFRASTRUCTURE", "Electrical Substation", 8)
    if industrial or landuse == "industrial" or any(k in combined for k in ["factory", "manufacturing", "steel", "works", "mill", "industrial"]):
        return ("INDUSTRIAL", "Industrial Manufacturing Facility", 8)
    if any(k in combined for k in ["warehouse", "storage", "depot", "godown"]):
        return ("INDUSTRIAL", "Industrial Warehouse / Storage", 6)

    # 5. RESIDENTIAL / POPULATION
    if place in ["city", "town", "suburb", "village", "hamlet", "neighbourhood"] or landuse in ["residential"]:
        label = "Village / Settlement" if place in ["village", "hamlet"] else "Residential Area / Settlement"
        return ("RESIDENTIAL", label, 7)

    # 6. TRANSPORTATION INFRASTRUCTURE
    if railway in ["station", "halt", "junction"] or "railway station" in combined:
        return ("TRANSPORT", "Railway Station / Hub", 7)
    if aeroway in ["aerodrome", "airport", "terminal"]:
        return ("TRANSPORT", "Airport / Aerodrome", 8)
    if highway in ["motorway", "trunk", "primary"]:
        return ("TRANSPORT", "Major Highway / Transport Corridor", 5)

    # 7. CRITICAL UTILITIES / WATER
    if man_made in ["water_works", "storage_tank"] or "water treatment" in combined:
        return ("CRITICAL_INFRASTRUCTURE", "Critical Utility Facility", 7)

    # 8. ENVIRONMENTAL / LAND USE
    if natural in ["wood", "tree_row"] or landuse in ["forest"]:
        return ("ENVIRONMENTAL", "Forest / Woodland", 5)
    if landuse in ["farmland", "farm", "orchard", "vineyard", "meadow"]:
        return ("ENVIRONMENTAL", "Agricultural / Farmland", 3)
    if natural in ["wetland", "water"]:
        return ("ENVIRONMENTAL", "Wetland / Water Body", 4)
    if natural in ["scrub", "grassland", "heath"]:
        return ("ENVIRONMENTAL", "Grassland / Open Terrain", 2)

    return ("UNCLASSIFIED", "Unclassified Mapped Feature", 2)


def _classify_context(features: List[Dict[str, Any]]) -> str:
    """
    Determine primary operational context classification from detected features:
    - INDUSTRIAL: Industrial manufacturing, chemical plants, or power facilities within 5 km.
    - HEALTHCARE: Hospitals or medical clinics within 5 km.
    - EDUCATION: Educational institutions within 5 km.
    - RESIDENTIAL: Villages, towns, or housing developments within 5 km.
    - TRANSPORT: Major railway junctions, stations, or airports.
    - CRITICAL_INFRASTRUCTURE: Power substations, water infrastructure, or emergency services.
    - FOREST: Forested / woodland areas.
    - AGRICULTURAL: Agricultural / farmland areas.
    - UNCLASSIFIED: No significant infrastructure detected within 5 km.
    """
    if not features:
        return "UNCLASSIFIED"

    categories = [f.get("category") for f in features]
    closest = features[0]

    if "INDUSTRIAL" in categories:
        # Check if closest is industrial
        if closest.get("category") == "INDUSTRIAL":
            return "INDUSTRIAL"
        # If industrial is within 2 km, still prioritize industrial context
        ind_items = [f for f in features if f.get("category") == "INDUSTRIAL"]
        if ind_items and ind_items[0].get("distance_km", 99) <= 2.0:
            return "INDUSTRIAL"

    if "HEALTHCARE" in categories:
        return "HEALTHCARE"

    if "EDUCATION" in categories:
        return "EDUCATION"

    if "RESIDENTIAL" in categories:
        return "RESIDENTIAL"

    if "CRITICAL_INFRASTRUCTURE" in categories:
        return "CRITICAL_INFRASTRUCTURE"

    if "TRANSPORT" in categories:
        return "TRANSPORT"

    if "ENVIRONMENTAL" in categories:
        env_types = [f.get("type", "") for f in features if f.get("category") == "ENVIRONMENTAL"]
        if any("forest" in t.lower() or "wood" in t.lower() for t in env_types):
            return "FOREST"
        if any("agricultural" in t.lower() or "farm" in t.lower() for t in env_types):
            return "AGRICULTURAL"
        return "ENVIRONMENTAL"

    return "UNCLASSIFIED"


def get_cached_osm_context(lat: float, lon: float, radius_km: float = 5.0) -> Optional[Dict[str, Any]]:
    """
    Check if OSM context for this coordinate exists in the fast in-memory cache.
    Returns cached dict if valid, otherwise None.
    """
    operational_radius_km = min(5.0, float(radius_km))
    cache_key = (round(lat, 3), round(lon, 3), round(operational_radius_km, 1))
    now = time.time()
    if cache_key in _context_cache:
        entry = _context_cache[cache_key]
        cached_has_facilities = entry["data"].get("facility_count", 0) > 0
        max_age = CACHE_TTL_SECONDS if cached_has_facilities else 120
        if (now - entry["timestamp"]) < max_age:
            return entry["data"]
    return None


async def fetch_hotspot_osm_context(
    lat: float,
    lon: float,
    radius_km: float = DEFAULT_SEARCH_RADIUS_KM
) -> Dict[str, Any]:
    """
    Query OpenStreetMap for real-world infrastructure features within <= 5.0 KM.
    NON-BLOCKING: Strictly bounded with fast timeouts (max 1.5s total).
    Returns cached data if available, or fast fallback with data_status='OSM_UNAVAILABLE' if network is slow.
    """
    operational_radius_km = min(5.0, float(radius_km))
    cache_key = (round(lat, 3), round(lon, 3), round(operational_radius_km, 1))
    now = time.time()

    # 1. Fast cache check
    cached = get_cached_osm_context(lat, lon, operational_radius_km)
    if cached:
        logger.info(f"Returning cached OSM context for key: {cache_key}")
        return cached

    # Calculate bounding box for 5 km
    d_lat = operational_radius_km / 111.0
    cos_lat = math.cos(math.radians(lat))
    d_lon = operational_radius_km / (111.0 * max(0.01, cos_lat))

    min_lat = round(lat - d_lat, 5)
    max_lat = round(lat + d_lat, 5)
    min_lon = round(lon - d_lon, 5)
    max_lon = round(lon + d_lon, 5)

    query = f"""[out:json][timeout:5];
(
  node["amenity"~"hospital|clinic|doctors|school|college|university|fire_station|police"]({min_lat},{min_lon},{max_lat},{max_lon});
  way["amenity"~"hospital|clinic|doctors|school|college|university|fire_station|police"]({min_lat},{min_lon},{max_lat},{max_lon});
  node["industrial"]({min_lat},{min_lon},{max_lat},{max_lon});
  way["industrial"]({min_lat},{min_lon},{max_lat},{max_lon});
  node["landuse"~"industrial|commercial|residential|forest|farmland|farm|meadow|orchard"]({min_lat},{min_lon},{max_lat},{max_lon});
  way["landuse"~"industrial|commercial|residential|forest|farmland|farm|meadow|orchard"]({min_lat},{min_lon},{max_lat},{max_lon});
  node["power"~"substation|plant|generator"]({min_lat},{min_lon},{max_lat},{max_lon});
  way["power"~"substation|plant|generator"]({min_lat},{min_lon},{max_lat},{max_lon});
  node["railway"~"station|junction"]({min_lat},{min_lon},{max_lat},{max_lon});
  way["railway"~"station|junction"]({min_lat},{min_lon},{max_lat},{max_lon});
  node["place"~"city|town|village|suburb|neighbourhood|hamlet"]({min_lat},{min_lon},{max_lat},{max_lon});
  node["natural"~"wood|wetland|scrub|water"]({min_lat},{min_lon},{max_lat},{max_lon});
  way["natural"~"wood|wetland|scrub|water"]({min_lat},{min_lon},{max_lat},{max_lon});
);
out center 40;
"""

    features: List[Dict[str, Any]] = []
    headers = {"User-Agent": USER_AGENT}
    data_status = "OSM_UNAVAILABLE"
    fast_timeout = httpx.Timeout(connect=0.6, read=0.8, write=0.5, pool=0.5)

    try:
        async with httpx.AsyncClient(timeout=fast_timeout) as client:
            # Try single fast Overpass server (0.8s max)
            primary_server = OVERPASS_SERVERS[0]
            try:
                resp = await client.post(primary_server, data={"data": query}, headers=headers, timeout=fast_timeout)
                if resp.status_code == 200:
                    elements = resp.json().get("elements", [])
                    seen_osm_ids = set()

                    for el in elements:
                        osm_id = f"{el.get('type', 'node')}/{el.get('id', '0')}"
                        if osm_id in seen_osm_ids:
                            continue
                        seen_osm_ids.add(osm_id)

                        tags = el.get("tags", {})
                        feat_lat = el.get("lat") or el.get("center", {}).get("lat")
                        feat_lon = el.get("lon") or el.get("center", {}).get("lon")

                        if feat_lat is None or feat_lon is None:
                            continue

                        # Exact Haversine geodesic distance
                        dist_km = haversine_distance_km(lat, lon, float(feat_lat), float(feat_lon))

                        # STRICT 5 KM FILTER: Anything beyond 5 km MUST NOT be included
                        if dist_km > operational_radius_km:
                            continue

                        cat, specific_type, importance_wt = _categorize_osm_tags(tags)

                        # Name resolution
                        name = (
                            tags.get("name")
                            or tags.get("name:en")
                            or tags.get("operator")
                            or tags.get("brand")
                            or tags.get("description")
                        )
                        if not name:
                            place_tag = tags.get("place")
                            amenity_tag = tags.get("amenity")
                            ind_tag = tags.get("industrial")
                            land_tag = tags.get("landuse")
                            if place_tag:
                                name = f"Settlement ({place_tag.title()})"
                            elif amenity_tag:
                                name = f"{amenity_tag.replace('_', ' ').title()}"
                            elif ind_tag:
                                name = f"Industrial Site ({ind_tag.title()})"
                            elif land_tag:
                                name = f"{land_tag.title()} Area"
                            else:
                                name = specific_type

                        features.append({
                            "id": osm_id,
                            "osm_id": osm_id,
                            "name": name,
                            "type": specific_type,
                            "category": cat,
                            "latitude": float(feat_lat),
                            "longitude": float(feat_lon),
                            "distance_km": dist_km,
                            "importance_weight": importance_wt,
                            "source": "OpenStreetMap",
                            "tags": {k: v for k, v in tags.items() if k in ["amenity", "industrial", "landuse", "power", "place", "railway", "natural"]}
                        })

                    if features:
                        data_status = "READY"
            except Exception as ex:
                logger.warning(f"Overpass primary server query failed/timed out: {ex}")

            # Step 2: Fallback to Nominatim Reverse Geocoding with strict fast timeout
            if not features:
                try:
                    nom_url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json&extratags=1&addressdetails=1"
                    n_resp = await client.get(nom_url, headers=headers, timeout=fast_timeout)
                    if n_resp.status_code == 200:
                        n_data = n_resp.json()
                        addr = n_data.get("address", {})
                        disp = n_data.get("display_name", "")
                        n_lat = float(n_data.get("lat", lat))
                        n_lon = float(n_data.get("lon", lon))
                        dist = haversine_distance_km(lat, lon, n_lat, n_lon)

                        # Check for industrial facility
                        if addr.get("industrial") or "industrial" in disp.lower() or "steel" in disp.lower() or "refinery" in disp.lower() or "factory" in disp.lower():
                            ind_name = addr.get("industrial") or disp.split(",")[0]
                            features.append({
                                "id": f"nominatim/industrial/{n_data.get('osm_id', '0')}",
                                "osm_id": f"nominatim/industrial/{n_data.get('osm_id', '0')}",
                                "name": ind_name,
                                "type": "Industrial Facility",
                                "category": "INDUSTRIAL",
                                "latitude": n_lat,
                                "longitude": n_lon,
                                "distance_km": dist,
                                "importance_weight": 9,
                                "source": "OpenStreetMap",
                                "tags": {"industrial": ind_name}
                            })

                        # Check for village / settlement
                        settlement_name = addr.get("village") or addr.get("suburb") or addr.get("town") or addr.get("hamlet") or addr.get("neighbourhood")
                        if settlement_name:
                            features.append({
                                "id": f"nominatim/settlement/{n_data.get('osm_id', '0')}",
                                "osm_id": f"nominatim/settlement/{n_data.get('osm_id', '0')}",
                                "name": f"{settlement_name} Settlement",
                                "type": "Village / Settlement",
                                "category": "RESIDENTIAL",
                                "latitude": n_lat,
                                "longitude": n_lon,
                                "distance_km": dist,
                                "importance_weight": 7,
                                "source": "OpenStreetMap",
                                "tags": {"place": settlement_name}
                            })

                        # Check for hospital
                        if addr.get("hospital") or "hospital" in disp.lower() or "clinic" in disp.lower():
                            h_name = addr.get("hospital") or "Local Medical Center"
                            features.append({
                                "id": f"nominatim/healthcare/{n_data.get('osm_id', '0')}",
                                "osm_id": f"nominatim/healthcare/{n_data.get('osm_id', '0')}",
                                "name": h_name,
                                "type": "Hospital / Medical Center",
                                "category": "HEALTHCARE",
                                "latitude": n_lat,
                                "longitude": n_lon,
                                "distance_km": dist,
                                "importance_weight": 10,
                                "source": "OpenStreetMap",
                                "tags": {"amenity": "hospital"}
                            })
                        if features:
                            data_status = "READY"
                except Exception as nom_ex:
                    logger.warning(f"Nominatim reverse fallback error/timeout: {nom_ex}")
    except Exception as outer_ex:
        logger.warning(f"External OSM client error: {outer_ex}")

    # Sort all features strictly by distance ascending (closest first)
    features.sort(key=lambda x: x["distance_km"])

    # Determine context classification
    context_classification = _classify_context(features)

    # Category counts
    category_summary: Dict[str, int] = {}
    for f in features:
        c = f.get("category", "UNCLASSIFIED")
        category_summary[c] = category_summary.get(c, 0) + 1

    # Find closest critical asset (Industrial, Healthcare, Education, Critical Infrastructure, Residential)
    critical_categories = {"INDUSTRIAL", "HEALTHCARE", "EDUCATION", "CRITICAL_INFRASTRUCTURE", "RESIDENTIAL"}
    critical_features = [f for f in features if f.get("category") in critical_categories]
    closest_critical = critical_features[0] if critical_features else None

    # First industrial facility if any
    industrial_features = [f for f in features if f.get("category") == "INDUSTRIAL"]
    closest_industrial = industrial_features[0] if industrial_features else None

    result_data = {
        "hotspot": {
            "latitude": lat,
            "longitude": lon,
        },
        "search_radius_km": operational_radius_km,
        "context_classification": context_classification,
        "facility_count": len(features),
        "nearby_features": features,
        "category_summary": category_summary,
        "closest_critical_asset": closest_critical,
        "closest_industrial": closest_industrial,
        "nearby_facility": closest_industrial.get("name") if closest_industrial else (closest_critical.get("name") if closest_critical else None),
        "distance_km": closest_industrial.get("distance_km") if closest_industrial else (closest_critical.get("distance_km") if closest_critical else None),
        "data_source": "OpenStreetMap Overpass API",
        "data_status": data_status,
        "fetched_at": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(now)),
    }

    # Store in memory cache
    _context_cache[cache_key] = {
        "timestamp": now,
        "data": result_data,
    }

    return result_data
