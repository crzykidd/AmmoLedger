import json
import os
import re
import shutil
import sqlite3
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any

from alembic import command as alembic_command
from alembic.config import Config as AlembicConfig
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from database import get_session
from utils.config import BACKUP_PATH, UPLOADS_PATH, load_and_validate_config
from utils.logging import get_logger
from utils.rbac import require_role
from version import __version__

logger = get_logger(__name__)

router = APIRouter(prefix="/backup", tags=["backup"])

_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////data/ammoledger.db")

# Tables included in JSON export/import. Order matters for restore — parents before
# children when foreign keys exist (currently FKs are disabled during restore via
# PRAGMA, but the order is preserved as documentation of intent).
#
# Excluded tables and rationale:
#   - password_history: not needed for restore; only enforces "don't reuse last N
#     passwords" which is a UX nicety, not a security boundary. Keeping it would
#     export additional bcrypt hashes for no restore value.
#   - password_reset_tokens: short-lived, single-use; meaningless after restore.
#   - task_history: operational telemetry, not user data. Re-populates naturally.
#   - task_registry: re-seeded on app startup from TASK_DEFINITIONS. Restoring
#     stale rows would conflict with the seed logic.
_EXPORT_TABLES = [
    # User accounts and lookups (parents)
    "users",
    "calibers",
    "manufacturers",
    "ammo_types",
    "ammo_conditions",
    "categories",
    "dealers",
    "locations",
    "containers",
    # Firearm lookups — action_types and the physical-attribute lookups
    # come before firearm_models / firearms (FK ordering). The four
    # frame_size / optic_cut / rail_type / finish tables are FK targets
    # of the firearms row added in v0.3.0; firearm_user_tags FKs users
    # (already above).
    "firearm_action_types",
    "firearm_frame_sizes",
    "firearm_optic_cuts",
    "firearm_rail_types",
    "firearm_finishes",
    "firearm_models",
    "firearm_compliance_tags",
    "firearm_user_tags",
    # Catalog
    "products",
    # Inventory (children of users + lookups). expenditure_log comes after
    # range_session_lines because expenditure_log carries an FK to it (P3).
    "ammo_box",
    # Firearms registry + log + tag link tables (P1b).
    # Order: firearms → firearm_log + tag links (link tables FK both firearms and
    # the lookup tables already above).
    "firearms",
    "firearm_log",
    "firearm_compliance_tag_links",
    "firearm_user_tag_links",
    # Range sessions (P3) — sessions before lines; lines FK firearms + ammo_box.
    # expenditure_log FKs range_session_lines for the session-driven audit link,
    # so expenditure_log must be inserted after range_session_lines on restore.
    "range_sessions",
    "range_session_lines",
    "expenditure_log",
    # Threshold configuration
    "caliber_thresholds",
    "location_thresholds",
    # System
    "app_settings",
    "invitations",
    "notifications",
]

_COMPATIBLE_MAJOR = __version__.split(".")[0]

# Operational telemetry keys that change on every backup/import and would
# dominate the app_settings diff with noise. Hidden from the preview UI.
_PREVIEW_HIDE_SETTINGS_KEYS = frozenset({
    "last_backup_at",
    "last_backup_file",
    "last_import_at",
})


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


# Backup filenames we generate:
#   ammoledger_YYYY-MM-DD_HH-MM.db / .zip
#   ammoledger_export_YYYY-MM-DD_HH-MM.json
#   ammoledger_pre-import_YYYY-MM-DD.db   (pre_import_backup uses date-only)
_BACKUP_FILENAME_PATTERN = re.compile(
    r"^ammoledger(_[a-z\-]+)?_\d{4}-\d{2}-\d{2}(_\d{2}-\d{2})?\.(db|zip|json)$"
)


def _sanitize_backup_filename(filename: str) -> str:
    """Strict whitelist for backup filenames passed to download/delete endpoints.

    Returns the validated filename when it matches the shape AmmoLedger generates.
    Raises HTTPException(400) otherwise. Return-style so CodeQL recognizes sanitization.
    """
    if not isinstance(filename, str) or not _BACKUP_FILENAME_PATTERN.match(filename):
        raise HTTPException(
            status_code=400,
            detail="Invalid filename — does not match expected backup naming",
        )
    return filename


