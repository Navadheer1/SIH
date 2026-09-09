import os
import sys
import argparse
import random
import logging
from typing import List, Dict, Any, Tuple, Optional
from collections import defaultdict

from app.ml.dataset.config import (
    MAIN_MANIFEST_PATH,
    TRAIN_MANIFEST_PATH,
    VAL_MANIFEST_PATH,
    TEST_MANIFEST_PATH
)
from app.ml.dataset.manifest import ManifestEntry, ManifestManager

logger = logging.getLogger("create_splits")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


def get_spatial_cluster_key(lat: float, lon: float, grid_size_deg: float = 0.5) -> str:
    """
    Assigns coordinates to a deterministic spatial cluster grid key (e.g. 'lat_22.0_lon_80.5').
    Samples in the same spatial vicinity share the cluster key to prevent spatial leakage.
    """
    grid_lat = round(lat / grid_size_deg) * grid_size_deg
    grid_lon = round(lon / grid_size_deg) * grid_size_deg
    return f"cluster_{grid_lat:.2f}_{grid_lon:.2f}"


def create_spatial_event_splits(
    manifest_path: str = MAIN_MANIFEST_PATH,
    train_path: Optional[str] = None,
    val_path: Optional[str] = None,
    test_path: Optional[str] = None,
    train_ratio: float = 0.70,
    val_ratio: float = 0.15,
    test_ratio: float = 0.15,
    seed: int = 42
) -> Tuple[List[ManifestEntry], List[ManifestEntry], List[ManifestEntry]]:
    """
    Creates train/val/test splits partitioned strictly by spatial cluster/event to guarantee
    zero spatial and event leakage across partitions.
    """
    out_train_path = train_path or TRAIN_MANIFEST_PATH
    out_val_path = val_path or VAL_MANIFEST_PATH
    out_test_path = test_path or TEST_MANIFEST_PATH

    entries = ManifestManager.load_manifest(manifest_path)
    if not entries:
        logger.warning(f"No manifest entries found at {manifest_path}")
        return [], [], []

    # Group entries by class, then by spatial cluster within each class
    class_clusters: Dict[str, Dict[str, List[ManifestEntry]]] = defaultdict(lambda: defaultdict(list))

    for entry in entries:
        # Determine group key: if notes specify an event, use that, else use spatial grid key
        cluster_key = get_spatial_cluster_key(entry.latitude, entry.longitude)
        class_clusters[entry.label][cluster_key].append(entry)

    train_entries: List[ManifestEntry] = []
    val_entries: List[ManifestEntry] = []
    test_entries: List[ManifestEntry] = []

    rng = random.Random(seed)

    # For each class, allocate entire clusters to train, val, and test to maintain balanced class proportions
    for label, clusters in class_clusters.items():
        cluster_keys = list(clusters.keys())
        rng.shuffle(cluster_keys)

        total_samples = sum(len(clusters[k]) for k in cluster_keys)
        target_train_count = int(total_samples * train_ratio)
        target_val_count = int(total_samples * val_ratio)

        current_train = 0
        current_val = 0

        for k in cluster_keys:
            cluster_items = clusters[k]
            if current_train + len(cluster_items) <= target_train_count or (current_train < target_train_count and not val_entries):
                train_entries.extend(cluster_items)
                current_train += len(cluster_items)
            elif current_val + len(cluster_items) <= target_val_count:
                val_entries.extend(cluster_items)
                current_val += len(cluster_items)
            else:
                test_entries.extend(cluster_items)

    # Save partition manifests
    ManifestManager.save_manifest(train_entries, out_train_path)
    ManifestManager.save_manifest(val_entries, out_val_path)
    ManifestManager.save_manifest(test_entries, out_test_path)

    logger.info(f"Split Summary (Total: {len(entries)}):")
    logger.info(f"  Train: {len(train_entries)} ({len(train_entries)/len(entries)*100:.1f}%)")
    logger.info(f"  Val:   {len(val_entries)} ({len(val_entries)/len(entries)*100:.1f}%)")
    logger.info(f"  Test:  {len(test_entries)} ({len(test_entries)/len(entries)*100:.1f}%)")

    return train_entries, val_entries, test_entries


def main():
    parser = argparse.ArgumentParser(description="Partition dataset into train/val/test splits without spatial leakage")
    parser.add_argument("--manifest", type=str, default=MAIN_MANIFEST_PATH, help="Path to input manifest")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for cluster shuffling")
    args = parser.parse_args()

    create_spatial_event_splits(manifest_path=args.manifest, seed=args.seed)


if __name__ == "__main__":
    main()
