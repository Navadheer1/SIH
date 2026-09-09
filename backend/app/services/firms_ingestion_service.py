import os
import csv
import io
import json
import time
import hashlib
import logging
import tempfile
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional, Tuple
import httpx

import app.config as config
from app.services.firms_service import (
    REGION_BOUNDS,
    PUBLIC_FIRMS_FEEDS,
    _normalize_satellite_name,
    _format_acquisition_time,
    _is_within_bbox,
)

logger = logging.getLogger("firms_ingestion")
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

# Grace period in seconds before marking a HEALTHY status as STALE
STALE_GRACE_PERIOD_SECONDS = 300


def generate_observation_id(
    latitude: float,
    longitude: float,
    acquired_at: str,
    satellite: str,
    instrument: str
) -> str:
    """
    Generate a deterministic SHA-256 hash key (first 16 hex chars)
    from unique spatial, temporal, and sensor attributes.
    """
    raw_key = f"{latitude:.5f}_{longitude:.5f}_{acquired_at}_{satellite}_{instrument}"
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()[:16]


def parse_firms_record_to_schema(
    row: Dict[str, str],
    default_satellite: str = "VIIRS",
    default_instrument: str = "VIIRS",
    ingested_at: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Parse a single raw CSV row from NASA FIRMS into standardized observation JSON schema.
    """
    try:
        lat = round(float(row["latitude"]), 5)
        lon = round(float(row["longitude"]), 5)

        brightness_raw = row.get("bright_ti4") or row.get("brightness") or "0"
        brightness = round(float(brightness_raw), 2)

        frp_raw = row.get("frp") or "0"
        frp = round(float(frp_raw), 2)

        confidence = row.get("confidence", "N/A")

        acq_date = row.get("acq_date", "")
        acq_time = row.get("acq_time", "")
        acquired_at = _format_acquisition_time(acq_date, acq_time)

        sat_code = row.get("satellite", "")
        satellite_name = _normalize_satellite_name(sat_code, default_satellite)
        instrument = "VIIRS" if "bright_ti4" in row else default_instrument

        obs_id = generate_observation_id(lat, lon, acquired_at, satellite_name, instrument)
        ingest_ts = ingested_at or datetime.now(timezone.utc).isoformat()

        return {
            "observation_id": obs_id,
            "latitude": lat,
            "longitude": lon,
            "brightness": brightness,
            "confidence": confidence,
            "frp": frp,
            "acquired_at": acquired_at,
            "satellite": satellite_name,
            "instrument": instrument,
            "source": "NASA FIRMS",
            "ingested_at": ingest_ts,
        }
    except (KeyError, ValueError) as e:
        logger.warning(f"Skipping invalid FIRMS row: {e}")
        return None


def _atomic_write_json(file_path: str, data: Any) -> None:
    """
    Atomically write data to a JSON file using a tempfile and os.replace
    to guarantee zero corruption and prevent partial reads during concurrent access.
    """
    dir_name = os.path.dirname(os.path.abspath(file_path))
    os.makedirs(dir_name, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=dir_name, delete=False) as tf:
        json.dump(data, tf, indent=2, ensure_ascii=False)
        temp_name = tf.name
    os.replace(temp_name, file_path)


def _load_stored_from_json() -> List[Dict[str, Any]]:
    """Load stored observations directly from local JSON storage."""
    if not os.path.exists(config.FIRMS_OBSERVATIONS_PATH):
        return []
    try:
        with open(config.FIRMS_OBSERVATIONS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
            return []
    except Exception as e:
        logger.error(f"Error reading stored FIRMS observations JSON: {e}")
        return []


def load_stored_observations(bbox: Optional[List[float]] = None) -> List[Dict[str, Any]]:
    """
    Load stored observations.
    Attempts to read from PostgreSQL database primary store first;
    gracefully falls back to local JSON storage if DB is unavailable.
    """
    from app.db.database import get_session_factory
    from app.db.repositories import FirmsObservationRepository

    factory = get_session_factory()
    if factory is not None:
        try:
            with factory() as db:
                db_records = FirmsObservationRepository.get_observations(db, limit=5000, offset=0, bbox=bbox)
                if db_records:
                    return [r.to_dict() for r in db_records]
        except Exception as ex:
            logger.warning(f"Database read failed, falling back to local JSON: {ex}")

    # Fallback to local JSON storage
    json_obs = _load_stored_from_json()
    if bbox and len(bbox) == 4:
        return [
            it for it in json_obs
            if isinstance(it, dict) and _is_within_bbox(float(it.get("latitude", 0)), float(it.get("longitude", 0)), bbox)
        ]
    return json_obs


def save_stored_observations(observations: List[Dict[str, Any]]) -> None:
    """Save observations list atomically to local JSON storage as persistent backup."""
    _atomic_write_json(config.FIRMS_OBSERVATIONS_PATH, observations)


def load_ingestion_state() -> Dict[str, Any]:
    """Load ingestion state metadata from disk."""
    if not os.path.exists(config.FIRMS_INGEST_STATE_PATH):
        return {
            "status": "NOT_STARTED",
            "last_run_started_at": None,
            "last_run_completed_at": None,
            "last_successful_run_at": None,
            "records_received": 0,
            "records_inserted": 0,
            "duplicates_skipped": 0,
            "total_stored_records": 0,
            "interval_minutes": config.FIRMS_INGEST_INTERVAL_MINUTES,
            "error_category": None,
            "error_message": None,
            "last_http_status": None,
        }
    try:
        with open(config.FIRMS_INGEST_STATE_PATH, "r", encoding="utf-8") as f:
            state = json.load(f)
            if isinstance(state, dict):
                return state
    except Exception as e:
        logger.error(f"Error reading FIRMS ingestion state: {e}")
    return {
        "status": "NOT_STARTED",
        "last_run_started_at": None,
        "last_run_completed_at": None,
        "last_successful_run_at": None,
        "records_received": 0,
        "records_inserted": 0,
        "duplicates_skipped": 0,
        "total_stored_records": 0,
        "interval_minutes": config.FIRMS_INGEST_INTERVAL_MINUTES,
        "error_category": None,
        "error_message": None,
        "last_http_status": None,
    }


def save_ingestion_state(state: Dict[str, Any]) -> None:
    """Save ingestion state metadata atomically to disk."""
    _atomic_write_json(config.FIRMS_INGEST_STATE_PATH, state)


def get_firms_ingestion_status() -> Dict[str, Any]:
    """
    Get effective current status of FIRMS ingestion pipeline.
    Calculates dynamic STALE status if last successful run is beyond configured interval + grace period.
    """
    state = load_ingestion_state()

    # Get total count from DB if available, else local JSON
    total_stored = 0
    from app.db.database import get_session_factory
    from app.db.repositories import FirmsObservationRepository

    factory = get_session_factory()
    if factory is not None:
        try:
            with factory() as db:
                total_stored = FirmsObservationRepository.count_observations(db)
        except Exception:
            total_stored = len(_load_stored_from_json())
    else:
        total_stored = len(_load_stored_from_json())

    state["total_stored_records"] = total_stored
    state["interval_minutes"] = config.FIRMS_INGEST_INTERVAL_MINUTES
    state["configured"] = bool(config.NASA_FIRMS_MAP_KEY)

    # Dynamic STALE evaluation
    if state["status"] in ("HEALTHY", "NOT_STARTED") and state.get("last_successful_run_at"):
        try:
            last_dt = datetime.fromisoformat(state["last_successful_run_at"].replace("Z", "+00:00"))
            now_dt = datetime.now(timezone.utc)
            max_age_seconds = (config.FIRMS_INGEST_INTERVAL_MINUTES * 60) + STALE_GRACE_PERIOD_SECONDS
            if (now_dt - last_dt).total_seconds() > max_age_seconds:
                state["status"] = "STALE"
        except Exception:
            pass

    return state


def parse_acquired_at(acquired_str: Optional[str]) -> Optional[datetime]:
    """
    Parse acquired_at string into a timezone-aware UTC datetime.
    Supports formats:
    - 'YYYY-MM-DD HH:MM UTC'
    - 'YYYY-MM-DD HH:MM:SS UTC'
    - 'YYYY-MM-DDTHH:MM:SSZ'
    - 'YYYY-MM-DDTHH:MM:SS+00:00'
    - 'YYYY-MM-DD HH:MM:SS'
    """
    if not acquired_str or not isinstance(acquired_str, str):
        return None

    clean_str = acquired_str.strip()

    # Strip UTC suffix
    if clean_str.endswith(" UTC"):
        clean_str = clean_str[:-4].strip()

    # ISO Z suffix handling
    if clean_str.endswith("Z"):
        clean_str = clean_str[:-1] + "+00:00"

    for fmt in (
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
    ):
        try:
            dt = datetime.strptime(clean_str, fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    try:
        dt = datetime.fromisoformat(clean_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def classify_observation_freshness(age_minutes: Optional[int]) -> str:
    """
    Classify satellite observation data freshness based strictly on `acquired_at` sensor overpass time.
    Freshness Thresholds:
      - FRESH:   0 <= age_minutes <= 180  (Within 3 hours of sensor overpass)
      - RECENT:  180 < age_minutes <= 720 (3 to 12 hours, same-day orbit)
      - STALE:   age_minutes > 720        (Older than 12 hours / prior-day passes)
      - NO_DATA: age_minutes is None      (No observations available)
    """
    if age_minutes is None or age_minutes < 0:
        return "NO_DATA"
    if age_minutes <= 180:
        return "FRESH"
    elif age_minutes <= 720:
        return "RECENT"
    else:
        return "STALE"


def get_latest_firms_observation() -> Dict[str, Any]:
    """
    Determine the newest NASA FIRMS observation using the actual `acquired_at` timestamp.
    Does NOT use ingestion time, server time, or request time for ordering.
    Queries database primary store first; falls back to local storage if DB is unavailable.
    """
    from app.db.database import get_session_factory
    from app.db.repositories import FirmsObservationRepository

    latest_obs: Optional[Dict[str, Any]] = None

    factory = get_session_factory()
    if factory is not None:
        try:
            with factory() as db:
                db_latest = FirmsObservationRepository.get_latest_observation(db)
                if db_latest:
                    latest_obs = db_latest.to_dict()
        except Exception as ex:
            logger.warning(f"Database query for latest observation failed, falling back to local storage: {ex}")

    now_utc = datetime.now(timezone.utc)

    if latest_obs:
        acq_dt = parse_acquired_at(latest_obs.get("acquired_at"))
        if acq_dt is not None:
            age_seconds = (now_utc - acq_dt).total_seconds()
            age_minutes = max(0, int(age_seconds // 60))
            freshness = classify_observation_freshness(age_minutes)
            return {
                "available": True,
                "observation_id": latest_obs.get("observation_id"),
                "latitude": latest_obs.get("latitude"),
                "longitude": latest_obs.get("longitude"),
                "brightness": latest_obs.get("brightness"),
                "confidence": latest_obs.get("confidence"),
                "frp": latest_obs.get("frp"),
                "satellite": latest_obs.get("satellite"),
                "instrument": latest_obs.get("instrument"),
                "acquired_at": latest_obs.get("acquired_at"),
                "ingested_at": latest_obs.get("ingested_at"),
                "age_minutes": age_minutes,
                "freshness": freshness,
                "source": latest_obs.get("source", "NASA FIRMS"),
                "observation": latest_obs,
            }

    # Fallback to in-memory evaluation over stored JSON observations
    observations = _load_stored_from_json()
    if not observations:
        return {
            "available": False,
            "observation": None,
            "freshness": "NO_DATA",
            "message": "No FIRMS observations are currently available.",
        }

    valid_candidates: List[Tuple[datetime, float, Dict[str, Any]]] = []

    for obs in observations:
        if not isinstance(obs, dict):
            continue
        acq_str = obs.get("acquired_at")
        acq_dt = parse_acquired_at(acq_str)
        if acq_dt is None:
            continue
        try:
            lat = float(obs.get("latitude", 0))
            lon = float(obs.get("longitude", 0))
            if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
                continue
        except (ValueError, TypeError):
            continue

        frp = float(obs.get("frp") or 0.0)
        valid_candidates.append((acq_dt, frp, obs))

    if not valid_candidates:
        return {
            "available": False,
            "observation": None,
            "freshness": "NO_DATA",
            "message": "No valid FIRMS observations with parseable acquisition times found.",
        }

    # Sort by acquired_dt descending, then frp descending
    valid_candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    newest_dt, _, newest_obs = valid_candidates[0]

    age_seconds = (now_utc - newest_dt).total_seconds()
    age_minutes = max(0, int(age_seconds // 60))
    freshness = classify_observation_freshness(age_minutes)

    return {
        "available": True,
        "observation_id": newest_obs.get("observation_id"),
        "latitude": newest_obs.get("latitude"),
        "longitude": newest_obs.get("longitude"),
        "brightness": newest_obs.get("brightness"),
        "confidence": newest_obs.get("confidence"),
        "frp": newest_obs.get("frp"),
        "satellite": newest_obs.get("satellite"),
        "instrument": newest_obs.get("instrument"),
        "acquired_at": newest_obs.get("acquired_at"),
        "ingested_at": newest_obs.get("ingested_at"),
        "age_minutes": age_minutes,
        "freshness": freshness,
        "source": newest_obs.get("source", "NASA FIRMS"),
        "observation": newest_obs,
    }


async def run_firms_ingestion_cycle(
    region: str = "india",
    custom_bbox: Optional[List[float]] = None,
    client: Optional[httpx.AsyncClient] = None
) -> Dict[str, Any]:
    """
    Execute a single, isolated, robust NASA FIRMS ingestion cycle:
    1. Update state to RUNNING.
    2. Record ingestion run start in database.
    3. Query NASA FIRMS (MAP_KEY API or official feeds).
    4. Normalize records and generate deterministic observation IDs.
    5. Deduplicate and insert into Supabase PostgreSQL primary store.
    6. Atomically append/update local JSON backup.
    7. Record cycle metrics in DB and update state machine.
    """
    from app.db.database import get_session_factory
    from app.db.repositories import FirmsObservationRepository, FirmsIngestionRunRepository

    target_bbox = custom_bbox if (custom_bbox and len(custom_bbox) == 4) else REGION_BOUNDS.get(region.lower(), REGION_BOUNDS["india"])
    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    state = load_ingestion_state()
    state["status"] = "RUNNING"
    state["last_run_started_at"] = now_iso
    state["interval_minutes"] = config.FIRMS_INGEST_INTERVAL_MINUTES
    save_ingestion_state(state)

    factory = get_session_factory()
    db_run_id: Optional[int] = None
    if factory is not None:
        try:
            with factory() as db:
                run_obj = FirmsIngestionRunRepository.create_run(db, started_at=now_dt, status="RUNNING", region=region)
                db_run_id = run_obj.id
        except Exception as ex:
            logger.warning(f"Could not record ingestion run start in DB: {ex}")

    map_key = config.NASA_FIRMS_MAP_KEY
    records_received = 0
    raw_rows: List[Tuple[Dict[str, str], str, str]] = []
    error_category: Optional[str] = None
    error_message: Optional[str] = None
    http_status: Optional[int] = None

    headers = {
        "User-Agent": "SIH-26162-FIRMS-IngestionWorker/1.0"
    }

    should_close_client = False
    if client is None:
        client = httpx.AsyncClient(timeout=20.0, headers=headers, follow_redirects=True)
        should_close_client = True

    try:
        if map_key:
            min_lon, min_lat, max_lon, max_lat = target_bbox
            bbox_str = f"{min_lon},{min_lat},{max_lon},{max_lat}"
            api_url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{map_key}/VIIRS_SNPP_NRT/{bbox_str}/1"
            logger.info(f"Querying NASA FIRMS MAP_KEY API for bbox: {bbox_str}")

            resp = await client.get(api_url)
            http_status = resp.status_code

            if resp.status_code == 200:
                if resp.text.startswith("Invalid MAP_KEY"):
                    error_category = "invalid_map_key"
                    error_message = "NASA FIRMS rejected provided MAP_KEY"
                    logger.warning("NASA FIRMS returned Invalid MAP_KEY response")
                else:
                    reader = csv.DictReader(io.StringIO(resp.text))
                    for row in reader:
                        raw_rows.append((row, "VIIRS", "VIIRS"))
            elif resp.status_code in (401, 403):
                error_category = "unauthorized"
                error_message = f"NASA FIRMS returned HTTP {resp.status_code}"
                logger.warning(f"NASA FIRMS query unauthorized: HTTP {resp.status_code}")
            else:
                error_category = f"http_{resp.status_code}"
                error_message = f"NASA FIRMS returned HTTP {resp.status_code}"
                logger.warning(f"NASA FIRMS API query failed with HTTP {resp.status_code}")
        else:
            # If no map key is configured, fallback to public feeds
            logger.info("No NASA_FIRMS_MAP_KEY configured; querying public 24h CSV feeds...")
            for feed in PUBLIC_FIRMS_FEEDS:
                try:
                    feed_resp = await client.get(feed["url"])
                    if feed_resp.status_code == 200:
                        http_status = 200
                        reader = csv.DictReader(io.StringIO(feed_resp.text))
                        for row in reader:
                            raw_rows.append((row, feed["default_satellite"], feed["instrument"]))
                except Exception as ex:
                    logger.warning(f"Error fetching public feed {feed['url']}: {ex}")

    except httpx.TimeoutException:
        error_category = "timeout"
        error_message = "Network request to NASA FIRMS timed out"
        logger.error("NASA FIRMS ingestion timed out")
    except Exception as ex:
        error_category = type(ex).__name__
        error_message = str(ex)
        logger.error(f"NASA FIRMS ingestion encountered unexpected error: {ex}")
    finally:
        if should_close_client:
            await client.aclose()

    completed_dt = datetime.now(timezone.utc)
    completed_iso = completed_dt.isoformat()

    # If there was a fatal error, record and exit cycle
    if error_category:
        if factory is not None and db_run_id is not None:
            try:
                with factory() as db:
                    FirmsIngestionRunRepository.complete_run(
                        db, run_id=db_run_id, completed_at=completed_dt,
                        status="ERROR", received_count=0, inserted_count=0,
                        duplicate_count=0, error_message=error_message
                    )
            except Exception:
                pass

        state["status"] = "ERROR"
        state["last_run_completed_at"] = completed_iso
        state["error_category"] = error_category
        state["error_message"] = error_message
        state["last_http_status"] = http_status
        save_ingestion_state(state)
        return {
            "status": "ERROR",
            "error_category": error_category,
            "error_message": error_message,
            "records_received": 0,
            "records_inserted": 0,
            "duplicates_skipped": 0,
            "total_stored_records": len(_load_stored_from_json()),
            "started_at": now_iso,
            "completed_at": completed_iso,
        }

    # Process and parse records
    parsed_observations: List[Dict[str, Any]] = []
    for row, def_sat, def_inst in raw_rows:
        parsed = parse_firms_record_to_schema(row, def_sat, def_inst, ingested_at=completed_iso)
        if parsed and _is_within_bbox(parsed["latitude"], parsed["longitude"], target_bbox):
            records_received += 1
            parsed_observations.append(parsed)

    records_inserted = 0
    duplicates_skipped = 0

    # 1. Primary Store: Insert into Supabase PostgreSQL
    if factory is not None:
        try:
            with factory() as db:
                db_result = FirmsObservationRepository.insert_observations(db, parsed_observations)
                records_inserted = db_result["inserted"]
                duplicates_skipped = db_result["duplicates"]
                logger.info(f"Supabase DB insert: inserted={records_inserted}, duplicates={duplicates_skipped}")
        except Exception as ex:
            logger.error(f"Failed to persist observations to Supabase DB: {ex}")

    # 2. Atomic Local Backup: Keep JSON file in sync
    existing_json_obs = _load_stored_from_json()
    existing_ids = {obs.get("observation_id") for obs in existing_json_obs if "observation_id" in obs}
    new_json_obs: List[Dict[str, Any]] = []

    for obs in parsed_observations:
        if obs["observation_id"] not in existing_ids:
            existing_ids.add(obs["observation_id"])
            new_json_obs.append(obs)

    if new_json_obs:
        all_json = existing_json_obs + new_json_obs
        save_stored_observations(all_json)
        total_stored = len(all_json)
    else:
        total_stored = len(existing_json_obs)

    # If DB was not available, determine counts from JSON deduplication
    if factory is None or records_inserted == 0 and duplicates_skipped == 0:
        records_inserted = len(new_json_obs)
        duplicates_skipped = max(0, records_received - records_inserted)

    # Complete DB run record
    if factory is not None and db_run_id is not None:
        try:
            with factory() as db:
                FirmsIngestionRunRepository.complete_run(
                    db, run_id=db_run_id, completed_at=completed_dt,
                    status="SUCCESS", received_count=records_received,
                    inserted_count=records_inserted, duplicate_count=duplicates_skipped
                )
        except Exception as ex:
            logger.warning(f"Could not complete DB ingestion run record: {ex}")

    state["status"] = "HEALTHY"
    state["last_run_completed_at"] = completed_iso
    state["last_successful_run_at"] = completed_iso
    state["records_received"] = records_received
    state["records_inserted"] = records_inserted
    state["duplicates_skipped"] = duplicates_skipped
    state["total_stored_records"] = total_stored
    state["error_category"] = None
    state["error_message"] = None
    state["last_http_status"] = http_status or 200
    save_ingestion_state(state)

    logger.info(
        f"FIRMS Ingestion Cycle Complete: received={records_received}, "
        f"inserted={records_inserted}, duplicates_skipped={duplicates_skipped}, "
        f"total_stored={total_stored}"
    )

    return {
        "status": "HEALTHY",
        "records_received": records_received,
        "records_inserted": records_inserted,
        "duplicates_skipped": duplicates_skipped,
        "total_stored_records": total_stored,
        "started_at": now_iso,
        "completed_at": completed_iso,
    }
