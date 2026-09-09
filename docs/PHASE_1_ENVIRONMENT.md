# Phase 1: Environment & Configuration Architecture

This document specifies the environment configuration architecture, secret management rules, API endpoint integration, and startup instructions for the SIH 26162 Industrial Fire & Persistent Thermal Source Intelligence Platform.

---

## 1. Environment Variables Overview

| Environment Variable | Location | Type | Default Value | Description |
| :--- | :--- | :--- | :--- | :--- |
| `NASA_FIRMS_MAP_KEY` | `backend/.env` | **SECRET** | None / Empty | NASA FIRMS MAP_KEY required for real-time area API queries. If missing, backend falls back gracefully to public 24h CSV feeds & offline backup cache. |
| `DATABASE_URL` | `backend/.env` | **SECRET** (if credentials included) | None / Empty | Optional SQL/database connection URI. When unset, alerts and events persist locally to `data/processed/alerts.json`. |
| `CORS_ORIGINS` | `backend/.env` | Config | `http://localhost:5173` | Comma-separated list of allowed frontend origins for CORS. |
| `ALERT_CRITICAL_THRESHOLD` | `backend/.env` | Config | `75.0` | Risk score threshold to trigger CRITICAL severity alert triage. |
| `ALERT_HIGH_THRESHOLD` | `backend/.env` | Config | `50.0` | Risk score threshold to trigger HIGH severity alert triage. |
| `ALERT_DEDUP_RADIUS_KM` | `backend/.env` | Config | `1.0` | Spatial clustering deduplication radius in kilometers. |
| `ALERT_COOLDOWN_HOURS` | `backend/.env` | Config | `12.0` | Alert cooldown duration window before re-triggering. |
| `SATELLITE_PROVIDER` | `backend/.env` | Config | `Sentinel-2` | Target satellite constellation imagery provider. |
| `SATELLITE_API_KEY` | `backend/.env` | **SECRET** | None / Empty | Satellite provider API key (e.g. Sentinel Hub). |
| `VITE_API_BASE_URL` | `frontend/.env` | Config (Public) | `http://localhost:8000` | Backend API base URL consumed by Vite frontend client. |

---

## 2. File Placements and Template Files

### Backend Configuration (`backend/.env`)
- **File path:** `backend/.env`
- **Example template:** `backend/.env.example`
- **Rule:** Never commit `backend/.env` to source control. Only commit `backend/.env.example` with empty/placeholder values.

#### `backend/.env.example` Template:
```env
# NASA FIRMS API Key (Get your key at: https://firms.modaps.eosdis.nasa.gov/api/map_key)
NASA_FIRMS_MAP_KEY=

# Database Connection URL (Optional - defaults to local file storage if empty)
DATABASE_URL=

# CORS Allowed Origins (Comma-separated URLs for frontend clients)
CORS_ORIGINS=http://localhost:5173

# Alert Thresholds & State Machine
ALERT_CRITICAL_THRESHOLD=75.0
ALERT_HIGH_THRESHOLD=50.0
ALERT_DEDUP_RADIUS_KM=1.0
ALERT_COOLDOWN_HOURS=12.0

# Phase 8 & 9 Satellite Image Intelligence & Computer Vision Configuration
SATELLITE_PROVIDER=Sentinel-2
SATELLITE_API_KEY=
SATELLITE_IMAGE_SIZE=256
SATELLITE_PATCH_RADIUS_KM=1.0
SATELLITE_CACHE_DIR=data/satellite/cache
SATELLITE_DATASET_DIR=data/satellite

# Phase 9 Trainable Computer Vision Model Configuration
SATELLITE_CLASSIFIER=trained
SATELLITE_MODEL_DIR=models/satellite_classifier
SATELLITE_METRICS_DIR=data/satellite/metrics
```

### Frontend Configuration (`frontend/.env`)
- **File path:** `frontend/.env`
- **Example template:** `frontend/.env.example`
- **Rule:** The frontend environment contains only client-safe configuration variables prefixed with `VITE_`. It must **never** contain `NASA_FIRMS_MAP_KEY`, database credentials, or private API keys.

#### `frontend/.env.example` Template:
```env
# SIH 26162 Frontend Environment Configuration
# Backend API Base URL (default for local development: http://localhost:8000)
VITE_API_BASE_URL=http://localhost:8000
```

---

## 3. How Frontend Accesses Backend

All frontend network calls are centralized in `frontend/src/config/api.ts`.

```typescript
// frontend/src/config/api.ts
export const API_BASE_URL: string = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
).replace(/\/+$/, '');

export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export function getAssetUrl(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return getApiUrl(path);
}
```

Components import `getApiUrl` and `getAssetUrl` to formulate endpoints dynamically without hardcoding `http://127.0.0.1:8000` or `http://localhost:8000`.

---

## 4. System Health & Status Endpoints

The backend provides two observability and status endpoints:

