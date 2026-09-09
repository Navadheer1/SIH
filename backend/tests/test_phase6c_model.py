import os
import json
import pytest
import torch
import numpy as np

from app.ml.satellite_model.config import (
    INPUT_BANDS,
    NUM_CHANNELS,
    NUM_CLASSES,
    IMAGE_SIZE,
    CLASS_NAMES,
    TRAIN_MANIFEST_PATH,
    TEST_MANIFEST_PATH,
    BEST_MODEL_PATH,
    NORMALIZATION_STATS_PATH,
    get_device
)
from app.ml.satellite_model.model import MultispectralCNN, get_model
from app.ml.satellite_model.transforms import MultispectralTransform
from app.ml.satellite_model.dataset import MultispectralSatelliteDataset, compute_dataset_normalization_stats
from app.ml.satellite_model.inference import predict_multispectral, get_inference_engine
from app.ml.satellite_model.evaluate import evaluate_model_on_dataset


def test_dataset_sample_loading_and_six_channels():
    """Verify MultispectralSatelliteDataset loads samples with 6 channels and correct dimensions."""
    dataset = MultispectralSatelliteDataset(manifest_path=TEST_MANIFEST_PATH, is_train=False)
    assert len(dataset) > 0

    tensor, label_id, sample_id = dataset[0]
    # Check shape: [6, 128, 128]
    assert tensor.shape == (NUM_CHANNELS, IMAGE_SIZE, IMAGE_SIZE)
    assert tensor.dtype == torch.float32
    assert label_id in (0, 1, 2)
    assert isinstance(sample_id, str) and len(sample_id) > 0


def test_no_nan_or_inf_after_preprocessing():
    """Verify transforms cleanly sanitize NaNs and Infs."""
    transform = MultispectralTransform(is_train=False, mean=[0.1]*6, std=[0.2]*6)
    
    # Input with NaN and Inf
    bad_tensor = torch.tensor([
        [[float('nan'), float('inf')], [float('-inf'), 0.5]]
    ] * 6, dtype=torch.float32)

    cleaned = transform(bad_tensor)
    assert not torch.isnan(cleaned).any()
    assert not torch.isinf(cleaned).any()


def test_normalization_uses_training_statistics():
    """Verify dataset-level normalization uses training statistics."""
    stats = compute_dataset_normalization_stats(TRAIN_MANIFEST_PATH)
    assert "mean" in stats and len(stats["mean"]) == 6
    assert "std" in stats and len(stats["std"]) == 6
    assert all(m > 0.0 for m in stats["mean"])
    assert all(s > 0.0 for s in stats["std"])


def test_model_forward_pass_and_output_shape():
    """Verify MultispectralCNN forward pass produces [batch_size, 3] logits."""
    model = get_model(in_channels=6, num_classes=3)
    model.eval()

    batch_size = 4
    dummy_input = torch.randn(batch_size, 6, 128, 128, dtype=torch.float32)
    with torch.no_grad():
        logits = model(dummy_input)

    assert logits.shape == (batch_size, NUM_CLASSES)
    assert not torch.isnan(logits).any()


def test_checkpoint_save_and_load(tmp_path):
    """Verify model state dictionary can be saved and restored with identical weights."""
    model = get_model()
    model.eval()
    ckpt_path = str(tmp_path / "test_model.pth")
    torch.save(model.state_dict(), ckpt_path)

    loaded_model = get_model()
    loaded_model.load_state_dict(torch.load(ckpt_path, weights_only=True))
    loaded_model.eval()

    x = torch.randn(2, 6, 128, 128)
    with torch.no_grad():
        out1 = model(x)
        out2 = loaded_model(x)

    torch.testing.assert_close(out1, out2)


def test_inference_returns_valid_classification():
    """Verify predict_multispectral inference engine returns expected payload structure."""
    engine = get_inference_engine()
    assert engine is not None

    # Test with 6-channel numpy input dict
    dummy_bands = {b: np.random.uniform(0.1, 0.5, (128, 128)).astype(np.float32) for b in INPUT_BANDS}
    res = predict_multispectral(dummy_bands)

    assert "predicted_class" in res
    assert res["predicted_class"] in CLASS_NAMES
    assert "class_probabilities" in res
    assert len(res["class_probabilities"]) == 3
    assert abs(sum(res["class_probabilities"].values()) - 1.0) < 1e-3
    assert res["input_bands"] == INPUT_BANDS


def test_evaluation_metrics_generation():
    """Verify evaluation metric computation produces accuracy, per-class F1, and confusion matrix."""
    model = get_model()
    if os.path.exists(BEST_MODEL_PATH):
        model.load_state_dict(torch.load(BEST_MODEL_PATH, weights_only=True, map_location="cpu"))
    model.eval()

    test_dataset = MultispectralSatelliteDataset(manifest_path=TEST_MANIFEST_PATH, is_train=False)
    metrics = evaluate_model_on_dataset(model, test_dataset, batch_size=16, device=torch.device("cpu"))

    assert "accuracy" in metrics
    assert "macro_f1" in metrics
    assert "per_class" in metrics
    assert "confusion_matrix" in metrics
    assert len(metrics["confusion_matrix"]) == 3
    assert len(metrics["confusion_matrix"][0]) == 3
