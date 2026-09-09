import os
import json
import asyncio
import pytest
import tempfile
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
import httpx

import app.config as config
from app.services.firms_ingestion_service import (
    generate_observation_id,
    parse_firms_record_to_schema,
    load_stored_observations,
    save_stored_observations,
    load_ingestion_state,
    save_ingestion_state,
    get_firms_ingestion_status,
    run_firms_ingestion_cycle,
    _atomic_write_json,
    parse_acquired_at,
    classify_observation_freshness,
    get_latest_firms_observation,
)
from app.services.firms_service import fetch_firms_hotspots
from app.main import app

SAMPLE_FIRMS_CSV = """latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
21.12345,79.12345,345.6,0.4,0.4,2026-09-07,1430,N,VIIRS,nominal,2.0NRT,295.1,12.5,N
22.67890,80.54321,360.2,0.5,0.4,2026-09-07,1430,N,VIIRS,high,2.0NRT,300.0,25.8,N
23.11111,81.22222,330.0,0.4,0.4,2026-09-07,1430,N,VIIRS,low,2.0NRT,290.0,8.2,N
"""

SAMPLE_FIRMS_CSV_EXTRA = """latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
21.12345,79.12345,345.6,0.4,0.4,2026-09-07,1430,N,VIIRS,nominal,2.0NRT,295.1,12.5,N
24.99999,82.88888,350.0,0.4,0.4,2026-09-07,1500,N,VIIRS,high,2.0NRT,298.0,18.0,N
"""


@pytest.fixture(autouse=True)
def isolated_storage(tmp_path, monkeypatch):
    """Use temporary isolated file paths for every test to prevent cross-test contamination."""
    obs_path = str(tmp_path / "test_firms_observations.json")
    state_path = str(tmp_path / "test_firms_ingestion_state.json")
    monkeypatch.setattr(config, "FIRMS_OBSERVATIONS_PATH", obs_path)
    monkeypatch.setattr(config, "FIRMS_INGEST_STATE_PATH", state_path)
    monkeypatch.setattr(config, "NASA_FIRMS_MAP_KEY", "test_mock_firms_key_123")
    monkeypatch.setattr(config, "DATABASE_URL", None)
    yield tmp_path


def test_deterministic_observation_id():
    """Verify observation ID is deterministic and changes with any variance."""
    id1 = generate_observation_id(21.12345, 79.12345, "2026-09-07 14:30 UTC", "Suomi-NPP (VIIRS)", "VIIRS")
    id2 = generate_observation_id(21.12345, 79.12345, "2026-09-07 14:30 UTC", "Suomi-NPP (VIIRS)", "VIIRS")
    assert id1 == id2
    assert len(id1) == 16

    # Change latitude slightly -> different ID
    id3 = generate_observation_id(21.12346, 79.12345, "2026-09-07 14:30 UTC", "Suomi-NPP (VIIRS)", "VIIRS")
    assert id1 != id3

    # Change satellite -> different ID
    id4 = generate_observation_id(21.12345, 79.12345, "2026-09-07 14:30 UTC", "NOAA-20 (VIIRS)", "VIIRS")
    assert id1 != id4


def test_parse_firms_record_schema():
    """Verify parsing raw CSV row produces schema conforming to Phase 2 requirements."""
    row = {
        "latitude": "21.123456",
        "longitude": "79.123456",
        "bright_ti4": "345.6",
        "frp": "14.2",
        "confidence": "nominal",
        "acq_date": "2026-09-07",
        "acq_time": "1430",
        "satellite": "N",
    }
    parsed = parse_firms_record_to_schema(row, default_satellite="VIIRS", default_instrument="VIIRS")
    assert parsed is not None
    assert parsed["latitude"] == 21.12346
    assert parsed["longitude"] == 79.12346
    assert parsed["brightness"] == 345.6
    assert parsed["frp"] == 14.2
    assert parsed["confidence"] == "nominal"
    assert parsed["acquired_at"] == "2026-09-07 14:30 UTC"
    assert parsed["satellite"] == "Suomi-NPP (VIIRS)"
    assert parsed["instrument"] == "VIIRS"
    assert parsed["source"] == "NASA FIRMS"
    assert "observation_id" in parsed
    assert "ingested_at" in parsed


