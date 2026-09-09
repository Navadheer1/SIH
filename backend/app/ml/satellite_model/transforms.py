import random
import torch
from typing import Optional, List, Dict, Any


class MultispectralTransform:
    """
    Multispectral conservative tensor transformation pipeline.
    Performs tensor augmentation (flips and 90-degree rotations for train)
    and channel-wise dataset normalization without altering physical inter-band ratios.
    """

    def __init__(
        self,
        is_train: bool = False,
        mean: Optional[List[float]] = None,
        std: Optional[List[float]] = None
    ):
        self.is_train = is_train
        self.mean = torch.tensor(mean, dtype=torch.float32).view(-1, 1, 1) if mean is not None else None
        self.std = torch.tensor(std, dtype=torch.float32).view(-1, 1, 1) if std is not None else None

    def __call__(self, tensor: torch.Tensor) -> torch.Tensor:
        """
        Input shape: [6, H, W] float32 tensor
        """
        # 1. Clean NaNs or Infs
        tensor = torch.nan_to_num(tensor, nan=0.0, posinf=1.0, neginf=0.0)

        # 2. Geometric augmentations (train only)
        if self.is_train:
            # Horizontal flip
            if random.random() > 0.5:
                tensor = torch.flip(tensor, dims=[2])
            # Vertical flip
            if random.random() > 0.5:
                tensor = torch.flip(tensor, dims=[1])
            # Random 90 degree rotation
            k = random.randint(0, 3)
            if k > 0:
                tensor = torch.rot90(tensor, k=k, dims=[1, 2])

        # 3. Channel-wise Normalization using training statistics
        if self.mean is not None and self.std is not None:
            tensor = (tensor - self.mean) / (self.std + 1e-6)

        return tensor
