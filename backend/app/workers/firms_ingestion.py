import os
import sys
import time
import signal
import asyncio
import logging
import argparse
from datetime import datetime, timezone

# Ensure project root & backend are in Python path
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import app.config as config
from app.services.firms_ingestion_service import (
    run_firms_ingestion_cycle,
    get_firms_ingestion_status,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [firms-worker] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logger = logging.getLogger("firms_worker")


class FirmsIngestionWorker:
    """
    Dedicated worker to manage automated Near-Real-Time ingestion
    from NASA FIRMS into local storage on a configurable schedule.
    """

    def __init__(self, interval_minutes: int = 10, region: str = "india"):
        self.interval_minutes = interval_minutes
        self.interval_seconds = interval_minutes * 60
        self.region = region
        self.is_running = False
        self._stop_event = asyncio.Event()

    def stop(self, signum=None, frame=None):
        """Signal handler to trigger graceful shutdown."""
        sig_name = signal.Signals(signum).name if signum else "USER"
        logger.info(f"Received shutdown signal ({sig_name}). Stopping worker gracefully...")
        self.is_running = False
        self._stop_event.set()

    async def run_once(self) -> dict:
        """Execute a single ingestion cycle."""
        logger.info(f"Starting FIRMS ingestion cycle for region='{self.region}'...")
        result = await run_firms_ingestion_cycle(region=self.region)
        status = result.get("status")
        if status == "HEALTHY":
            logger.info(
                f"Cycle SUCCESS: received={result.get('records_received')}, "
                f"inserted={result.get('records_inserted')}, "
                f"duplicates_skipped={result.get('duplicates_skipped')}, "
                f"total_stored={result.get('total_stored_records')}"
            )
        else:
            logger.warning(
                f"Cycle {status}: error_category={result.get('error_category')}, "
                f"msg={result.get('error_message')}"
            )
        return result

    async def run_daemon(self):
        """Main worker daemon loop."""
        self.is_running = True
        self._stop_event.clear()

        logger.info("=" * 60)
        logger.info("Starting NASA FIRMS Ingestion Daemon Worker")
        logger.info(f"  Target Region:     {self.region}")
        logger.info(f"  Polling Interval:  {self.interval_minutes} minutes ({self.interval_seconds}s)")
        logger.info(f"  MAP_KEY Config:    {'CONFIGURED' if config.NASA_FIRMS_MAP_KEY else 'NOT_CONFIGURED (public feeds)'}")
        logger.info(f"  Storage Target:    {config.FIRMS_OBSERVATIONS_PATH}")
        logger.info("=" * 60)

        # Run immediately upon start
        await self.run_once()

        while self.is_running:
            logger.info(f"Sleeping for {self.interval_minutes} minutes until next cycle...")
            try:
                # Wait for interval or until stop event is set
                await asyncio.wait_for(self._stop_event.wait(), timeout=self.interval_seconds)
                # If _stop_event was set, exit loop
                break
            except asyncio.TimeoutError:
                # Timeout reached: run next cycle
                if self.is_running:
                    await self.run_once()

        logger.info("NASA FIRMS Ingestion Worker has stopped.")


def main():
    parser = argparse.ArgumentParser(description="NASA FIRMS Automatic Ingestion Worker")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single ingestion cycle and exit immediately"
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=config.FIRMS_INGEST_INTERVAL_MINUTES,
        help="Polling interval in minutes (default from FIRMS_INGEST_INTERVAL_MINUTES or 10)"
    )
    parser.add_argument(
        "--region",
        type=str,
        default="india",
        help="Geographic region to ingest (default: 'india')"
    )

    args = parser.parse_args()
    worker = FirmsIngestionWorker(interval_minutes=args.interval, region=args.region)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    # Attach signal handlers for graceful shutdown (Unix/macOS)
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, lambda s=sig: worker.stop(signum=s))
        except NotImplementedError:
            # For environments without loop signal handlers (e.g. Windows)
            signal.signal(sig, worker.stop)

    try:
        if args.once:
            loop.run_until_complete(worker.run_once())
        else:
            loop.run_until_complete(worker.run_daemon())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Interrupted. Exiting.")
    finally:
        loop.close()


if __name__ == "__main__":
    main()
