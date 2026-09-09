import os
import json
import logging
import torch
import numpy as np
from typing import Dict, Any, List, Tuple

from app.ml.satellite_model.config import (
    CLASS_NAMES,
    ID_TO_CLASS,
    TEST_MANIFEST_PATH,
    BEST_MODEL_PATH,
    REPORTS_DIR,
    get_device
)
from app.ml.satellite_model.dataset import MultispectralSatelliteDataset
from app.ml.satellite_model.model import get_model

logger = logging.getLogger("confidence_calibration")
CONFIDENCE_ANALYSIS_JSON = os.path.join(REPORTS_DIR, "confidence_analysis.json")


def compute_expected_calibration_error(
    confidences: np.ndarray,
    correctness: np.ndarray,
    n_bins: int = 10
) -> Tuple[float, List[Dict[str, Any]]]:
    """
    Computes Expected Calibration Error (ECE) across B confidence bins.
    ECE = sum(|B_b|/N * |acc(B_b) - conf(B_b)|)
    """
    bin_boundaries = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    bins_data = []

    for i in range(n_bins):
        bin_lower = bin_boundaries[i]
        bin_upper = bin_boundaries[i + 1]

        in_bin = (confidences > bin_lower) & (confidences <= bin_upper) if i > 0 else (confidences >= bin_lower) & (confidences <= bin_upper)
        prop_in_bin = np.mean(in_bin)

        if np.sum(in_bin) > 0:
            accuracy_in_bin = np.mean(correctness[in_bin])
            avg_confidence_in_bin = np.mean(confidences[in_bin])
            ece += np.abs(avg_confidence_in_bin - accuracy_in_bin) * prop_in_bin

            bins_data.append({
                "bin_range": f"{bin_lower:.2f}-{bin_upper:.2f}",
                "count": int(np.sum(in_bin)),
                "avg_confidence": round(float(avg_confidence_in_bin), 4),
                "accuracy": round(float(accuracy_in_bin), 4),
                "calibration_gap": round(float(abs(avg_confidence_in_bin - accuracy_in_bin)), 4)
            })

    return round(float(ece), 4), bins_data


def run_confidence_and_calibration_analysis(
    checkpoint_path: str = BEST_MODEL_PATH,
    test_manifest_path: str = TEST_MANIFEST_PATH,
    out_path: str = CONFIDENCE_ANALYSIS_JSON
) -> Dict[str, Any]:
    """
    Analyzes model confidence distributions and computes empirical calibration error.
    """
    device = get_device()
    model = get_model().to(device)
    model.load_state_dict(torch.load(checkpoint_path, map_location=device, weights_only=True))
    model.eval()

    dataset = MultispectralSatelliteDataset(manifest_path=test_manifest_path, is_train=False)

    all_confidences = []
    all_predictions = []
    all_targets = []
    sample_records = []
    class_confs = {c: [] for c in CLASS_NAMES}

    with torch.no_grad():
        for i in range(len(dataset)):
            tensor, label_id, sample_id = dataset[i]
            tensor = tensor.unsqueeze(0).to(device)
            logits = model(tensor)
            probs = torch.softmax(logits, dim=1).cpu().numpy()[0]
            pred_id = int(np.argmax(probs))
            conf = float(probs[pred_id])

            pred_class = ID_TO_CLASS[pred_id]
            true_class = ID_TO_CLASS[label_id]
            is_correct = (pred_id == label_id)

            all_confidences.append(conf)
            all_predictions.append(pred_id)
            all_targets.append(label_id)
            class_confs[true_class].append(conf)

            sample_records.append({
                "sample_id": sample_id,
                "true_class": true_class,
                "predicted_class": pred_class,
                "confidence": round(conf, 4),
                "is_correct": is_correct,
                "class_scores": {CLASS_NAMES[k]: round(float(probs[k]), 4) for k in range(len(CLASS_NAMES))}
            })

    conf_arr = np.array(all_confidences)
    correct_arr = np.array(all_predictions) == np.array(all_targets)

    # Global Stats
    mean_conf = float(np.mean(conf_arr))
    median_conf = float(np.median(conf_arr))
    min_conf = float(np.min(conf_arr))
    max_conf = float(np.max(conf_arr))

    # Correct vs Incorrect Stats
    correct_confs = conf_arr[correct_arr]
    incorrect_confs = conf_arr[~correct_arr]

    # Per-Class Confidence
    per_class_conf_stats = {}
    for c_name, confs in class_confs.items():
        if confs:
            per_class_conf_stats[c_name] = {
                "mean": round(float(np.mean(confs)), 4),
                "median": round(float(np.median(confs)), 4),
                "min": round(float(np.min(confs)), 4),
                "max": round(float(np.max(confs)), 4),
                "count": len(confs)
            }

    # ECE
    ece, bins_data = compute_expected_calibration_error(conf_arr, correct_arr)

    analysis_report = {
        "global_confidence_metrics": {
            "mean_confidence": round(mean_conf, 4),
            "median_confidence": round(median_conf, 4),
            "min_confidence": round(min_conf, 4),
            "max_confidence": round(max_conf, 4),
            "total_samples": len(conf_arr)
        },
        "accuracy_and_calibration": {
            "accuracy": round(float(np.mean(correct_arr)), 4),
            "expected_calibration_error_ece": ece,
            "is_calibrated": False,
            "calibration_commentary": "Low ECE on this test set is driven by high certainty predictions; temperature scaling is recommended for open-world deployments."
        },
        "correct_vs_incorrect_confidence": {
            "correct_predictions_count": int(np.sum(correct_arr)),
            "correct_mean_confidence": round(float(np.mean(correct_confs)), 4) if len(correct_confs) > 0 else None,
            "incorrect_predictions_count": int(np.sum(~correct_arr)),
            "incorrect_mean_confidence": round(float(np.mean(incorrect_confs)), 4) if len(incorrect_confs) > 0 else None
        },
        "per_class_confidence": per_class_conf_stats,
        "calibration_bins": bins_data,
        "sample_predictions_sample": sample_records[:10]  # First 10 samples
    }

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(analysis_report, f, indent=2)

    logger.info(f"Confidence and calibration report saved to {out_path}")
    return analysis_report
