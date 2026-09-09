import os
import json
import logging
import numpy as np
import torch
from torch.utils.data import Dataset
from typing import Dict, Any, List, Optional, Tuple

from app.ml.satellite_model.config import (
    INPUT_BANDS,
    CLASS_TO_ID,
    SAMPLES_DIR,
    NORMALIZATION_STATS_PATH
)
from app.ml.satellite_model.transforms import MultispectralTransform
from app.ml.dataset.manifest import ManifestManager, ManifestEntry
from app.ml.dataset.patch_generator import load_multispectral_patch

logger = logging.getLogger("multispectral_dataset")


def compute_dataset_normalization_stats(
    dataset_manifest_path: str,
    samples_dir: str = SAMPLES_DIR,
    stats_out_path: str = NORMALIZATION_STATS_PATH
) -> Dict[str, List[float]]:
    """
    Computes per-channel mean and standard deviation across all samples in the training split.
    Saves the computed statistics to normalization_stats.json.
    """
    entries = ManifestManager.load_manifest(dataset_manifest_path)
    if not entries:
        raise ValueError(f"No samples found in {dataset_manifest_path} to compute normalization stats.")

    channel_sums = np.zeros(len(INPUT_BANDS), dtype=np.float64)
    channel_sq_sums = np.zeros(len(INPUT_BANDS), dtype=np.float64)
    pixel_count_per_channel = 0

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
        for idx, band_name in enumerate(INPUT_BANDS):
            arr = np.nan_to_num(patch[band_name].astype(np.float64), nan=0.0, posinf=1.0, neginf=0.0)
            channel_sums[idx] += np.sum(arr)
            channel_sq_sums[idx] += np.sum(arr ** 2)

        pixel_count_per_channel += patch[INPUT_BANDS[0]].size

    means = (channel_sums / pixel_count_per_channel).tolist()
    variances = (channel_sq_sums / pixel_count_per_channel) - np.square(means)
    stds = np.sqrt(np.maximum(variances, 1e-6)).tolist()

    stats = {
        "bands": INPUT_BANDS,
        "mean": [round(m, 6) for m in means],
        "std": [round(s, 6) for s in stds],
        "samples_analyzed": len(entries),
        "total_pixels_per_band": pixel_count_per_channel
    }

    os.makedirs(os.path.dirname(stats_out_path), exist_ok=True)
    with open(stats_out_path, "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)

    logger.info(f"Saved dataset normalization statistics to {stats_out_path}")
    return stats


def load_normalization_stats(stats_path: str = NORMALIZATION_STATS_PATH) -> Optional[Dict[str, List[float]]]:
    if not os.path.exists(stats_path):
        return None
    try:
        with open(stats_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Could not load normalization stats from {stats_path}: {e}")
        return None


class MultispectralSatelliteDataset(Dataset):
    """
    PyTorch Dataset loading 6-band Sentinel-2 L2A optical patches (B02, B03, B04, B08, B11, B12).
    """

    def __init__(
        self,
        manifest_path: str,
        samples_dir: str = SAMPLES_DIR,
        transform: Optional[MultispectralTransform] = None,
        is_train: bool = False,
        normalization_stats: Optional[Dict[str, List[float]]] = None
    ):
        self.manifest_path = manifest_path
        self.samples_dir = samples_dir
        self.entries: List[ManifestEntry] = ManifestManager.load_manifest(manifest_path)
        self.is_train = is_train

        # Setup transforms
        if transform is not None:
            self.transform = transform
        else:
            stats = normalization_stats or load_normalization_stats()
            mean = stats["mean"] if stats else None
            std = stats["std"] if stats else None
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
        """
        Computes inverse class frequency weights for CrossEntropyLoss.
        """
        counts = self.get_class_counts()
        total = len(self.entries)
        weights = []
        for cls_name in sorted(CLASS_TO_ID, key=lambda k: CLASS_TO_ID[k]):
            cnt = max(1, counts.get(cls_name, 1))
            weights.append(total / (len(CLASS_TO_ID) * cnt))
        return torch.tensor(weights, dtype=torch.float32)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, int, Dict[str, Any]]:
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

        # Assemble [6, 128, 128] float32 tensor
        band_arrays = []
        for band in INPUT_BANDS:
            arr = patch[band].astype(np.float32)
            band_arrays.append(arr)

        stacked_np = np.stack(band_arrays, axis=0)  # Shape: (6, 128, 128)
        tensor = torch.from_numpy(stacked_np)

        # Apply augmentation and normalization
        tensor = self.transform(tensor)

        label_id = CLASS_TO_ID.get(entry.label, 2)
        sample_id = str(entry.sample_id)

        return tensor, label_id, sample_id
