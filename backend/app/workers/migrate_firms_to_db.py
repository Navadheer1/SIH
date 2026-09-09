import os
import sys
import json
import logging
from typing import Dict, Any

# Ensure project root & backend are in Python path
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import app.config as config
from app.db.database import get_session_factory, init_db, check_database_connectivity
from app.db.repositories import FirmsObservationRepository

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [migrate-firms] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("migrate_firms")


def migrate_firms_observations() -> Dict[str, Any]:
    """
    Migrate existing FIRMS observations from local JSON backup (data/processed/firms_observations.json)
    to Supabase PostgreSQL using `observation_id` for idempotency (ON CONFLICT DO NOTHING).

    Guarantees:
    - Never deletes or modifies the local JSON backup file.
    - Never logs or exposes database connection credentials or API keys.
    """
    logger.info("=" * 60)
    logger.info("Starting FIRMS Observation Migration to Supabase PostgreSQL")
    logger.info(f"  Source JSON File: {config.FIRMS_OBSERVATIONS_PATH}")
    logger.info("=" * 60)

    if not os.path.exists(config.FIRMS_OBSERVATIONS_PATH):
        logger.error(f"Source JSON file not found at: {config.FIRMS_OBSERVATIONS_PATH}")
        return {
            "success": False,
            "error": f"File not found: {config.FIRMS_OBSERVATIONS_PATH}",
            "records_read": 0,
            "records_inserted": 0,
            "duplicates_skipped": 0,
            "failures": 0,
        }

    # Verify database connectivity
    db_status = check_database_connectivity()
    if db_status["status"] != "CONNECTED":
        logger.error(f"Database connection failed: status={db_status['status']}, error={db_status.get('error_category')}")
        return {
            "success": False,
            "error": f"Database not connected ({db_status['status']})",
            "records_read": 0,
            "records_inserted": 0,
            "duplicates_skipped": 0,
            "failures": 0,
        }

    # Ensure tables exist
    init_db()

    try:
        with open(config.FIRMS_OBSERVATIONS_PATH, "r", encoding="utf-8") as f:
            observations = json.load(f)
            if not isinstance(observations, list):
                logger.error("Source JSON does not contain a valid JSON array of observations.")
                return {
                    "success": False,
                    "error": "Invalid JSON format (expected list)",
                    "records_read": 0,
                    "records_inserted": 0,
                    "duplicates_skipped": 0,
                    "failures": 0,
                }
    except Exception as e:
        logger.error(f"Failed to read local JSON file: {e}")
        return {
            "success": False,
            "error": str(e),
            "records_read": 0,
            "records_inserted": 0,
            "duplicates_skipped": 0,
            "failures": 0,
        }

    records_read = len(observations)
    logger.info(f"Read {records_read} observations from {config.FIRMS_OBSERVATIONS_PATH}")

    session_factory = get_session_factory()
    db = session_factory()
    try:
        res = FirmsObservationRepository.insert_observations(db, observations)
        inserted_count = res["inserted"]
        duplicates_skipped = res["duplicates"]
        failures = max(0, records_read - (inserted_count + duplicates_skipped))

        logger.info("=" * 60)
        logger.info("Migration Summary:")
        logger.info(f"  Records Read:        {records_read}")
        logger.info(f"  Records Inserted:    {inserted_count}")
        logger.info(f"  Duplicates Skipped:  {duplicates_skipped}")
        logger.info(f"  Failures:            {failures}")
        logger.info(f"  JSON Backup Status:  PRESERVED ({config.FIRMS_OBSERVATIONS_PATH})")
        logger.info("=" * 60)

        return {
            "success": True,
            "records_read": records_read,
            "records_inserted": inserted_count,
            "duplicates_skipped": duplicates_skipped,
            "failures": failures,
        }
    except Exception as ex:
        db.rollback()
        logger.error(f"Database migration failed: {ex}")
        return {
            "success": False,
            "error": str(ex),
            "records_read": records_read,
            "records_inserted": 0,
            "duplicates_skipped": 0,
            "failures": records_read,
        }
    finally:
        db.close()


def main():
    result = migrate_firms_observations()
    if not result.get("success"):
        sys.exit(1)


if __name__ == "__main__":
    main()
