import json
import os
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from alembic import command as alembic_command
from alembic.config import Config as AlembicConfig
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from database import get_session
from utils.config import BACKUP_PATH
from utils.logging import get_logger
from utils.rbac import require_role
from version import __version__

logger = get_logger(__name__)

router = APIRouter(prefix="/backup", tags=["backup"])

_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////data/ammoledger.db")

_EXPORT_TABLES = [
    "users",
    "ammo_box",
    "expenditure_log",
    "calibers",
    "manufacturers",
    "ammo_types",
    "categories",
    "dealers",
    "locations",
    "containers",
    "app_settings",
    "invitations",
    "notifications",
    "password_history",
]

_COMPATIBLE_MAJOR = __version__.split(".")[0]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _db_path() -> Path:
    url = _DATABASE_URL
    if url.startswith("sqlite:///"):
        return Path(url[len("sqlite:///"):])
    return Path("/data/ammoledger.db")


def _backup_dir() -> Path:
    return Path(BACKUP_PATH)


def _validate_filename(filename: str) -> Path:
    """Reject path traversal; return resolved path or 404."""
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    path = _backup_dir() / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return path


def _file_meta(path: Path) -> dict:
    stat = path.stat()
    return {
        "filename": path.name,
        "size_bytes": stat.st_size,
        "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        "type": "sqlite" if path.suffix == ".db" else "json",
    }


def _parse_import_json(contents: bytes) -> dict:
    try:
        data = json.loads(contents)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}") from exc

    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="JSON root must be an object")

    if "ammologger_version" not in data:
        raise HTTPException(
            status_code=400,
            detail="Missing 'ammologger_version' — this may not be an AmmoLedger export",
        )

    file_major = str(data["ammologger_version"]).split(".")[0]
    if file_major != _COMPATIBLE_MAJOR:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Version mismatch: export is v{data['ammologger_version']}, "
                f"app is v{__version__}. Major version must match."
            ),
        )

    if "tables" not in data or not isinstance(data["tables"], dict):
        raise HTTPException(status_code=400, detail="Missing or invalid 'tables' key")

    return data


# ---------------------------------------------------------------------------
# POST /backup/trigger
# ---------------------------------------------------------------------------

@router.post("/trigger")
def trigger_backup(_: Any = Depends(require_role("admin"))):
    db_path = _db_path()
    if not db_path.is_file():
        raise HTTPException(status_code=500, detail="Database file not found")

    backup_dir = _backup_dir()
    backup_dir.mkdir(parents=True, exist_ok=True)

    if not os.access(str(backup_dir), os.W_OK):
        raise HTTPException(status_code=500, detail="Backup directory is not writable")

    # Refresh query-planner statistics so they are current in the backup file
    try:
        from database import engine  # noqa: PLC0415
        from sqlalchemy import text  # noqa: PLC0415
        from sqlmodel import Session  # noqa: PLC0415
        with Session(engine) as session:
            session.execute(text("ANALYZE"))
            session.commit()
    except Exception:
        pass  # Never block a backup over a statistics update

    ts = datetime.now().strftime("%Y-%m-%d_%H-%M")
    filename = f"ammoledger_{ts}.db"
    dest = backup_dir / filename

    try:
        shutil.copy2(str(db_path), str(dest))
    except OSError as exc:
        logger.error("Backup failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Backup failed: {exc}") from exc

    stat = dest.stat()
    logger.info("Manual backup triggered: %s", filename)
    logger.info("Backup complete: %s, %d bytes", filename, stat.st_size)

    try:
        from database import engine  # noqa: PLC0415
        from sqlmodel import Session  # noqa: PLC0415
        from utils.config import set_setting  # noqa: PLC0415
        with Session(engine) as session:
            set_setting(session, "last_backup_at", datetime.now().isoformat())
            set_setting(session, "last_backup_file", filename)
            session.commit()
    except Exception:
        pass  # Don't fail the backup over a settings write

    return _file_meta(dest)


# ---------------------------------------------------------------------------
# GET /backup/list
# ---------------------------------------------------------------------------

@router.get("/list")
def list_backups(_: Any = Depends(require_role("admin"))):
    backup_dir = _backup_dir()
    if not backup_dir.exists():
        return []
    files = sorted(
        [f for f in backup_dir.iterdir() if f.suffix in (".db", ".json") and f.is_file()],
        key=lambda f: f.stat().st_mtime,
        reverse=True,
    )
    return [_file_meta(f) for f in files]


# ---------------------------------------------------------------------------
# GET /backup/download/{filename}
# GET /backup/export/download/{filename}
# ---------------------------------------------------------------------------

@router.get("/download/{filename}")
def download_backup(filename: str, _: Any = Depends(require_role("admin"))):
    path = _validate_filename(filename)
    return FileResponse(path=str(path), filename=filename, media_type="application/octet-stream")