### A. Health & Basic Config Check: `GET /api/health`
Used by dashboards and orchestrators to confirm server availability and environment configuration summary:

```json
{
  "status": "healthy",
  "service": "SIH 26162 Backend",
  "version": "1.0.0",
  "config": {
    "nasa_firms_map_key_configured": true,
    "database_configured": false,
    "cors_origins": ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    "satellite_provider": "sentinel-2",
    "satellite_classifier": "trained",
    "satellite_api_key_configured": false,
    "environment": "development"
  }
}
```

---

### B. Dedicated System Status: `GET /api/system/status`
Provides a structured system health status report distinguishing **credential configuration** from **actual network connectivity**.

#### Default Request (Fast Check - Zero External Network Latency):
```http
GET /api/system/status
```

Response:
```json
{
  "status": "OPERATIONAL",
  "services": {
    "backend": "UP",
    "firms": "CONFIGURED"
  },
  "details": {
    "firms": {
      "configured": true,
      "status": "CONFIGURED",
      "connectivity_tested": false,
      "latency_ms": null
    },
    "database": "NOT_CONFIGURED",
    "storage": "FILE_LOCAL"
  },
  "timestamp": "2026-09-07T15:19:33.589214+00:00",
  "environment": "development"
}
```

#### Optional Connectivity Probe Request:
```http
GET /api/system/status?check_connectivity=true
```

Response:
```json
{
  "status": "OPERATIONAL",
  "services": {
    "backend": "UP",
    "firms": "REACHABLE"
  },
  "details": {
    "firms": {
      "configured": true,
      "status": "REACHABLE",
      "connectivity_tested": true,
      "latency_ms": 342.5,
      "http_status": 200,
      "error_category": null
    },
    "database": "NOT_CONFIGURED",
    "storage": "FILE_LOCAL"
  },
  "timestamp": "2026-09-07T15:19:02.475197+00:00",
  "environment": "development"
}
```

---

### 5. Semantic Meaning of Service States

| Status | Meaning | Conditions |
| :--- | :--- | :--- |
| `CONFIGURED` | Credential present in environment | `NASA_FIRMS_MAP_KEY` is non-empty. Connectivity has **not** been actively tested. |
| `NOT_CONFIGURED` | Credential missing from environment | `NASA_FIRMS_MAP_KEY` is empty or unset. |
| `REACHABLE` | Remote service responded successfully | Single, minimal probe received valid HTTP 200 CSV from NASA FIRMS API. |
| `UNREACHABLE` | Remote service timed out or errored | Remote service returned HTTP 5xx, connect error, or timeout (e.g. offline / DNS issue). |
| `INVALID_CREDENTIAL` | Credential was rejected by remote API | Remote API returned HTTP 200 `Invalid MAP_KEY` or HTTP 401/403. |

> [!IMPORTANT]
> **CONFIGURED vs REACHABLE Distinction:**
> Having `NASA_FIRMS_MAP_KEY` configured in `.env` only proves the key was loaded. It does **not** guarantee network reachability or key validity until an active probe (`check_connectivity=true`) is explicitly requested.

---

### 6. Security Rules

1. **No Secrets in Frontend:** The frontend bundle is public client code. Never place API keys, private tokens, or secret credentials in `frontend/.env` or React code.
2. **Zero Key Exposure:** Never return `NASA_FIRMS_MAP_KEY` or partial keys in any API response or log statement.
3. **Sanitized Logging:** Never log query URLs containing raw API keys (such as `api/area/csv/{KEY}/...`). Log sanitized URLs (e.g. `api/area/csv/***VIIRS...`).
4. **No Polling Overhead:** Do not perform periodic or automated continuous FIRMS connectivity probing. Connectivity tests are single, minimal, and on-demand only.
5. **Strict Git Exclusion:** `.gitignore` must ignore `.env`, `.env.*`, `backend/.env`, and `frontend/.env`, while explicitly whitelisting `.env.example` templates.
6. **No Plaintext Commits:** Run `git status` and `git diff` before committing to ensure no credentials or active keys are staged.

---

### 7. How to Start the Project

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm

### Backend Setup & Launch
```bash
# 1. From repository root, create virtual environment (or use uv)
python3 -m venv .venv
source .venv/bin/activate

# 2. Install backend dependencies
pip install -r backend/requirements.txt

# 3. Configure backend environment
cp backend/.env.example backend/.env
# Edit backend/.env to set NASA_FIRMS_MAP_KEY (optional)

# 4. Start backend API server
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
*Backend API will be accessible at `http://localhost:8000` (Docs at `http://localhost:8000/docs`).*

### Frontend Setup & Launch
```bash
# 1. Navigate to frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Configure frontend environment
cp .env.example .env
# Default VITE_API_BASE_URL=http://localhost:8000 is ready for local dev

# 4. Start frontend development server
npm run dev
```
*Frontend will be accessible at `http://localhost:5173`.*
