import os
import sys
import json
import logging
from typing import List, Dict, Any, Set, Tuple
from collections import Counter, defaultdict

from app.ml.dataset.config import (
    MAIN_MANIFEST_PATH,
    TRAIN_MANIFEST_PATH,
    VAL_MANIFEST_PATH,
    TEST_MANIFEST_PATH,
    QUALITY_REPORT_JSON,
    QUALITY_REPORT_MD,
    SAMPLES_DIR,
    ML_PATCH_SIZE,
    MULTISPECTRAL_BANDS,
    ALLOWED_LABELS,
    ALLOWED_LABEL_TYPES,
    ALLOWED_QUALITIES
)
from app.ml.dataset.manifest import ManifestEntry, ManifestManager
from app.ml.dataset.patch_generator import load_multispectral_patch
from app.ml.dataset.create_splits import get_spatial_cluster_key

logger = logging.getLogger("validate_dataset")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


def validate_dataset_integrity(
    manifest_path: str = MAIN_MANIFEST_PATH,
    samples_dir: str = SAMPLES_DIR,
    check_image_files: bool = True
) -> Dict[str, Any]:
    """
    Executes a comprehensive data quality and leakage audit across the dataset.
    """
    entries = ManifestManager.load_manifest(manifest_path)
    total_samples = len(entries)

    errors: List[str] = []
    warnings: List[str] = []

    if total_samples == 0:
        errors.append(f"Manifest at {manifest_path} is empty or missing.")
        return {"status": "FAILED", "errors": errors, "warnings": warnings, "total_samples": 0}

    seen_sample_ids: Set[str] = set()
    duplicate_ids: List[str] = []
    seen_coords: Dict[Tuple[float, float], str] = {}
    duplicate_coords: List[str] = []

    class_counts: Dict[str, int] = Counter()
    label_type_counts: Dict[str, int] = Counter()
    quality_counts: Dict[str, int] = Counter()
    source_counts: Dict[str, int] = Counter()
    cloud_histogram = {"0-10%": 0, "10-30%": 0, "30-60%": 0, ">60%": 0}

    missing_images: List[str] = []
    corrupted_images: List[str] = []
    invalid_dimensions: List[str] = []

    for entry in entries:
        # 1. ID uniqueness
        if entry.sample_id in seen_sample_ids:
            duplicate_ids.append(entry.sample_id)
        seen_sample_ids.add(entry.sample_id)

        # 2. Coordinate duplicate detection
        coord_key = (round(entry.latitude, 5), round(entry.longitude, 5))
        if coord_key in seen_coords and seen_coords[coord_key] != entry.sample_id:
            duplicate_coords.append(f"{entry.sample_id} duplicates {seen_coords[coord_key]} at {coord_key}")
        seen_coords[coord_key] = entry.sample_id

        # 3. Schema & vocabulary validation
        schema_errs = entry.validate()
        for err in schema_errs:
            errors.append(f"[{entry.sample_id}] {err}")

        # 4. Aggregations
        class_counts[entry.label] += 1
        label_type_counts[entry.label_type] += 1
        quality_counts[entry.quality] += 1
        source_counts[entry.source_dataset] += 1

        # 5. Cloud distribution
        cc = entry.cloud_cover
        if cc <= 10.0:
            cloud_histogram["0-10%"] += 1
        elif cc <= 30.0:
            cloud_histogram["10-30%"] += 1
        elif cc <= 60.0:
            cloud_histogram["30-60%"] += 1
        else:
            cloud_histogram[">60%"] += 1

        # 6. Physical image file validation
        if check_image_files:
            # Resolve image path
            img_path = entry.image_path
            if not os.path.isabs(img_path):
                img_path = os.path.join(os.path.dirname(SAMPLES_DIR), img_path)
            
            if not os.path.exists(img_path):
                # Check direct sample_id.npz
                alt_path = os.path.join(samples_dir, f"{entry.sample_id}.npz")
                if os.path.exists(alt_path):
                    img_path = alt_path
                else:
                    missing_images.append(entry.sample_id)
                    continue

            # Load and verify bands
            try:
                patch = load_multispectral_patch(img_path)
                for b in MULTISPECTRAL_BANDS:
                    if b not in patch:
                        corrupted_images.append(f"{entry.sample_id} missing band {b}")
                    elif patch[b].shape != (ML_PATCH_SIZE, ML_PATCH_SIZE):
                        invalid_dimensions.append(f"{entry.sample_id} band {b} shape {patch[b].shape} != ({ML_PATCH_SIZE}, {ML_PATCH_SIZE})")
            except Exception as ex:
                corrupted_images.append(f"{entry.sample_id} failed to load: {str(ex)}")

    if duplicate_ids:
        errors.append(f"Found {len(duplicate_ids)} duplicate sample IDs: {duplicate_ids[:5]}...")
    if missing_images:
        errors.append(f"Found {len(missing_images)} missing image files.")
    if corrupted_images:
        errors.append(f"Found {len(corrupted_images)} corrupted image files.")
    if invalid_dimensions:
        errors.append(f"Found {len(invalid_dimensions)} patches with invalid dimensions.")

    # 7. Spatial / Event Leakage Checks across train/val/test splits
    leakage_issues: List[str] = []
    train_entries = ManifestManager.load_manifest(TRAIN_MANIFEST_PATH)
    val_entries = ManifestManager.load_manifest(VAL_MANIFEST_PATH)
    test_entries = ManifestManager.load_manifest(TEST_MANIFEST_PATH)

    train_clusters = {get_spatial_cluster_key(e.latitude, e.longitude) for e in train_entries}
    val_clusters = {get_spatial_cluster_key(e.latitude, e.longitude) for e in val_entries}
    test_clusters = {get_spatial_cluster_key(e.latitude, e.longitude) for e in test_entries}

    train_val_overlap = train_clusters.intersection(val_clusters)
    train_test_overlap = train_clusters.intersection(test_clusters)
    val_test_overlap = val_clusters.intersection(test_clusters)

    if train_val_overlap:
        leakage_issues.append(f"Train/Val spatial cluster overlap ({len(train_val_overlap)} clusters): {list(train_val_overlap)[:3]}")
    if train_test_overlap:
        leakage_issues.append(f"Train/Test spatial cluster overlap ({len(train_test_overlap)} clusters): {list(train_test_overlap)[:3]}")
    if val_test_overlap:
        leakage_issues.append(f"Val/Test spatial cluster overlap ({len(val_test_overlap)} clusters): {list(val_test_overlap)[:3]}")

    if leakage_issues:
        errors.extend(leakage_issues)

    status = "PASSED" if not errors else "FAILED"

    report_data = {
        "status": status,
        "total_samples": total_samples,
        "class_distribution": dict(class_counts),
        "label_type_distribution": dict(label_type_counts),
        "quality_distribution": dict(quality_counts),
        "source_distribution": dict(source_counts),
        "cloud_histogram": cloud_histogram,
        "split_counts": {
            "train": len(train_entries),
            "val": len(val_entries),
            "test": len(test_entries)
        },
        "leakage_check": "PASSED" if not leakage_issues else "FAILED",
        "errors": errors,
        "warnings": warnings
    }

    # Save JSON report
    os.makedirs(os.path.dirname(QUALITY_REPORT_JSON), exist_ok=True)
    with open(QUALITY_REPORT_JSON, "w", encoding="utf-8") as f:
        json.dump(report_data, f, indent=2)

    # Save Markdown report
    md_content = f"""# Satellite ML Dataset Quality Audit Report

**Audit Status:** `{status}`  
**Total Samples:** {total_samples}  
**Leakage Check:** `{'PASSED (Zero Spatial/Event Leakage)' if not leakage_issues else 'FAILED'}`

---

## 1. Class Distribution
| Class | Sample Count | Percentage |
| :--- | :--- | :--- |
"""
    for cls, cnt in class_counts.items():
        md_content += f"| `{cls}` | {cnt} | {cnt/total_samples*100:.1f}% |\n"

    md_content += f"""
---

## 2. Label Type Distribution
| Label Type | Count | Percentage | Description |
| :--- | :--- | :--- | :--- |
| `GROUND_TRUTH` | {label_type_counts.get('GROUND_TRUTH', 0)} | {label_type_counts.get('GROUND_TRUTH', 0)/total_samples*100:.1f}% | Verified reference fire/background events |
| `WEAK_LABEL` | {label_type_counts.get('WEAK_LABEL', 0)} | {label_type_counts.get('WEAK_LABEL', 0)/total_samples*100:.1f}% | Algorithmic FIRMS + OSM proximity pairings |
| `MANUAL_REVIEW` | {label_type_counts.get('MANUAL_REVIEW', 0)} | {label_type_counts.get('MANUAL_REVIEW', 0)/total_samples*100:.1f}% | Human-inspected and confirmed |

---

## 3. Dataset Splits & Leakage Audit
- **Train Split:** {len(train_entries)} ({len(train_entries)/max(1, total_samples)*100:.1f}%)
- **Validation Split:** {len(val_entries)} ({len(val_entries)/max(1, total_samples)*100:.1f}%)
- **Test Split:** {len(test_entries)} ({len(test_entries)/max(1, total_samples)*100:.1f}%)
- **Spatial Overlap Issues:** {len(leakage_issues)}

---

## 4. Cloud Quality Distribution
- **0–10% Cloud Cover:** {cloud_histogram['0-10%']} samples
- **10–30% Cloud Cover:** {cloud_histogram['10-30%']} samples
- **30–60% Cloud Cover:** {cloud_histogram['30-60%']} samples
- **>60% Cloud Cover:** {cloud_histogram['>60%']} samples

---

## 5. Audit Details
- **Errors ({len(errors)}):** {', '.join(errors) if errors else 'None'}
- **Missing Images:** {len(missing_images)}
- **Corrupted Files:** {len(corrupted_images)}
"""

    with open(QUALITY_REPORT_MD, "w", encoding="utf-8") as f:
        f.write(md_content)

    logger.info(f"Quality audit completed with status: {status}")
    logger.info(f"Reports saved to {QUALITY_REPORT_JSON} and {QUALITY_REPORT_MD}")
    return report_data


def main():
    report = validate_dataset_integrity()
    print(json.dumps(report, indent=2))
    if report["status"] != "PASSED":
        sys.exit(1)


if __name__ == "__main__":
    main()