def _sanitize_zip_entry_name(name: str) -> str:
    """Validate a zip archive entry name before extraction.

    Returns the entry name when safe; raises HTTPException(400) on any traversal
    attempt. Return-style sanitizer recognized by CodeQL.
    """
    if not isinstance(name, str) or not name:
        raise HTTPException(status_code=400, detail="Empty zip entry name")
    if "\x00" in name:
        raise HTTPException(status_code=400, detail=f"Null byte in zip entry: {name!r}")
    if name.startswith("/") or name.startswith("\\"):
        raise HTTPException(status_code=400, detail=f"Absolute path in zip: {name}")
    if len(name) >= 2 and name[1] == ":":
        raise HTTPException(status_code=400, detail=f"Windows drive-letter path in zip: {name}")
    parts = Path(name).parts
    if ".." in parts:
        raise HTTPException(status_code=400, detail=f"Parent-directory escape in zip: {name}")
    return name


def _safe_resolve_under(candidate: Path, root: Path) -> Path:
    """Resolve `candidate` and confirm it lives under `root`.

    Raises HTTPException(400) on escape. Return-style sanitizer.
    """
    root_resolved = root.resolve()
    try:
        resolved = candidate.resolve()
    except (OSError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=f"Could not resolve path: {exc}") from exc
    if not resolved.is_relative_to(root_resolved):
        raise HTTPException(status_code=400, detail="Path escapes expected root")
    return resolved


def _safe_resolve_under_backup_root(candidate: Path) -> Path:
    """Containment check scoped to the backup directory."""
    return _safe_resolve_under(candidate, _backup_dir())


def _backup_file_path(filename: str) -> Path:
    """Look up an existing backup file by validated name.

    Sanitizes the filename, confirms containment, and returns the resolved path.
    Raises 400 on bad name, 404 if missing.
    """
    safe_name = _sanitize_backup_filename(filename)
    candidate = _backup_dir() / safe_name
    if not candidate.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return _safe_resolve_under_backup_root(candidate)


_TYPE_MAP = {".db": "sqlite", ".json": "json", ".zip": "zip"}


def _file_meta(path: Path) -> dict:
    stat = path.stat()
    return {
        "filename": path.name,
        "size_bytes": stat.st_size,
        "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        "type": _TYPE_MAP.get(path.suffix, "unknown"),
    }


def _backup_to_db(db_path: Path, dest: Path) -> None:
    """WAL-safe SQLite copy."""
    src = sqlite3.connect(str(db_path))
    try:
        dst = sqlite3.connect(str(dest))
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()


def _backup_to_zip(db_path: Path, dest: Path) -> None:
    """Bundle SQLite + photos directory into a single zip.

    Order: take a WAL-safe SQLite copy to a temp file first (the live DB
    file is unsafe to read directly while the app is running — the WAL
    sidecar holds recent writes), then zip the temp DB plus the photos
    directory. The zip preserves the on-disk `firearm_photos/<id>/` layout
    so restore is a straight rename.
    """
    temp_db = dest.parent / f"{dest.stem}.tmp.db"
    _backup_to_db(db_path, temp_db)

    photos_root = Path(UPLOADS_PATH) / "firearm_photos"

    try:
        with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(str(temp_db), "ammoledger.db")
            if photos_root.exists():
                for path in photos_root.rglob("*"):
                    if path.is_file():
                        # Archive name preserves firearm_photos/... structure.
                        arcname = path.relative_to(photos_root.parent)
                        zf.write(str(path), str(arcname))
    finally:
        temp_db.unlink(missing_ok=True)


def _backup_include_photos() -> bool:
    """Read backup.include_photos from current config. Defaults to True."""
    try:
        cfg = load_and_validate_config()
        backup_cfg = cfg.get("backup") or {}
        val = backup_cfg.get("include_photos", True)
        return bool(val)
    except Exception:
        return True


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


