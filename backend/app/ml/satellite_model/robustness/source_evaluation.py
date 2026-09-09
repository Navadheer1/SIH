import os
import json
import logging
import torch
import numpy as np
from typing import Dict, Any, List
from collections import defaultdict
from sklearn.metrics import accuracy_score, precision_recall_fscore_support

from app.ml.satellite_model.config import (
    CLASS_NAMES,
    CLASS_TO_ID,
    TEST_MANIFEST_PATH,
    BEST_MODEL_PATH,
    REPORTS_DIR,
    get_device
)
from app.ml.satellite_model.dataset import MultispectralSatelliteDataset
from app.ml.satellite_model.model import get_model

logger = logging.getLogger("source_evaluation")
SOURCE_METRICS_JSON = os.path.join(REPORTS_DIR, "source_metrics.json")


def evaluate_by_sources_and_provenance(
    checkpoint_path: str = BEST_MODEL_PATH,
    test_manifest_path: str = TEST_MANIFEST_PATH,
    out_path: str = SOURCE_METRICS_JSON
) -> Dict[str, Any]:
    """
    Evaluates model performance stratified by dataset source, label provenance, and class.
    """
    device = get_device()
    model = get_model().to(device)
    model.load_state_dict(torch.load(checkpoint_path, map_location=device, weights_only=True))
    model.eval()

    dataset = MultispectralSatelliteDataset(manifest_path=test_manifest_path, is_train=False)

    predictions = []
    targets = []
    metadata_list = []

    with torch.no_grad():
        for i in range(len(dataset)):
            tensor, label_id, sample_id = dataset[i]
            tensor = tensor.unsqueeze(0).to(device)
            out = model(tensor)
            pred = int(torch.argmax(out, dim=1).cpu().item())
            
            predictions.append(pred)
            targets.append(label_id)
            metadata_list.append(dataset.entries[i])

    # Stratifications
    source_groups = defaultdict(lambda: {"preds": [], "targets": []})
    provenance_groups = defaultdict(lambda: {"preds": [], "targets": []})
    class_groups = defaultdict(lambda: {"preds": [], "targets": []})

    for pred, target, entry in zip(predictions, targets, metadata_list):
        src = entry.source_dataset or "UNKNOWN_SOURCE"
        prov = entry.label_type or "UNKNOWN_PROVENANCE"
        cls_name = entry.label

        source_groups[src]["preds"].append(pred)
        source_groups[src]["targets"].append(target)

        provenance_groups[prov]["preds"].append(pred)
        provenance_groups[prov]["targets"].append(target)

        class_groups[cls_name]["preds"].append(pred)
        class_groups[cls_name]["targets"].append(target)

    def _calc_group_metrics(group_dict: Dict[str, Any]) -> Dict[str, Any]:
        results = {}
        for k, v in group_dict.items():
            y_t = np.array(v["targets"])
            y_p = np.array(v["preds"])
            n = len(y_t)
            
            if n == 0:
                continue

            acc = float(accuracy_score(y_t, y_p))
            prec, rec, f1, _ = precision_recall_fscore_support(y_t, y_p, average="macro", zero_division=0)
            
            results[k] = {
                "sample_count": n,
                "accuracy": round(acc, 4),
                "macro_precision": round(float(prec), 4),
                "macro_recall": round(float(rec), 4),
                "macro_f1": round(float(f1), 4),
                "is_statistically_small": n < 15,
                "flag": "Sample size too small (<15) for high statistical confidence" if n < 15 else "Adequate sample size"
            }
        return results

    source_metrics = _calc_group_metrics(source_groups)
    provenance_metrics = _calc_group_metrics(provenance_groups)
    class_metrics = _calc_group_metrics(class_groups)

    report = {
        "evaluation_summary": {
            "total_test_samples": len(targets),
            "overall_accuracy": round(float(accuracy_score(targets, predictions)), 4)
        },
        "performance_by_source": source_metrics,
        "performance_by_label_provenance": provenance_metrics,
        "performance_by_class": class_metrics
    }

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    logger.info(f"Source-stratified metrics saved to {out_path}")
    return report
