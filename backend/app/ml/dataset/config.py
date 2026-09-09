import os
from typing import List
import app.config as config

# Directory Paths
DATASET_BASE_DIR = config.ML_SATELLITE_DATA_DIR
RAW_DIR = os.path.join(DATASET_BASE_DIR, "raw")
PROCESSED_DIR = os.path.join(DATASET_BASE_DIR, "processed")
MANIFEST_DIR = config.ML_MANIFEST_DIR
SAMPLES_DIR = config.ML_SAMPLES_DIR
SCRIPTS_DIR = os.path.join(DATASET_BASE_DIR, "scripts")
REPORTS_DIR = config.ML_REPORTS_DIR

# Main Manifest Paths
MAIN_MANIFEST_PATH = os.path.join(MANIFEST_DIR, "dataset_manifest.csv")
TRAIN_MANIFEST_PATH = os.path.join(MANIFEST_DIR, "train.csv")
VAL_MANIFEST_PATH = os.path.join(MANIFEST_DIR, "validation.csv")
TEST_MANIFEST_PATH = os.path.join(MANIFEST_DIR, "test.csv")

# Reports Paths
QUALITY_REPORT_JSON = os.path.join(REPORTS_DIR, "dataset_quality_report.json")
QUALITY_REPORT_MD = os.path.join(REPORTS_DIR, "dataset_quality_report.md")
BALANCE_REPORT_JSON = os.path.join(REPORTS_DIR, "dataset_balance_report.json")
BALANCE_REPORT_MD = os.path.join(REPORTS_DIR, "dataset_balance_report.md")
PHASE6B_AUDIT_REPORT_JSON = os.path.join(REPORTS_DIR, "phase6b_audit_report.json")
NORMALIZATION_STATS_JSON = os.path.join(REPORTS_DIR, "normalization_stats.json")
TEST_METRICS_JSON = os.path.join(REPORTS_DIR, "test_metrics.json")
CONFUSION_MATRIX_JSON = os.path.join(REPORTS_DIR, "confusion_matrix.json")
PHASE6C_EVALUATION_REPORT_MD = os.path.join(REPORTS_DIR, "phase6c_evaluation_report.md")
TRAINING_HISTORY_JSON = os.path.join(REPORTS_DIR, "training_history.json")

# Model Paths
MODEL_DIR = os.path.join(config.BACKEND_DIR, "app", "ml", "models")
BEST_MODEL_PATH = os.path.join(MODEL_DIR, "satellite_classifier_best.pth")
MODEL_METADATA_PATH = os.path.join(MODEL_DIR, "satellite_classifier_metadata.json")

# Target Counts (configurable via environment variables)
TARGET_WILDFIRE = config.SATELLITE_DATASET_TARGET_WILDFIRE
TARGET_INDUSTRIAL = config.SATELLITE_DATASET_TARGET_INDUSTRIAL
TARGET_NON_FIRE = config.SATELLITE_DATASET_TARGET_NON_FIRE

# Filtering and Thresholds
INDUSTRIAL_CANDIDATE_RADIUS_KM = config.INDUSTRIAL_CANDIDATE_RADIUS_KM
MIN_FIRMS_CONFIDENCE = config.MIN_FIRMS_CONFIDENCE
MIN_FRP = config.MIN_FRP
MAX_CLOUD_FOR_TRAINING = config.MAX_CLOUD_FOR_TRAINING

# Image & Multispectral Specifications
ML_PATCH_SIZE = config.ML_PATCH_SIZE
ML_PATCH_RADIUS_KM = config.ML_PATCH_RADIUS_KM
MULTISPECTRAL_BANDS: List[str] = ["B02", "B03", "B04", "B08", "B11", "B12"]
BANDS_STR = ",".join(MULTISPECTRAL_BANDS)

# Class Mapping (Phase 6C: 0=WILDFIRE, 1=INDUSTRIAL_FIRE, 2=NON_FIRE)
CLASS_TO_ID = {
    "WILDFIRE": 0,
    "INDUSTRIAL_FIRE": 1,
    "NON_FIRE": 2
}
ID_TO_CLASS = {0: "WILDFIRE", 1: "INDUSTRIAL_FIRE", 2: "NON_FIRE"}
NUM_CLASSES = 3

# Allowed Vocabulary
ALLOWED_LABELS = {"WILDFIRE", "INDUSTRIAL_FIRE", "NON_FIRE"}
ALLOWED_LABEL_TYPES = {"GROUND_TRUTH", "SOURCE_LABEL", "WEAK_LABEL", "MANUAL_REVIEW"}
ALLOWED_QUALITIES = {"GOOD", "ACCEPTABLE", "REJECT", "UNAVAILABLE"}

# Cloud Quality Classification for ML Candidates
def get_ml_cloud_quality(cloud_cover: float) -> str:
    if cloud_cover < 30.0:
        return "GOOD"
    elif cloud_cover <= MAX_CLOUD_FOR_TRAINING:
        return "ACCEPTABLE"
    else:
        return "REJECT"

