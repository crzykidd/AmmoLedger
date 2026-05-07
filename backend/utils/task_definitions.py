import os
import sqlite3
from datetime import datetime
from pathlib import Path

from utils.logging import get_logger

logger = get_logger(__name__)

_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////data/ammoledger.db")
_BACKUP_PATH = os.getenv("BACKUP_PATH", "/data/backups")


def _db_path() -> Path:
    url = _DATABASE_URL
    if url.startswith("sqlite:///"):
        return Path(url[len("sqlite:///"):])
    return Path("/data/ammoledger.db")


# ---------------------------------------------------------------------------
# Task functions — each returns a dict of stats or raises on failure
# ---------------------------------------------------------------------------

def _backup_fn() -> dict:
    db_path = _db_path()
    backup_dir = Path(_BACKUP_PATH)
    backup_dir.mkdir(parents=True, exist_ok=True)

    if not db_path.is_file():
        raise RuntimeError(f"Database not found at {db_path}")

    ts = datetime.now().strftime("%Y-%m-%d_%H-%M")
    filename = f"ammoledger_{ts}.db"
    dest = backup_dir / filename
    try:
        src = sqlite3.connect(str(db_path))
        try:
            dst = sqlite3.connect(str(dest))
            try:
                src.backup(dst)
            finally:
                dst.close()
        finally:
            src.close()
    except (OSError, sqlite3.Error) as exc:
        logger.error("Scheduled backup failed: %s", exc)
        raise
    logger.info("Scheduled backup created: %s", filename)

    try:
        from database import engine  # noqa: PLC0415
        from sqlmodel import Session  # noqa: PLC0415
        from utils.config import set_setting  # noqa: PLC0415
        with Session(engine) as session:
            set_setting(session, "last_backup_at", datetime.now().isoformat())
            set_setting(session, "last_backup_file", filename)
            session.commit()
    except Exception as e:
        logger.warning("Failed to record last_backup_at: %s", e)

    return {"filename": filename}


def _cleanup_fn() -> dict:
    from utils.config import load_and_validate_config  # noqa: PLC0415
    config = load_and_validate_config()
    retention_days = int((config.get("backup") or {}).get("retention_days", 30))

    backup_dir = Path(_BACKUP_PATH)
    pruned = 0
    try:
        cutoff = datetime.now().timestamp() - retention_days * 86400
        for f in sorted(backup_dir.glob("ammoledger_*.db"), key=lambda x: x.stat().st_mtime):
            if "pre-import" in f.name:
                continue
            if f.stat().st_mtime < cutoff:
                f.unlink()
                pruned += 1
        if pruned:
            logger.info("Pruned %d old backup(s)", pruned)
    except Exception as e:
        logger.error("Backup cleanup failed: %s", e)
        raise

    return {"pruned": pruned, "retention_days": retention_days}


def _version_check_fn() -> dict:
    from database import engine  # noqa: PLC0415
    from sqlmodel import Session  # noqa: PLC0415
    from utils.version_check import run_full_check  # noqa: PLC0415

    with Session(engine) as db:
        return run_full_check(db, force=True)


def _community_sync_fn() -> dict:
    from database import engine  # noqa: PLC0415
    from sqlmodel import Session  # noqa: PLC0415
    from utils.community_sync import check_first_run, sync_all  # noqa: PLC0415

    with Session(engine) as session:
        first_run = check_first_run(session)
        results = sync_all(session, first_run=first_run)
    return results


def _db_optimize_fn() -> dict:
    from database import engine  # noqa: PLC0415
    from sqlmodel import Session  # noqa: PLC0415
    from sqlalchemy import text  # noqa: PLC0415

    with Session(engine) as db:
        db.execute(text("PRAGMA optimize"))
        db.commit()
    logger.info("Database optimize (PRAGMA optimize) complete")
    return {"status": "ok"}


def _db_vacuum_fn() -> dict:
    from database import engine  # noqa: PLC0415
    import time  # noqa: PLC0415

    started = time.monotonic()
    # VACUUM cannot run inside a transaction; use a raw connection with autocommit.
    raw_conn = engine.raw_connection()
    try:
        raw_conn.isolation_level = None  # autocommit
        cursor = raw_conn.cursor()
        try:
            cursor.execute("VACUUM")
        finally:
            cursor.close()
    finally:
        raw_conn.close()

    duration_s = round(time.monotonic() - started, 2)
    logger.info("Database VACUUM complete in %.2fs", duration_s)
    return {"status": "ok", "duration_seconds": duration_s}


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

TASK_DEFINITIONS = [
    {
        "task_key": "community_sync",
        "name": "Community Sync",
        "description": "Sync dealers, manufacturers, calibers, and ammo types from GitHub",
        "interval_type": "hours",
        "interval_value": "24",
        "enabled": True,
        "allowed_modes": ["hours"],
        "min_hours": 4,
        "max_hours": 168,  # 7 days
    },
    {
        "task_key": "version_check",
        "name": "Version Check",
        "description": "Check GitHub for new AmmoLedger releases",
        "interval_type": "hours",
        "interval_value": "24",
        "enabled": True,
        "allowed_modes": ["hours"],
        "min_hours": 4,
        "max_hours": 24,
    },
    {
        "task_key": "scheduled_backup",
        "name": "Scheduled Backup",
        "description": "Create automatic database backup",
        "interval_type": "daily",
        "interval_value": "03:00",
        "enabled": True,
        "allowed_modes": ["hours", "daily"],
        "min_hours": 4,
        "max_hours": 24,
    },
    {
        "task_key": "backup_cleanup",
        "name": "Backup Cleanup",
        "description": "Remove backups older than retention period",
        "interval_type": "daily",
        "interval_value": "03:05",
        "enabled": True,
        "allowed_modes": ["daily"],
    },
    {
        "task_key": "db_optimize",
        "name": "Database Optimize (PRAGMA optimize)",
        "description": "Run SQLite PRAGMA optimize to refresh query planner statistics for tables with stale stats.",
        "interval_type": "daily",
        "interval_value": "04:00",
        "enabled": True,
        "allowed_modes": ["daily"],
        "requires_exclusive": True,
    },
    {
        "task_key": "db_vacuum",
        "name": "Database Vacuum",
        "description": "Reclaim unused space and defragment the database. Disabled by default — requires ~2x free disk space while running.",
        "interval_type": "daily",
        "interval_value": "04:30",
        "enabled": False,
        "allowed_modes": ["daily"],
        "requires_exclusive": True,
    },
]

TASK_FUNCTIONS: dict = {
    "version_check": _version_check_fn,
    "scheduled_backup": _backup_fn,
    "backup_cleanup": _cleanup_fn,
    "community_sync": _community_sync_fn,
    "db_optimize": _db_optimize_fn,
    "db_vacuum": _db_vacuum_fn,
}
