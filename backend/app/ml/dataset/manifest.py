import os
import csv
import logging
from dataclasses import dataclass, asdict, field
from typing import List, Dict, Any, Optional, Set

from app.ml.dataset.config import (
    MAIN_MANIFEST_PATH,
    ALLOWED_LABELS,
    ALLOWED_LABEL_TYPES,
    ALLOWED_QUALITIES,
    BANDS_STR
)

logger = logging.getLogger("dataset_manifest")

MANIFEST_HEADER = [
    "sample_id",
    "label",
    "source_dataset",
    "label_type",
    "latitude",
    "longitude",
    "acquisition_time",
    "firms_observation_id",
    "cloud_cover",
    "industrial_distance_km",
    "osm_industrial_type",
    "bands",
    "image_path",
    "quality",
    "notes"
]


@dataclass
class ManifestEntry:
    sample_id: str
    label: str
    source_dataset: str
    label_type: str
    latitude: float
    longitude: float
    acquisition_time: str
    firms_observation_id: str = ""
    cloud_cover: float = 0.0
    industrial_distance_km: Optional[float] = None
    osm_industrial_type: Optional[str] = ""
    bands: str = BANDS_STR
    image_path: str = ""
    quality: str = "GOOD"
    notes: str = ""

    def validate(self) -> List[str]:
        errors: List[str] = []
        if not self.sample_id:
            errors.append("Missing sample_id")
        if self.label not in ALLOWED_LABELS:
            errors.append(f"Invalid label '{self.label}'. Allowed: {sorted(ALLOWED_LABELS)}")
        if self.label_type not in ALLOWED_LABEL_TYPES:
            errors.append(f"Invalid label_type '{self.label_type}'. Allowed: {sorted(ALLOWED_LABEL_TYPES)}")
        if not (-90.0 <= float(self.latitude) <= 90.0):
            errors.append(f"Latitude {self.latitude} out of bounds [-90, 90]")
        if not (-180.0 <= float(self.longitude) <= 180.0):
            errors.append(f"Longitude {self.longitude} out of bounds [-180, 180]")
        if not (0.0 <= float(self.cloud_cover) <= 100.0):
            errors.append(f"Cloud cover {self.cloud_cover} out of bounds [0, 100]")
        if self.quality not in ALLOWED_QUALITIES:
            errors.append(f"Invalid quality '{self.quality}'. Allowed: {sorted(ALLOWED_QUALITIES)}")
        return errors

    def to_dict(self) -> Dict[str, Any]:
        return {
            "sample_id": self.sample_id,
            "label": self.label,
            "source_dataset": self.source_dataset,
            "label_type": self.label_type,
            "latitude": round(float(self.latitude), 6),
            "longitude": round(float(self.longitude), 6),
            "acquisition_time": str(self.acquisition_time),
            "firms_observation_id": str(self.firms_observation_id or ""),
            "cloud_cover": round(float(self.cloud_cover), 2),
            "industrial_distance_km": round(float(self.industrial_distance_km), 2) if self.industrial_distance_km is not None and str(self.industrial_distance_km) != "" else "",
            "osm_industrial_type": str(self.osm_industrial_type or ""),
            "bands": str(self.bands or BANDS_STR),
            "image_path": str(self.image_path or ""),
            "quality": str(self.quality or "GOOD"),
            "notes": str(self.notes or "")
        }

    @classmethod
    def from_dict(cls, row: Dict[str, Any]) -> "ManifestEntry":
        ind_dist = row.get("industrial_distance_km")
        if ind_dist is not None and str(ind_dist).strip() != "":
            try:
                ind_dist_val = float(ind_dist)
            except (ValueError, TypeError):
                ind_dist_val = None
        else:
            ind_dist_val = None

        return cls(
            sample_id=str(row.get("sample_id", "")).strip(),
            label=str(row.get("label", "")).strip(),
            source_dataset=str(row.get("source_dataset", "")).strip(),
            label_type=str(row.get("label_type", "")).strip(),
            latitude=float(row.get("latitude", 0.0)),
            longitude=float(row.get("longitude", 0.0)),
            acquisition_time=str(row.get("acquisition_time", "")).strip(),
            firms_observation_id=str(row.get("firms_observation_id", "")).strip(),
            cloud_cover=float(row.get("cloud_cover", 0.0)),
            industrial_distance_km=ind_dist_val,
            osm_industrial_type=str(row.get("osm_industrial_type", "")).strip(),
            bands=str(row.get("bands", BANDS_STR)).strip(),
            image_path=str(row.get("image_path", "")).strip(),
            quality=str(row.get("quality", "GOOD")).strip(),
            notes=str(row.get("notes", "")).strip()
        )


class ManifestManager:
    @staticmethod
    def load_manifest(manifest_path: str = MAIN_MANIFEST_PATH) -> List[ManifestEntry]:
        if not os.path.exists(manifest_path):
            return []
        entries: List[ManifestEntry] = []
        with open(manifest_path, mode="r", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row and row.get("sample_id"):
                    entries.append(ManifestEntry.from_dict(row))
        return entries

    @staticmethod
    def save_manifest(entries: List[ManifestEntry], manifest_path: str = MAIN_MANIFEST_PATH) -> None:
        os.makedirs(os.path.dirname(manifest_path), exist_ok=True)
        with open(manifest_path, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=MANIFEST_HEADER)
            writer.writeheader()
            for entry in entries:
                writer.writerow(entry.to_dict())
        logger.info(f"Saved {len(entries)} manifest entries to {manifest_path}")

    @staticmethod
    def append_or_update_entries(new_entries: List[ManifestEntry], manifest_path: str = MAIN_MANIFEST_PATH) -> List[ManifestEntry]:
        existing = ManifestManager.load_manifest(manifest_path)
        existing_map: Dict[str, ManifestEntry] = {e.sample_id: e for e in existing}

        for entry in new_entries:
            existing_map[entry.sample_id] = entry

        all_entries = list(existing_map.values())
        ManifestManager.save_manifest(all_entries, manifest_path)
        return all_entries
