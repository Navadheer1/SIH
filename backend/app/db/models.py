import os
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Float,
    DateTime,
    Integer,
    BigInteger,
    Boolean,
    Index,
    func,
)
from app.db.database import Base


class FirmsObservation(Base):
    """
    Persistent SQLAlchemy model representing a standardized NASA FIRMS active fire hotspot observation.
    """
    __tablename__ = "firms_observations"

    observation_id = Column(String, primary_key=True, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    brightness = Column(Float, nullable=True)
    confidence = Column(Float, nullable=True)
    frp = Column(Float, nullable=True)
    acquired_at = Column(DateTime(timezone=True), nullable=False)
    satellite = Column(String, nullable=True)
    instrument = Column(String, nullable=True)
    ingested_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    source = Column(String, default="NASA FIRMS")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_firms_acquired_at", acquired_at.desc()),
        Index("idx_firms_location", latitude, longitude),
        Index("idx_firms_satellite", satellite),
        Index("idx_firms_instrument", instrument),
    )

    def to_dict(self) -> dict:
        """
        Serialize model into standardized JSON dictionary matching Phase 2/3A schema.
        """
        acq_str = ""
        if self.acquired_at:
            acq_dt = self.acquired_at if self.acquired_at.tzinfo else self.acquired_at.replace(tzinfo=timezone.utc)
            acq_str = acq_dt.strftime("%Y-%m-%d %H:%M UTC")

        ingest_str = ""
        if self.ingested_at:
            ing_dt = self.ingested_at if self.ingested_at.tzinfo else self.ingested_at.replace(tzinfo=timezone.utc)
            ingest_str = ing_dt.isoformat()

        # Format confidence back to string or numeric
        conf_val = self.confidence
        if conf_val is not None:
            if conf_val == 100.0:
                conf_formatted = "h"
            elif conf_val == 60.0:
                conf_formatted = "n"
            elif conf_val == 20.0:
                conf_formatted = "l"
            else:
                conf_formatted = round(conf_val, 1)
        else:
            conf_formatted = "N/A"

        return {
            "observation_id": self.observation_id,
            "latitude": round(float(self.latitude), 5),
            "longitude": round(float(self.longitude), 5),
            "brightness": round(float(self.brightness), 2) if self.brightness is not None else 0.0,
            "confidence": conf_formatted,
            "frp": round(float(self.frp), 2) if self.frp is not None else 0.0,
            "acquired_at": acq_str,
            "satellite": self.satellite or "VIIRS",
            "instrument": self.instrument or "VIIRS",
            "source": self.source or "NASA FIRMS",
            "ingested_at": ingest_str,
        }


class FirmsIngestionRun(Base):
    """
    SQLAlchemy model recording execution history and metrics for every NASA FIRMS ingestion cycle.
    """
    __tablename__ = "firms_ingestion_runs"

    id = Column(Integer().with_variant(BigInteger, "postgresql"), primary_key=True, autoincrement=True)
    started_at = Column(DateTime(timezone=True), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, nullable=False)
    received_count = Column(Integer, default=0)
    inserted_count = Column(Integer, default=0)
    duplicate_count = Column(Integer, default=0)
    region = Column(String, nullable=True)
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "status": self.status,
            "received_count": self.received_count,
            "inserted_count": self.inserted_count,
            "duplicate_count": self.duplicate_count,
            "region": self.region,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class SatelliteEvidenceRecord(Base):
    """
    SQLAlchemy model recording genuine Copernicus Sentinel-2 satellite imagery evidence metadata,
    linked to FIRMS active fire observations.
    """
    __tablename__ = "satellite_evidence"

    id = Column(Integer().with_variant(BigInteger, "postgresql"), primary_key=True, autoincrement=True)
    observation_id = Column(String, index=True, nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    provider = Column(String, default="Copernicus Sentinel Hub")
    product = Column(String, default="Sentinel-2 L2A")
    firms_acquired_at = Column(DateTime(timezone=True), nullable=True)
    satellite_acquired_at = Column(DateTime(timezone=True), nullable=True)
    retrieved_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    cloud_percentage = Column(Float, nullable=True)
    bbox = Column(String, nullable=True)
    true_color_path = Column(String, nullable=True)
    false_color_path = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    status = Column(String, default="AVAILABLE")
    is_synthetic = Column(Boolean, default=False, nullable=False)
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_sat_obs_id", observation_id),
        Index("idx_sat_acquired_at", satellite_acquired_at.desc()),
        Index("idx_sat_coords", latitude, longitude),
    )

    def to_dict(self) -> dict:
        sat_acq_str = None
        if self.satellite_acquired_at:
            sat_dt = self.satellite_acquired_at if self.satellite_acquired_at.tzinfo else self.satellite_acquired_at.replace(tzinfo=timezone.utc)
            sat_acq_str = sat_dt.strftime("%Y-%m-%d %H:%M:%S UTC")

        firms_acq_str = None
        if self.firms_acquired_at:
            f_dt = self.firms_acquired_at if self.firms_acquired_at.tzinfo else self.firms_acquired_at.replace(tzinfo=timezone.utc)
            firms_acq_str = f_dt.strftime("%Y-%m-%d %H:%M UTC")

        retrieved_str = None
        if self.retrieved_at:
            r_dt = self.retrieved_at if self.retrieved_at.tzinfo else self.retrieved_at.replace(tzinfo=timezone.utc)
            retrieved_str = r_dt.isoformat()

        bbox_list = None
        if self.bbox:
            try:
                bbox_list = [float(x.strip()) for x in self.bbox.split(",")]
            except Exception:
                bbox_list = None

        time_diff = None
        if self.firms_acquired_at and self.satellite_acquired_at:
            try:
                time_diff = round(abs((self.firms_acquired_at - self.satellite_acquired_at).total_seconds()) / 3600.0, 2)
            except Exception:
                time_diff = None

        return {
            "id": self.id,
            "observation_id": self.observation_id,
            "available": self.status in ("AVAILABLE", "ACQUISITION_AVAILABLE", "ACQUISITION_AVAILABLE_HIGH_CLOUD"),
            "is_synthetic": bool(self.is_synthetic),
            "source": self.provider or "Copernicus Sentinel-2",
            "product": self.product or "Sentinel-2 L2A",
            "latitude": round(float(self.latitude), 5),
            "longitude": round(float(self.longitude), 5),
            "firms_acquired_at": firms_acq_str,
            "satellite_acquired_at": sat_acq_str,
            "retrieved_at": retrieved_str,
            "cloud_percentage": round(float(self.cloud_percentage), 2) if self.cloud_percentage is not None else None,
            "time_difference_hours": time_diff,
            "bounding_box": bbox_list,
            "image_url": self.image_url,
            "true_color_available": bool(self.true_color_path and os.path.exists(self.true_color_path)),
            "false_color_available": bool(self.false_color_path and os.path.exists(self.false_color_path)),
            "status": self.status,
            "error_message": self.error_message,
        }


