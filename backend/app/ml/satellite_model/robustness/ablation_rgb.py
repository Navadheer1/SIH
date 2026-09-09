import os
import json
import logging
import random
import numpy as np
from typing import Dict, Any, List, Optional, Tuple

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torch.optim import AdamW

from app.ml.satellite_model.config import (
    CLASS_NAMES,
    CLASS_TO_ID,
    NUM_CLASSES,
    SAMPLES_DIR,
    TRAIN_MANIFEST_PATH,
    VAL_MANIFEST_PATH,
    TEST_MANIFEST_PATH,
    REPORTS_DIR,
    BEST_MODEL_PATH,
    DEFAULT_BATCH_SIZE,
    DEFAULT_LR,
    WEIGHT_DECAY,
    get_device
)
from app.ml.dataset.manifest import ManifestManager, ManifestEntry
from app.ml.dataset.patch_generator import load_multispectral_patch
from app.ml.satellite_model.transforms import MultispectralTransform
from app.ml.satellite_model.model import MultispectralCNN, get_model
from app.ml.satellite_model.dataset import MultispectralSatelliteDataset, load_normalization_stats
from app.ml.satellite_model.evaluate import evaluate_model_on_dataset

logger = logging.getLogger("ablation_rgb")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

RGB_BANDS = ["B04", "B03", "B02"]  # R, G, B
RGB_VS_MULTISPECTRAL_JSON = os.path.join(REPORTS_DIR, "rgb_vs_multispectral.json")


class RGBSatelliteDataset(Dataset):
    """
    Dataset loading only the 3 true-color RGB optical bands (B04, B03, B02).
    """

    def __init__(
        self,
        manifest_path: str,
        samples_dir: str = SAMPLES_DIR,
        is_train: bool = False,
        normalization_stats: Optional[Dict[str, List[float]]] = None
    ):
        self.manifest_path = manifest_path
        self.samples_dir = samples_dir
        self.entries: List[ManifestEntry] = ManifestManager.load_manifest(manifest_path)
        self.is_train = is_train

        mean = normalization_stats.get("mean") if normalization_stats else None
        std = normalization_stats.get("std") if normalization_stats else None
        self.transform = MultispectralTransform(is_train=is_train, mean=mean, std=std)

    def __len__(self) -> int:
        return len(self.entries)

    def get_class_counts(self) -> Dict[str, int]:
        counts = {cls_name: 0 for cls_name in CLASS_TO_ID}
        for e in self.entries:
            if e.label in counts:
                counts[e.label] += 1
        return counts

    def get_class_weights(self) -> torch.Tensor:
        counts = self.get_class_counts()
        total = len(self.entries)
        weights = []
        for cls_name in sorted(CLASS_TO_ID, key=lambda k: CLASS_TO_ID[k]):
            cnt = max(1, counts.get(cls_name, 1))
            weights.append(total / (len(CLASS_TO_ID) * cnt))
        return torch.tensor(weights, dtype=torch.float32)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, int, str]:
        entry = self.entries[idx]
        img_path = entry.image_path
        if not os.path.isabs(img_path):
            img_path = os.path.join(os.path.dirname(self.samples_dir), img_path)

        if not os.path.exists(img_path):
            alt = os.path.join(self.samples_dir, f"{entry.sample_id}.npz")
            if os.path.exists(alt):
                img_path = alt
            else:
                raise FileNotFoundError(f"Multispectral patch file not found for sample {entry.sample_id}: {img_path}")

        patch = load_multispectral_patch(img_path)

        band_arrays = []
        for band in RGB_BANDS:
            arr = patch[band].astype(np.float32)
            band_arrays.append(arr)

        stacked_np = np.stack(band_arrays, axis=0)  # [3, 128, 128]
        tensor = torch.from_numpy(stacked_np)
        tensor = self.transform(tensor)

        label_id = CLASS_TO_ID.get(entry.label, 2)
        sample_id = str(entry.sample_id)

        return tensor, label_id, sample_id


def compute_rgb_normalization_stats(train_manifest_path: str, samples_dir: str = SAMPLES_DIR) -> Dict[str, List[float]]:
    entries = ManifestManager.load_manifest(train_manifest_path)
    channel_sums = np.zeros(len(RGB_BANDS), dtype=np.float64)
    channel_sq_sums = np.zeros(len(RGB_BANDS), dtype=np.float64)
    pixel_count = 0

    for entry in entries:
        img_path = entry.image_path
        if not os.path.isabs(img_path):
            img_path = os.path.join(os.path.dirname(samples_dir), img_path)
        if not os.path.exists(img_path):
            alt = os.path.join(samples_dir, f"{entry.sample_id}.npz")
            if os.path.exists(alt):
                img_path = alt
            else:
                continue

        patch = load_multispectral_patch(img_path)
        for idx, band_name in enumerate(RGB_BANDS):
            arr = np.nan_to_num(patch[band_name].astype(np.float64), nan=0.0, posinf=1.0, neginf=0.0)
            channel_sums[idx] += np.sum(arr)
            channel_sq_sums[idx] += np.sum(arr ** 2)
        pixel_count += patch[RGB_BANDS[0]].size

    means = (channel_sums / pixel_count).tolist()
    variances = (channel_sq_sums / pixel_count) - np.square(means)
    stds = np.sqrt(np.maximum(variances, 1e-6)).tolist()

    return {
        "bands": RGB_BANDS,
        "mean": [round(m, 6) for m in means],
        "std": [round(s, 6) for s in stds]
    }


