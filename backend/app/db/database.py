import os
import time
import logging
from typing import Generator, Optional, Dict, Any
from urllib.parse import urlparse
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from sqlalchemy.pool import StaticPool

import app.config as config

logger = logging.getLogger("sih_db")

Base = declarative_base()

_engine = None
_SessionLocal = None


def normalize_database_url(raw_url: Optional[str] = None) -> str:
    """
    Normalize and sanitize the database URL for SQLAlchemy 2.0 with psycopg v3.
    Ensures zero secret leakage in logs and handles driver prefixes.
    """
    raw = raw_url if raw_url is not None else config.DATABASE_URL
    if not raw or not isinstance(raw, str):
        return ""
    url = raw.strip()
    if not url:
        return ""

    # Fix accidental double schemes (e.g. postgresql:postgresql:// or postgres:postgres://)
    if url.startswith("postgresql:postgresql://"):
        url = url.replace("postgresql:postgresql://", "postgresql://", 1)
    elif url.startswith("postgres:postgres://"):
        url = url.replace("postgres:postgres://", "postgres://", 1)

    # Convert postgres:// or postgresql:// to postgresql+psycopg://
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)

    # Automatic fallback for IPv4 environments if direct Supabase domain without pooler is given
    if "db.agxtdttgjdtduyxeijcv.supabase.co" in url and "pooler.supabase.com" not in url:
        url = url.replace("postgres:", "postgres.agxtdttgjdtduyxeijcv:")
        url = url.replace("db.agxtdttgjdtduyxeijcv.supabase.co:5432", "aws-0-ap-southeast-1.pooler.supabase.com:5432")

    return url


def get_engine(db_url: Optional[str] = None):
    """
    Create or retrieve cached SQLAlchemy engine with connection pooling and health checks.
    """
    global _engine
    target_url = normalize_database_url(db_url)
    if not target_url:
        return None

    if _engine is not None and db_url is None:
        return _engine

    if target_url.startswith("sqlite"):
        engine = create_engine(
            target_url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool if ":memory:" in target_url else None
        )
    else:
        engine = create_engine(
            target_url,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
            pool_recycle=300,
            connect_args={"connect_timeout": 5}
        )

    if db_url is None:
        _engine = engine
    return engine


def get_session_factory(db_url: Optional[str] = None):
    """
    Create or retrieve cached sessionmaker factory.
    """
    global _SessionLocal
    engine = get_engine(db_url)
    if engine is None:
        return None

    if _SessionLocal is not None and db_url is None:
        return _SessionLocal

    factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    if db_url is None:
        _SessionLocal = factory
    return factory


from contextlib import contextmanager


@contextmanager
def get_db_context() -> Generator[Optional[Session], None, None]:
    """
    Context manager providing a database session with safe cleanup.
    """
    factory = get_session_factory()
    if factory is None:
        yield None
        return

    db = factory()
    try:
        yield db
    finally:
        db.close()


def get_db() -> Generator[Optional[Session], None, None]:
    """
    FastAPI dependency that yields a database session.
    Yields None if database is not configured or engine is unavailable.
    """
    factory = get_session_factory()
    if factory is None:
        yield None
        return

    db = factory()
    try:
        yield db
    finally:
        db.close()



def check_database_connectivity(timeout_seconds: float = 3.0) -> Dict[str, Any]:
    """
    Perform an isolated, timeout-protected connectivity check to the database.
    Never exposes database credentials, passwords, or connection URLs.
    """
    url = normalize_database_url()
    if not url:
        return {
            "status": "NOT_CONFIGURED",
            "configured": False,
            "latency_ms": None,
            "dialect": None,
            "error_category": None,
        }

    start_time = time.time()
    try:
        engine = get_engine()
        if engine is None:
            return {
                "status": "NOT_CONFIGURED",
                "configured": False,
                "latency_ms": None,
                "dialect": None,
                "error_category": "engine_creation_failed",
            }

        with engine.connect() as conn:
            conn.execute(text("SELECT 1")).scalar()
            elapsed_ms = round((time.time() - start_time) * 1000, 2)
            dialect_name = engine.dialect.name
            return {
                "status": "CONNECTED",
                "configured": True,
                "latency_ms": elapsed_ms,
                "dialect": dialect_name,
                "error_category": None,
            }
    except Exception as ex:
        elapsed_ms = round((time.time() - start_time) * 1000, 2)
        error_type = type(ex).__name__
        logger.warning(f"Database connectivity check failed after {elapsed_ms}ms: {error_type}")
        return {
            "status": "DISCONNECTED",
            "configured": True,
            "latency_ms": elapsed_ms,
            "dialect": None,
            "error_category": error_type,
        }


def init_db(engine_override=None):
    """
    Create all database tables and indexes if they do not exist.
    """
    engine = engine_override or get_engine()
    if engine is None:
        logger.info("Database engine not configured; skipping DDL initialization.")
        return

    from app.db import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables and indexes initialized successfully.")
