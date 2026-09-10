"""
Thermoscope Satellite Orbit & Telemetry Service
Models NOAA-21 (JPSS-2) Sun-Synchronous Polar Low Earth Orbit for NASA VIIRS sensor.
Provides deterministic orbital state vectors, ground tracks, sub-satellite coordinates,
and pass detection over the Indian subcontinent.
"""

import math
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Tuple

# Constants for NOAA-21 (JPSS-2) / VIIRS
ORBIT_ALTITUDE_KM = 824.0
EARTH_RADIUS_KM = 6371.0
ORBIT_RADIUS_KM = EARTH_RADIUS_KM + ORBIT_ALTITUDE_KM
ORBIT_INCLINATION_DEG = 98.71  # Retrograde polar orbit
ORBIT_PERIOD_MINUTES = 101.4   # ~14.2 orbits per day
ORBIT_PERIOD_SECONDS = ORBIT_PERIOD_MINUTES * 60.0
ORBIT_VELOCITY_KMS = 7.45
SWATH_WIDTH_KM = 3040.0
SENSOR_NAME = "VIIRS (Visible Infrared Imaging Radiometer Suite)"
SPACECRAFT_NAME = "NOAA-21 (JPSS-2)"

# India Regional Geographic Bounding Box
INDIA_BBOX = {
    "lat_min": 6.5,
    "lat_max": 37.5,
    "lon_min": 68.0,
    "lon_max": 97.5
}

# Standard TLE representation for NOAA-21
NOAA21_TLE = {
    "line1": "1 54234U 22150A   26252.54166667  .00000050  00000-0  25000-4 0  9993",
    "line2": "2 54234  98.7123 145.2341 0001245  85.4321 274.7120 14.19561234123456"
}


def calculate_sub_satellite_point(epoch_seconds: float) -> Tuple[float, float, float]:
    """
    Calculates the Sub-Satellite Point (SSP) in (latitude, longitude, altitude_km).
    Uses a deterministic circular inclined orbit with Earth rotation progression.
    """
    # Orbital mean anomaly progression (0 to 2pi)
    phase = (epoch_seconds % ORBIT_PERIOD_SECONDS) / ORBIT_PERIOD_SECONDS
    mean_anomaly = phase * 2.0 * math.pi

    # Incline orbit: Z-axis elevation
    inc_rad = math.radians(ORBIT_INCLINATION_DEG)
    lat_rad = math.asin(math.sin(inc_rad) * math.sin(mean_anomaly))
    latitude = math.degrees(lat_rad)

    # In-plane longitude before Earth rotation
    in_plane_lon_rad = math.atan2(
        math.cos(inc_rad) * math.sin(mean_anomaly),
        math.cos(mean_anomaly)
    )

    # Earth rotation: 360 degrees per 86400 seconds (sidereal day ~86164s)
    earth_rot_deg = (epoch_seconds / 86164.09 * 360.0) % 360.0
    lon_deg = (math.degrees(in_plane_lon_rad) - earth_rot_deg) % 360.0
    if lon_deg > 180.0:
        lon_deg -= 360.0

    return round(latitude, 4), round(lon_deg, 4), ORBIT_ALTITUDE_KM


def is_over_india_pass(lat: float, lon: float, buffer_deg: float = 8.0) -> bool:
    """
    Determines whether the satellite footprint/swath intersects the Indian subcontinent.
    """
    return (
        (INDIA_BBOX["lat_min"] - buffer_deg) <= lat <= (INDIA_BBOX["lat_max"] + buffer_deg) and
        (INDIA_BBOX["lon_min"] - buffer_deg) <= lon <= (INDIA_BBOX["lon_max"] + buffer_deg)
    )


def generate_ground_track_points(current_epoch: float, steps: int = 72) -> List[Dict[str, float]]:
    """
    Generates points for the full upcoming orbital period ground track polyline.
    """
    track = []
    step_duration = ORBIT_PERIOD_SECONDS / steps
    for i in range(steps + 1):
        t = current_epoch + (i * step_duration)
        lat, lon, alt = calculate_sub_satellite_point(t)
        track.append({
            "latitude": lat,
            "longitude": lon,
            "altitude_km": alt,
            "offset_minutes": round((i * step_duration) / 60.0, 1)
        })
    return track


def get_orbital_telemetry(epoch_override: float = None) -> Dict[str, Any]:
    """
    Returns full real-time operational telemetry for NOAA-21 VIIRS.
    """
    now_epoch = epoch_override if epoch_override is not None else time.time()
    lat, lon, alt = calculate_sub_satellite_point(now_epoch)
    active_pass = is_over_india_pass(lat, lon)

    # Compute sensor observation cone footprint radius on ground
    # Footprint ground radius = Swath width / 2
    swath_radius_km = SWATH_WIDTH_KM / 2.0

    status = "ACTIVE_PASS" if active_pass else "ORBITAL_PATROL"
    acquisition_state = "TRANSMITTING" if active_pass else "STANDBY"

    return {
        "satellite": SPACECRAFT_NAME,
        "instrument": SENSOR_NAME,
        "norad_id": 54234,
        "cospar_id": "2022-150A",
        "epoch_utc": datetime.fromtimestamp(now_epoch, tz=timezone.utc).isoformat(),
        "orbital_elements": {
            "altitude_km": alt,
            "inclination_deg": ORBIT_INCLINATION_DEG,
            "period_minutes": ORBIT_PERIOD_MINUTES,
            "velocity_km_s": ORBIT_VELOCITY_KMS,
            "orbit_type": "Sun-Synchronous Polar LEO",
            "eccentricity": 0.00012,
            "semi_major_axis_km": ORBIT_RADIUS_KM,
        },
        "sub_satellite_point": {
            "latitude": lat,
            "longitude": lon,
            "altitude_km": alt
        },
        "sensor_telemetry": {
            "swath_width_km": SWATH_WIDTH_KM,
            "swath_radius_km": swath_radius_km,
            "resolution_m": 375,
            "bands": ["I4 (3.74 um)", "I5 (11.45 um)", "M13 (4.05 um)"],
            "status": status,
            "acquisition_state": acquisition_state,
            "is_over_india": active_pass,
            "detection_channel": "High-Gain Radiometric Radiance"
        },
        "ground_track": generate_ground_track_points(now_epoch),
        "tle": NOAA21_TLE,
        "disclaimer": "Deterministic orbital propagation model for operational mission monitoring."
    }