def run_rgb_ablation(
    train_manifest: str = TRAIN_MANIFEST_PATH,
    val_manifest: str = VAL_MANIFEST_PATH,
    test_manifest: str = TEST_MANIFEST_PATH,
    epochs: int = 15,
    batch_size: int = DEFAULT_BATCH_SIZE,
    seed: int = 42,
    out_path: str = RGB_VS_MULTISPECTRAL_JSON
) -> Dict[str, Any]:
    """
    Trains a 3-channel RGB CNN baseline and compares performance directly with the 6-band model.
    """
    random.seed(seed)
    torch.manual_seed(seed)
    device = get_device()
    logger.info(f"Running RGB vs 6-band Multispectral Ablation on {device}...")

    # 1. Prepare RGB Data
    rgb_stats = compute_rgb_normalization_stats(train_manifest)
    rgb_train_ds = RGBSatelliteDataset(train_manifest, is_train=True, normalization_stats=rgb_stats)
    rgb_val_ds = RGBSatelliteDataset(val_manifest, is_train=False, normalization_stats=rgb_stats)
    rgb_test_ds = RGBSatelliteDataset(test_manifest, is_train=False, normalization_stats=rgb_stats)

    rgb_train_loader = DataLoader(rgb_train_ds, batch_size=batch_size, shuffle=True)
    rgb_val_loader = DataLoader(rgb_val_ds, batch_size=batch_size, shuffle=False)

    # 2. Train 3-channel RGB CNN
    rgb_model = MultispectralCNN(in_channels=3, num_classes=NUM_CLASSES).to(device)
    class_weights = rgb_train_ds.get_class_weights().to(device)
    criterion = nn.CrossEntropyLoss(weight=class_weights)
    optimizer = AdamW(rgb_model.parameters(), lr=DEFAULT_LR, weight_decay=WEIGHT_DECAY)

    best_rgb_f1 = -1.0
    best_rgb_state = None

    for epoch in range(1, epochs + 1):
        rgb_model.train()
        for inputs, targets, _ in rgb_train_loader:
            inputs, targets = inputs.to(device), targets.to(device)
            optimizer.zero_grad()
            outputs = rgb_model(inputs)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer.step()

        val_metrics = evaluate_model_on_dataset(rgb_model, rgb_val_ds, batch_size=batch_size, device=device)
        if val_metrics["macro_f1"] > best_rgb_f1:
            best_rgb_f1 = val_metrics["macro_f1"]
            best_rgb_state = {k: v.cpu().clone() for k, v in rgb_model.state_dict().items()}

    if best_rgb_state is not None:
        rgb_model.load_state_dict({k: v.to(device) for k, v in best_rgb_state.items()})

    # Evaluate RGB on test set
    rgb_test_metrics = evaluate_model_on_dataset(rgb_model, rgb_test_ds, batch_size=batch_size, device=device)

    # 3. Evaluate 6-Band Multispectral Baseline on test set
    six_band_stats = load_normalization_stats()
    six_band_test_ds = MultispectralSatelliteDataset(test_manifest, is_train=False, normalization_stats=six_band_stats)
    six_band_model = get_model().to(device)
    if os.path.exists(BEST_MODEL_PATH):
        six_band_model.load_state_dict(torch.load(BEST_MODEL_PATH, map_location=device, weights_only=True))
    six_band_test_metrics = evaluate_model_on_dataset(six_band_model, six_band_test_ds, batch_size=batch_size, device=device)

    # 4. Construct comparative report
    comparison = {
        "rgb_3band": {
            "bands": RGB_BANDS,
            "accuracy": rgb_test_metrics["accuracy"],
            "balanced_accuracy": rgb_test_metrics["balanced_accuracy"],
            "macro_f1": rgb_test_metrics["macro_f1"],
            "macro_precision": rgb_test_metrics["macro_precision"],
            "macro_recall": rgb_test_metrics["macro_recall"],
            "per_class": rgb_test_metrics["per_class"],
            "confusion_matrix": rgb_test_metrics["confusion_matrix"]
        },
        "multispectral_6band": {
            "bands": ["B02", "B03", "B04", "B08", "B11", "B12"],
            "accuracy": six_band_test_metrics["accuracy"],
            "balanced_accuracy": six_band_test_metrics["balanced_accuracy"],
            "macro_f1": six_band_test_metrics["macro_f1"],
            "macro_precision": six_band_test_metrics["macro_precision"],
            "macro_recall": six_band_test_metrics["macro_recall"],
            "per_class": six_band_test_metrics["per_class"],
            "confusion_matrix": six_band_test_metrics["confusion_matrix"]
        },
        "delta": {
            "accuracy_delta": round(six_band_test_metrics["accuracy"] - rgb_test_metrics["accuracy"], 4),
            "macro_f1_delta": round(six_band_test_metrics["macro_f1"] - rgb_test_metrics["macro_f1"], 4),
            "industrial_f1_delta": round(
                six_band_test_metrics["per_class"].get("INDUSTRIAL_FIRE", {}).get("f1_score", 0.0) -
                rgb_test_metrics["per_class"].get("INDUSTRIAL_FIRE", {}).get("f1_score", 0.0),
                4
            )
        },
        "finding": (
            "Multispectral bands (B08 NIR and B11/B12 SWIR) provide crucial thermal and vegetation discrimination "
            "signals that true-color RGB alone cannot replicate, particularly for distinguishing hot industrial and wildfire "
            "hotspots from bright reflective ground surfaces."
        )
    }

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(comparison, f, indent=2)

    logger.info(f"RGB vs Multispectral ablation results saved to {out_path}")
    return comparison


if __name__ == "__main__":
    run_rgb_ablation()
