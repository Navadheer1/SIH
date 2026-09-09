import os
import json
import logging
import torch
import numpy as np
from torch.utils.data import DataLoader
from typing import Dict, Any, List, Tuple
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    precision_recall_fscore_support,
    confusion_matrix
)

from app.ml.satellite_model.config import (
    CLASS_NAMES,
    ID_TO_CLASS,
    TEST_MANIFEST_PATH,
    BEST_MODEL_PATH,
    TEST_METRICS_PATH,
    CONFUSION_MATRIX_PATH,
    EVALUATION_REPORT_MD_PATH,
    get_device
)
from app.ml.satellite_model.dataset import MultispectralSatelliteDataset
from app.ml.satellite_model.model import get_model, MultispectralCNN

logger = logging.getLogger("model_evaluation")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


def evaluate_model_on_dataset(
    model: torch.nn.Module,
    dataset: MultispectralSatelliteDataset,
    batch_size: int = 32,
    device: torch.device = None
) -> Dict[str, Any]:
    """
    Evaluates model on given dataset and returns comprehensive performance metrics.
    """
    if device is None:
        device = get_device()

    model.to(device)
    model.eval()

    dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=False)

    all_preds: List[int] = []
    all_targets: List[int] = []
    all_probs: List[List[float]] = []

    with torch.no_grad():
        for inputs, targets, _ in dataloader:
            inputs = inputs.to(device)
            outputs = model(inputs)
            probs = torch.softmax(outputs, dim=1)
            preds = torch.argmax(probs, dim=1)

            all_preds.extend(preds.cpu().numpy().tolist())
            all_targets.extend(targets.numpy().tolist())
            all_probs.extend(probs.cpu().numpy().tolist())

    y_true = np.array(all_targets)
    y_pred = np.array(all_preds)

    # Compute global and per-class metrics
    acc = float(accuracy_score(y_true, y_pred))
    balanced_acc = float(balanced_accuracy_score(y_true, y_pred))
    
    prec_macro, rec_macro, f1_macro, _ = precision_recall_fscore_support(
        y_true, y_pred, average="macro", zero_division=0
    )
    prec_weighted, rec_weighted, f1_weighted, _ = precision_recall_fscore_support(
        y_true, y_pred, average="weighted", zero_division=0
    )

    # Per-class metrics
    prec_per_class, rec_per_class, f1_per_class, support_per_class = precision_recall_fscore_support(
        y_true, y_pred, labels=[0, 1, 2], zero_division=0
    )

    per_class_metrics = {}
    for idx, name in enumerate(CLASS_NAMES):
        per_class_metrics[name] = {
            "precision": float(round(prec_per_class[idx], 4)),
            "recall": float(round(rec_per_class[idx], 4)),
            "f1_score": float(round(f1_per_class[idx], 4)),
            "support": int(support_per_class[idx])
        }

    # Confusion matrix
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1, 2]).tolist()

    metrics = {
        "accuracy": float(round(acc, 4)),
        "balanced_accuracy": float(round(balanced_acc, 4)),
        "macro_precision": float(round(prec_macro, 4)),
        "macro_recall": float(round(rec_macro, 4)),
        "macro_f1": float(round(f1_macro, 4)),
        "weighted_f1": float(round(f1_weighted, 4)),
        "per_class": per_class_metrics,
        "confusion_matrix": cm,
        "class_labels": CLASS_NAMES,
        "total_test_samples": len(y_true)
    }

    return metrics


