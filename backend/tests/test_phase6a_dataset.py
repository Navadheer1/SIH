import os
import shutil
import pytest
import numpy as np

from app.ml.dataset.config import (
    get_ml_cloud_quality,
    ALLOWED_LABELS,
    ALLOWED_LABEL_TYPES,
    ALLOWED_QUALITIES,
    MULTISPECTRAL_BANDS,
    ML_PATCH_SIZE
)
from app.ml.dataset.manifest import ManifestEntry, ManifestManager
from app.ml.dataset.patch_generator import generate_multispectral_patch, load_multispectral_patch
from app.ml.dataset.create_splits import get_spatial_cluster_key, create_spatial_event_splits
from app.ml.dataset.validate_dataset import validate_dataset_integrity
from app.ml.dataset.review_candidates import apply_review_decision
from app.ml.dataset.dataset_report import generate_dataset_report
from app.services.osm_service import haversine_distance_km


@pytest.fixture
def temp_dataset_env(tmp_path):
    """
    Creates an isolated temporary dataset environment for testing.
    """
    base_dir = tmp_path / "satellite_test"
    manifest_dir = base_dir / "manifests"
    samples_dir = base_dir / "samples"
    reports_dir = base_dir / "reports"

    manifest_dir.mkdir(parents=True)
    samples_dir.mkdir(parents=True)
    reports_dir.mkdir(parents=True)

    manifest_file = str(manifest_dir / "dataset_manifest.csv")
    return {
        "base_dir": str(base_dir),
        "manifest_path": manifest_file,
        "manifest_dir": str(manifest_dir),
        "samples_dir": str(samples_dir),
        "reports_dir": str(reports_dir),
    }


def test_cloud_filtering_rules():
    """Verify cloud quality categorization rules."""
    assert get_ml_cloud_quality(15.0) == "GOOD"
    assert get_ml_cloud_quality(0.0) == "GOOD"
    assert get_ml_cloud_quality(29.9) == "GOOD"
    assert get_ml_cloud_quality(30.0) == "ACCEPTABLE"
    assert get_ml_cloud_quality(60.0) == "ACCEPTABLE"
    assert get_ml_cloud_quality(60.1) == "REJECT"
    assert get_ml_cloud_quality(95.0) == "REJECT"


def test_haversine_industrial_distance():
    """Verify geodesic distance calculation between coordinates."""
    # Jamnagar refinery approx distance
    dist = haversine_distance_km(22.3800, 69.8300, 22.3900, 69.8400)
    assert 1.0 < dist < 2.5
    
    # Identical coordinates
    assert haversine_distance_km(20.0, 80.0, 20.0, 80.0) == 0.0


def test_manifest_entry_validation():
    """Test schema validation and error reporting on ManifestEntry."""
    valid_entry = ManifestEntry(
        sample_id="test_001",
        label="WILDFIRE",
        source_dataset="SEN2FIRE",
        label_type="GROUND_TRUTH",
        latitude=22.5,
        longitude=80.5,
        acquisition_time="2026-09-07T14:30:00Z",
        cloud_cover=15.0,
        quality="GOOD"
    )
    assert valid_entry.validate() == []

    # Invalid label and out-of-bounds coordinates
    invalid_entry = ManifestEntry(
        sample_id="test_bad",
        label="INVALID_FIRE_TYPE",
        source_dataset="TEST",
        label_type="FAKE_GROUND_TRUTH",
        latitude=120.0,
        longitude=200.0,
        acquisition_time="2026-09-07T14:30:00Z",
        cloud_cover=150.0,
        quality="UNKNOWN_QUALITY"
    )
    errs = invalid_entry.validate()
    assert len(errs) >= 4
    assert any("Invalid label" in e for e in errs)
    assert any("Invalid label_type" in e for e in errs)
    assert any("Latitude" in e for e in errs)
    assert any("Cloud cover" in e for e in errs)


def test_multispectral_patch_generation_and_loading(temp_dataset_env):
    """Test creating and loading a 6-band .npz patch with RGB preview."""
    samples_dir = temp_dataset_env["samples_dir"]
    sample_id = "test_patch_001"

    npz_path, preview_png_path = generate_multispectral_patch(
        sample_id=sample_id,
        latitude=22.6789,
        longitude=80.5432,
        label="WILDFIRE",
        cloud_cover=12.5,
        output_dir=samples_dir,
        patch_size=ML_PATCH_SIZE
    )

    assert os.path.exists(npz_path)
    assert os.path.exists(preview_png_path)

    loaded = load_multispectral_patch(npz_path)
    for band in MULTISPECTRAL_BANDS:
        assert band in loaded
        assert loaded[band].shape == (ML_PATCH_SIZE, ML_PATCH_SIZE)
        assert loaded[band].dtype == np.float32

    assert loaded["metadata"]["sample_id"] == sample_id
    assert loaded["metadata"]["label"] == "WILDFIRE"


