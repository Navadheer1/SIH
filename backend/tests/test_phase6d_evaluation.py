import os
import json
import pytest
import numpy as np
import torch

from app.ml.satellite_model.config import (
    REPORTS_DIR,
    TEST_MANIFEST_PATH,
    BEST_MODEL_PATH
)
from app.ml.satellite_model.robustness.integrity import verify_test_set_integrity
from app.ml.satellite_model.robustness.source_evaluation import evaluate_by_sources_and_provenance
from app.ml.satellite_model.robustness.confidence_calibration import run_confidence_and_calibration_analysis, compute_expected_calibration_error
from app.ml.satellite_model.robustness.stress_testing import run_robustness_stress_tests
from app.ml.satellite_model.robustness.feature_baseline import extract_patch_features, evaluate_tabular_baseline
from app.ml.satellite_model.robustness.separability import analyze_dataset_separability
from app.ml.satellite_model.robustness.gradcam import GradCAM
from app.ml.satellite_model.robustness.cross_validation import create_spatial_cluster_folds
from app.ml.satellite_model.model import get_model
from app.ml.dataset.manifest import ManifestManager


def test_test_set_integrity():
    """
    Verify test set integrity: zero duplicates, zero spatial cluster overlap.
    """
    report = verify_test_set_integrity()
    assert report["integrity_status"] == "PASSED"
    assert report["leakage_verdict"] == "ZERO_LEAKAGE"
    assert report["id_duplicates_in_test"] == 0
    assert report["id_overlap"]["train_test"] == 0
    assert report["id_overlap"]["val_test"] == 0
    assert report["spatial_cluster_overlap"]["train_test"] == 0
    assert report["spatial_cluster_overlap"]["val_test"] == 0


def test_source_stratification():
    """
    Verify performance stratification across sources and provenances.
    """
    if not os.path.exists(BEST_MODEL_PATH):
        pytest.skip("Best model checkpoint not found")
    report = evaluate_by_sources_and_provenance()
    assert "performance_by_source" in report
    assert "performance_by_label_provenance" in report
    assert "performance_by_class" in report
    assert report["evaluation_summary"]["total_test_samples"] > 0


def test_confidence_calibration():
    """
    Verify confidence calibration calculation and ECE metric.
    """
    confs = np.array([0.9, 0.8, 0.95, 0.4, 0.7])
    correct = np.array([1, 1, 1, 0, 1])
    ece, bins = compute_expected_calibration_error(confs, correct, n_bins=5)
    assert 0.0 <= ece <= 1.0
    assert len(bins) > 0


def test_stress_testing_execution():
    """
    Verify stress testing battery executes across noise, haze, and band dropout.
    """
    if not os.path.exists(BEST_MODEL_PATH):
        pytest.skip("Best model checkpoint not found")
    report = run_robustness_stress_tests()
    assert "clean_baseline_test" in report
    assert "gaussian_noise_stress_tests" in report
    assert "cloud_haze_stress_tests" in report
    assert "band_dropout_sensitivity" in report
    assert len(report["band_dropout_sensitivity"]) == 6


def test_feature_extraction():
    """
    Verify tabular spectral feature extraction from 6-band patch.
    """
    mock_patch = {
        "B02": np.full((128, 128), 0.1, dtype=np.float32),
        "B03": np.full((128, 128), 0.12, dtype=np.float32),
        "B04": np.full((128, 128), 0.15, dtype=np.float32),
        "B08": np.full((128, 128), 0.40, dtype=np.float32),
        "B11": np.full((128, 128), 0.35, dtype=np.float32),
        "B12": np.full((128, 128), 0.30, dtype=np.float32),
    }
    feats = extract_patch_features(mock_patch)
    assert "ndvi_mean" in feats
    assert "nbr_mean" in feats
    assert "swir_ratio_mean" in feats
    assert feats["ndvi_mean"] > 0.0


def test_dataset_separability_audit():
    """
    Verify dataset separability and tensor metadata isolation.
    """
    report = analyze_dataset_separability()
    assert report["dataset_separability_status"] == "ANALYZED"
    assert report["metadata_audit"]["tensor_leakage_audit"]["verdict"] == "CLEAN_TENSORS_NO_METADATA_LEAKAGE"
    assert len(report["spectral_separability"]["pca_explained_variance_ratio"]) == 3


def test_gradcam_hook_and_computation():
    """
    Verify GradCAM heatmap generation on dummy tensor.
    """
    model = get_model()
    model.eval()
    gradcam = GradCAM(model)
    dummy_input = torch.randn(1, 6, 128, 128, requires_grad=True)
    heatmap = gradcam.generate_heatmap(dummy_input, target_class=0)
    assert heatmap.shape == (128, 128)
    assert 0.0 <= np.min(heatmap) <= np.max(heatmap) <= 1.0


def test_spatial_cluster_folds_creation():
    """
    Verify that spatial cluster folds partition entries with zero cluster leakage.
    """
    entries = ManifestManager.load_manifest(TEST_MANIFEST_PATH)
    splits = create_spatial_cluster_folds(entries, n_splits=3, seed=42)
    assert len(splits) == 3
    for train_f, val_f in splits:
        assert len(train_f) > 0
        assert len(val_f) > 0
        train_ids = {e.sample_id for e in train_f}
        val_ids = {e.sample_id for e in val_f}
        assert len(train_ids.intersection(val_ids)) == 0


def test_phase6d_report_files_generation():
    """
    Verify that all Phase 6D report artifacts are created in REPORTS_DIR.
    """
    expected_files = [
        "phase6d_integrity_report.json",
        "source_metrics.json",
        "confidence_analysis.json",
        "robustness_stress_test.json",
        "rgb_vs_multispectral.json",
        "feature_baseline.json",
        "dataset_separability_report.json",
        "phase6d_gradcam_report.json",
        "cross_validation_report.json",
        "phase6d_error_analysis.json",
        "phase6d_robustness_report.md"
    ]
    for fname in expected_files:
        fpath = os.path.join(REPORTS_DIR, fname)
        assert os.path.exists(fpath), f"Expected Phase 6D report file {fname} not found at {fpath}"
