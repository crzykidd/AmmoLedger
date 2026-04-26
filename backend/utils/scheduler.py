import os
import shutil
from datetime import datetime
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler

_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////data/ammoledger.db")
BACKUP_PATH = os.getenv("BACKUP_PATH", "/data/backups")

_scheduler: AsyncIOScheduler | None = None


def _db_path() -> Path:
    url = _DATABASE_URL
    if url.startswith("sqlite:///"):
        return Path(url[len("sqlite:///"):])
    return Path("/data/ammoledger.db")


def _run_backup_job(retention_days: int) -> None:
    """Nightly backup job — runs as a sync function in APScheduler's thread pool."""
    db_path = _db_path()
    backup_dir = Path(BACKUP_PATH)
    backup_dir.mkdir(parents=True, exist_ok=True)

    if not db_path.is_file():
        print(f"[scheduler] DB not found at {db_path} — skipping backup")
        return

    ts = datetime.now().strftime("%Y-%m-%d_%H-%M")
    filename = f"ammoledger_{ts}.db"
    dest = backup_dir / filename

    try:
        shutil.copy2(str(db_path), str(dest))
        print(f"[scheduler] Backup created: {filename}")
    except Exception as e:
        print(f"[scheduler] Backup failed: {e}")
        return

    # Prune files older than retention_days
    try:
        cutoff = datetime.now().timestamp() - retention_days * 86400
        for f in sorted(backup_dir.glob("ammoledger_*.db"), key=lambda x: x.stat().st_mtime):
            if "pre-import" in f.name:
                continue
            if f.stat().st_mtime < cutoff:
                f.unlink()
                print(f"[scheduler] Pruned: {f.name}")
    except Exception as e:
        print(f"[scheduler] Prune failed: {e}")

    # Record timestamp in app_settings
    try:
        from database import engine  # noqa: PLC0415
        from sqlmodel import Session  # noqa: PLC0415
        from utils.config import set_setting  # noqa: PLC0415
        with Session(engine) as session:
            set_setting(session, "last_backup_at", datetime.now().isoformat())
            set_setting(session, "last_backup_file", filename)
            session.commit()
    except Exception as e:
        print(f"[scheduler] Failed to update last_backup_at: {e}")


def start_scheduler(config: dict) -> None:
    global _scheduler

    backup_cfg = config.get("backup") or {}
    if not backup_cfg.get("enabled", False):
        print("[scheduler] Scheduled backups disabled")
        return

    schedule = str(backup_cfg.get("schedule", "03:00"))
    retention_days = int(backup_cfg.get("retention_days", 30))

    try:
        hour_str, minute_str = schedule.split(":")
        hour, minute = int(hour_str), int(minute_str)
    except (ValueError, AttributeError):
        print(f"[scheduler] Invalid schedule '{schedule}' — defaulting to 03:00")
        hour, minute = 3, 0

    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(
        _run_backup_job,
        trigger="cron",
        hour=hour,
        minute=minute,
        kwargs={"retention_days": retention_days},
        id="nightly_backup",
        replace_existing=True,
    )
    _scheduler.start()
    print(f"[scheduler] Scheduled backup at {hour:02d}:{minute:02d}, retention {retention_days}d")


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        _scheduler = None


def reschedule(config: dict) -> None:
    """Restart scheduler with updated config — called after POST /system/config."""
    stop_scheduler()
    start_scheduler(config)