def _current_migration(con: sqlite3.Connection) -> str:
    """Read the current DB's Alembic head. Returns 'unknown' on any failure."""
    try:
        row = con.execute("SELECT version_num FROM alembic_version LIMIT 1").fetchone()
        return row[0] if row else "unknown"
    except Exception:
        return "unknown"


def _validate_schema_migration(export_migration: str | None, current: str) -> None:
    """Reject the import if the export's schema doesn't exactly match current.

    # TODO(schema-evolution): Strict equality is correct for v0.2.1 because there
    # is only one schema version in the wild. Once migration 0002+ ships, revisit
    # whether older exports can be replayed safely. Cases to consider:
    #   - Export migration < current: forward-compatible if all newer migrations
    #     are additive (new nullable columns, new tables). Could be allowed by
    #     populating defaults for new fields.
    #   - Export migration > current: must always reject. The app cannot know how
    #     to translate forward.
    # Tracked in #14.
    """
    if not export_migration or export_migration == "unknown":
        raise HTTPException(
            status_code=400,
            detail={
                "message": (
                    "This export does not record a schema version and cannot be "
                    "restored. Re-export from a current version of AmmoLedger."
                ),
                "technical": (
                    f"Export 'schema_migration' field is missing or unknown; "
                    f"current database is at {current}."
                ),
            },
        )
    if export_migration != current:
        raise HTTPException(
            status_code=400,
            detail={
                "message": (
                    "This export was created with a different version of "
                    "AmmoLedger and cannot be restored. Export from a matching "
                    "version, or upgrade the source installation first."
                ),
                "technical": (
                    f"Schema mismatch: export was taken at migration "
                    f"{export_migration}, current database is at {current}."
                ),
            },
        )


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
            session.execute(text("PRAGMA optimize"))
            session.commit()
    except Exception:
        pass  # Never block a backup over a statistics update

    ts = datetime.now().strftime("%Y-%m-%d_%H-%M")
    include_photos = _backup_include_photos()
    if include_photos:
        filename = f"ammoledger_{ts}.zip"
        dest = backup_dir / filename
    else:
        filename = f"ammoledger_{ts}.db"
        dest = backup_dir / filename

    try:
        if include_photos:
            _backup_to_zip(db_path, dest)
        else:
            _backup_to_db(db_path, dest)
    except (OSError, sqlite3.Error, zipfile.BadZipFile) as exc:
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
        [
            f for f in backup_dir.iterdir()
            if f.suffix in (".db", ".json", ".zip") and f.is_file()
        ],
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
    path = _backup_file_path(filename)
    return FileResponse(path=str(path), filename=filename, media_type="application/octet-stream")


@router.get("/export/download/{filename}")
def download_export(filename: str, _: Any = Depends(require_role("admin"))):
    path = _backup_file_path(filename)
    media = "application/json" if path.suffix == ".json" else "application/octet-stream"
    return FileResponse(path=str(path), filename=filename, media_type=media)


# ---------------------------------------------------------------------------
# DELETE /backup/{filename}
# ---------------------------------------------------------------------------

@router.delete("/{filename}", status_code=204)
def delete_backup(filename: str, _: Any = Depends(require_role("admin"))):
    path = _backup_file_path(filename)
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
    meta = _file_meta(dest)
    meta["security_notice"] = (
        "This export contains bcrypt password hashes for all user accounts. "
        "Treat the file with the same care as your database — store securely, "
        "transmit over encrypted channels, and delete when no longer needed."
    )
    return meta


# ---------------------------------------------------------------------------
# GET /backup/export/csv
# ---------------------------------------------------------------------------

@router.get("/export/csv")
def export_csv_all(_: Any = Depends(require_role("admin")), db=Depends(get_session)):
    """Export all ammo boxes (including archived) as CSV. Admin only."""
    import io  # noqa: PLC0415

    from fastapi.responses import StreamingResponse  # noqa: PLC0415
    from sqlmodel import select  # noqa: PLC0415

    from models import (  # noqa: PLC0415
        AmmoBox,
    )
    from routers.ammo import _build_csv  # noqa: PLC0415

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
# POST /backup/restore  (and the deprecated /backup/restore/sqlite alias)
# ---------------------------------------------------------------------------

