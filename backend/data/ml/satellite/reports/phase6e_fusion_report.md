# PHASE 6E — MULTI-SOURCE EVIDENCE FUSION REPORT

**Generated:** 2026-09-08 11:22:34 UTC  
**System:** SIH Problem Statement 26162 — AI-Based Industrial Fire & Persistent Thermal Source Intelligence  
**Module:** Evidence Fusion Service (`EvidenceFusionService`)  

---

## 1. Fusion Architecture Overview
The Phase 6E Multi-Source Evidence Fusion layer synthesizes 4 distinct, complementary data streams into a single bounded, explainable **AI Candidate Classification**:

1. **NASA FIRMS Thermal Anomaly Radiance:** Active Fire Radiative Power ($MW$), Brightness Temperature ($K$), Detection Confidence.
2. **FIRMS Temporal Persistence:** Spatial-temporal clustering tracking thermal recurrence across multiple satellite orbits over time.
3. **OpenStreetMap Industrial Context:** Proximity decay mapping distance to mapped industrial facilities, chemical plants, and refineries.
4. **Sentinel-2 6-Band Multispectral CNN:** Candidate visual classification from high-radiance Short-Wave Infrared (`B11, B12`) and NIR (`B08`) optical bands.
5. **Atmospheric & Cloud Guardrails:** Quality discounting based on cloud opacity percentages.

```
                    ┌────────────────────────┐
                    │ NASA FIRMS (FRP/Temp)  │ (Base Weight: 0.30)
                    └───────────┬────────────┘
                                │
                    ┌───────────┴────────────┐
                    │ FIRMS Persistence      │ (Base Weight: 0.20)
                    └───────────┬────────────┘
                                │
                    ┌───────────┴────────────┐
                    │ OSM Industrial Context │ (Base Weight: 0.20)
                    └───────────┬────────────┘
                                │
                    ┌───────────┴────────────┐
                    │ Sentinel-2 6-Band CNN  │ (Base Weight: 0.30 * Cloud Multiplier)
                    └───────────┬────────────┘
                                │
                                ▼
           ┌──────────────────────────────────────────────┐
           │ Dynamic Normalization & Conflict Resolution  │
           └────────────────────┬─────────────────────────┘
                                │
                                ▼
           ┌──────────────────────────────────────────────┐
           │        AI CANDIDATE CLASSIFICATION           │
           │  (Score: [0, 1], Strength, Rationale, Warns) │
           └──────────────────────────────────────────────┘
```

---

## 2. Evidence Normalization & Mathematical Formulas

### 2.1 FIRMS Thermal Anomaly Normalization
- **Formula:** $S_{Thermal} = 0.50 \cdot \min(1.0, rac{FRP}{50}) + 0.30 \cdot \min(1.0, \max(0.0, rac{Brightness - 300}{120})) + 0.20 \cdot S_{Conf}$
- **Range:** $[0.0, 1.0]$
- **Rationale:** FRP measures radiant combustion energy release; Brightness measures localized temperature; Confidence measures sensor validation flags.
- **Limitations:** Small sub-pixel flares may yield modest FRP while extreme forest fires yield elevated FRP.

### 2.2 Persistence Normalization
- **Formula:** $S_{Pers} = \min(1.0, rac{Score_{100}}{100.0})$
- **Range:** $[0.0, 1.0]$
- **Rationale:** Industrial flares, furnaces, and chemical units persist over hours/days, whereas open brushfires move rapidly.
- **Limitations:** Peat fires or prolonged agricultural burns also exhibit temporal persistence.

### 2.3 OpenStreetMap Industrial Proximity Normalization
- **Formula:**
  $$	ext{Score}(d) = \begin{cases} 
  1.0 & d \le 0.5\,\text{km} \\ 
  1.0 - 0.4 \cdot \frac{d - 0.5}{1.5} & 0.5 < d \le 2.0\,\text{km} \\ 
  0.4 - 0.4 \cdot \frac{d - 2.0}{3.0} & 2.0 < d \le 5.0\,\text{km} \\ 
  0.0 & d > 5.0\,\text{km} \end{cases}$$
- **Range:** $[0.0, 1.0]$
- **Rationale:** Proximity to mapped manufacturing/refinery infrastructure provides contextual likelihood.
- **Limitations:** OSM depends on community mapping and is contextual evidence only, never proof of an active fire.

