# Satellite ML Dataset Balance & Provenance Report

**Total Samples:** 1050

## Class and Label Type Breakdown
```
WILDFIRE (Total: 400)
  Ground truth:  400
  Weak label:    0
  Manual review: 0

INDUSTRIAL_FIRE (Total: 250)
  Ground truth:  0
  Weak label:    248
  Manual review: 2

NON_FIRE (Total: 400)
  Ground truth:  111
  Weak label:    289
  Manual review: 0

Total: 1050
```

## Source Dataset Provenance
| Source Dataset | Count | Percentage |
| :--- | :--- | :--- |
| `SEN2FIRE` | 240 | 22.9% |
| `TS_SATFIRE` | 160 | 15.2% |
| `INDUSTRIAL_BENCHMARK_CORPUS` | 250 | 23.8% |
| `DIVERSE_GEOGRAPHIC_BACKGROUND` | 400 | 38.1% |

## Cloud Quality Stratification
| Cloud Range | Sample Count | Percentage |
| :--- | :--- | :--- |
| `0–10%` (Optimal) | 185 | 17.6% |
| `10–30%` (Good) | 557 | 53.0% |
| `30–60%` (Acceptable) | 308 | 29.3% |
| `>60%` (Rejected for Training) | 0 | 0.0% |