def _migrate_db_to_head(db_file: Path) -> None:
    """Run Alembic upgrade head on an arbitrary SQLite file."""
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    alembic_cfg = AlembicConfig(os.path.join(backend_dir, "alembic.ini"))
    alembic_cfg.set_main_option(
        "script_location", os.path.join(backend_dir, "migrations")
    )
    alembic_cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_file}")
    alembic_command.upgrade(alembic_cfg, "head")


def _validate_sqlite_file(path: Path) -> None:
    """PRAGMA integrity_check on the candidate file. Raises HTTPException."""
    try:
        con = sqlite3.connect(str(path))
        result = con.execute("PRAGMA integrity_check").fetchone()
        con.close()
        if not result or result[0] != "ok":
            raise HTTPException(
                status_code=400,
                detail="SQLite integrity check failed — the file may be corrupted",
            )
    except sqlite3.DatabaseError as exc:
        raise HTTPException(
            status_code=400, detail=f"Not a valid SQLite database: {exc}"
        ) from exc


async def _restore_sqlite_impl(contents: bytes) -> dict:
    """Replace the live DB with the contents of an uploaded .db file."""
    if len(contents) < 100:
        raise HTTPException(
            status_code=400, detail="File too small to be a valid SQLite database"
        )

    temp_path = Path("/data/ammoledger_restore_temp.db")
    try:
        temp_path.write_bytes(contents)
    except OSError as exc:
        raise HTTPException(
            status_code=500, detail=f"Could not write temp file: {exc}"
        ) from exc

    try:
        _validate_sqlite_file(temp_path)
    except HTTPException:
        temp_path.unlink(missing_ok=True)
        raise

    try:
        _migrate_db_to_head(temp_path)
    except Exception as exc:
        temp_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=500, detail=f"Migration failed on uploaded database: {exc}"
        ) from exc

    db_path = _db_path()
    try:
        shutil.move(str(temp_path), str(db_path))
    except OSError as exc:
        temp_path.unlink(missing_ok=True)
        logger.error("Restore failed: %s", exc)
        raise HTTPException(
            status_code=500, detail=f"Could not replace database: {exc}"
        ) from exc

    from database import engine  # noqa: PLC0415
    engine.dispose()

    logger.info("Restore complete (db only)")
    return {
        "success": True,
        "message": "Database restored successfully.",
        "force_logout": True,
        "logout_reason": (
            "The user database was replaced. Please log in with your "
            "restored credentials."
        ),
    }


async def _restore_zip_impl(contents: bytes) -> dict:
    """Replace DB + photos directory from a .zip archive."""
    if len(contents) < 100:
        raise HTTPException(
            status_code=400, detail="File too small to be a valid zip backup"
        )

    staging = Path(tempfile.mkdtemp(prefix="ammoledger_restore_"))
    try:
        zip_path = staging / "upload.zip"
        zip_path.write_bytes(contents)

        try:
            with zipfile.ZipFile(zip_path) as zf:
                names = zf.namelist()
                if "ammoledger.db" not in names:
                    raise HTTPException(
                        status_code=400,
                        detail="Zip does not contain ammoledger.db at the root",
                    )
                staging_resolved = staging.resolve()
                for n in names:
                    safe_n = _sanitize_zip_entry_name(n)
                    target = staging / safe_n
                    # Defense in depth: confirm each target stays inside staging.
                    if target.parent != staging_resolved:
                        parent_resolved = (
                            target.parent.resolve()
                            if target.parent.exists()
                            else staging_resolved
                        )
                        if not parent_resolved.is_relative_to(staging_resolved):
                            raise HTTPException(
                                status_code=400,
                                detail=f"Zip entry escapes staging: {n}",
                            )
                    if safe_n.endswith("/"):
                        target.mkdir(parents=True, exist_ok=True)
                        continue
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with zf.open(n) as src, open(target, "wb") as dst:
                        shutil.copyfileobj(src, dst)
        except zipfile.BadZipFile as exc:
            raise HTTPException(
                status_code=400, detail=f"Not a valid zip file: {exc}"
            ) from exc

        extracted_db = staging / "ammoledger.db"
        if not extracted_db.is_file():
            raise HTTPException(
                status_code=400, detail="ammoledger.db missing after extraction"
            )
        # Final containment check before destructive moves.
        _safe_resolve_under(extracted_db, staging)
        _validate_sqlite_file(extracted_db)

        try:
            _migrate_db_to_head(extracted_db)
        except Exception as exc:
            raise HTTPException(
                status_code=500, detail=f"Migration failed: {exc}"
            ) from exc

        db_path = _db_path()
        shutil.move(str(extracted_db), str(db_path))

        photos_root = Path(UPLOADS_PATH) / "firearm_photos"
        extracted_photos = staging / "firearm_photos"
        if extracted_photos.exists():
            _safe_resolve_under(extracted_photos, staging)
            if photos_root.exists():
                shutil.rmtree(photos_root, ignore_errors=True)
            photos_root.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(extracted_photos), str(photos_root))
        # If the zip had no photos directory, leave the photos root empty —
        # fresh state matches the .db we just put in.

        from database import engine  # noqa: PLC0415
        engine.dispose()

        logger.info("Restore complete (zip — db + photos)")
        return {
            "success": True,
            "message": "Database and photos restored successfully.",
            "force_logout": True,
            "logout_reason": (
                "The user database was replaced. Please log in with your "
                "restored credentials."
            ),
        }
    finally:
        shutil.rmtree(staging, ignore_errors=True)


