import os
import sqlite3
from datetime import datetime
from pathlib import Path

_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////data/ammoledger.db")
BACKUP_PATH = os.getenv("BACKUP_PATH", "/data/backups")


def _db_path() -> Path:
    url = _DATABASE_URL
    if url.startswith("sqlite:///"):
        p = url[len("sqlite:///"):]
        return Path(p)
    return Path("/data/ammoledger.db")


def trigger_pre_import_backup() -> str:
    """
    Copies the current DB to the backups dir as a pre-import safety backup.
    Returns the destination filename on success, raises RuntimeError on failure.
    """
    db_path = _db_path()
    if not db_path.is_file():
        raise RuntimeError(f"Database file not found: {db_path}")

    backup_dir = Path(BACKUP_PATH)
    backup_dir.mkdir(parents=True, exist_ok=True)

    if not os.access(str(backup_dir), os.W_OK):
        raise RuntimeError(f"Backup directory is not writable: {backup_dir}")

    ts = datetime.now().strftime("%Y-%m-%d")
    filename = f"ammoledger_pre-import_{ts}.db"
    dest = backup_dir / filename
    src = sqlite3.connect(str(db_path))
    try:
        dst = sqlite3.connect(str(dest))
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()
    return filename
