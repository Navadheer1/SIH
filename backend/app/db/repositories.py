import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.models import FirmsObservation, FirmsIngestionRun, SatelliteEvidenceRecord

logger = logging.getLogger("sih_repositories")


def parse_confidence_to_float(raw_conf: Any) -> Optional[float]:
    """
    Safely convert FIRMS confidence value ('n', 'h', 'l', 'nominal', 'high', 'low', or numeric)
    into a standard float representation for PostgreSQL double precision storage.
    """
    if raw_conf is None or raw_conf == "N/A":
        return None
    if isinstance(raw_conf, (int, float)):
        return float(raw_conf)

    s = str(raw_conf).strip().lower()
    if s in ("h", "high"):
        return 100.0
    if s in ("n", "nominal", "medium", "med"):
        return 60.0
    if s in ("l", "low"):
        return 20.0

    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def parse_datetime_utc(val: Any) -> Optional[datetime]:
    """
    Parse acquisition or ingestion timestamp into a timezone-aware UTC datetime.
    """
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    if not val or not isinstance(val, str):
        return None

    clean_str = val.strip()
    if clean_str.endswith(" UTC"):
        clean_str = clean_str[:-4].strip()
    if clean_str.endswith("Z"):
        clean_str = clean_str[:-1] + "+00:00"

    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(clean_str, fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    try:
        dt = datetime.fromisoformat(clean_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


class FirmsObservationRepository:
    """
    Repository for FIRMS observations providing idempotent insertion,
    spatial-temporal querying, and latest observation lookup.
    """

    @staticmethod
    def insert_observations(db: Session, observations: List[Dict[str, Any]]) -> Dict[str, int]:
        """
        Idempotently insert FIRMS observations using `observation_id` as the primary key.
        Duplicates are skipped with ON CONFLICT DO NOTHING (PostgreSQL) or lookup check.
        Returns: {'received': int, 'inserted': int, 'duplicates': int}
        """
        if not observations:
            return {"received": 0, "inserted": 0, "duplicates": 0}

        now_utc = datetime.now(timezone.utc)
        records_to_insert = []
        for obs in observations:
            obs_id = obs.get("observation_id")
            if not obs_id:
                continue

            acq_dt = parse_datetime_utc(obs.get("acquired_at"))
            if acq_dt is None:
                continue

            ing_dt = parse_datetime_utc(obs.get("ingested_at")) or now_utc
            conf_val = parse_confidence_to_float(obs.get("confidence"))

            records_to_insert.append({
                "observation_id": str(obs_id),
                "latitude": float(obs.get("latitude", 0.0)),
                "longitude": float(obs.get("longitude", 0.0)),
                "brightness": float(obs.get("brightness", 0.0)) if obs.get("brightness") is not None else None,
                "confidence": conf_val,
                "frp": float(obs.get("frp", 0.0)) if obs.get("frp") is not None else None,
                "acquired_at": acq_dt,
                "satellite": str(obs.get("satellite", "VIIRS")),
                "instrument": str(obs.get("instrument", "VIIRS")),
                "source": str(obs.get("source", "NASA FIRMS")),
                "ingested_at": ing_dt,
                "created_at": now_utc,
            })

        if not records_to_insert:
            return {"received": len(observations), "inserted": 0, "duplicates": 0}

        bind = db.get_bind()
        dialect_name = bind.dialect.name if bind else ""

        if dialect_name == "postgresql":
            # PostgreSQL ON CONFLICT DO NOTHING with RETURNING for exact counts
            stmt = pg_insert(FirmsObservation).values(records_to_insert)
            stmt = stmt.on_conflict_do_nothing(index_elements=["observation_id"]).returning(FirmsObservation.observation_id)
            inserted_ids = db.execute(stmt).scalars().all()
            inserted_count = len(inserted_ids)
            duplicate_count = len(records_to_insert) - inserted_count
            db.commit()
            return {
                "received": len(observations),
                "inserted": inserted_count,
                "duplicates": duplicate_count
            }
        else:
            # SQLite / Generic Fallback for unit testing
            ids = [r["observation_id"] for r in records_to_insert]
            existing_ids = {
                row[0] for row in db.query(FirmsObservation.observation_id).filter(
                    FirmsObservation.observation_id.in_(ids)
                ).all()
            }
            new_records = [r for r in records_to_insert if r["observation_id"] not in existing_ids]
            if new_records:
                db.bulk_insert_mappings(FirmsObservation, new_records)
            db.commit()
            return {
                "received": len(observations),
                "inserted": len(new_records),
                "duplicates": len(records_to_insert) - len(new_records)
            }

    @staticmethod
    def get_observations(
        db: Session,
        limit: int = 100,
        offset: int = 0,
        bbox: Optional[List[float]] = None
    ) -> List[FirmsObservation]:
        """
        Retrieve stored observations filtered by bounding box [min_lon, min_lat, max_lon, max_lat]
        ordered chronologically by acquired_at DESC.
        """
        query = db.query(FirmsObservation)
        if bbox and len(bbox) == 4:
            min_lon, min_lat, max_lon, max_lat = bbox
            query = query.filter(
                FirmsObservation.latitude >= min_lat,
                FirmsObservation.latitude <= max_lat,
                FirmsObservation.longitude >= min_lon,
                FirmsObservation.longitude <= max_lon,
            )

        return query.order_by(
            FirmsObservation.acquired_at.desc(),
            FirmsObservation.frp.desc()
        ).offset(offset).limit(limit).all()

    @staticmethod
    def get_latest_observation(db: Session) -> Optional[FirmsObservation]:
        """
        Get the chronologically newest observation using `acquired_at`.
        """
        return db.query(FirmsObservation).order_by(
            FirmsObservation.acquired_at.desc(),
            FirmsObservation.frp.desc()
        ).first()

    @staticmethod
    def count_observations(db: Session, bbox: Optional[List[float]] = None) -> int:
        """
        Count total stored observations matching bounding box filter.
        """
        query = db.query(func.count(FirmsObservation.observation_id))
        if bbox and len(bbox) == 4:
            min_lon, min_lat, max_lon, max_lat = bbox
            query = query.filter(
                FirmsObservation.latitude >= min_lat,
                FirmsObservation.latitude <= max_lat,
                FirmsObservation.longitude >= min_lon,
                FirmsObservation.longitude <= max_lon,
            )
        return query.scalar() or 0


class FirmsIngestionRunRepository:
    """
    Repository for managing audit history and metrics for FIRMS ingestion cycles.
    """

    @staticmethod
    def create_run(
        db: Session,
        started_at: datetime,
        status: str = "RUNNING",
        region: str = "india"
    ) -> FirmsIngestionRun:
        """Create a new ingestion run record."""
        run = FirmsIngestionRun(
            started_at=started_at,
            status=status,
            region=region,
            received_count=0,
            inserted_count=0,
            duplicate_count=0,
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        return run

    @staticmethod
    def complete_run(
        db: Session,
        run_id: int,
        completed_at: datetime,
        status: str,
        received_count: int,
        inserted_count: int,
        duplicate_count: int,
        error_message: Optional[str] = None
    ) -> Optional[FirmsIngestionRun]:
        """Update an existing ingestion run with completion status and metrics."""
        run = db.query(FirmsIngestionRun).filter(FirmsIngestionRun.id == run_id).first()
        if run:
            run.completed_at = completed_at
            run.status = status
            run.received_count = received_count
            run.inserted_count = inserted_count
            run.duplicate_count = duplicate_count
            run.error_message = error_message
            db.commit()
            db.refresh(run)
        return run

    @staticmethod
    def get_latest_run(db: Session) -> Optional[FirmsIngestionRun]:
        """Retrieve the most recent ingestion run."""
        return db.query(FirmsIngestionRun).order_by(FirmsIngestionRun.id.desc()).first()


class SatelliteEvidenceRepository:
    """
    Repository for managing persistent Sentinel-2 satellite imagery evidence records.
    """

    @staticmethod
    def get_by_observation_id(db: Session, observation_id: str) -> Optional[SatelliteEvidenceRecord]:
        """Fetch satellite evidence linked directly to a FIRMS observation ID."""
        if not observation_id:
            return None
        return db.query(SatelliteEvidenceRecord).filter(
            SatelliteEvidenceRecord.observation_id == observation_id
        ).order_by(SatelliteEvidenceRecord.id.desc()).first()

    @staticmethod
    def get_by_coords_and_time(
        db: Session,
        lat: float,
        lon: float,
        timestamp: Optional[datetime] = None,
        radius_deg: float = 0.02
    ) -> Optional[SatelliteEvidenceRecord]:
        """
        Fetch cached satellite evidence near specified coordinates.
        """
        query = db.query(SatelliteEvidenceRecord).filter(
            SatelliteEvidenceRecord.latitude >= lat - radius_deg,
            SatelliteEvidenceRecord.latitude <= lat + radius_deg,
            SatelliteEvidenceRecord.longitude >= lon - radius_deg,
            SatelliteEvidenceRecord.longitude <= lon + radius_deg,
        )
        return query.order_by(SatelliteEvidenceRecord.id.desc()).first()

    @staticmethod
    def save_evidence(db: Session, data: Dict[str, Any]) -> SatelliteEvidenceRecord:
        """
        Save or update a satellite evidence record.
        """
        obs_id = data.get("observation_id")
        existing = None
        if obs_id:
            existing = db.query(SatelliteEvidenceRecord).filter(
                SatelliteEvidenceRecord.observation_id == obs_id
            ).first()

        firms_dt = parse_datetime_utc(data.get("firms_acquired_at"))
        sat_dt = parse_datetime_utc(data.get("satellite_acquired_at"))
        ret_dt = parse_datetime_utc(data.get("retrieved_at")) or datetime.now(timezone.utc)

        bbox_raw = data.get("bbox")
        bbox_str = ",".join(map(str, bbox_raw)) if isinstance(bbox_raw, list) else str(bbox_raw or "")

        if existing:
            existing.latitude = float(data.get("latitude", existing.latitude))
            existing.longitude = float(data.get("longitude", existing.longitude))
            existing.provider = str(data.get("provider", existing.provider))
            existing.product = str(data.get("product", existing.product))
            existing.firms_acquired_at = firms_dt
            existing.satellite_acquired_at = sat_dt
            existing.retrieved_at = ret_dt
            existing.cloud_percentage = float(data.get("cloud_percentage", 0.0)) if data.get("cloud_percentage") is not None else None
            existing.bbox = bbox_str
            existing.true_color_path = data.get("true_color_path")
            existing.false_color_path = data.get("false_color_path")
            existing.image_url = data.get("image_url")
            existing.status = str(data.get("status", "AVAILABLE"))
            existing.is_synthetic = bool(data.get("is_synthetic", False))
            existing.error_message = data.get("error_message")
            db.commit()
            db.refresh(existing)
            return existing
        else:
            record = SatelliteEvidenceRecord(
                observation_id=obs_id,
                latitude=float(data.get("latitude", 0.0)),
                longitude=float(data.get("longitude", 0.0)),
                provider=str(data.get("provider", "Copernicus Sentinel Hub")),
                product=str(data.get("product", "Sentinel-2 L2A")),
                firms_acquired_at=firms_dt,
                satellite_acquired_at=sat_dt,
                retrieved_at=ret_dt,
                cloud_percentage=float(data.get("cloud_percentage", 0.0)) if data.get("cloud_percentage") is not None else None,
                bbox=bbox_str,
                true_color_path=data.get("true_color_path"),
                false_color_path=data.get("false_color_path"),
                image_url=data.get("image_url"),
                status=str(data.get("status", "AVAILABLE")),
                is_synthetic=bool(data.get("is_synthetic", False)),
                error_message=data.get("error_message"),
            )
            db.add(record)
            db.commit()
            db.refresh(record)
            return record