def test_ingestion_cycle_success_and_storage():
    """Verify a complete successful ingestion cycle stores records and sets status to HEALTHY."""
    mock_response = httpx.Response(
        status_code=200,
        text=SAMPLE_FIRMS_CSV,
        request=httpx.Request("GET", "https://firms.modaps.eosdis.nasa.gov/api/test")
    )

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.return_value = mock_response

    result = asyncio.run(run_firms_ingestion_cycle(region="india", client=mock_client))
    assert result["status"] == "HEALTHY"
    assert result["records_received"] == 3
    assert result["records_inserted"] == 3
    assert result["duplicates_skipped"] == 0
    assert result["total_stored_records"] == 3

    # Check stored observations on disk
    stored = load_stored_observations()
    assert len(stored) == 3
    assert stored[0]["latitude"] == 21.12345

    # Check state on disk
    state = load_ingestion_state()
    assert state["status"] == "HEALTHY"
    assert state["records_received"] == 3
    assert state["records_inserted"] == 3
    assert state["total_stored_records"] == 3
    assert state["last_successful_run_at"] is not None


def test_ingestion_cycle_deduplication():
    """Verify that recurring cycles with overlapping data correctly skip duplicates."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)

    # Cycle 1: 3 records
    mock_client.get.return_value = httpx.Response(
        status_code=200,
        text=SAMPLE_FIRMS_CSV,
        request=httpx.Request("GET", "https://firms.modaps.eosdis.nasa.gov/api/test")
    )
    res1 = asyncio.run(run_firms_ingestion_cycle(region="india", client=mock_client))
    assert res1["records_inserted"] == 3
    assert res1["duplicates_skipped"] == 0
    assert res1["total_stored_records"] == 3

    # Cycle 2: identical data
    res2 = asyncio.run(run_firms_ingestion_cycle(region="india", client=mock_client))
    assert res2["records_received"] == 3
    assert res2["records_inserted"] == 0
    assert res2["duplicates_skipped"] == 3
    assert res2["total_stored_records"] == 3

    # Cycle 3: 1 duplicate, 1 new record
    mock_client.get.return_value = httpx.Response(
        status_code=200,
        text=SAMPLE_FIRMS_CSV_EXTRA,
        request=httpx.Request("GET", "https://firms.modaps.eosdis.nasa.gov/api/test")
    )
    res3 = asyncio.run(run_firms_ingestion_cycle(region="india", client=mock_client))
    assert res3["records_received"] == 2
    assert res3["records_inserted"] == 1
    assert res3["duplicates_skipped"] == 1
    assert res3["total_stored_records"] == 4

    stored = load_stored_observations()
    assert len(stored) == 4


def test_ingestion_cycle_empty_firms_response():
    """Verify handling when FIRMS returns valid response with 0 records (header only)."""
    header_only_csv = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n"
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.return_value = httpx.Response(
        status_code=200,
        text=header_only_csv,
        request=httpx.Request("GET", "https://firms.modaps.eosdis.nasa.gov/api/test")
    )

    result = asyncio.run(run_firms_ingestion_cycle(region="india", client=mock_client))
    assert result["status"] == "HEALTHY"
    assert result["records_received"] == 0
    assert result["records_inserted"] == 0
    assert result["duplicates_skipped"] == 0


def test_ingestion_cycle_http_error():
    """Verify handling when FIRMS returns HTTP 500 or 403."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.return_value = httpx.Response(
        status_code=500,
        text="Internal Server Error",
        request=httpx.Request("GET", "https://firms.modaps.eosdis.nasa.gov/api/test")
    )

    result = asyncio.run(run_firms_ingestion_cycle(region="india", client=mock_client))
    assert result["status"] == "ERROR"
    assert result["error_category"] == "http_500"
    state = load_ingestion_state()
    assert state["status"] == "ERROR"
    assert state["error_category"] == "http_500"