@router.post("/restore")
async def restore_backup(
    file: UploadFile = File(...),
    _: Any = Depends(require_role("admin")),
):
    """Restore from a `.db` SQLite backup or a `.zip` (db + photos) archive."""
    name = (file.filename or "").lower()
    contents = await file.read()
    logger.info("Restore started from: %s", file.filename or "unknown")
    if name.endswith(".zip"):
        return await _restore_zip_impl(contents)
    if name.endswith(".db"):
        return await _restore_sqlite_impl(contents)
    raise HTTPException(
        status_code=400,
        detail="Upload must be a .db or .zip backup file",
    )


@router.post("/restore/sqlite", deprecated=True)
async def restore_sqlite(
    file: UploadFile = File(...),
    _: Any = Depends(require_role("admin")),
):
    """Deprecated alias for /backup/restore. Kept for one release cycle."""
    name = (file.filename or "").lower()
    contents = await file.read()
    if name.endswith(".zip"):
        return await _restore_zip_impl(contents)
    if name.endswith(".db"):
        return await _restore_sqlite_impl(contents)
    raise HTTPException(
        status_code=400, detail="File must be a .db or .zip backup file"
    )


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

    db_path = _db_path()
    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row
    try:
        cur_migration = _current_migration(con)
        _validate_schema_migration(data.get("schema_migration"), cur_migration)

        tables = data["tables"]
        record_counts = {t: len(v) for t, v in tables.items() if isinstance(v, list)}

        warnings: list[str] = []
        for t in _EXPORT_TABLES:
            if t not in tables:
                warnings.append(f"Table '{t}' not present in export file")

        # User conflicts: usernames in export that already exist in current DB
        import_users = tables.get("users", []) or []
        import_users_by_name = {
            u["username"]: u for u in import_users
            if isinstance(u, dict) and "username" in u
        }
        user_conflicts: list[dict] = []
        if import_users_by_name:
            placeholders = ",".join("?" * len(import_users_by_name))
            current_user_rows = con.execute(
                f"SELECT username, role FROM users WHERE username IN ({placeholders})",  # noqa: S608
                tuple(import_users_by_name.keys()),
            ).fetchall()
            for row in sorted(current_user_rows, key=lambda r: r["username"]):
                imported = import_users_by_name[row["username"]]
                user_conflicts.append({
                    "username": row["username"],
                    "current_role": row["role"],
                    "import_role": imported.get("role", "unknown"),
                })

        # app_settings diff: keys whose values differ, minus operational keys
        current_settings: dict[str, str | None] = {}
        try:
            for row in con.execute("SELECT key, value FROM app_settings").fetchall():
                current_settings[row["key"]] = row["value"]
        except Exception:
            pass

        import_settings_rows = tables.get("app_settings", []) or []
        import_settings: dict[str, str | None] = {
            r["key"]: r.get("value")
            for r in import_settings_rows
            if isinstance(r, dict) and "key" in r
        }

        all_keys = (set(current_settings) | set(import_settings)) - _PREVIEW_HIDE_SETTINGS_KEYS
        app_settings_diff: list[dict] = []
        for key in sorted(all_keys):
            cur = current_settings.get(key)
            imp = import_settings.get(key)
            if cur != imp:
                app_settings_diff.append({
                    "key": key,
                    "current": cur,
                    "imported": imp,
                })

        # Ownership summary: post-restore boxes/products per user, from the export
        import_boxes = tables.get("ammo_box", []) or []
        import_products = tables.get("products", []) or []

        box_counts: dict[int, int] = {}
        product_counts: dict[int, int] = {}
        for box in import_boxes:
            if isinstance(box, dict):
                oid = box.get("owner_id")
                if oid is not None:
                    box_counts[oid] = box_counts.get(oid, 0) + 1
        for prod in import_products:
            if isinstance(prod, dict):
                oid = prod.get("owner_id")
                if oid is not None:
                    product_counts[oid] = product_counts.get(oid, 0) + 1

        import_users_by_id: dict[int, str] = {
            u["id"]: u["username"]
            for u in import_users
            if isinstance(u, dict) and "id" in u and "username" in u
        }

        current_usernames: set[str] = set()
        try:
            for row in con.execute("SELECT username FROM users").fetchall():
                current_usernames.add(row["username"])
        except Exception:
            pass

        ownership_rows: list[dict] = []
        for uid, username in import_users_by_id.items():
            ownership_rows.append({
                "username": username,
                "ammo_box_count": box_counts.get(uid, 0),
                "product_count": product_counts.get(uid, 0),
                "is_new_user": username not in current_usernames,
            })
        ownership_rows.sort(key=lambda r: (-r["ammo_box_count"], r["username"]))
    finally:
        con.close()

    return {
        "valid": True,
        "version": data.get("ammologger_version"),
        "schema_migration": data.get("schema_migration"),
        "current_migration": cur_migration,
        "exported_at": data.get("exported_at"),
        "record_counts": record_counts,
        "warnings": warnings,
        "user_conflicts": user_conflicts,
        "app_settings_diff": app_settings_diff,
        "ownership_summary": ownership_rows,
    }


