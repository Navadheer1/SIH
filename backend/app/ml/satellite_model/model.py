import torch
import torch.nn as nn
from typing import Dict, Any

from app.ml.satellite_model.config import NUM_CHANNELS, NUM_CLASSES


class MultispectralCNN(nn.Module):
    """
    6-Band Sentinel-2 Multispectral Convolutional Neural Network Baseline.
    Processes [B, 6, H, W] tensor input (B02, B03, B04, B08, B11, B12) and outputs
    classification logits for [WILDFIRE, INDUSTRIAL_FIRE, NON_FIRE].
    """

    def __init__(self, in_channels: int = NUM_CHANNELS, num_classes: int = NUM_CLASSES, dropout_rate: float = 0.3):
        super(MultispectralCNN, self).__init__()
        
        self.in_channels = in_channels
        self.num_classes = num_classes

        # Feature Extractor Blocks
        self.block1 = nn.Sequential(
            nn.Conv2d(in_channels, 32, kernel_size=3, stride=1, padding=1, bias=False),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=2, stride=2)  # 128 -> 64
        )

        self.block2 = nn.Sequential(
            nn.Conv2d(32, 64, kernel_size=3, stride=1, padding=1, bias=False),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=2, stride=2)  # 64 -> 32
        )

        self.block3 = nn.Sequential(
            nn.Conv2d(64, 128, kernel_size=3, stride=1, padding=1, bias=False),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True)
        )

        # Classification Head
        self.pool = nn.AdaptiveAvgPool2d((1, 1))
        self.dropout = nn.Dropout(p=dropout_rate)
        self.classifier = nn.Linear(128, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass.
        Input x: [B, 6, H, W]
        Returns logits: [B, num_classes]
        """
        x = self.block1(x)
        x = self.block2(x)
        x = self.block3(x)
        x = self.pool(x)
        x = torch.flatten(x, 1)
        x = self.dropout(x)
        logits = self.classifier(x)
        return logits


def get_model(in_channels: int = NUM_CHANNELS, num_classes: int = NUM_CLASSES) -> MultispectralCNN:
    """
    Model constructor helper.
    """
    return MultispectralCNN(in_channels=in_channels, num_classes=num_classes)