def test_spatial_cluster_splitting_prevents_leakage(temp_dataset_env):
    """Verify that spatial clustering strictly allocates same-region samples to a single split."""
    manifest_path = temp_dataset_env["manifest_path"]
    samples_dir = temp_dataset_env["samples_dir"]

    # Create entries clustered at 3 distinct geographic regions
    entries = []
    # Region 1: Cluster A (lat ~ 15.0, lon ~ 75.0) - 10 samples
    for i in range(10):
        s_id = f"wf_clusterA_{i}"
        generate_multispectral_patch(s_id, 15.01, 75.02, "WILDFIRE", output_dir=samples_dir)
        entries.append(ManifestEntry(
            sample_id=s_id, label="WILDFIRE", source_dataset="TEST",
            label_type="GROUND_TRUTH", latitude=15.01, longitude=75.02,
            acquisition_time="2026-09-01T00:00:00Z", cloud_cover=5.0, quality="GOOD"
        ))

    # Region 2: Cluster B (lat ~ 25.0, lon ~ 85.0) - 10 samples
    for i in range(10):
        s_id = f"ind_clusterB_{i}"
        generate_multispectral_patch(s_id, 25.01, 85.02, "INDUSTRIAL_FIRE", output_dir=samples_dir)
        entries.append(ManifestEntry(
            sample_id=s_id, label="INDUSTRIAL_FIRE", source_dataset="TEST",
            label_type="WEAK_LABEL", latitude=25.01, longitude=85.02,
            acquisition_time="2026-09-01T00:00:00Z", cloud_cover=10.0,
            industrial_distance_km=0.8, osm_industrial_type="factory", quality="GOOD"
        ))

    # Region 3: Cluster C (lat ~ 30.0, lon ~ 77.0) - 10 samples
    for i in range(10):
        s_id = f"nf_clusterC_{i}"
        generate_multispectral_patch(s_id, 30.01, 77.02, "NON_FIRE", output_dir=samples_dir)
        entries.append(ManifestEntry(
            sample_id=s_id, label="NON_FIRE", source_dataset="TEST",
            label_type="GROUND_TRUTH", latitude=30.01, longitude=77.02,
            acquisition_time="2026-09-01T00:00:00Z", cloud_cover=2.0, quality="GOOD"
        ))

    ManifestManager.save_manifest(entries, manifest_path)

    t_path = os.path.join(temp_dataset_env["manifest_dir"], "train.csv")
    v_path = os.path.join(temp_dataset_env["manifest_dir"], "val.csv")
    te_path = os.path.join(temp_dataset_env["manifest_dir"], "test.csv")

    train, val, test = create_spatial_event_splits(
        manifest_path=manifest_path,
        train_path=t_path,
        val_path=v_path,
        test_path=te_path,
        seed=42
    )

    # Verify no cluster overlap
    train_clusters = {get_spatial_cluster_key(e.latitude, e.longitude) for e in train}
    val_clusters = {get_spatial_cluster_key(e.latitude, e.longitude) for e in val}
    test_clusters = {get_spatial_cluster_key(e.latitude, e.longitude) for e in test}

    assert len(train_clusters.intersection(val_clusters)) == 0
    assert len(train_clusters.intersection(test_clusters)) == 0
    assert len(val_clusters.intersection(test_clusters)) == 0


def test_manual_review_workflow(temp_dataset_env):
    """Test manual review marking updates label_type while preserving source metadata."""
    manifest_path = temp_dataset_env["manifest_path"]
    entry = ManifestEntry(
        sample_id="ind_rev_001",
        label="INDUSTRIAL_FIRE",
        source_dataset="FIRMS_OSM_TEST",
        label_type="WEAK_LABEL",
        latitude=21.12,
        longitude=79.12,
        acquisition_time="2026-09-07T14:30:00Z",
        cloud_cover=18.0,
        industrial_distance_km=0.6,
        osm_industrial_type="refinery",
        quality="GOOD",
        notes="Automated pairing"
    )
    ManifestManager.save_manifest([entry], manifest_path)

    # Apply ACCEPT review
    updated = apply_review_decision("ind_rev_001", "ACCEPT", reviewer_notes="Confirmed smoke plume", manifest_path=manifest_path)
    assert updated is not None
    assert updated.label_type == "MANUAL_REVIEW"
    assert "Confirmed smoke plume" in updated.notes
    assert updated.source_dataset == "FIRMS_OSM_TEST"  # Preserved original provenance


def test_dataset_validator_audit():
    """Run full dataset validation audit on production manifests."""
    report = validate_dataset_integrity()
    assert report["status"] == "PASSED"
    assert report["total_samples"] >= 800
    assert report["class_distribution"]["WILDFIRE"] > 0
    assert report["class_distribution"]["INDUSTRIAL_FIRE"] > 0
    assert report["class_distribution"]["NON_FIRE"] > 0
    assert report["leakage_check"] == "PASSED"
    assert len(report["errors"]) == 0
