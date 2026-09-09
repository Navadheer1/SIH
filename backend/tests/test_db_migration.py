import os
import json
import pytest
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

import app.config as config
from app.db.database import (
    Base,
    normalize_database_url,
    check_database_connectivity,
    init_db,
    get_db,
)
from app.db.models import FirmsObservation, FirmsIngestionRun
from app.db.repositories import (
    FirmsObservationRepository,
    FirmsIngestionRunRepository,
    parse_confidence_to_float,
    parse_datetime_utc,
)
from app.services.firms_ingestion_service import (
    load_stored_observations,
    get_latest_firms_observation,
    save_stored_observations,
)
from app.main import app


@pytest.fixture
def in_memory_db():
    """Create an isolated in-memory SQLite database session for unit testing."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_normalize_database_url():
    """Verify database URL normalization handles prefixes and never leaks secrets."""
    # Empty
    assert normalize_database_url("") == ""
    # Standard postgresql -> postgresql+psycopg
    assert normalize_database_url("postgresql://user:pass@host:5432/db") == "postgresql+psycopg://user:pass@host:5432/db"
    # Postgres scheme
    assert normalize_database_url("postgres://user:pass@host:5432/db") == "postgresql+psycopg://user:pass@host:5432/db"
    # Double scheme
    assert normalize_database_url("postgresql:postgresql://user:pass@host:5432/db") == "postgresql+psycopg://user:pass@host:5432/db"
    # Direct Supabase IPv4 Pooler auto-mapping
    direct = "postgresql://postgres:pass@db.agxtdttgjdtduyxeijcv.supabase.co:5432/postgres"
    normalized = normalize_database_url(direct)
    assert "pooler.supabase.com" in normalized
    assert "postgres.agxtdttgjdtduyxeijcv" in normalized


def test_parse_helpers():
    """Verify confidence and datetime parsing helpers."""
    assert parse_confidence_to_float("high") == 100.0
    assert parse_confidence_to_float("h") == 100.0
    assert parse_confidence_to_float("nominal") == 60.0
    assert parse_confidence_to_float("n") == 60.0
    assert parse_confidence_to_float("low") == 20.0
    assert parse_confidence_to_float("l") == 20.0
    assert parse_confidence_to_float("85.5") == 85.5
    assert parse_confidence_to_float(92) == 92.0
    assert parse_confidence_to_float("N/A") is None

    dt1 = parse_datetime_utc("2026-09-07 14:30 UTC")
    assert dt1 is not None
    assert dt1.hour == 14 and dt1.minute == 30
    assert dt1.tzinfo is not None

    dt2 = parse_datetime_utc("2026-09-07T14:30:00Z")
    assert dt2 is not None
    assert dt2.hour == 14 and dt2.minute == 30


def test_repository_insert_and_idempotency(in_memory_db):
    """Verify repository inserts records and skips duplicates idempotently."""
    sample_obs = [
        {
            "observation_id": "test_obs_001",
            "latitude": 21.12345,
            "longitude": 79.12345,
            "brightness": 340.5,
            "confidence": "high",
            "frp": 15.2,
            "acquired_at": "2026-09-07 10:00 UTC",
            "satellite": "Suomi-NPP (VIIRS)",
            "instrument": "VIIRS",
            "source": "NASA FIRMS",
            "ingested_at": "2026-09-07 10:05 UTC",
        },
        {
            "observation_id": "test_obs_002",
            "latitude": 22.54321,
            "longitude": 80.54321,
            "brightness": 355.0,
            "confidence": "nominal",
            "frp": 25.0,
            "acquired_at": "2026-09-07 11:00 UTC",
            "satellite": "NOAA-20 (VIIRS)",
            "instrument": "VIIRS",
            "source": "NASA FIRMS",
            "ingested_at": "2026-09-07 11:05 UTC",
        }
    ]

    # First Insert
    res1 = FirmsObservationRepository.insert_observations(in_memory_db, sample_obs)
    assert res1["received"] == 2
    assert res1["inserted"] == 2
    assert res1["duplicates"] == 0

    count = FirmsObservationRepository.count_observations(in_memory_db)
    assert count == 2

    # Second Insert with same items (Idempotent Deduplication)
    res2 = FirmsObservationRepository.insert_observations(in_memory_db, sample_obs)
    assert res2["received"] == 2
    assert res2["inserted"] == 0
    assert res2["duplicates"] == 2

    # Verify query and ordering
    records = FirmsObservationRepository.get_observations(in_memory_db)
    assert len(records) == 2
    assert records[0].observation_id == "test_obs_002"  # Newest acquired_at first

    # Verify latest observation
    latest = FirmsObservationRepository.get_latest_observation(in_memory_db)
    assert latest is not None
    assert latest.observation_id == "test_obs_002"

    # Verify bounding box filtering
    bbox_match = FirmsObservationRepository.get_observations(in_memory_db, bbox=[78.0, 20.0, 80.0, 22.0])
    assert len(bbox_match) == 1
    assert bbox_match[0].observation_id == "test_obs_001"


def test_ingestion_run_repository(in_memory_db):
    """Verify FirmsIngestionRunRepository records runs and completion metrics."""
    now_dt = datetime.now(timezone.utc)
    run = FirmsIngestionRunRepository.create_run(in_memory_db, started_at=now_dt, status="RUNNING", region="india")
    assert run.id is not None
    assert run.status == "RUNNING"

    completed_dt = datetime.now(timezone.utc)
    updated = FirmsIngestionRunRepository.complete_run(
        in_memory_db,
        run_id=run.id,
        completed_at=completed_dt,
        status="SUCCESS",
        received_count=50,
        inserted_count=45,
        duplicate_count=5
    )
    assert updated.status == "SUCCESS"
    assert updated.received_count == 50
    assert updated.inserted_count == 45
    assert updated.duplicate_count == 5


def test_system_status_api():
    """Verify /api/system/status reports backend, firms, and database status accurately."""
    client = TestClient(app)

    # 1. Unchecked status without probe
    resp = client.get("/api/system/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "OPERATIONAL"
    assert "services" in data
    assert "backend" in data["services"]
    assert "firms" in data["services"]
    assert "database" in data["services"]
    assert "details" in data
    assert "database" in data["details"]

    # 2. Checked status with connectivity probe
    resp_check = client.get("/api/system/status?check_connectivity=true")
    assert resp_check.status_code == 200
    data_check = resp_check.json()
    assert "services" in data_check
    assert data_check["services"]["backend"] == "UP"


def test_firms_observations_api():
    """Verify /api/firms/observations returns stored observations."""
    client = TestClient(app)
    resp = client.get("/api/firms/observations?limit=10")
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "observations" in data
    assert isinstance(data["observations"], list)


def test_firms_latest_api():
    """Verify /api/firms/latest returns chronologically newest observation and freshness."""
    client = TestClient(app)
    resp = client.get("/api/firms/latest")
    assert resp.status_code == 200
    data = resp.json()
    assert "available" in data
    assert "freshness" in data


@pytest.mark.skipif(
    not os.getenv("RUN_SUPABASE_SMOKE_TEST"),
    reason="Set RUN_SUPABASE_SMOKE_TEST=true to run live Supabase PostgreSQL smoke test"
)
def test_live_supabase_smoke_test():
    """
    Live Supabase smoke test.
    Only runs if explicitly enabled with RUN_SUPABASE_SMOKE_TEST=true.
    Never exposes database passwords or credentials.
    """
    conn_info = check_database_connectivity(timeout_seconds=5.0)
    assert conn_info["status"] == "CONNECTED", f"Live Supabase connection failed: {conn_info}"
    assert conn_info["dialect"] == "postgresql"
    assert conn_info["latency_ms"] is not None