def test_ingestion_cycle_timeout():
    """Verify handling when FIRMS network request times out."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.side_effect = httpx.TimeoutException("Timeout")

    result = asyncio.run(run_firms_ingestion_cycle(region="india", client=mock_client))
    assert result["status"] == "ERROR"
    assert result["error_category"] == "timeout"


def test_staleness_calculation():
    """Verify status calculation dynamically turns STALE when last run is older than interval + grace period."""
    old_time = (datetime.now(timezone.utc) - timedelta(minutes=25)).isoformat()
    state = {
        "status": "HEALTHY",
        "last_run_started_at": old_time,
        "last_run_completed_at": old_time,
        "last_successful_run_at": old_time,
        "records_received": 10,
        "records_inserted": 10,
        "duplicates_skipped": 0,
        "total_stored_records": 10,
        "interval_minutes": 10,
        "error_category": None,
        "error_message": None,
        "last_http_status": 200,
    }
    save_ingestion_state(state)

    status = get_firms_ingestion_status()
    assert status["status"] == "STALE"


def test_api_firms_status_endpoint():
    """Test GET /api/firms/status endpoint returns expected structure."""
    client = TestClient(app)
    response = client.get("/api/firms/status")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "configured" in data
    assert "interval_minutes" in data
    assert "records_received" in data
    assert "total_stored_records" in data
    assert "timestamp" in data


def test_api_firms_observations_endpoint():
    """Test GET /api/firms/observations endpoint returns stored observations with pagination."""
    sample_obs = [
        {
            "observation_id": f"obs_{i}",
            "latitude": 20.0 + (i * 0.1),
            "longitude": 78.0 + (i * 0.1),
            "brightness": 330.0,
            "confidence": "nominal",
            "frp": 10.0,
            "acquired_at": "2026-09-07 14:30 UTC",
            "satellite": "Suomi-NPP (VIIRS)",
            "instrument": "VIIRS",
            "source": "NASA FIRMS",
            "ingested_at": datetime.now(timezone.utc).isoformat(),
        }
        for i in range(15)
    ]
    save_stored_observations(sample_obs)

    client = TestClient(app)
    response = client.get("/api/firms/observations?limit=10&offset=0")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 15
    assert data["limit"] == 10
    assert data["offset"] == 0
    assert data["count"] == 10
    assert len(data["observations"]) == 10

    # Test offset
    response2 = client.get("/api/firms/observations?limit=10&offset=10")
    assert response2.status_code == 200
    data2 = response2.json()
    assert data2["count"] == 5


def test_parse_acquired_at_formats():
    """Verify parsing of various acquired_at formats into UTC datetimes."""
    dt1 = parse_acquired_at("2026-09-07 14:30 UTC")
    assert dt1 is not None
    assert dt1.year == 2026 and dt1.month == 9 and dt1.day == 7
    assert dt1.hour == 14 and dt1.minute == 30
    assert dt1.tzinfo == timezone.utc

    dt2 = parse_acquired_at("2026-09-07T14:30:00Z")
    assert dt2 is not None
    assert dt2.hour == 14 and dt2.minute == 30

    dt3 = parse_acquired_at("2026-09-07 14:30:45")
    assert dt3 is not None
    assert dt3.second == 45

    assert parse_acquired_at(None) is None
    assert parse_acquired_at("") is None
    assert parse_acquired_at("invalid-date-string") is None


def test_freshness_classification_rules():
    """Verify data freshness rules based strictly on sensor overpass time."""
    assert classify_observation_freshness(30) == "FRESH"      # <= 180 min
    assert classify_observation_freshness(180) == "FRESH"     # Boundary
    assert classify_observation_freshness(181) == "RECENT"    # 181-720 min
    assert classify_observation_freshness(500) == "RECENT"
    assert classify_observation_freshness(720) == "RECENT"    # Boundary
    assert classify_observation_freshness(721) == "STALE"     # > 720 min
    assert classify_observation_freshness(1440) == "STALE"
    assert classify_observation_freshness(None) == "NO_DATA"
    assert classify_observation_freshness(-5) == "NO_DATA"


def test_get_latest_firms_observation_empty():
    """Verify get_latest_firms_observation handles empty storage cleanly."""
    save_stored_observations([])
    res = get_latest_firms_observation()
    assert res["available"] is False
    assert res["observation"] is None
    assert res["freshness"] == "NO_DATA"
    assert "No FIRMS observations" in res["message"]


def test_get_latest_firms_observation_selection():
    """
    Verify newest observation is chosen strictly by `acquired_at`
    regardless of `ingested_at` order or file order.
    """
    now = datetime.now(timezone.utc)
    older_time = (now - timedelta(hours=5)).strftime("%Y-%m-%d %H:%M UTC")
    newest_time = (now - timedelta(minutes=45)).strftime("%Y-%m-%d %H:%M UTC")
    oldest_time = (now - timedelta(hours=14)).strftime("%Y-%m-%d %H:%M UTC")

    sample_obs = [
        {
            "observation_id": "older_obs_1",
            "latitude": 16.5,
            "longitude": 80.6,
            "brightness": 340.0,
            "confidence": "high",
            "frp": 12.0,
            "acquired_at": older_time,
            "satellite": "Suomi-NPP (VIIRS)",
            "instrument": "VIIRS",
            "source": "NASA FIRMS",
            "ingested_at": now.isoformat(), # Ingested recently, but older observation
        },
        {
            "observation_id": "newest_obs_2",
            "latitude": 17.2,
            "longitude": 81.1,
            "brightness": 365.0,
            "confidence": "high",
            "frp": 45.0,
            "acquired_at": newest_time, # Chronologically latest satellite overpass
            "satellite": "NOAA-20 (VIIRS)",
            "instrument": "VIIRS",
            "source": "NASA FIRMS",
            "ingested_at": (now - timedelta(minutes=10)).isoformat(),
        },
        {
            "observation_id": "oldest_obs_3",
            "latitude": 18.0,
            "longitude": 82.0,
            "brightness": 330.0,
            "confidence": "nominal",
            "frp": 8.0,
            "acquired_at": oldest_time,
            "satellite": "Terra (MODIS)",
            "instrument": "MODIS",
            "source": "NASA FIRMS",
            "ingested_at": now.isoformat(),
        },
    ]
    save_stored_observations(sample_obs)

    latest = get_latest_firms_observation()
    assert latest["available"] is True
    assert latest["observation_id"] == "newest_obs_2"
    assert latest["latitude"] == 17.2
    assert latest["satellite"] == "NOAA-20 (VIIRS)"
    assert latest["freshness"] == "FRESH"
    assert latest["age_minutes"] >= 40 and latest["age_minutes"] <= 55


def test_get_latest_firms_observation_malformed_handling():
    """Verify malformed records with invalid dates or coordinates are skipped safely."""
    now = datetime.now(timezone.utc)
    valid_time = (now - timedelta(hours=2)).strftime("%Y-%m-%d %H:%M UTC")

    malformed_obs = [
        {
            "observation_id": "bad_1",
            "latitude": "invalid",
            "longitude": 80.0,
            "acquired_at": valid_time,
        },
        {
            "observation_id": "bad_2",
            "latitude": 16.0,
            "longitude": 80.0,
            "acquired_at": "not-a-datetime",
        },
        {
            "observation_id": "valid_1",
            "latitude": 16.123,
            "longitude": 80.456,
            "brightness": 342.5,
            "confidence": "high",
            "frp": 18.7,
            "satellite": "NOAA-20 (VIIRS)",
            "instrument": "VIIRS",
            "acquired_at": valid_time,
            "ingested_at": now.isoformat(),
            "source": "NASA FIRMS",
        }
    ]
    save_stored_observations(malformed_obs)

    latest = get_latest_firms_observation()
    assert latest["available"] is True
    assert latest["observation_id"] == "valid_1"
    assert latest["latitude"] == 16.123
    assert latest["freshness"] == "FRESH"


def test_api_firms_latest_endpoint():
    """Test GET /api/firms/latest endpoint schema and response."""
    now = datetime.now(timezone.utc)
    sample_obs = [
        {
            "observation_id": "api_test_obs",
            "latitude": 16.123,
            "longitude": 80.456,
            "brightness": 342.5,
            "confidence": "high",
            "frp": 18.7,
            "satellite": "NOAA-20 (VIIRS)",
            "instrument": "VIIRS",
            "acquired_at": (now - timedelta(minutes=45)).strftime("%Y-%m-%d %H:%M UTC"),
            "ingested_at": now.isoformat(),
            "source": "NASA FIRMS",
        }
    ]
    save_stored_observations(sample_obs)

    client = TestClient(app)
    response = client.get("/api/firms/latest")
    assert response.status_code == 200
    data = response.json()
    assert data["available"] is True
    assert data["observation_id"] == "api_test_obs"
    assert data["latitude"] == 16.123
    assert data["longitude"] == 80.456
    assert data["brightness"] == 342.5
    assert data["confidence"] == "high"
    assert data["frp"] == 18.7
    assert data["satellite"] == "NOAA-20 (VIIRS)"
    assert data["instrument"] == "VIIRS"
    assert data["freshness"] == "FRESH"
    assert "age_minutes" in data
    assert "acquired_at" in data
    assert "ingested_at" in data
    assert data["source"] == "NASA FIRMS"


def test_fetch_firms_hotspots_uses_stored_observations():
    """Verify fetch_firms_hotspots seamlessly consumes stored observations from Phase 2."""
    sample_obs = [
        {
            "observation_id": "stored_hotspot_1",
            "latitude": 17.5,
            "longitude": 79.5,
            "brightness": 350.0,
            "confidence": "high",
            "frp": 20.0,
            "acquired_at": "2026-09-07 12:00 UTC",
            "satellite": "Suomi-NPP (VIIRS)",
            "instrument": "VIIRS",
            "source": "NASA FIRMS",
            "ingested_at": datetime.now(timezone.utc).isoformat(),
        }
    ]
    save_stored_observations(sample_obs)

    result = asyncio.run(fetch_firms_hotspots(region="india"))
    assert result["source"] == "NASA FIRMS"
    assert result["count"] >= 1
    assert result["hotspots"][0]["latitude"] == 17.5


def test_zero_secret_leak():
    """Ensure secret key is never leaked in status endpoints or serialization."""
    client = TestClient(app)
    res_status = client.get("/api/firms/status")
    assert "test_mock_firms_key_123" not in res_status.text

    res_latest = client.get("/api/firms/latest")
    assert "test_mock_firms_key_123" not in res_latest.text

    res_sys = client.get("/api/system/status")
    assert "test_mock_firms_key_123" not in res_sys.text
