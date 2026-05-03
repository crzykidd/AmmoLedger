import os
import shutil
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
    shutil.copy2(str(db_path), str(dest))
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
    import httpx  # noqa: PLC0415
    from datetime import timezone  # noqa: PLC0415
    from database import engine  # noqa: PLC0415
    from sqlmodel import Session  # noqa: PLC0415
    from utils.config import set_setting  # noqa: PLC0415
    from version import __version__  # noqa: PLC0415

    GITHUB_API_URL = "https://api.github.com/repos/crzykidd/AmmoLedger"

    def _version_gt(a: str, b: str) -> bool:
        try:
            return (
                tuple(int(x) for x in a.lstrip("v").split(".")[:3])
                > tuple(int(x) for x in b.lstrip("v").split(".")[:3])
            )
        except Exception:
            return False

    now = datetime.utcnow().replace(tzinfo=timezone.utc)
    latest = None
    update_available = False

    try:
        resp = httpx.get(
            f"{GITHUB_API_URL}/releases/latest",
            timeout=5.0,
            headers={"Accept": "application/vnd.github+json", "User-Agent": "AmmoLedger"},
        )
        if resp.status_code == 200:
            data = resp.json()
            latest = data.get("tag_name", "").lstrip("v")
            if latest:
                update_available = _version_gt(latest, __version__)
    except Exception as exc:
        logger.warning("GitHub version check failed: %s", exc)
        raise RuntimeError(f"GitHub API unavailable: {exc}") from exc

    with Session(engine) as db:
        if latest:
            set_setting(db, "latest_version", latest)
            set_setting(db, "update_available", "true" if update_available else "false")
        set_setting(db, "version_last_checked", now.isoformat())
        db.commit()

    return {"latest": latest, "update_available": update_available}


def _community_sync_fn() -> dict:
    from database import engine  # noqa: PLC0415
    from sqlmodel import Session  # noqa: PLC0415
    from utils.community_sync import check_first_run, sync_all  # noqa: PLC0415

    with Session(engine) as session:
        first_run = check_first_run(session)
        results = sync_all(session, first_run=first_run)
    return results


def _db_analyze_fn() -> dict:
    from database import engine  # noqa: PLC0415
    from sqlmodel import Session  # noqa: PLC0415
    from sqlalchemy import text  # noqa: PLC0415

    with Session(engine) as db:
        db.execute(text("ANALYZE"))
        db.commit()
    logger.info("Database ANALYZE complete")
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

TASK_DEFINITIONS = [
    {
        "task_key": "version_check",
        "name": "Version Check",
        "description": "Check GitHub for new AmmoLedger releases",
        "interval_type": "hours",
        "interval_value": "24",
        "enabled": True,
    },
    {
        "task_key": "scheduled_backup",
        "name": "Scheduled Backup",
        "description": "Create automatic database backup",
        "interval_type": "daily",
        "interval_value": "03:00",
        "enabled": True,
    },
    {
        "task_key": "backup_cleanup",
        "name": "Backup Cleanup",
        "description": "Remove backups older than retention period",
        "interval_type": "daily",
        "interval_value": "03:05",
        "enabled": True,
    },
    {
        "task_key": "community_sync",
        "name": "Community Sync",
        "description": "Sync dealers, manufacturers, calibers, and ammo types from GitHub",
        "interval_type": "hours",
        "interval_value": "24",
        "enabled": True,
    },
    {
        "task_key": "db_analyze",
        "name": "Database Optimize",
        "description": "Run SQLite ANALYZE to update query planner statistics",
        "interval_type": "daily",
        "interval_value": "04:00",
        "enabled": True,
    },
]

TASK_FUNCTIONS: dict = {
    "version_check": _version_check_fn,
    "scheduled_backup": _backup_fn,
    "backup_cleanup": _cleanup_fn,
    "community_sync": _community_sync_fn,
    "db_analyze": _db_analyze_fn,
}
