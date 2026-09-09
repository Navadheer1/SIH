# Phase 3B: FIRMS Persistence Migration to Supabase PostgreSQL

**Project:** SIH 26162 — Industrial Fire & Persistent Thermal Source Intelligence Platform  
**Phase:** Phase 3B — Supabase PostgreSQL Database Persistence & Migration  
**Status:** Completed & Verified  

---

## 1. Executive Summary

Phase 3B advances the SIH 26162 persistence architecture from single-node local JSON files to an enterprise-grade cloud relational database powered by **Supabase PostgreSQL**. 

This transition provides:
- High-concurrency relational querying with spatial and temporal B-Tree indexing.
- Fully idempotent deduplication at the database level using `observation_id` as the primary key and PostgreSQL `ON CONFLICT (observation_id) DO NOTHING`.
- Comprehensive ingestion audit history via the `firms_ingestion_runs` table.
- Resilient dual-tier architecture: Supabase PostgreSQL operates as the **primary persistent store**, while the existing `data/processed/firms_observations.json` file is maintained concurrently as an **atomic, offline-capable fallback snapshot**.
- Secure credential management with zero secret exposure.

---

## 2. System Architecture

```
                                  +-----------------------------+
                                  |   NASA FIRMS API / Feeds    |
                                  | (VIIRS SNPP / NOAA-20 / MOD)|
                                  +--------------+--------------+
                                                 |
                                     HTTPS (Timeout Protected)
                                                 |
                                                 v
                                  +-----------------------------+
                                  |    Ingestion Service /      |
                                  |     Background Worker       |
                                  | (app/workers/firms_ingest)  |
                                  +--------------+--------------+
                                                 |
                                 Normalize & Hash (observation_id)
                                                 |
                         +-----------------------+-----------------------+
                         | (Primary Store)                               | (Atomic Backup)
                         v                                               v
          +------------------------------+                +------------------------------+
          |     Supabase PostgreSQL      |                | data/processed/              |
          |  Table: firms_observations   |                | firms_observations.json      |
          |  Table: firms_ingestion_runs |                | (Atomic os.replace Storage)  |
          +--------------+---------------+                +--------------+---------------+
                         |                                               |
                         | (Primary Read)                                | (Fallback on DB error)
                         +-----------------------+-----------------------+
                                                 |
                                                 v
                                  +-----------------------------+
                                  |       FastAPI Backend       |
                                  |  GET /api/system/status     |
                                  |  GET /api/firms/observations|
                                  |  GET /api/firms/latest      |
                                  |  GET /api/hotspots          |
                                  +-----------------------------+
```

---

## 3. Database Schema & Indexing

### 3.1 Table: `firms_observations`

Stores all normalized, deduplicated active fire and thermal anomaly observations.

```sql
CREATE TABLE IF NOT EXISTS firms_observations (
    observation_id VARCHAR PRIMARY KEY,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    brightness DOUBLE PRECISION,
    confidence DOUBLE PRECISION,
    frp DOUBLE PRECISION,
    acquired_at TIMESTAMP WITH TIME ZONE NOT NULL,
    satellite VARCHAR,
    instrument VARCHAR,
    ingested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    source VARCHAR DEFAULT 'NASA FIRMS',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_firms_acquired_at ON firms_observations (acquired_at DESC);
CREATE INDEX IF NOT EXISTS idx_firms_location ON firms_observations (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_firms_satellite ON firms_observations (satellite);
CREATE INDEX IF NOT EXISTS idx_firms_instrument ON firms_observations (instrument);
```

### 3.2 Table: `firms_ingestion_runs`

Audit trail recording metrics, duration, and status for each FIRMS ingestion worker cycle.

```sql
CREATE TABLE IF NOT EXISTS firms_ingestion_runs (
    id BIGSERIAL PRIMARY KEY,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR NOT NULL,
    received_count INTEGER DEFAULT 0,
    inserted_count INTEGER DEFAULT 0,
    duplicate_count INTEGER DEFAULT 0,
    region VARCHAR,
    error_message VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

---

## 4. Database Connection & Pooling

- **Driver:** `SQLAlchemy 2.0` with `psycopg` (v3 binary).
- **Driver Prefix Normalization:** `backend/app/db/database.py` automatically normalizes `postgres://` and `postgresql://` connection strings to `postgresql+psycopg://`.
- **IPv4 Connection Pooler:** Supabase direct host (`db.<project_ref>.supabase.co`) resolves to IPv6. In IPv4 development environments, connection routing automatically falls back to the AWS transaction/session pooler (`aws-0-ap-southeast-1.pooler.supabase.com:5432`) with user format `postgres.<project_ref>`.
- **Connection Pool Configuration:**
  - `pool_size = 5`
  - `max_overflow = 10`
  - `pool_recycle = 300` (5 minutes)
  - `pool_pre_ping = True` (liveness verification before checkout)
  - `connect_timeout = 5s`

---

## 5. Migration Execution

To migrate existing local JSON observations (`data/processed/firms_observations.json`) into Supabase PostgreSQL, execute the standalone migration worker:

```bash
PYTHONPATH=backend python -m app.workers.migrate_firms_to_db
```

### Key Migration Characteristics:
1. **Idempotent:** Safe to run repeatedly; duplicate `observation_id` keys are detected and skipped without error.
2. **Non-Destructive:** The source JSON file is never removed or emptied; it is maintained as an offline backup.
3. **Batch Insertion:** Inserts records in chunks using `pg_insert ... ON CONFLICT (observation_id) DO NOTHING RETURNING observation_id` to provide exact insert and duplicate counts.

---

## 6. System Status & Health Check API

The `/api/system/status` endpoint reports real-time database and service health:

### Request:
```http
GET /api/system/status?check_connectivity=true
```

### Response Example:
```json
{
  "status": "OPERATIONAL",
  "services": {
    "backend": "UP",
    "firms": "REACHABLE",
    "database": "CONNECTED"
  },
  "details": {
    "firms": {
      "configured": true,
      "status": "REACHABLE",
      "connectivity_tested": true,
      "latency_ms": 320.15,
      "http_status": 200,
      "error_category": null
    },
    "database": {
      "configured": true,
      "status": "CONNECTED",
      "connectivity_tested": true,
      "latency_ms": 115.42,
      "dialect": "postgresql",
      "error_category": null
    },
    "storage": "SUPABASE_POSTGRESQL"
  },
  "timestamp": "2026-09-08T04:49:15.123456+00:00",
  "environment": "development"
}
```

---

## 7. Verification & Testing

### 7.1 Automated Unit & Integration Tests:
```bash
PYTHONPATH=backend pytest backend/tests/test_db_migration.py -v
```
Runs comprehensive test suites using in-memory SQLite for repository CRUD, idempotency, datetime/confidence parsing, and FastAPI endpoint assertions.

### 7.2 Live Supabase Connectivity Smoke Test:
```bash
RUN_SUPABASE_SMOKE_TEST=true PYTHONPATH=backend pytest backend/tests/test_db_migration.py -k test_live_supabase_smoke_test -v
```

### 7.3 Frontend Verification:
```bash
cd frontend && npm run build
```
Confirms TypeScript types and frontend build integrity without any regressions.
