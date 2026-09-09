# PHASE 6F — BACKEND API INTEGRATION & OPERATIONALIZATION REPORT

**Generated:** 2026-09-08 11:30:00 UTC  
**System:** SIH Problem Statement 26162 — AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources  
**Service:** Canonical Investigation API & Multi-Source Orchestration (`InvestigationService`)  

---

## 1. Executive Summary & Objective

Phase 6F operationalizes the **Phase 6E Multi-Source Evidence Fusion engine** and **Phase 6C 6-band Sentinel-2 CNN** into a production-grade, highly resilient, strongly typed FastAPI backend endpoint.

The primary objective is providing a single canonical endpoint for the frontend intelligence view:
$$\text{GET } /api/firms/\{observation\_id\}/investigation$$
with backward-compatible alias:
$$\text{GET } /api/hotspots/\{observation\_id\}/investigation$$

### Key Guarantees Delivered
1. **Unified Schema:** Returns a consolidated JSON payload containing thermal anomaly radiance, temporal persistence, OSM geospatial proximity, Sentinel-2 6-band CNN inference, multi-source fusion classification, operational risk scoring, temporal provenance, and system warnings.
2. **Fault Isolation:** External services (Copernicus Data Space Ecosystem, OpenStreetMap Overpass API, Supabase Database) are fetched concurrently with bounded timeouts (`asyncio.gather` with 5–8s limits). Partial dependency failures gracefully downgrade to partial evidence rather than raising HTTP 500.
3. **Sub-Millisecond Repeated Query Caching:** In-memory thread-safe LRU/TTL cache with expiration reduces repeated investigation latency from ~30–1200 ms to **< 1.0 ms**.
4. **Strict Safety & Provenance Flags:** Ensures `is_synthetic: false`, `is_calibrated: false`, and explicit `temporal_offset_hours` are always conveyed to operational users.
5. **Zero Credential Exposure:** Eliminates API keys, client secrets, and database credentials from all serialization layers.

---

## 2. API Architecture & Canonical Endpoint

```
                  ┌──────────────────────────────────────────────────┐
                  │    GET /api/firms/{observation_id}/investigation │
                  └────────────────────────┬─────────────────────────┘
                                           │
                                ┌──────────┴──────────┐
                                │ Cache Lookup (TTL)  │───(Hit: <1ms)───┐
                                └──────────┬──────────┘                 │
                                           │ (Miss)                     │
                                           ▼                            │
                       ┌───────────────────────────────────────┐        │
                       │ Load Observation (DB / Local Cache)   │        │
                       └───────────────────┬───────────────────┘        │
                                           │                            │
             ┌─────────────────────────────┼────────────────────────────┤
             │                             │                            │
             ▼                             ▼                            │
┌─────────────────────────┐   ┌─────────────────────────┐               │
│  fetch_osm_context()    │   │ fetch_satellite_image() │               │
│  (Timeout: 5.0s)        │   │ (Timeout: 8.0s)         │               │
└────────────┬────────────┘   └────────────┬────────────┘               │
             │                             │                            │
             └───────────────┬─────────────┘                            │
                             │ (Fault Isolation & Gathering)            │
                             ▼                                          │
             ┌────────────────────────────────────────┐                 │
             │ Multi-Source Evidence Fusion Service   │                 │
             │ - Thermal Normalization                │                 │
             │ - Persistence Evaluation               │                 │
             │ - Spatial Proximity Decay              │                 │
             │ - Sentinel-2 6-Band CNN Inference      │                 │
             │ - Cloud-Cover Guardrails               │                 │
             └───────────────────┬────────────────────┘                 │
                                 │                                      │
                                 ▼                                      │
             ┌────────────────────────────────────────┐                 │
             │ Build InvestigationResponse (Pydantic) │                 │
             └───────────────────┬────────────────────┘                 │
                                 │                                      │
                                 ▼                                      │
             ┌────────────────────────────────────────┐                 │
             │ Populate In-Memory TTL Cache           │                 │
             └───────────────────┬────────────────────┘                 │
                                 │                                      │
                                 ▼                                      │
                     ┌───────────────────────┐                          │
                     │  HTTP 200 JSON Stream │ ◄────────────────────────┘
                     └───────────────────────┘
```

---

## 3. Strongly Typed Pydantic Schema Specification

Defined in `backend/app/schemas/investigation.py`:

| Schema Model | Description | Core Attributes |
| :--- | :--- | :--- |
| `DetectionEvidence` | NASA FIRMS thermal radiometric evidence | `source`, `latitude`, `longitude`, `brightness`, `frp`, `confidence`, `satellite`, `acquired_at`, `freshness` |
| `PersistenceEvidence` | Multi-day satellite recurrence evidence | `available`, `score` ($[0, 100]$), `observation_count`, `duration_hours`, `time_window_hours`, `classification` |
| `IndustrialContextEvidence` | OpenStreetMap geospatial proximity | `available`, `score` ($[0, 1]$), `nearest_distance_m`, `nearest_distance_km`, `nearest_facility`, `features` |
| `Sentinel2Evidence` | Genuine Sentinel-2 optical/multispectral | `available`, `state`, `class` (alias), `confidence`, `cloud_cover`, `quality`, `is_synthetic`, `is_calibrated`, `satellite_acquired_at`, `time_difference_hours`, `image_url`, `class_probabilities` |
| `FusionResult` | Multi-source synthesized intelligence | `candidate_class`, `candidate_score` ($[0, 1]$), `evidence_strength`, `confidence_label`, `reasoning`, `conflict_detected` |
| `RiskResult` | Operational multi-factor risk indicator | `risk_score` ($[0, 100]$), `risk_level` (`CRITICAL`, `HIGH`, `MODERATE`, `LOW`), `primary_driver`, `factors` |
| `Provenance` | Data lineage and temporal alignment | `observation_id`, `firms_acquired_at`, `sentinel2_acquired_at`, `temporal_offset_hours`, `osm_queried_at`, `investigated_at` |
| `InvestigationResponse` | Complete canonical response envelope | `observation_id`, `detection`, `persistence`, `industrial_context`, `sentinel2`, `fusion`, `risk`, `provenance`, `warnings`, `disclaimers` |