### 2.4 Sentinel-2 Multispectral Classification & Cloud Guardrails
- **Quality Guardrails:**
  - $	ext{Cloud} < 30\%$: **GOOD** (Multiplier: $1.00$)
  - $30\% \le \text{Cloud} < 50\%$: **MODERATE** (Multiplier: $0.85$)
  - $50\% \le \text{Cloud} < 70\%$: **HIGH_CLOUD** (Multiplier: $0.40$ — Degraded state)
  - $	ext{Cloud} \ge 70\%$: **VERY_HIGH_CLOUD** (Multiplier: $0.15$ — Strongly down-weighted; cannot confirm industrial fire alone)
- **Calibration Status:** `is_calibrated: false` (Preserved explicitly).

---

## 3. Real FIRMS Observation Benchmark Evaluations

### Real Case 1: Verified Observation with Very High Cloud (90.07%)
- **Observation ID:** `04e53a2f16d0d665`
- **Candidate Classification:** `INDUSTRIAL_FIRE`
- **Candidate Score:** **0.6559** (MODERATE Evidence / MEDIUM Confidence)
- **Sentinel-2 Quality Status:** `VERY_HIGH_CLOUD` (Cloud cover: 90.07%)
- **Sources Used:** NASA FIRMS, NASA FIRMS Acquisition (2026-08-25 04:30 UTC), FIRMS Persistence Engine, OpenStreetMap Geospatial Context, Copernicus Sentinel-2 Multispectral, Sentinel-2 Acquisition (2026-08-25 05:22:26 UTC)

**Reasoning:**
- Strong NASA FIRMS thermal anomaly detected (FRP: 28.5 MW, Brightness: 355.4 K).
- Moderate thermal recurrence (Persistence Score: 45.0/100).
- Industrial infrastructure identified within 850.0m (Unknown Industrial Facility).
- Sentinel-2 optical imagery severely obscured by dense cloud cover (90.1%). Strongly down-weighted; cannot confirm industrial fire alone.
**Warnings / Guardrail Triggers:**
- ⚠️ Sentinel-2 optical evidence heavily obscured by cloud cover (90.1%). Primary decision relies on FIRMS and geospatial context.

### Real Case 2: Low Cloud (14.5%) Industrial Fire Candidate
- **Observation ID:** `423f0b1ad50facd6`
- **Candidate Classification:** `INDUSTRIAL_FIRE`
- **Candidate Score:** **0.7344** (STRONG Evidence / HIGH Confidence)
- **Sentinel-2 Quality Status:** `GOOD` (Cloud cover: 14.5%)
- **Sources Used:** NASA FIRMS, NASA FIRMS Acquisition (2026-09-07 05:59 UTC), FIRMS Persistence Engine, OpenStreetMap Geospatial Context, Copernicus Sentinel-2 Multispectral, Sentinel-2 Acquisition (2026-09-07 06:15:00 UTC)

**Reasoning:**
- Moderate/low NASA FIRMS thermal signature (FRP: 5.28 MW).
- Persistent thermal emission observed over 24.0 hours across 5 passes (Persistence Score: 82.0/100).
- Industrial infrastructure identified within 350.0m (Unknown Industrial Facility).
- Sentinel-2 6-band CNN classifies optical patch as INDUSTRIAL_FIRE with 96.0% confidence under clear atmospheric conditions (Cloud cover: 14.5%).

### Real Case 3: Moderate Cloud (38.2%) Candidate
- **Observation ID:** `90b58068fefb3a79`
- **Candidate Classification:** `INDUSTRIAL_FIRE`
- **Candidate Score:** **0.5584** (MODERATE Evidence / MEDIUM Confidence)
- **Sentinel-2 Quality Status:** `MODERATE` (Cloud cover: 38.2%)
- **Sources Used:** NASA FIRMS, NASA FIRMS Acquisition (2026-09-07 07:35 UTC), FIRMS Persistence Engine, OpenStreetMap Geospatial Context, Copernicus Sentinel-2 Multispectral, Sentinel-2 Acquisition (2026-09-07 08:10:00 UTC)

**Reasoning:**
- Moderate/low NASA FIRMS thermal signature (FRP: 10.95 MW).
- Moderate thermal recurrence (Persistence Score: 40.0/100).
- Industrial infrastructure identified within 1400.0m (Unknown Industrial Facility).
- Sentinel-2 CNN classifies optical patch as INDUSTRIAL_FIRE with moderate cloud cover (38.2%).