@router.get("/export/download/{filename}")
def download_export(filename: str, _: Any = Depends(require_role("admin"))):
    path = _validate_filename(filename)
    media = "application/json" if path.suffix == ".json" else "application/octet-stream"
    return FileResponse(path=str(path), filename=filename, media_type=media)


# ---------------------------------------------------------------------------
# DELETE /backup/{filename}
# ---------------------------------------------------------------------------

@router.delete("/{filename}", status_code=204)
def delete_backup(filename: str, _: Any = Depends(require_role("admin"))):
    path = _validate_filename(filename)
    try:
        path.unlink()
        logger.warning("Backup file deleted: %s", filename)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Delete failed: {exc}") from exc


# ---------------------------------------------------------------------------
# POST /backup/export
# ---------------------------------------------------------------------------

@router.post("/export")
def export_backup(_: Any = Depends(require_role("admin"))):
    db_path = _db_path()
    if not db_path.is_file():
        raise HTTPException(status_code=500, detail="Database file not found")

    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row
    try:
        try:
            row = con.execute("SELECT version_num FROM alembic_version LIMIT 1").fetchone()
            migration = row["version_num"] if row else "unknown"
        except Exception:
            migration = "unknown"

        tables: dict[str, list] = {}
        for table in _EXPORT_TABLES:
            try:
                rows = con.execute(f"SELECT * FROM {table}").fetchall()  # noqa: S608
                tables[table] = [dict(r) for r in rows]
            except Exception:
                tables[table] = []
    finally:
        con.close()

    payload = {
        "ammologger_version": __version__,
        "schema_migration": migration,
        "exported_at": datetime.now().isoformat(),
        "tables": tables,
    }

    backup_dir = _backup_dir()
    backup_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y-%m-%d_%H-%M")
    filename = f"ammoledger_export_{ts}.json"
    dest = backup_dir / filename
    dest.write_text(json.dumps(payload, default=str, indent=2))

    logger.info("JSON export created: %s", filename)
    return _file_meta(dest)


# ---------------------------------------------------------------------------
# GET /backup/export/csv
# ---------------------------------------------------------------------------

@router.get("/export/csv")
def export_csv_all(_: Any = Depends(require_role("admin")), db=Depends(get_session)):
    """Export all ammo boxes (including archived) as CSV. Admin only."""
    import csv  # noqa: PLC0415
    import io  # noqa: PLC0415

    from fastapi.responses import StreamingResponse  # noqa: PLC0415
    from sqlmodel import Session, select  # noqa: PLC0415

    from models import (  # noqa: PLC0415
        AmmoBox, AmmoCondition, AmmoType, Caliber, Category,
        Container, Dealer, Location, Manufacturer, User,
    )
    from routers.ammo import _build_csv, _CSV_COLUMNS  # noqa: PLC0415

    boxes = list(db.exec(select(AmmoBox)).all())
    csv_bytes = _build_csv(boxes, db)
    date_str = datetime.now().strftime("%Y-%m-%d")
    filename = f"ammoledger_full_export_{date_str}.csv"
    logger.info("Full CSV export: %d boxes", len(boxes))
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ---------------------------------------------------------------------------
# POST /backup/restore/sqlite
# ---------------------------------------------------------------------------

@router.post("/restore/sqlite")
async def restore_sqlite(
    file: UploadFile = File(...),
    _: Any = Depends(require_role("admin")),
):
    if not (file.filename or "").endswith(".db"):
        raise HTTPException(status_code=400, detail="File must be a .db SQLite database")

    contents = await file.read()
    if len(contents) < 100:
        raise HTTPException(status_code=400, detail="File too small to be a valid SQLite database")

    temp_path = Path("/data/ammoledger_restore_temp.db")
    try:
        temp_path.write_bytes(contents)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Could not write temp file: {exc}") from exc

    # Validate SQLite integrity
    try:
        con = sqlite3.connect(str(temp_path))
        result = con.execute("PRAGMA integrity_check").fetchone()
        con.close()
        if not result or result[0] != "ok":
            temp_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail="SQLite integrity check failed — the file may be corrupted")
    except sqlite3.DatabaseError as exc:
        temp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Not a valid SQLite database: {exc}") from exc

    # Run Alembic migrations on temp file to bring it up to current schema
    try:
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        alembic_cfg = AlembicConfig(os.path.join(backend_dir, "alembic.ini"))
        alembic_cfg.set_main_option("script_location", os.path.join(backend_dir, "migrations"))
        alembic_cfg.set_main_option("sqlalchemy.url", f"sqlite:///{temp_path}")
        alembic_command.upgrade(alembic_cfg, "head")
    except Exception as exc:
        temp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Migration failed on uploaded database: {exc}") from exc

    # Replace the main DB
    db_path = _db_path()
    logger.info("Restore started from: %s", file.filename or "unknown")
    try:
        shutil.move(str(temp_path), str(db_path))
    except OSError as exc:
        temp_path.unlink(missing_ok=True)
        logger.error("Restore failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Could not replace database: {exc}") from exc

    # Flush all pooled SQLAlchemy connections so the next request opens the new file
    from database import engine  # noqa: PLC0415
    engine.dispose()

    logger.info("Restore complete")
    return {"success": True, "message": "Database restored successfully. Please reload the application."}


