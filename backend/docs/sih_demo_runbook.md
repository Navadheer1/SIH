# Smart India Hackathon 2026 — Live Demonstration Runbook
**Problem Statement ID:** 26162  
**Project:** AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources  
**System:** Emergency Operations Center (EOC) Intelligence Platform  
**Target Evaluation Duration:** 3 – 5 Minutes  

---

## 1. Demonstration Overview & Operational Lifecycle

The platform demonstrates the complete, end-to-end incident management lifecycle:

$$\text{DETECT} \longrightarrow \text{INVESTIGATE} \longrightarrow \text{DECIDE} \longrightarrow \text{DISPATCH \& AUDIT}$$

```
[NASA FIRMS Radiometry] ──> [OSM Context + Persistence] ──> [Sentinel-2 6-Band CNN]
                                                                     │
                                                                     ▼
[EOC Incident Workspace] <── [Decision Support / P1-P4] <── [Multi-Source Evidence Fusion]
           │
           ├──> [3-Tier Dynamic Threat Zones on EOC Map]
           ├──> [Critical Asset Exposure Analysis]
           └──> [Immutable Chronological Audit Trail & Dispatch]
```

---

## 2. Timed 4-Minute Presentation Sequence

| Timestamp | Phase / Step | Screen / View | Presenter Talking Points & Key Actions |
| :--- | :--- | :--- | :--- |
| **0:00 – 0:20** | **EOC Overview** | **EOC Map & Dashboard** | • Introduce SIH Problem 26162: Detecting and classifying industrial fires and distinguishing them from wildfires and non-fire thermal sources.<br>• Point out the live telemetry: TopBar shows fleet health, sync timestamps, and active incident counts.<br>• Point to the **Map Legend**: Explains color-coded thermal severities, selected incident ring, and simulated hazard envelopes. |
| **0:20 – 0:50** | **Scenario Selection & Detection** | **Demo Presets / Hotspot Pin** | • In the TopBar dropdown, select **`🏭 P1 Critical — Petrochemical Flare`** (`423f0b1ad50facd6`).<br>• Show that the map smoothly centers on the Gujarat Petrochemical Corridor.<br>• Point to the thermal anomaly card: **FRP = 45.2 MW**, Brightness = 342.5 K, acquired via VIIRS/MODIS sensors. |
| **0:50 – 1:30** | **Multi-Source Investigation** | **[ 🔍 INVESTIGATE ] Tab** | • Click **"⚡ Open Incident & Impact Intelligence"**.<br>• Walk the judges through the 4 independent evidence pillars:<br>  1. **Thermal Radiometry:** High Fire Radiative Power.<br>  2. **Multi-Pass Persistence:** High recurrence score ($85/100$) over 5 satellite passes.<br>  3. **Industrial Context (OSM):** Located within $230\text{m}$ of a mapped petrochemical refining complex.<br>  4. **Sentinel-2 Multispectral Evidence:** Show the optical image tile and explain the **6-Band Residual CNN** ($B02, B03, B04, B08, B11, B12$). |
| **1:30 – 2:10** | **Evidence Fusion & AI Candidate** | **Evidence Fusion Card** | • Emphasize the AI Candidate Classification: **`INDUSTRIAL_FIRE`** (Confidence: $91.5\%$).<br>• Highlight the **Mandatory Disclaimer**: *"AI Candidate Classification is an evidence-fusion output, not a standalone confirmation of an industrial fire."*<br>• Explain fault isolation: Even if cloud cover is high or OSM is offline, the system safely falls back to `PARTIAL_EVIDENCE` with transparent warnings. |
| **2:10 – 2:50** | **Operational Decision Support** | **[ ⚖️ DECIDE ] Tab** | • Switch to the **DECIDE** tab.<br>• Show the **Priority Hero Dial**: Score = **92 / 100**, Index = **P1 CRITICAL**.<br>• Show the explainability breakdown: Risk component ($39.6\text{ pts}$) + Asset proximity ($25.0\text{ pts}$) + Industrial class bonus ($15.0\text{ pts}$) + Persistence bonus ($12.4\text{ pts}$).<br>• Point to the map: Highlight the **3-tier concentric hazard circles**:<br>  - 🔴 **High Hazard Zone** ($300\text{m}$ blast/extreme heat perimeter)<br>  - 🟠 **Moderate Hazard Zone** ($800\text{m}$ smoke/radiation plume)<br>  - 🟡 **Precautionary Zone** ($1850\text{m}$ downwind dispersion)<br>• Review mapped critical assets: **LNG Storage Terminal 4** ($280\text{m}$) and **Regional Substation** ($650\text{m}$). |
| **2:50 – 3:30** | **Dispatch & Triage Execution** | **Action Buttons** | • Review the recommended actions: *"Deploy Specialized Industrial Foam Unit"*.<br>• Click the **`🚨 DISPATCH`** button.<br>• Select target agency: *Industrial Fire Brigade Alpha*, enter dispatch notes: *"Deploying Foam Tender 4 to North Tank Farm"*, and confirm.<br>• Show that the UI updates immediately: Status changes from `ACKNOWLEDGED` to **`DISPATCHED`**. |
| **3:30 – 4:00** | **Audit Trail & System Readiness** | **Audit Timeline & Status Tab** | • Scroll down to the **Incident Audit Timeline** in the panel.<br>• Show the immutable event cards: Actor attribution (`Dispatcher Lead`), action timestamp, status transition, and notes.<br>• Click the **`⚡ SYSTEM STATUS`** tab in the TopBar to display the `/api/system/readiness` dashboard.<br>• Show that all 7 core components (FastAPI, Database, FIRMS, Copernicus, OSM, CNN Model, Audit Store) are verified healthy with zero secret leakage. |
| **4:00 – 4:30** | **Summary & Safety Governance** | **Summary & Q&A** | • Conclude with the 3 pillars of our solution:<br>  1. **Multi-Source Synergy:** Combining thermal anomalies, multi-pass persistence, geospatial context, and 6-band optical vision.<br>  2. **Operational Explainability:** Deterministic P1-P4 prioritization that frontline dispatchers can trust.<br>  3. **Safety & Governance:** Strict disclaimers, clear provenance, simulation labeling, and zero fabricated evidence.<br>• Open for judges' questions. |