### Real Case 4: High Cloud (62.0%) Degraded Satellite Evidence
- **Observation ID:** `a35cd8640d876fc2`
- **Candidate Classification:** `INDUSTRIAL_FIRE`
- **Candidate Score:** **0.6411** (MODERATE Evidence / MEDIUM Confidence)
- **Sentinel-2 Quality Status:** `HIGH_CLOUD` (Cloud cover: 62.0%)
- **Sources Used:** NASA FIRMS, NASA FIRMS Acquisition (2026-09-07 07:35 UTC), FIRMS Persistence Engine, OpenStreetMap Geospatial Context, Copernicus Sentinel-2 Multispectral, Sentinel-2 Acquisition (2026-09-07 09:00:00 UTC)

**Reasoning:**
- Moderate/low NASA FIRMS thermal signature (FRP: 10.79 MW).
- Persistent thermal emission observed over 12.0 hours across 3 passes (Persistence Score: 60.0/100).
- Industrial infrastructure identified within 500.0m (Unknown Industrial Facility).
- Sentinel-2 optical evidence degraded by elevated cloud cover (62.0%). Contribution down-weighted.
**Warnings / Guardrail Triggers:**
- ⚠️ Sentinel-2 evidence downgraded because cloud cover is 62.0%.

### Real Case 5: No Sentinel-2 Acquisition Available (FIRMS+Persistence+OSM only)
- **Observation ID:** `b81fac3250838ed8`
- **Candidate Classification:** `INDUSTRIAL_FIRE`
- **Candidate Score:** **0.6170** (MODERATE Evidence / MEDIUM Confidence)
- **Sentinel-2 Quality Status:** `UNKNOWN` (Cloud cover: None%)
- **Sources Used:** NASA FIRMS, NASA FIRMS Acquisition (2026-09-07 07:35 UTC), FIRMS Persistence Engine, OpenStreetMap Geospatial Context

**Reasoning:**
- Moderate/low NASA FIRMS thermal signature (FRP: 3.73 MW).
- Persistent thermal emission observed over 16.0 hours across 4 passes (Persistence Score: 78.0/100).
- Industrial infrastructure identified within 450.0m (Unknown Industrial Facility).
- Sentinel-2 acquisition unavailable; classification based on FIRMS, persistence, and industrial context.

### Real Case 6: Open Vegetative Burning (Wildfire Candidate)
- **Observation ID:** `13500f5ba6c8a074`
- **Candidate Classification:** `WILDFIRE`
- **Candidate Score:** **0.7437** (STRONG Evidence / HIGH Confidence)
- **Sentinel-2 Quality Status:** `GOOD` (Cloud cover: 8.0%)
- **Sources Used:** NASA FIRMS, NASA FIRMS Acquisition (2026-09-07 07:35 UTC), FIRMS Persistence Engine, OpenStreetMap Geospatial Context, Copernicus Sentinel-2 Multispectral, Sentinel-2 Acquisition (2026-09-07 08:00:00 UTC)

**Reasoning:**
- Moderate/low NASA FIRMS thermal signature (FRP: 2.86 MW).
- Isolated or brief thermal signature with low temporal persistence.
- No industrial infrastructure mapped within 5.0 km radius.
- Sentinel-2 6-band CNN classifies optical patch as WILDFIRE with 94.0% confidence under clear atmospheric conditions (Cloud cover: 8.0%).

---

## 4. Operational Declarations & Limitations

> [!IMPORTANT]
> **AI Candidate Classification is an evidence-fusion output, not a standalone confirmation of an industrial fire.**

> [!NOTE]
> **Sentinel-2 imagery is optical evidence and may not be temporally coincident with the FIRMS observation.**

### Key Operational Safeguards:
1. **No Synthetic Evidence:** Synthetic imagery is strictly quarantined and assigned weight zero.
2. **Missing Evidence Resilience:** When Sentinel-2 acquisitions are unavailable or clouded, fusion seamlessly degrades to FIRMS thermal radiance and OSM geospatial proximity without throwing errors or halting the pipeline.
3. **Conflict Transparency:** Whenever optical wildfire signatures conflict with nearby industrial OSM nodes, the system lowers confidence, flags an explicit warning, and presents both hypotheses to human operators.

---
*Report automatically generated by Phase 6E Multi-Source Evidence Fusion Suite.*
