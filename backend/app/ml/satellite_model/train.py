import os
import sys
import json
import time
import random
import argparse
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torch.optim import AdamW

from app.ml.satellite_model.config import (
    CLASS_NAMES,
    NUM_CLASSES,
    INPUT_BANDS,
    DEFAULT_LR,
    DEFAULT_BATCH_SIZE,
    DEFAULT_EPOCHS,
    DEFAULT_PATIENCE,
    WEIGHT_DECAY,
    TRAIN_MANIFEST_PATH,
    VAL_MANIFEST_PATH,
    TEST_MANIFEST_PATH,
    BEST_MODEL_PATH,
    MODEL_METADATA_PATH,
    TRAINING_HISTORY_PATH,
    NORMALIZATION_STATS_PATH,
    get_device
)
from app.ml.satellite_model.dataset import (
    MultispectralSatelliteDataset,
    compute_dataset_normalization_stats
)
from app.ml.satellite_model.model import get_model, MultispectralCNN
from app.ml.satellite_model.evaluate import evaluate_model_on_dataset, save_evaluation_reports

logger = logging.getLogger("model_trainer")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


def set_seed(seed: int = 42) -> None:
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def train_classifier(
    train_manifest: str = TRAIN_MANIFEST_PATH,
    val_manifest: str = VAL_MANIFEST_PATH,
    test_manifest: str = TEST_MANIFEST_PATH,
    epochs: int = DEFAULT_EPOCHS,
    batch_size: int = DEFAULT_BATCH_SIZE,
    lr: float = DEFAULT_LR,
    patience: int = DEFAULT_PATIENCE,
    seed: int = 42,
    checkpoint_out_path: str = BEST_MODEL_PATH,
    metadata_out_path: str = MODEL_METADATA_PATH,
    history_out_path: str = TRAINING_HISTORY_PATH
) -> Dict[str, Any]:
    """
    Executes the 6-band CNN training loop with early stopping and best-model checkpointing.
    """
    set_seed(seed)
    device = get_device()
    logger.info(f"Training on device: {device}")

    # 1. Compute training set normalization statistics
    logger.info("Computing channel-wise training normalization statistics...")
    norm_stats = compute_dataset_normalization_stats(train_manifest)

    # 2. Build datasets and data loaders
    train_dataset = MultispectralSatelliteDataset(
        manifest_path=train_manifest,
        is_train=True,
        normalization_stats=norm_stats
    )
    val_dataset = MultispectralSatelliteDataset(
        manifest_path=val_manifest,
        is_train=False,
        normalization_stats=norm_stats
    )

    logger.info(f"Dataset splits: {len(train_dataset)} train, {len(val_dataset)} validation")

    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, drop_last=False)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)

    # 3. Initialize Model, Class-Weighted Loss, and Optimizer
    model = get_model().to(device)
    class_weights = train_dataset.get_class_weights().to(device)
    logger.info(f"Using class weights: {class_weights.cpu().numpy().tolist()}")

    criterion = nn.CrossEntropyLoss(weight=class_weights)
    optimizer = AdamW(model.parameters(), lr=lr, weight_decay=WEIGHT_DECAY)

    # 4. Training Loop
    history: List[Dict[str, Any]] = []
    best_val_f1 = -1.0
    best_epoch = 0
    patience_counter = 0

    os.makedirs(os.path.dirname(checkpoint_out_path), exist_ok=True)

    start_time = time.time()

    for epoch in range(1, epochs + 1):
        model.train()
        running_loss = 0.0
        correct_train = 0
        total_train = 0

        for inputs, targets, _ in train_loader:
            inputs, targets = inputs.to(device), targets.to(device)

            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer.step()

            running_loss += loss.item() * inputs.size(0)
            preds = torch.argmax(outputs, dim=1)
            correct_train += (preds == targets).sum().item()
            total_train += inputs.size(0)

        epoch_train_loss = running_loss / max(1, total_train)
        epoch_train_acc = correct_train / max(1, total_train)

        # Validation Step
        val_metrics = evaluate_model_on_dataset(model, val_dataset, batch_size=batch_size, device=device)
        epoch_val_acc = val_metrics["accuracy"]
        epoch_val_f1 = val_metrics["macro_f1"]

        # Validation Loss
        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for inputs, targets, _ in val_loader:
                inputs, targets = inputs.to(device), targets.to(device)
                outputs = model(inputs)
                v_loss = criterion(outputs, targets)
                val_loss += v_loss.item() * inputs.size(0)
        epoch_val_loss = val_loss / max(1, len(val_dataset))

        epoch_record = {
            "epoch": epoch,
            "train_loss": round(epoch_train_loss, 4),
            "validation_loss": round(epoch_val_loss, 4),
            "train_accuracy": round(epoch_train_acc, 4),
            "validation_accuracy": round(epoch_val_acc, 4),
            "validation_macro_f1": round(epoch_val_f1, 4)
        }
        history.append(epoch_record)

        logger.info(
            f"Epoch [{epoch:02d}/{epochs:02d}] "
            f"Train Loss: {epoch_train_loss:.4f} Acc: {epoch_train_acc*100:.1f}% | "
            f"Val Loss: {epoch_val_loss:.4f} Acc: {epoch_val_acc*100:.1f}% Macro-F1: {epoch_val_f1:.4f}"
        )

        # Checkpoint Best Model
        if epoch_val_f1 > best_val_f1:
            best_val_f1 = epoch_val_f1
            best_epoch = epoch
            patience_counter = 0

            # Save state dict
            torch.save(model.state_dict(), checkpoint_out_path)

            # Save model metadata
            metadata = {
                "model_name": "Sentinel-2 6-Band Multispectral CNN Baseline",
                "model_version": "phase6c-v1.0",
                "architecture": "MultispectralCNN",
                "input_bands": INPUT_BANDS,
                "input_channels": len(INPUT_BANDS),
                "image_size": [128, 128],
                "class_names": CLASS_NAMES,
                "classes": {name: idx for idx, name in enumerate(CLASS_NAMES)},
                "normalization": norm_stats,
                "training_configuration": {
                    "epochs": epochs,
                    "batch_size": batch_size,
                    "learning_rate": lr,
                    "weight_decay": WEIGHT_DECAY,
                    "seed": seed,
                    "device": str(device)
                },
                "best_epoch": best_epoch,
                "validation_macro_f1": round(best_val_f1, 4),
                "validation_accuracy": round(epoch_val_acc, 4),
                "trained_at": datetime.now(timezone.utc).isoformat()
            }
            with open(metadata_out_path, "w", encoding="utf-8") as f:
                json.dump(metadata, f, indent=2)
            logger.info(f"Saved new best model checkpoint (Val Macro-F1: {best_val_f1:.4f}) to {checkpoint_out_path}")
        else:
            patience_counter += 1
            if patience_counter >= patience:
                logger.info(f"Early stopping triggered at epoch {epoch} (no improvement for {patience} epochs).")
                break

    # Save training history
    os.makedirs(os.path.dirname(history_out_path), exist_ok=True)
    with open(history_out_path, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2)

    total_training_time = round(time.time() - start_time, 2)
    logger.info(f"Training completed in {total_training_time}s. Best epoch: {best_epoch} with Val Macro-F1: {best_val_f1:.4f}")

    # 5. Evaluate on Test Split
    test_dataset = MultispectralSatelliteDataset(
        manifest_path=test_manifest,
        is_train=False,
        normalization_stats=norm_stats
    )
    # Load best checkpoint
    best_model = get_model().to(device)
    best_model.load_state_dict(torch.load(checkpoint_out_path, map_location=device, weights_only=True))
    test_metrics = evaluate_model_on_dataset(best_model, test_dataset, batch_size=batch_size, device=device)
    save_evaluation_reports(test_metrics)

    return {
        "best_epoch": best_epoch,
        "best_val_f1": best_val_f1,
        "test_metrics": test_metrics,
        "training_time_seconds": total_training_time,
        "checkpoint_path": checkpoint_out_path
    }


def main():
    parser = argparse.ArgumentParser(description="Train 6-band Sentinel-2 CNN Baseline Classifier")
    parser.add_argument("--epochs", type=int, default=DEFAULT_EPOCHS, help="Number of training epochs")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="Batch size")
    parser.add_argument("--lr", type=float, default=DEFAULT_LR, help="Learning rate")
    parser.add_argument("--patience", type=int, default=DEFAULT_PATIENCE, help="Early stopping patience")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument("--smoke", action="store_true", help="Run 2-epoch smoke test")
    args = parser.parse_args()

    if args.smoke:
        logger.info("Executing smoke training run (2 epochs)...")
        train_classifier(epochs=2, batch_size=min(args.batch_size, 8))
    else:
        train_classifier(epochs=args.epochs, batch_size=args.batch_size, lr=args.lr, patience=args.patience, seed=args.seed)


if __name__ == "__main__":
    main()