---

## 3. Benchmark Demo Case Quick-Reference

| Scenario Preset | Observation ID | Coordinates | Primary Benchmark Features |
| :--- | :--- | :--- | :--- |
| **`🏭 P1 Critical — Petrochemical Flare`** | `423f0b1ad50facd6` | $24.238^\circ\text{N}, 97.228^\circ\text{E}$ | • $45.2\text{ MW}$ FRP, $85\%$ persistence.<br>• Proximate to LNG tank ($280\text{m}$) & power grid.<br>• 6-band CNN classifies as `INDUSTRIAL_FIRE`.<br>• Triage Action: Immediate Class-B Foam Dispatch. |
| **`🌲 P2 High — Forest Wildfire`** | `04e53a2f16d0d665` | $22.678^\circ\text{N}, 80.543^\circ\text{E}$ | • Real Sentinel-2 optical image verified from Copernicus CDSE.<br>• High biomass vegetation fire perimeter.<br>• 6-band CNN classifies as `WILDFIRE`.<br>• Triage Action: Forestry Wildfire Containment. |
| **`🌾 P4 Low — Crop Residual Burn`** | `a35cd8640d876fc2` | $30.733^\circ\text{N}, 76.779^\circ\text{E}$ | • Low persistence, zero nearby industrial facilities.<br>• Non-industrial rural agricultural land.<br>• 6-band CNN classifies as `NON_FIRE` (Controlled burn).<br>• Triage Action: Standard Routine Monitoring. |
| **`☁️ P3 Guardrail — Cloud Degraded`** | `90b58068fefb3a79` | $21.845^\circ\text{N}, 73.123^\circ\text{E}$ | • $>70\%$ Cloud cover triggers safety guardrail.<br>• System outputs `PARTIAL_EVIDENCE` with warning.<br>• Triage Action: Request aerial drone / ground patrol. |

---

## 4. Operational Safety & Truthfulness Guardrails

Always maintain strict compliance with the 3 mandatory disclaimers during presentation:

1. > [!WARNING]
   > **"AI Candidate Classification is an evidence-fusion output, not a standalone confirmation of an industrial fire."**
2. > [!NOTE]
   > **"Sentinel-2 imagery is optical evidence and may not be temporally coincident with the FIRMS observation."**
3. > [!CAUTION]
   > **"Dynamic threat zones and scenario projections are simulation estimates — NOT official government evacuation orders."**
