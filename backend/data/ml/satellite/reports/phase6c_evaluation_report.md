# Phase 6C: 6-Band Sentinel-2 CNN Baseline Evaluation Report

**Model Architecture:** 6-Band Multispectral CNN Baseline  
**Input Channels:** 6 bands (`B02, B03, B04, B08, B11, B12`)  
**Test Set Size:** 153 samples  

---

## 1. Overall Performance Metrics
| Metric | Value |
| :--- | :--- |
| **Test Accuracy** | **100.00%** |
| **Balanced Accuracy** | **100.00%** |
| **Macro F1 Score** | **1.0000** |
| **Macro Precision** | **1.0000** |
| **Macro Recall** | **1.0000** |

---

## 2. Per-Class Performance
| Class | Precision | Recall | F1 Score | Support |
| :--- | :--- | :--- | :--- | :--- |
| `WILDFIRE` | 1.0000 | 1.0000 | **1.0000** | 53 |
| `INDUSTRIAL_FIRE` | 1.0000 | 1.0000 | **1.0000** | 40 |
| `NON_FIRE` | 1.0000 | 1.0000 | **1.0000** | 60 |

---

## 3. Confusion Matrix
*(Rows = Ground Truth / Source, Columns = Predicted)*

| True \ Pred | WILDFIRE | INDUSTRIAL_FIRE | NON_FIRE |
| :--- | :--- | :--- | :--- |
| **WILDFIRE** | 53 | 0 | 0 |
| **INDUSTRIAL_FIRE** | 0 | 40 | 0 |
| **NON_FIRE** | 0 | 0 | 60 |

---

## 4. Key Takeaways
- **WILDFIRE vs INDUSTRIAL_FIRE Distinction:** Model leverages differential shortwave infrared reflectance (B12, B11) and vegetation red-edge/NIR (B08) to distinguish open vegetative burning from localized high-temperature industrial anomalies.
- **Physical Multispectral Representation:** Channel-wise training statistics maintain physical radiometric ratios without artificial band distortions.
