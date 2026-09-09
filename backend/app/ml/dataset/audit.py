import os
import sys
import json
import logging
import numpy as np
from typing import Dict, Any, List, Set, Tuple
from collections import Counter, defaultdict

from app.ml.dataset.config import (
    MAIN_MANIFEST_PATH,
    TRAIN_MANIFEST_PATH,
    VAL_MANIFEST_PATH,
    TEST_MANIFEST_PATH,
    PHASE6B_AUDIT_REPORT_JSON,
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

logger = logging.getLogger("dataset_audit")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


def run_phase6b_audit(
    manifest_path: str = MAIN_MANIFEST_PATH,
    train_path: str = TRAIN_MANIFEST_PATH,
    val_path: str = VAL_MANIFEST_PATH,
    test_path: str = TEST_MANIFEST_PATH,
    samples_dir: str = SAMPLES_DIR,
    check_band_arrays: bool = True
) -> Dict[str, Any]:
    """
    Executes an in-depth Phase 6B dataset audit across all manifests, patch files,
    band matrices, and split boundaries to prove data integrity and zero leakage.
    """
    logger.info(f"Starting Phase 6B dataset audit on {manifest_path}...")
    
    entries = ManifestManager.load_manifest(manifest_path)
    total_samples = len(entries)

    errors: List[str] = []
    warnings: List[str] = []

    if total_samples == 0:
        errors.append(f"Manifest at {manifest_path} is empty or missing.")
        return {"audit_status": "FAILED", "errors": errors, "total_samples": 0}

    # 1. Manifest and Schema Audits
    seen_ids: Set[str] = set()
    duplicate_ids: List[str] = []
    missing_files: List[str] = []
    invalid_files: List[str] = []
    nan_inf_files: List[str] = []
    invalid_dimension_files: List[str] = []

    class_counts: Dict[str, int] = Counter()
    source_counts: Dict[str, int] = Counter()
    label_type_counts: Dict[str, int] = Counter()
    quality_counts: Dict[str, int] = Counter()
    cloud_dist = {"0-10%": 0, "10-30%": 0, "30-60%": 0, ">60%": 0}

    for entry in entries:
        # Check duplicate ID
        if entry.sample_id in seen_ids:
            duplicate_ids.append(entry.sample_id)
        seen_ids.add(entry.sample_id)

        # Validate schema
        errs = entry.validate()
        for e in errs:
            errors.append(f"[{entry.sample_id}] {e}")

        # Aggregations
        class_counts[entry.label] += 1
        source_counts[entry.source_dataset] += 1
        label_type_counts[entry.label_type] += 1
        quality_counts[entry.quality] += 1

        # Cloud distribution
        cc = entry.cloud_cover
        if cc <= 10.0:
            cloud_dist["0-10%"] += 1
        elif cc <= 30.0:
            cloud_dist["10-30%"] += 1
        elif cc <= 60.0:
            cloud_dist["30-60%"] += 1
        else:
            cloud_dist[">60%"] += 1

        # Check physical patch file and bands
        if check_band_arrays:
            img_path = entry.image_path
            if not os.path.isabs(img_path):
                img_path = os.path.join(os.path.dirname(samples_dir), img_path)

            if not os.path.exists(img_path):
                alt_path = os.path.join(samples_dir, f"{entry.sample_id}.npz")
                if os.path.exists(alt_path):
                    img_path = alt_path
                else:
                    missing_files.append(entry.sample_id)
                    continue

            try:
                patch = load_multispectral_patch(img_path)
                for band in MULTISPECTRAL_BANDS:
                    if band not in patch:
                        invalid_files.append(f"{entry.sample_id} missing band {band}")
                        continue
                    
                    arr = patch[band]
                    if arr.shape != (ML_PATCH_SIZE, ML_PATCH_SIZE):
                        invalid_dimension_files.append(f"{entry.sample_id} band {band} shape {arr.shape}")
                    
                    if np.isnan(arr).any() or np.isinf(arr).any():
                        nan_inf_files.append(f"{entry.sample_id} band {band} contains NaN or Inf")
            except Exception as ex:
                invalid_files.append(f"{entry.sample_id} failed to load: {str(ex)}")

    if duplicate_ids:
        errors.append(f"Found {len(duplicate_ids)} duplicate sample IDs.")
    if missing_files:
        errors.append(f"Found {len(missing_files)} missing .npz patch files.")
    if invalid_files:
        errors.append(f"Found {len(invalid_files)} corrupted/invalid patch files.")
    if nan_inf_files:
        errors.append(f"Found {len(nan_inf_files)} patches with NaN/Inf values.")
    if invalid_dimension_files:
        errors.append(f"Found {len(invalid_dimension_files)} patches with non-128x128 dimensions.")

    # 2. Split and Leakage Audits
    train_entries = ManifestManager.load_manifest(train_path)
    val_entries = ManifestManager.load_manifest(val_path)
    test_entries = ManifestManager.load_manifest(test_path)

    train_ids = {e.sample_id for e in train_entries}
    val_ids = {e.sample_id for e in val_entries}
    test_ids = {e.sample_id for e in test_entries}

    id_overlap_train_val = train_ids.intersection(val_ids)
    id_overlap_train_test = train_ids.intersection(test_ids)
    id_overlap_val_test = val_ids.intersection(test_ids)

    if id_overlap_train_val or id_overlap_train_test or id_overlap_val_test:
        errors.append(f"Sample ID overlap detected across splits: TV={len(id_overlap_train_val)}, TT={len(id_overlap_train_test)}, VT={len(id_overlap_val_test)}")

    # Spatial cluster leakage check
    train_clusters = {get_spatial_cluster_key(e.latitude, e.longitude) for e in train_entries}
    val_clusters = {get_spatial_cluster_key(e.latitude, e.longitude) for e in val_entries}
    test_clusters = {get_spatial_cluster_key(e.latitude, e.longitude) for e in test_entries}

    cluster_overlap_tv = train_clusters.intersection(val_clusters)
    cluster_overlap_tt = train_clusters.intersection(test_clusters)
    cluster_overlap_vt = val_clusters.intersection(test_clusters)

    spatial_overlap_count = len(cluster_overlap_tv) + len(cluster_overlap_tt) + len(cluster_overlap_vt)
    if spatial_overlap_count > 0:
        errors.append(f"Spatial cluster overlap detected across splits ({spatial_overlap_count} overlapping clusters).")

    audit_status = "PASSED" if not errors else "FAILED"

    report = {
        "audit_status": audit_status,
        "total_samples": total_samples,
        "samples_per_class": dict(class_counts),
        "samples_per_source": dict(source_counts),
        "samples_per_label_type": dict(label_type_counts),
        "samples_per_quality": dict(quality_counts),
        "samples_per_split": {
            "train": len(train_entries),
            "validation": len(val_entries),
            "test": len(test_entries)
        },
        "missing_files_count": len(missing_files),
        "invalid_files_count": len(invalid_files),
        "nan_inf_files_count": len(nan_inf_files),
        "duplicate_samples_count": len(duplicate_ids),
        "leakage_audit": {
            "sample_id_overlap": len(id_overlap_train_val) + len(id_overlap_train_test) + len(id_overlap_val_test),
            "spatial_cluster_overlap": spatial_overlap_count,
            "status": "PASSED" if spatial_overlap_count == 0 and not id_overlap_train_val and not id_overlap_train_test and not id_overlap_val_test else "FAILED"
        },
        "cloud_distribution": cloud_dist,
        "band_availability": {
            "required_bands": MULTISPECTRAL_BANDS,
            "all_6_bands_present_in_all_patches": len(invalid_files) == 0 and len(missing_files) == 0
        },
        "label_provenance_summary": {
            "GROUND_TRUTH": label_type_counts.get("GROUND_TRUTH", 0),
            "SOURCE_LABEL": label_type_counts.get("SOURCE_LABEL", 0),
            "WEAK_LABEL": label_type_counts.get("WEAK_LABEL", 0),
            "MANUAL_REVIEW": label_type_counts.get("MANUAL_REVIEW", 0),
            "notes": "Wildfire candidate seeds labeled SOURCE_LABEL; FIRMS+OSM pairings labeled WEAK_LABEL."
        },
        "errors": errors,
        "warnings": warnings
    }

    os.makedirs(os.path.dirname(PHASE6B_AUDIT_REPORT_JSON), exist_ok=True)
    with open(PHASE6B_AUDIT_REPORT_JSON, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    logger.info(f"Phase 6B dataset audit completed with status: {audit_status}")
    logger.info(f"Report saved to {PHASE6B_AUDIT_REPORT_JSON}")
    return report


def main():
    report = run_phase6b_audit()
    print(json.dumps(report, indent=2))
    if report["audit_status"] != "PASSED":
        sys.exit(1)


if __name__ == "__main__":
    main()