# ---------------------------------------------------------------------------
# POST /backup/import/preview
# ---------------------------------------------------------------------------

@router.post("/import/preview")
async def import_preview(
    file: UploadFile = File(...),
    _: Any = Depends(require_role("admin")),
):
    contents = await file.read()
    data = _parse_import_json(contents)

    tables = data["tables"]
    record_counts = {t: len(v) for t, v in tables.items() if isinstance(v, list)}

    warnings = []
    for t in _EXPORT_TABLES:
        if t not in tables:
            warnings.append(f"Table '{t}' not present in export file")

    return {
        "valid": True,
        "version": data.get("ammologger_version"),
        "schema_migration": data.get("schema_migration"),
        "exported_at": data.get("exported_at"),
        "record_counts": record_counts,
        "warnings": warnings,
    }


# ---------------------------------------------------------------------------
# POST /backup/import/commit
# ---------------------------------------------------------------------------

@router.post("/import/commit")
async def import_commit(
    file: UploadFile = File(...),
    mode: str = Form("full"),
    _: Any = Depends(require_role("admin")),
):
    if mode not in ("full", "additive"):
        raise HTTPException(status_code=400, detail="mode must be 'full' or 'additive'")

    contents = await file.read()
    data = _parse_import_json(contents)
    tables = data["tables"]

    # Auto pre-import backup — import is blocked if this fails
    from utils.pre_import_backup import trigger_pre_import_backup  # noqa: PLC0415
    try:
        trigger_pre_import_backup()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Pre-import backup failed: {exc}. Import blocked to protect your data.",
        ) from exc

    db_path = _db_path()
    records_imported = 0
    records_skipped = 0
    warnings: list[str] = []

    con = sqlite3.connect(str(db_path))
    try:
        con.execute("PRAGMA foreign_keys = OFF")

        if mode == "full":
            for table in reversed(_EXPORT_TABLES):
                try:
                    con.execute(f"DELETE FROM {table}")  # noqa: S608
                except Exception:
                    pass

        for table in _EXPORT_TABLES:
            rows = tables.get(table, [])
            if not isinstance(rows, list):
                continue

            for row in rows:
                if not isinstance(row, dict):
                    continue

                if mode == "additive" and "id" in row:
                    exists = con.execute(
                        f"SELECT 1 FROM {table} WHERE id = ?",  # noqa: S608
                        (row["id"],),
                    ).fetchone()
                    if exists:
                        records_skipped += 1
                        continue

                cols = list(row.keys())
                col_names = ", ".join(f'"{c}"' for c in cols)
                placeholders = ", ".join("?" * len(cols))
                values = [row[c] for c in cols]

                try:
                    con.execute(
                        f"INSERT OR IGNORE INTO {table} ({col_names}) VALUES ({placeholders})",  # noqa: S608
                        values,
                    )
                    records_imported += 1
                except sqlite3.IntegrityError:
                    records_skipped += 1
                except Exception as exc:
                    if len(warnings) < 20:
                        warnings.append(f"{table}: {exc}")

        # Reset autoincrement sequences so new rows get correct IDs
        for table in _EXPORT_TABLES:
            try:
                max_row = con.execute(f"SELECT MAX(id) FROM {table}").fetchone()  # noqa: S608
                if max_row and max_row[0] is not None:
                    con.execute(
                        "INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?) "
                        "ON CONFLICT(name) DO UPDATE SET seq = excluded.seq",
                        (table, max_row[0]),
                    )
            except Exception:
                pass

        con.execute("PRAGMA foreign_keys = ON")
        con.commit()
    except Exception as exc:
        con.rollback()
        con.close()
        raise HTTPException(status_code=500, detail=f"Import failed: {exc}") from exc
    finally:
        con.close()

    # Flush SQLAlchemy connections so they see the updated rows
    try:
        from database import engine  # noqa: PLC0415
        from sqlmodel import Session  # noqa: PLC0415
        from utils.config import set_setting  # noqa: PLC0415
        engine.dispose()
        with Session(engine) as session:
            set_setting(session, "last_import_at", datetime.now().isoformat())
            session.commit()
    except Exception:
        pass

    return {
        "records_imported": records_imported,
        "records_skipped": records_skipped,
        "warnings": warnings,
    }