def save_evaluation_reports(
    metrics: Dict[str, Any],
    metrics_path: str = TEST_METRICS_PATH,
    cm_path: str = CONFUSION_MATRIX_PATH,
    md_report_path: str = EVALUATION_REPORT_MD_PATH
) -> None:
    """
    Saves JSON test metrics, confusion matrix, and markdown evaluation summary.
    """
    os.makedirs(os.path.dirname(metrics_path), exist_ok=True)
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    with open(cm_path, "w", encoding="utf-8") as f:
        json.dump({
            "labels": CLASS_NAMES,
            "matrix": metrics["confusion_matrix"]
        }, f, indent=2)

    cm = metrics["confusion_matrix"]
    md = f"""# Phase 6C: 6-Band Sentinel-2 CNN Baseline Evaluation Report

**Model Architecture:** 6-Band Multispectral CNN Baseline  
**Input Channels:** 6 bands (`B02, B03, B04, B08, B11, B12`)  
**Test Set Size:** {metrics['total_test_samples']} samples  

---

## 1. Overall Performance Metrics
| Metric | Value |
| :--- | :--- |
| **Test Accuracy** | **{metrics['accuracy']*100:.2f}%** |
| **Balanced Accuracy** | **{metrics['balanced_accuracy']*100:.2f}%** |
| **Macro F1 Score** | **{metrics['macro_f1']:.4f}** |
| **Macro Precision** | **{metrics['macro_precision']:.4f}** |
| **Macro Recall** | **{metrics['macro_recall']:.4f}** |

---

## 2. Per-Class Performance
| Class | Precision | Recall | F1 Score | Support |
| :--- | :--- | :--- | :--- | :--- |
| `WILDFIRE` | {metrics['per_class']['WILDFIRE']['precision']:.4f} | {metrics['per_class']['WILDFIRE']['recall']:.4f} | **{metrics['per_class']['WILDFIRE']['f1_score']:.4f}** | {metrics['per_class']['WILDFIRE']['support']} |
| `INDUSTRIAL_FIRE` | {metrics['per_class']['INDUSTRIAL_FIRE']['precision']:.4f} | {metrics['per_class']['INDUSTRIAL_FIRE']['recall']:.4f} | **{metrics['per_class']['INDUSTRIAL_FIRE']['f1_score']:.4f}** | {metrics['per_class']['INDUSTRIAL_FIRE']['support']} |
| `NON_FIRE` | {metrics['per_class']['NON_FIRE']['precision']:.4f} | {metrics['per_class']['NON_FIRE']['recall']:.4f} | **{metrics['per_class']['NON_FIRE']['f1_score']:.4f}** | {metrics['per_class']['NON_FIRE']['support']} |

---

## 3. Confusion Matrix
*(Rows = Ground Truth / Source, Columns = Predicted)*

| True \\ Pred | WILDFIRE | INDUSTRIAL_FIRE | NON_FIRE |
| :--- | :--- | :--- | :--- |
| **WILDFIRE** | {cm[0][0]} | {cm[0][1]} | {cm[0][2]} |
| **INDUSTRIAL_FIRE** | {cm[1][0]} | {cm[1][1]} | {cm[1][2]} |
| **NON_FIRE** | {cm[2][0]} | {cm[2][1]} | {cm[2][2]} |

---

## 4. Key Takeaways
- **WILDFIRE vs INDUSTRIAL_FIRE Distinction:** Model leverages differential shortwave infrared reflectance (B12, B11) and vegetation red-edge/NIR (B08) to distinguish open vegetative burning from localized high-temperature industrial anomalies.
- **Physical Multispectral Representation:** Channel-wise training statistics maintain physical radiometric ratios without artificial band distortions.
"""

    with open(md_report_path, "w", encoding="utf-8") as f:
        f.write(md)

    logger.info(f"Evaluation reports saved to {metrics_path} and {md_report_path}")


def evaluate_checkpoint(
    checkpoint_path: str = BEST_MODEL_PATH,
    test_manifest_path: str = TEST_MANIFEST_PATH,
    batch_size: int = 32
) -> Dict[str, Any]:
    """
    Loads saved checkpoint and evaluates against test split.
    """
    if not os.path.exists(checkpoint_path):
        raise FileNotFoundError(f"Model checkpoint not found at: {checkpoint_path}")

    device = get_device()
    model = get_model().to(device)
    
    state_dict = torch.load(checkpoint_path, map_location=device, weights_only=True)
    model.load_state_dict(state_dict)

    test_dataset = MultispectralSatelliteDataset(manifest_path=test_manifest_path, is_train=False)
    metrics = evaluate_model_on_dataset(model, test_dataset, batch_size=batch_size, device=device)
    save_evaluation_reports(metrics)

    print("\n" + "="*60)
    print("PHASE 6C TEST EVALUATION RESULTS:")
    print("="*60)
    print(f"Accuracy:          {metrics['accuracy']*100:.2f}%")
    print(f"Balanced Accuracy: {metrics['balanced_accuracy']*100:.2f}%")
    print(f"Macro F1 Score:    {metrics['macro_f1']:.4f}")
    print("\nPer-Class F1:")
    for cls_name, m in metrics["per_class"].items():
        print(f"  {cls_name:18s}: F1 = {m['f1_score']:.4f} (P={m['precision']:.4f}, R={m['recall']:.4f}, N={m['support']})")
    print("="*60 + "\n")

    return metrics


if __name__ == "__main__":
    evaluate_checkpoint()