# ---------------------------------------------------------------------------
# POST /backup/import/commit
# ---------------------------------------------------------------------------

@router.post("/import/commit")
async def import_commit(
    file: UploadFile = File(...),
    _: Any = Depends(require_role("admin")),
):
    contents = await file.read()
    data = _parse_import_json(contents)
    tables = data["tables"]

    db_path = _db_path()

    # Validate schema before doing anything destructive
    pre_con = sqlite3.connect(str(db_path))
    try:
        cur_migration = _current_migration(pre_con)
        _validate_schema_migration(data.get("schema_migration"), cur_migration)
    finally:
        pre_con.close()

    # Auto pre-import backup — import is blocked if this fails
    from utils.pre_import_backup import trigger_pre_import_backup  # noqa: PLC0415
    try:
        trigger_pre_import_backup()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Pre-import backup failed: {exc}. Import blocked to protect your data.",
        ) from exc

    records_imported = 0
    warnings: list[str] = []

    con = sqlite3.connect(str(db_path))
    try:
        con.execute("PRAGMA foreign_keys = OFF")

        # Full replace: delete all exported tables in reverse FK order
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

                cols = list(row.keys())
                col_names = ", ".join(f'"{c}"' for c in cols)
                placeholders = ", ".join("?" * len(cols))
                values = [row[c] for c in cols]

                try:
                    con.execute(
                        f"INSERT INTO {table} ({col_names}) VALUES ({placeholders})",  # noqa: S608
                        values,
                    )
                    records_imported += 1
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
        "records_skipped": 0,
        "warnings": warnings,
        "force_logout": True,
        "logout_reason": (
            "The user database was replaced as part of a full restore. "
            "Please log in with your restored credentials."
        ),
    }
