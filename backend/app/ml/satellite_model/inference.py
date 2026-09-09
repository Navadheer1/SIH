import os
import json
import logging
import numpy as np
import torch
from typing import Dict, Any, Union, List, Optional

from app.ml.satellite_model.config import (
    CLASS_NAMES,
    ID_TO_CLASS,
    INPUT_BANDS,
    BEST_MODEL_PATH,
    MODEL_METADATA_PATH,
    NORMALIZATION_STATS_PATH,
    get_device
)
from app.ml.satellite_model.model import get_model, MultispectralCNN
from app.ml.satellite_model.transforms import MultispectralTransform
from app.ml.dataset.patch_generator import load_multispectral_patch

logger = logging.getLogger("satellite_inference")


class SatelliteInferenceEngine:
    """
    Inference Engine for 6-band Sentinel-2 Optical Classification.
    Provides fast, deterministic inference on multispectral imagery.
    """

    def __init__(
        self,
        checkpoint_path: str = BEST_MODEL_PATH,
        metadata_path: str = MODEL_METADATA_PATH,
        stats_path: str = NORMALIZATION_STATS_PATH,
        device: Optional[torch.device] = None
    ):
        self.checkpoint_path = checkpoint_path
        self.metadata_path = metadata_path
        self.stats_path = stats_path
        self.device = device or get_device()
        self.model: Optional[MultispectralCNN] = None
        self.metadata: Dict[str, Any] = {}
        self.transform: Optional[MultispectralTransform] = None

        self._initialize()

    def _initialize(self) -> None:
        # 1. Load Metadata
        if os.path.exists(self.metadata_path):
            try:
                with open(self.metadata_path, "r", encoding="utf-8") as f:
                    self.metadata = json.load(f)
            except Exception as e:
                logger.warning(f"Could not load metadata from {self.metadata_path}: {e}")

        # 2. Load Normalization Stats
        mean = None
        std = None
        if os.path.exists(self.stats_path):
            try:
                with open(self.stats_path, "r", encoding="utf-8") as f:
                    stats = json.load(f)
                    mean = stats.get("mean")
                    std = stats.get("std")
            except Exception as e:
                logger.warning(f"Could not load normalization stats from {self.stats_path}: {e}")

        self.transform = MultispectralTransform(is_train=False, mean=mean, std=std)

        # 3. Load Model Checkpoint
        if os.path.exists(self.checkpoint_path):
            try:
                model = get_model()
                state = torch.load(self.checkpoint_path, map_location=self.device, weights_only=True)
                model.load_state_dict(state)
                model.to(self.device)
                model.eval()
                self.model = model
                logger.info(f"Loaded satellite classifier model from {self.checkpoint_path}")
            except Exception as e:
                logger.error(f"Failed to load checkpoint {self.checkpoint_path}: {e}")
                self.model = None
        else:
            logger.warning(f"Model checkpoint not found at {self.checkpoint_path}. Inference engine uninitialized.")

    def is_ready(self) -> bool:
        return self.model is not None

    def predict(
        self,
        input_data: Union[str, Dict[str, np.ndarray], torch.Tensor]
    ) -> Dict[str, Any]:
        """
        Predict candidate classification for multispectral Sentinel-2 data.
        Input can be:
          - file path to .npz patch file
          - dictionary mapping band names ('B02', 'B03', 'B04', 'B08', 'B11', 'B12') to 2D numpy arrays
          - PyTorch Tensor of shape [6, H, W] or [1, 6, H, W]
        """
        if self.model is None:
            # Fallback heuristic if model checkpoint has not been trained yet
            return {
                "predicted_class": "NON_FIRE",
                "predicted_class_id": 2,
                "class_probabilities": {"WILDFIRE": 0.0, "INDUSTRIAL_FIRE": 0.0, "NON_FIRE": 1.0},
                "confidence": 1.0,
                "model_version": "uninitialized",
                "input_bands": INPUT_BANDS,
                "is_calibrated": False,
                "note": "Checkpoint unavailable; returning default neutral classification."
            }

        # 1. Format Tensor
        if isinstance(input_data, str):
            patch = load_multispectral_patch(input_data)
            band_arrays = [patch[b].astype(np.float32) for b in INPUT_BANDS]
            tensor = torch.from_numpy(np.stack(band_arrays, axis=0))
        elif isinstance(input_data, dict):
            band_arrays = [input_data[b].astype(np.float32) for b in INPUT_BANDS]
            tensor = torch.from_numpy(np.stack(band_arrays, axis=0))
        elif isinstance(input_data, torch.Tensor):
            tensor = input_data.float()
            if tensor.ndim == 4:
                tensor = tensor.squeeze(0)
        else:
            raise ValueError(f"Unsupported input data type: {type(input_data)}")

        # 2. Preprocess / Normalize
        if self.transform:
            tensor = self.transform(tensor)

        if tensor.ndim == 3:
            tensor = tensor.unsqueeze(0)  # Shape [1, 6, H, W]

        # 3. Model Forward Pass
        tensor = tensor.to(self.device)
        with torch.no_grad():
            logits = self.model(tensor)
            probs = torch.softmax(logits, dim=1).cpu().numpy()[0]
            pred_id = int(np.argmax(probs))

        pred_class = ID_TO_CLASS[pred_id]
        prob_dict = {
            CLASS_NAMES[i]: float(round(probs[i], 4)) for i in range(len(CLASS_NAMES))
        }

        return {
            "predicted_class": pred_class,
            "predicted_class_id": pred_id,
            "class_probabilities": prob_dict,
            "confidence": float(round(probs[pred_id], 4)),
            "model_version": self.metadata.get("model_version", "phase6c-v1.0"),
            "input_bands": INPUT_BANDS,
            "is_calibrated": False
        }


# Singleton engine instance
_engine_instance: Optional[SatelliteInferenceEngine] = None


def get_inference_engine() -> SatelliteInferenceEngine:
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = SatelliteInferenceEngine()
    return _engine_instance


def predict_multispectral(
    input_data: Union[str, Dict[str, np.ndarray], torch.Tensor]
) -> Dict[str, Any]:
    """
    Public helper for multispectral candidate prediction.
    """
    engine = get_inference_engine()
    return engine.predict(input_data)
