# Phase 4: Real Satellite Evidence Integration (Copernicus Sentinel-2)

**Project:** SIH 26162 — Industrial Fire & Persistent Thermal Source Intelligence Platform  
**Phase:** Phase 4 — Copernicus Sentinel-2 Satellite Evidence Integration  
**Status:** Completed & Verified  

---

## 1. Executive Summary

Phase 4 integrates authentic multi-spectral Earth Observation satellite evidence from the European Space Agency's **Copernicus Sentinel-2** constellation via the **Copernicus Data Space Ecosystem (CDSE) / Sentinel Hub APIs**.

Key milestones achieved:
- Replaced synthetic/mock satellite imagery with genuine Sentinel-2 L2A optical evidence retrieval.
- Implemented OAuth2 Client Credentials authentication with automated, expiry-aware in-memory token caching.
- Integrated Copernicus Catalog STAC search (`sh.dataspace.copernicus.eu/catalog/v1/search`) filtered by spatial bounding box, temporal window (`SATELLITE_SEARCH_WINDOW_HOURS=48`), and cloud coverage (`eo:cloud_cover <= 80%`).
- Integrated Sentinel Hub Processing API (`sh.dataspace.copernicus.eu/process/v1`) to render and download 10-meter Ground Sample Distance (GSD) True-Color (B04/B03/B02) and False-Color (B08/B04/B03) PNG image patches.
- Established persistent database storage in Supabase PostgreSQL (`satellite_evidence` table) linking evidence to FIRMS observations by `observation_id`.
- Enforced strict **Data Integrity Rules**: never disguising synthetic test data as real satellite imagery, returning `available: false` with clear human-readable rationale when no overpass exists, and marking test data as `is_synthetic: true`.

---

## 2. Architecture & Pipeline

```
                       +---------------------------------------+
                       |      FIRMS Active Fire Hotspot        |
                       | (observation_id, lat, lon, acquired)  |
                       +-------------------+-------------------+
                                           |
                                           v
                       +---------------------------------------+
                       |       SatelliteAuthService            |
                       | (OAuth2 CDSE Token Caching & Expiry)  |
                       +-------------------+-------------------+
                                           |
                               Bearer Access Token
                                           |
                                           v
                       +---------------------------------------+
                       |    Copernicus Catalog STAC Search     |
                       |     (/catalog/v1/search - S2 L2A)     |
                       +-------------------+-------------------+
                                           |
                    Candidate Scene Found? | (No -> available=false, reason logged)
                                           |
                                           v
                       +---------------------------------------+
                       |    Sentinel Hub Processing API        |
                       |   (/process/v1 - B04/B03/B02 True)    |
                       +-------------------+-------------------+
                                           |
                         256x256 10m True-Color PNG Bytes
                                           |
                 +-------------------------+-------------------------+
                 |                                                   |
                 v                                                   v
  +-------------------------------+                   +-------------------------------+
  | Disk Cache                    |                   | Supabase PostgreSQL           |
  | data/satellite/cache/         |                   | Table: satellite_evidence     |
  | sat_<obs_id>.png              |                   | (Links observation_id)        |
  +---------------+---------------+                   +---------------+---------------+
                  |                                                   |
                  +-------------------------+-------------------------+
                                            |
                                            v
                             +-------------------------------+
                             | FastAPI & Multi-Modal Fusion  |
                             | GET /api/satellite/evidence   |
                             | GET /api/firms/{id}/satellite |
                             +-------------------------------+
```

---

## 3. Database Schema

### Table: `satellite_evidence`

```sql
CREATE TABLE IF NOT EXISTS satellite_evidence (
    id BIGSERIAL PRIMARY KEY,
    observation_id VARCHAR,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    provider VARCHAR DEFAULT 'Copernicus Sentinel Hub',
    product VARCHAR DEFAULT 'Sentinel-2 L2A',
    firms_acquired_at TIMESTAMP WITH TIME ZONE,
    satellite_acquired_at TIMESTAMP WITH TIME ZONE,
    retrieved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    cloud_percentage DOUBLE PRECISION,
    bbox VARCHAR,
    true_color_path VARCHAR,
    false_color_path VARCHAR,
    image_url VARCHAR,
    status VARCHAR DEFAULT 'AVAILABLE',
    is_synthetic BOOLEAN NOT NULL DEFAULT FALSE,
    error_message VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_sat_obs_id ON satellite_evidence (observation_id);
CREATE INDEX IF NOT EXISTS idx_sat_acquired_at ON satellite_evidence (satellite_acquired_at DESC);
CREATE INDEX IF NOT EXISTS idx_sat_coords ON satellite_evidence (latitude, longitude);
```

---

## 4. API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/system/status` | Reports `services.satellite` health (`CONNECTED`, `NOT_CONFIGURED`, `UNAVAILABLE`, `ERROR`) and latency. |
| `GET` | `/api/satellite/evidence` | Fetches real Sentinel-2 evidence and runs multi-modal fusion. |
| `GET` | `/api/firms/{observation_id}/satellite-evidence` | Fetches satellite evidence linked directly to a FIRMS observation. |
| `GET` | `/api/satellite/image/{patch_id}` | Serves cached satellite image patch PNG. |
| `POST` | `/api/satellite/analyze` | Request body analysis for coordinate/patch queries. |

---

## 5. Verification & Testing

- **Automated Unit & Integration Tests:**
  ```bash
  PYTHONPATH=backend pytest backend/tests/test_phase4_satellite.py -v
  ```
- **Live Copernicus Smoke Test (Gated):**
  ```bash
  RUN_COPERNICUS_SMOKE_TEST=true PYTHONPATH=backend pytest backend/tests/test_phase4_satellite.py -k test_live_copernicus_smoke_test -v
  ```
- **Backend Byte-Compilation:**
  ```bash
  python -m compileall backend/app
  ```
- **Frontend Production Build:**
  ```bash
  cd frontend && npm run build
  ```