class IncidentStateRecord(Base):
    """
    SQLAlchemy model storing the latest persistent operational lifecycle state of an incident.
    """
    __tablename__ = "incident_state_records"

    observation_id = Column(String, primary_key=True, index=True)
    status = Column(String, default="NEW", nullable=False)
    priority_level = Column(String, default="LOW", nullable=False)
    priority_index = Column(String, default="P4", nullable=False)
    assigned_agency = Column(String, nullable=True)
    last_updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_updated_by = Column(String, default="System", nullable=False)
    total_actions_count = Column(Integer, default=0, nullable=False)

    __table_args__ = (
        Index("idx_incident_status", status),
        Index("idx_incident_priority", priority_level),
        Index("idx_incident_last_updated", last_updated_at.desc()),
    )

    def to_dict(self) -> dict:
        upd_str = None
        if self.last_updated_at:
            dt = self.last_updated_at if self.last_updated_at.tzinfo else self.last_updated_at.replace(tzinfo=timezone.utc)
            upd_str = dt.isoformat()

        return {
            "observation_id": self.observation_id,
            "status": self.status,
            "priority_level": self.priority_level,
            "priority_index": self.priority_index,
            "assigned_agency": self.assigned_agency,
            "last_updated_at": upd_str or datetime.now(timezone.utc).isoformat(),
            "last_updated_by": self.last_updated_by,
            "total_actions_count": int(self.total_actions_count or 0),
        }


class IncidentAuditLog(Base):
    """
    SQLAlchemy model recording every operator triage action and automated pipeline milestone.
    """
    __tablename__ = "incident_audit_logs"

    id = Column(Integer().with_variant(BigInteger, "postgresql"), primary_key=True, autoincrement=True)
    audit_id = Column(String, unique=True, index=True, nullable=False)
    observation_id = Column(String, index=True, nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    actor = Column(String, default="Operator", nullable=False)
    actor_type = Column(String, default="HUMAN_DISPATCHER", nullable=False)
    action = Column(String, nullable=False)
    previous_status = Column(String, nullable=True)
    new_status = Column(String, nullable=False)
    target_agency = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    metadata_json = Column(String, nullable=True)

    __table_args__ = (
        Index("idx_audit_obs_id", observation_id),
        Index("idx_audit_timestamp", timestamp.desc()),
    )

    def to_dict(self) -> dict:
        ts_str = None
        if self.timestamp:
            dt = self.timestamp if self.timestamp.tzinfo else self.timestamp.replace(tzinfo=timezone.utc)
            ts_str = dt.isoformat()

        meta_dict = {}
        if self.metadata_json:
            try:
                import json
                meta_dict = json.loads(self.metadata_json)
            except Exception:
                meta_dict = {}

        return {
            "id": self.audit_id or f"AUDIT-{self.id}",
            "observation_id": self.observation_id,
            "timestamp": ts_str or datetime.now(timezone.utc).isoformat(),
            "actor": self.actor,
            "actor_type": self.actor_type,
            "action": self.action,
            "previous_status": self.previous_status,
            "new_status": self.new_status,
            "target_agency": self.target_agency,
            "notes": self.notes,
            "metadata": meta_dict,
        }