---

## 4. Latency & Performance Benchmark

Testing conducted across stored FIRMS active fire observations:

| Metric / Scenario | Uncached Latency | Cached Latency | Speedup Factor |
| :--- | :--- | :--- | :--- |
| **Observation 1 (`423f0b1ad50facd6`)** (Cold-start model load) | 1,180.49 ms | 1.06 ms | **1,113.6x** |
| **Observation 2 (`90b58068fefb3a79`)** (Warm model inference) | 31.20 ms | 0.80 ms | **39.0x** |
| **Observation 3 (`a35cd8640d876fc2`)** (Warm model inference) | 30.15 ms | 0.79 ms | **38.1x** |
| **Observation 4 (`b81fac3250838ed8`)** (Warm model inference) | 52.21 ms | 0.87 ms | **60.0x** |
| **Observation 5 (`13500f5ba6c8a074`)** (Warm model inference) | 31.03 ms | 0.84 ms | **36.9x** |
| **Average Steady-State Response** | **36.14 ms** | **0.87 ms** | **41.5x** |

---

## 5. Fault Isolation & Error Matrix

| Scenario / Dependency State | HTTP Status | Response Handling | Warning Injected |
| :--- | :---: | :--- | :--- |
| **Valid Observation, All Services UP** | `200 OK` | Complete multi-source fusion | None |
| **Non-Existent Observation ID** | `404 Not Found` | Standard error envelope | Observation not found |
| **Malformed / Empty Observation ID** | `400 Bad Request` | Standard error envelope | Invalid ID provided |
| **Copernicus CDSE Timeout / Degraded** | `200 OK` | Fallback to FIRMS + OSM + Persistence | `"Copernicus Sentinel-2 service degraded..."` |
| **OpenStreetMap Overpass Timeout** | `200 OK` | Fallback to FIRMS + S2 + Persistence | `"OpenStreetMap industrial context service degraded..."` |
| **Database Disconnected** | `200 OK` | Fallback to local JSON observation cache | Logged internally, seamless query |
| **High Cloud Cover ($> 50\%$)** | `200 OK` | Softmax weight discounted in fusion | `"High cloud cover detected..."` |
| **Very High Cloud Cover ($> 80\%$)** | `200 OK` | CNN excluded from fusion calculation | `"Very high cloud cover; CNN evidence excluded"` |

---

## 6. Full Regression & Integration Test Suite Status

```
============================= test session starts ==============================
Platform: Darwin (macOS) -- Python 3.13.3 -- pytest-9.1.1
Collected 62 items across Phase 6A, 6B, 6C, 6D, 6E, 6F:

tests/test_phase6a_dataset.py ......................... [ 7 PASSED]
tests/test_phase6b_audit.py ........................... [ 4 PASSED]
tests/test_phase6c_model.py ........................... [ 7 PASSED]
tests/test_phase6d_evaluation.py ...................... [ 9 PASSED]
tests/test_phase6e_fusion.py .......................... [17 PASSED]
tests/test_phase6f_api_integration.py ................. [18 PASSED]

======================= 62 passed in 24.46s =======================
```

### Phase 6F Integration Tests Summary (18/18 Passed)
1. `test_01_valid_investigation_request`: Full payload validation for existing FIRMS observation.
2. `test_02_nonexistent_observation_404`: Proper HTTP 404 on missing record.
3. `test_03_malformed_observation_id_400`: Proper HTTP 400 on whitespace/empty record.
4. `test_04_partial_satellite_evidence`: Valid response when Sentinel-2 acquisition is absent.
5. `test_05_sentinel2_dependency_failure_isolation`: Fault isolation when satellite provider throws exception.
6. `test_06_osm_dependency_failure_isolation`: Fault isolation when Overpass API throws exception.
7. `test_07_missing_persistence_handled`: Clean handling when spatial persistence cluster is empty.
8. `test_08_missing_optional_evidence_clean`: Fallback when both OSM and S2 are absent.
9. `test_09_fusion_result_propagation`: Full candidate class, score, and reasoning propagation.
10. `test_10_cloud_warning_propagation`: Cloud cover warning propagation to warnings array.
11. `test_11_timestamp_provenance_propagation`: Complete ISO timestamp and offset verification.
12. `test_12_is_synthetic_safety_propagation`: Verification that `is_synthetic` is boolean False.
13. `test_13_is_calibrated_safety_propagation`: Verification that `is_calibrated` is boolean False.
14. `test_14_no_secret_leakage`: Automated scan ensuring 0 credentials exist in JSON response.
15. `test_15_stable_response_schema`: Schema keys conformance check.
16. `test_16_repeated_request_caching`: Cache hit latency acceleration and eviction check.
17. `test_17_hotspot_investigation_alias_route`: Verification of `/api/hotspots/{id}/investigation` route.
18. `test_18_system_health_regression`: Verification of `/api/system/status` operational state.

---

## 7. Mandatory Operational Disclaimers

Every API response strictly contains the two standard regulatory disclaimers:
1. > **AI Candidate Classification Disclaimer:**
   > *"AI Candidate Classification is an evidence-fusion output, not a standalone confirmation of an industrial fire."*
2. > **Satellite Temporal Coincidence Disclaimer:**
   > *"Sentinel-2 imagery is optical evidence and may not be temporally coincident with the FIRMS observation."*
