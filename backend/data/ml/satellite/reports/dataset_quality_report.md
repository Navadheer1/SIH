# Satellite ML Dataset Quality Audit Report

**Audit Status:** `PASSED`  
**Total Samples:** 1050  
**Leakage Check:** `PASSED (Zero Spatial/Event Leakage)`

---

## 1. Class Distribution
| Class | Sample Count | Percentage |
| :--- | :--- | :--- |
| `WILDFIRE` | 400 | 38.1% |
| `INDUSTRIAL_FIRE` | 250 | 23.8% |
| `NON_FIRE` | 400 | 38.1% |

---

## 2. Label Type Distribution
| Label Type | Count | Percentage | Description |
| :--- | :--- | :--- | :--- |
| `GROUND_TRUTH` | 111 | 10.6% | Verified reference fire/background events |
| `WEAK_LABEL` | 539 | 51.3% | Algorithmic FIRMS + OSM proximity pairings |
| `MANUAL_REVIEW` | 0 | 0.0% | Human-inspected and confirmed |

---

## 3. Dataset Splits & Leakage Audit
- **Train Split:** 743 (70.8%)
- **Validation Split:** 154 (14.7%)
- **Test Split:** 153 (14.6%)
- **Spatial Overlap Issues:** 0

---

## 4. Cloud Quality Distribution
- **0–10% Cloud Cover:** 185 samples
- **10–30% Cloud Cover:** 557 samples
- **30–60% Cloud Cover:** 308 samples
- **>60% Cloud Cover:** 0 samples

---

## 5. Audit Details
- **Errors (0):** None
- **Missing Images:** 0
- **Corrupted Files:** 0
