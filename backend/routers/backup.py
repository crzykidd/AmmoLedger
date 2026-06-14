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
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from database import get_session
from models import User
from utils.config import BACKUP_PATH, UPLOADS_PATH, load_and_validate_config
from utils.logging import get_logger, log_safe
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
#   - firearm_photos: photo metadata rows are zip-only by design. A JSON export
#     carries no binary blobs, so restoring photo rows without the accompanying
#     image files would surface broken photo references. Zip backup includes the
#     full SQLite DB (and therefore photo rows) alongside the image directories.
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
    # (already above). firearm_conditions is a full-CRUD user-editable
    # lookup (firearms.firearm_condition_id FKs it) — include before
    # firearm_models so it's a parent when firearms rows insert.
    "firearm_action_types",
    "firearm_conditions",
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

# Container format version — bumped only when the JSON envelope shape or zip
# layout changes, never for DB schema changes (schema_migration handles those).
# Exports without this field are treated as format 1. See §5.3 of
# docs/prd/backup-restore-compat.md.
BACKUP_FORMAT_VERSION = 1

# Oldest Alembic revision ID (from alembic_version.version_num — NOT the
# filename slug) from which a JSON export is known additive-safe into the
# current head. Migrations 0002–0004 are additive (new nullable columns, new
# tables); no existing column on ammo_box or other pre-0002 tables was changed
# to NOT NULL. If a future migration adds a NOT NULL column without a server
# default to an existing table, bump this constant to that migration's revision
# ID in the same commit. See docs/prd/backup-restore-compat.md §5.2 and
# CLAUDE.md → Database Rules.
JSON_RESTORE_ADDITIVE_SINCE = "0001"

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


def _read_backup_file_bytes(filename: str) -> tuple[Path, bytes]:
    """Locate a backup file by directory listing and return (path, contents).

    CodeQL's stock `py/uncontrolled-data-in-path-expression` query flagged the
    `_backup_file_path(body.filename) → path.read_bytes()` two-step pattern
    even though the path was validated upstream (#82–#84) — taint analysis
    does not propagate sanitization through Pydantic body attribute access
    into a path constructed via `_backup_dir() / safe_name`. The previously
    shipped custom sanitizer model (`AmmoLedgerSanitizers.qll`) was removed
    when CodeQL was switched back to default setup, so we now use the
    stock-recognized sanitizer pattern: `Path` objects originate from
    `Path.iterdir()`, and user input is only used in string comparison
    against `entry.name` values that came from the OS directory listing.

    Also re-applies the strict filename regex as a fast malformed-input reject.

    Returns the resolved path alongside the file contents — callers typically
    need `path.name` for structured logging.

    Raises 400 on bad name, 404 if missing.
    """
    safe_name = _sanitize_backup_filename(filename)
    backup_dir = _backup_dir()
    if backup_dir.is_dir():
        for entry in backup_dir.iterdir():
            if entry.is_file() and entry.name == safe_name:
                return entry, entry.read_bytes()
    raise HTTPException(status_code=404, detail="File not found")


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


# Directories under UPLOADS_PATH that participate in zip backup and zip
# restore. Each is bundled into the zip relative to UPLOADS_PATH and
# restored back into the same layout. Tuple order is the restore order.
_IMAGE_DIR_NAMES: tuple[str, ...] = ("firearm_photos", "products")
_OLD_SUFFIX = ".old"


def _image_dir_specs() -> list[tuple[Path, Path]]:
    """Return [(live_dir, snapshot_dir), ...] for image dirs under UPLOADS_PATH."""
    base = Path(UPLOADS_PATH)
    return [(base / name, base / f"{name}{_OLD_SUFFIX}") for name in _IMAGE_DIR_NAMES]


def _dir_metrics(p: Path) -> tuple[int, int]:
    """Return (file_count, total_size_bytes) for `p`. (0, 0) if absent."""
    if not p.exists():
        return 0, 0
    count = 0
    total = 0
    for f in p.rglob("*"):
        if f.is_file():
            count += 1
            try:
                total += f.stat().st_size
            except OSError:
                pass
    return count, total


def _rotate_image_dir_to_old(live: Path, old: Path) -> None:
    """Move `live` to `old`, deleting any prior snapshot.

    Both paths sit on the same filesystem under UPLOADS_PATH, so this is a
    rename. If `live` is absent, just clear any stale `.old` so the next
    placement starts from a clean state. After this call `live` does not
    exist and `old` either contains the prior live state or is absent.
    """
    if old.exists():
        shutil.rmtree(old, ignore_errors=True)
    if live.exists():
        shutil.move(str(live), str(old))


def _place_or_empty(extracted: Path | None, live: Path) -> None:
    """Move `extracted` into `live`, or create an empty `live` dir.

    Caller guarantees `live` does not exist (was rotated to .old just prior).
    """
    if extracted is not None and extracted.exists():
        live.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(extracted), str(live))
    else:
        live.mkdir(parents=True, exist_ok=True)


def _capture_image_snapshot_status() -> dict:
    """Report which `.old` snapshots exist and how large they are.

    Used by the restore response payload and the dedicated GET endpoint so the
    frontend can surface a "you have a pre-restore image snapshot — discard?"
    banner after a restore force-logout cycle.
    """
    snapshots: dict[str, dict] = {}
    for live, old in _image_dir_specs():
        if not old.exists():
            continue
        count, size = _dir_metrics(old)
        # Empty .old dirs aren't worth flagging — there's nothing to restore from.
        if count == 0:
            continue
        snapshots[live.name] = {"file_count": count, "size_bytes": size}
    return snapshots


def _backup_to_zip(db_path: Path, dest: Path) -> None:
    """Bundle SQLite + image directories into a single zip.

    Order: take a WAL-safe SQLite copy to a temp file first (the live DB
    file is unsafe to read directly while the app is running — the WAL
    sidecar holds recent writes), then zip the temp DB plus each image
    directory listed in `_IMAGE_DIR_NAMES`. The zip preserves the on-disk
    layout (e.g. `firearm_photos/<firearm_id>/...` and `products/<id>.jpg`)
    so restore is a straight rename.
    """
    temp_db = dest.parent / f"{dest.stem}.tmp.db"
    _backup_to_db(db_path, temp_db)

    uploads_root = Path(UPLOADS_PATH)

    try:
        with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
            manifest = json.dumps({
                "backup_format_version": BACKUP_FORMAT_VERSION,
                "ammoledger_version": __version__,
            })
            zf.writestr("MANIFEST.json", manifest)
            zf.write(str(temp_db), "ammoledger.db")
            for dir_name in _IMAGE_DIR_NAMES:
                src_dir = uploads_root / dir_name
                if not src_dir.exists():
                    continue
                for path in src_dir.rglob("*"):
                    if path.is_file():
                        # Archive name preserves the on-disk layout relative
                        # to UPLOADS_PATH so restore is a 1:1 rename.
                        arcname = path.relative_to(uploads_root)
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

    # Accept the correctly-spelled alias introduced in BACKUP_FORMAT_VERSION 1;
    # fall back to the legacy misspelling that all existing exports carry.
    app_ver = data.get("ammoledger_version") or data.get("ammologger_version")
    if not app_ver:
        raise HTTPException(
            status_code=400,
            detail="Missing 'ammologger_version' — this may not be an AmmoLedger export",
        )

    # Reject a backup whose container format is newer than this build understands.
    fmt_ver = data.get("backup_format_version", 1)
    if isinstance(fmt_ver, int) and fmt_ver > BACKUP_FORMAT_VERSION:
        raise HTTPException(
            status_code=400,
            detail={
                "message": (
                    f"This backup was made by a newer version of AmmoLedger "
                    f"(format {fmt_ver}). Upgrade your installation first."
                ),
                "reason": "unsupported_format",
            },
        )

    file_major = str(app_ver).split(".")[0]
    if file_major != _COMPATIBLE_MAJOR:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Version mismatch: export is v{app_ver}, "
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


def _classify_schema_migration(export_migration: str | None, current_db_rev: str) -> dict:  # noqa: ARG001
    """Classify the export's schema revision against the current Alembic head.

    Returns a verdict dict. Possible outcomes (per docs/prd/backup-restore-compat.md §5.1):
      {"verdict": "clean"} — exact match; normal happy-path restore.
      {"verdict": "older_compatible"} — older ancestor at/above JSON_RESTORE_ADDITIVE_SINCE;
          caller adds tables_added_empty / columns_defaulted / summary before returning.
      {"verdict": "rejected", "reason": <str>, "recommended_action": <str>}
          reason is one of: missing_schema_tag | not_ancestor | newer_schema | below_floor

    Uses the same walk_revisions graph walk as _classify_db_revision.
    # TODO: See docs/prd/backup-restore-compat.md for full design; supersedes #14.
    """
    if not export_migration or export_migration == "unknown":
        return {
            "verdict": "rejected",
            "reason": "missing_schema_tag",
            "recommended_action": "Re-export from a current version of AmmoLedger.",
        }

    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cfg = AlembicConfig(os.path.join(backend_dir, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(backend_dir, "migrations"))
    from alembic.script import ScriptDirectory  # noqa: PLC0415
    script = ScriptDirectory.from_config(cfg)
    head = script.get_current_head()

    if export_migration == head:
        return {"verdict": "clean"}

    # Ordered newest-first list of all revisions reachable from head.
    all_revs = [r.revision for r in script.walk_revisions(base="base", head=head)]

    # Is this revision even known in our migration scripts?
    try:
        script.get_revision(export_migration)
    except Exception:
        return {
            "verdict": "rejected",
            "reason": "not_ancestor",
            "recommended_action": (
                "This export was made with an unrecognized schema version. "
                "Restore the matching .db or .zip snapshot instead — it auto-upgrades."
            ),
        }

    if export_migration not in all_revs:
        # Known revision but not an ancestor of head → it is newer than head.
        return {
            "verdict": "rejected",
            "reason": "newer_schema",
            "recommended_action": (
                "This export was made with a newer version of AmmoLedger. "
                "Upgrade your installation first, then restore."
            ),
        }

    # Export is an older ancestor. Check the additive-since floor.
    try:
        floor_idx = all_revs.index(JSON_RESTORE_ADDITIVE_SINCE)
    except ValueError:
        floor_idx = len(all_revs) - 1  # floor not found → treat as oldest allowed

    em_idx = all_revs.index(export_migration)
    if em_idx > floor_idx:
        return {
            "verdict": "rejected",
            "reason": "below_floor",
            "recommended_action": (
                "This export predates the supported restore window. "
                "Restore the matching .db or .zip snapshot instead — it auto-upgrades the schema safely."
            ),
        }

    return {"verdict": "older_compatible"}


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
# GET /backup/restore-snapshots
# POST /backup/restore-snapshots/discard
# ---------------------------------------------------------------------------

@router.get("/restore-snapshots")
def get_restore_snapshots(_: Any = Depends(require_role("admin"))):
    """Report any pre-restore image directory snapshots (`.old`) still on disk.

    Every restore / full import rotates the live image directories to
    `<name>.old` before placing the new contents. Snapshots persist until an
    admin discards them so they can be reviewed or manually salvaged. The
    Backup page polls this endpoint to render a banner with a Discard button.
    """
    return {"snapshots": _capture_image_snapshot_status()}


@router.post("/restore-snapshots/discard")
def discard_restore_snapshots(_: Any = Depends(require_role("admin"))):
    """Delete all pre-restore image snapshot directories."""
    discarded: dict[str, dict] = {}
    for live, old in _image_dir_specs():
        if not old.exists():
            continue
        count, size = _dir_metrics(old)
        shutil.rmtree(old, ignore_errors=True)
        # Skip empty .old entries from the response — nothing useful to report.
        if count > 0:
            discarded[live.name] = {"file_count": count, "size_bytes": size}
    logger.info(
        "Pre-restore image snapshots discarded: %s",
        sorted(discarded.keys()) or "(none)",
    )
    return {"discarded": discarded}


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
        "ammologger_version": __version__,  # legacy misspelling — kept for read-compat
        "ammoledger_version": __version__,  # correctly-spelled alias (v0.3.10+)
        "backup_format_version": BACKUP_FORMAT_VERSION,
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
    # Fold Alembic's WAL into the main file so later steps / the move see a
    # complete single file.
    _checkpoint_and_unwal(db_file)


def _classify_db_revision(db_file: Path) -> tuple[str, str | None, str]:
    """Classify a candidate DB against the app's Alembic revision graph.

    Returns (state, db_rev, head) where state is one of:
      'at_head'  — db_rev == script head; no migration needed.
      'behind'   — db_rev is a known ancestor of head; upgrade required.
      'ahead'    — db_rev is known but NOT an ancestor of head (descendant /
                   side branch); restore must reject.
      'unknown'  — db_rev is not present in this app's migration scripts;
                   either a newer revision or an unrelated tree. Reject.
      'missing'  — alembic_version table absent or empty. Reject.

    Uses the revision graph (script_directory.walk_revisions), never string
    ordering — revision IDs are opaque hashes / slugs.
    """
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cfg = AlembicConfig(os.path.join(backend_dir, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(backend_dir, "migrations"))
    from alembic.script import ScriptDirectory  # noqa: PLC0415
    script = ScriptDirectory.from_config(cfg)
    head = script.get_current_head()

    con = sqlite3.connect(str(db_file))
    try:
        try:
            row = con.execute(
                "SELECT version_num FROM alembic_version LIMIT 1"
            ).fetchone()
        except sqlite3.Error:
            return ("missing", None, head)
    finally:
        con.close()

    db_rev = row[0] if row else None
    if db_rev is None:
        return ("missing", None, head)
    if db_rev == head:
        return ("at_head", db_rev, head)
    try:
        script.get_revision(db_rev)
    except Exception:
        return ("unknown", db_rev, head)
    ancestors = {r.revision for r in script.walk_revisions(base="base", head=head)}
    if db_rev in ancestors:
        return ("behind", db_rev, head)
    return ("ahead", db_rev, head)


def _migrate_if_needed(db_file: Path) -> None:
    """Run Alembic upgrade only when the candidate DB is behind head.

    Skips Alembic entirely when already at head (avoids needless WAL churn),
    rejects ahead / unknown / missing revisions with HTTP 400. Finalization
    (checkpoint + strip stats + integrity check) still runs in the caller
    regardless of which branch is taken, so the at-head skip is still safe
    for backups that arrive in WAL mode.
    """
    state, db_rev, head = _classify_db_revision(db_file)
    if state == "at_head":
        logger.info("Restore DB already at head (%s); skipping migration", head)
        return
    if state == "behind":
        logger.info("Restore DB at %s; upgrading to head %s", db_rev, head)
        _migrate_db_to_head(db_file)
        return
    if state in ("ahead", "unknown"):
        raise HTTPException(
            status_code=400,
            detail={
                "message": (
                    "This backup was created by a newer version of AmmoLedger "
                    "than this installation supports. Upgrade AmmoLedger to at "
                    "least the version that produced the backup, then restore."
                ),
                "technical": (
                    f"Backup schema revision {db_rev!r} is not an ancestor of "
                    f"this app's head {head!r} (state={state})."
                ),
            },
        )
    raise HTTPException(
        status_code=400,
        detail=(
            "This file does not record an AmmoLedger schema version and cannot "
            "be restored. Re-export from a current AmmoLedger installation."
        ),
    )


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


def _checkpoint_and_unwal(path: Path) -> None:
    """Fold any WAL into the main file and leave a single self-contained DB.

    A SQLite file in WAL mode keeps recent committed pages in a `-wal`
    sidecar. Moving the main file without checkpointing loses those pages
    (observed as 'invalid rootpage' after restore on weak-fsync filesystems
    such as Docker Desktop bind mounts). Switching journal_mode to DELETE
    forces a checkpoint and removes the sidecar so the file can be moved
    atomically as one file.
    """
    con = sqlite3.connect(str(path))
    try:
        con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        # journal_mode=DELETE checkpoints and drops out of WAL; the result is a
        # single file with no -wal/-shm sidecar.
        con.execute("PRAGMA journal_mode=DELETE")
        con.commit()
    finally:
        con.close()


def _assert_no_wal_sidecar(path: Path) -> None:
    """Belt-and-suspenders check before an atomic file move.

    Turns a silent corruption (committed pages stranded in a -wal that won't
    travel with the main file) into a clear error. Raises HTTPException(500)
    if a non-empty `<path>-wal` is found.
    """
    wal = path.with_name(path.name + "-wal")
    if wal.exists() and wal.stat().st_size > 0:
        raise HTTPException(
            status_code=500,
            detail=(
                "Internal error: restored database still has an un-checkpointed "
                "WAL; aborting to avoid corruption. Live database untouched."
            ),
        )


def _remove_wal_sidecars(path: Path) -> None:
    """Delete -wal and -shm sidecars for a DB path. Safe if absent.

    The live DB runs in WAL mode while the app is up, so its -wal/-shm
    sidecars belong to the OLD database. If we os.replace the main .db
    without clearing them first, SQLite will replay stale WAL frames from
    the old DB onto the freshly placed file on the next open — splicing
    pages from two unrelated databases and producing 'database disk image
    is malformed'. Must be called AFTER engine.dispose() releases the
    handle that holds the sidecars open.
    """
    for suffix in ("-wal", "-shm"):
        sidecar = path.with_name(path.name + suffix)
        sidecar.unlink(missing_ok=True)


def _durable_replace(src: Path, dst: Path) -> None:
    """Atomically and durably move `src` onto `dst`.

    Works across filesystems and on weak-fsync mounts (e.g. Docker Desktop bind
    mounts on Windows), where shutil.move's non-fsync cross-FS copy+delete can
    leave a partially-flushed 'database disk image is malformed' file.

    Stage a copy in dst's OWN directory (guarantees same filesystem, so
    os.replace is a true atomic rename), fsync the staged file, fsync the
    directory, os.replace into place, then fsync the directory again so the
    rename is durable before the caller reopens the DB.
    """
    dst_dir = dst.parent
    dst_dir.mkdir(parents=True, exist_ok=True)
    staged = dst_dir / f".{dst.name}.swap.tmp"
    try:
        with open(src, "rb") as fsrc, open(staged, "wb") as fdst:
            shutil.copyfileobj(fsrc, fdst)
            fdst.flush()
            os.fsync(fdst.fileno())
        dir_fd = os.open(str(dst_dir), os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
        os.replace(str(staged), str(dst))
        dir_fd = os.open(str(dst_dir), os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    finally:
        if staged.exists():
            staged.unlink(missing_ok=True)
    src.unlink(missing_ok=True)


def _strip_sqlite_stats(path: Path) -> None:
    """Remove derived query-planner statistics tables.

    `sqlite_stat1` / `sqlite_stat4` are regenerable stats whose cached
    rootpage pointers in sqlite_master can be invalidated by DDL run during
    an Alembic migration, producing
    'malformed database schema (sqlite_stat1) - invalid rootpage' on the
    next schema-touching query. They must never be carried through a
    restore + migrate. Dropping them is safe; SQLite rebuilds them on the
    next ANALYZE / PRAGMA optimize.
    """
    con = sqlite3.connect(str(path))
    try:
        con.execute("DROP TABLE IF EXISTS sqlite_stat1")
        con.execute("DROP TABLE IF EXISTS sqlite_stat4")
        con.commit()
    finally:
        con.close()


def _finalize_restored_db(path: Path) -> None:
    """Prepare a migrated DB for an atomic single-file move.

    Order matters:
      1. Checkpoint+unwal so the migrated schema is fully in the main file.
      2. Drop derived stats tables (sqlite_stat1/stat4). Absent stats is the
         only state proven to boot cleanly; SQLite regenerates them lazily at
         runtime. We deliberately do NOT run ANALYZE — that reallocates stat
         pages into a fresh WAL and reintroduces the dangling-rootpage bug.
      3. Checkpoint+unwal again to flush the DROPs into the main file.
      4. Integrity-check. Abort (HTTP 400) if not 'ok' — live DB untouched.
    Call AFTER Alembic upgrade and BEFORE moving the file into place.
    """
    _checkpoint_and_unwal(path)
    _strip_sqlite_stats(path)
    _checkpoint_and_unwal(path)
    con = sqlite3.connect(str(path))
    try:
        result = con.execute("PRAGMA integrity_check").fetchone()
        if not result or result[0] != "ok":
            raise HTTPException(
                status_code=400,
                detail=(
                    "Restored database failed integrity check after "
                    "migration — restore aborted, live database untouched."
                ),
            )
    finally:
        con.close()


async def _restore_sqlite_impl(
    contents: bytes, *, actor: str = "unknown", source: str = "upload"
) -> dict:
    """Replace the live DB with the contents of an uploaded .db file."""
    # Fetch inside the handler so get_logger() repairs the uvicorn-disabled
    # logger at call time. See utils/logging.py — module-level loggers do not
    # survive uvicorn --reload's dictConfig.
    logger = get_logger(__name__)
    if len(contents) < 100:
        raise HTTPException(
            status_code=400, detail="File too small to be a valid SQLite database"
        )

    safe_source = log_safe(source)
    safe_actor = log_safe(actor)
    logger.info(
        "Restore started | actor=%s | source=%s | kind=db", safe_actor, safe_source
    )

    temp_path = Path("/data/ammoledger_restore_temp.db")
    try:
        temp_path.write_bytes(contents)
    except OSError as exc:
        logger.error(
            "Restore failed | actor=%s | source=%s | stage=%s | error=%s",
            safe_actor, safe_source, "write_temp", exc,
        )
        raise HTTPException(
            status_code=500, detail=f"Could not write temp file: {exc}"
        ) from exc

    try:
        _validate_sqlite_file(temp_path)
    except HTTPException as exc:
        temp_path.unlink(missing_ok=True)
        logger.error(
            "Restore failed | actor=%s | source=%s | stage=%s | error=%s",
            safe_actor, safe_source, "validation", exc.detail,
        )
        raise

    try:
        _migrate_if_needed(temp_path)
    except HTTPException as exc:
        temp_path.unlink(missing_ok=True)
        logger.error(
            "Restore failed | actor=%s | source=%s | stage=%s | error=%s",
            safe_actor, safe_source, "migration", exc.detail,
        )
        raise
    except Exception as exc:
        temp_path.unlink(missing_ok=True)
        logger.error(
            "Restore failed | actor=%s | source=%s | stage=%s | error=%s",
            safe_actor, safe_source, "migration", exc,
        )
        raise HTTPException(
            status_code=500, detail=f"Migration failed on uploaded database: {exc}"
        ) from exc

    try:
        _finalize_restored_db(temp_path)
    except HTTPException as exc:
        temp_path.unlink(missing_ok=True)
        # Deliberate integrity-abort inside _finalize_restored_db is an HTTP 400
        # — a rejected restore, not a crash. Log at warning and re-raise unchanged.
        logger.warning(
            "Restore failed | actor=%s | source=%s | stage=%s | error=%s",
            safe_actor, safe_source, "finalize", exc.detail,
        )
        raise
    except Exception as exc:
        temp_path.unlink(missing_ok=True)
        logger.error(
            "Restore failed | actor=%s | source=%s | stage=%s | error=%s",
            safe_actor, safe_source, "finalize", exc,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Post-migration finalization failed: {exc}",
        ) from exc

    try:
        _assert_no_wal_sidecar(temp_path)
    except HTTPException as exc:
        temp_path.unlink(missing_ok=True)
        logger.error(
            "Restore failed | actor=%s | source=%s | stage=%s | error=%s",
            safe_actor, safe_source, "wal_guard", exc.detail,
        )
        raise

    db_path = _db_path()
    # Release the app's WAL handle on the live DB BEFORE swapping the file,
    # then clear the now-orphaned -wal/-shm sidecars so SQLite cannot replay
    # stale WAL frames from the old DB onto the newly placed file.
    from database import engine  # noqa: PLC0415
    engine.dispose()
    _remove_wal_sidecars(db_path)
    try:
        _durable_replace(temp_path, db_path)
    except OSError as exc:
        temp_path.unlink(missing_ok=True)
        logger.error(
            "Restore failed | actor=%s | source=%s | stage=%s | error=%s",
            safe_actor, safe_source, "replace", exc,
        )
        raise HTTPException(
            status_code=500, detail=f"Could not replace database: {exc}"
        ) from exc
    # Belt-and-suspenders: nothing should have recreated the sidecars in the
    # tiny window between dispose() and the os.replace, but make sure.
    _remove_wal_sidecars(db_path)

    # A .db restore carries no images. Blank both image dirs so the restored
    # DB never references photos from the previous install — rotated to .old
    # so an admin can recover them or discard them later.
    for live, old in _image_dir_specs():
        try:
            _rotate_image_dir_to_old(live, old)
            _place_or_empty(None, live)
        except OSError as exc:
            logger.error(
                "Restore failed | actor=%s | source=%s | stage=%s | error=%s",
                safe_actor, safe_source, f"images:{live.name}", exc,
            )
            raise HTTPException(
                status_code=500,
                detail=(
                    f"Could not rotate image directory {live.name}: {exc}. "
                    f"The database has been restored but image directories "
                    f"are in an inconsistent state. The previous contents "
                    f"may be preserved at {old.name}."
                ),
            ) from exc

    image_snapshots = _capture_image_snapshot_status()
    logger.info(
        "Restore complete | actor=%s | source=%s | restored database, "
        "image dirs blanked | snapshots=%s",
        safe_actor, safe_source, sorted(image_snapshots.keys()),
    )
    return {
        "success": True,
        "message": "Database restored successfully. Image directories were cleared.",
        "force_logout": True,
        "logout_reason": (
            "The user database was replaced. Please log in with your "
            "restored credentials."
        ),
        "image_snapshots": image_snapshots,
    }


async def _restore_zip_impl(
    contents: bytes, *, actor: str = "unknown", source: str = "upload"
) -> dict:
    """Replace DB + photos directory from a .zip archive."""
    # Fetch inside the handler so get_logger() repairs the uvicorn-disabled
    # logger at call time. See utils/logging.py.
    logger = get_logger(__name__)
    if len(contents) < 100:
        raise HTTPException(
            status_code=400, detail="File too small to be a valid zip backup"
        )

    safe_source = log_safe(source)
    safe_actor = log_safe(actor)
    logger.info(
        "Restore started | actor=%s | source=%s | kind=zip", safe_actor, safe_source
    )

    staging = Path(tempfile.mkdtemp(prefix="ammoledger_restore_"))
    try:
        zip_path = staging / "upload.zip"
        try:
            zip_path.write_bytes(contents)
        except OSError as exc:
            logger.error(
                "Restore failed | actor=%s | source=%s | stage=%s | error=%s",
                safe_actor, safe_source, "write_temp", exc,
            )
            raise HTTPException(
                status_code=500, detail=f"Could not write temp file: {exc}"
            ) from exc

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
            logger.error(
                "Restore failed | actor=%s | source=%s | stage=%s | error=%s",
                safe_actor, safe_source, "validation", exc,
            )
            raise HTTPException(
                status_code=400, detail=f"Not a valid zip file: {exc}"
            ) from exc
        except HTTPException as exc:
            logger.error(
                "Restore failed | actor=%s | source=%s | stage=%s | error=%s",
                safe_actor, safe_source, "validation", exc.detail,
            )
            raise

        try:
            extracted_db = staging / "ammoledger.db"
            if not extracted_db.is_file():
                raise HTTPException(
                    status_code=400, detail="ammoledger.db missing after extraction"
                )
            # Final containment check before destructive moves.
            _safe_resolve_under(extracted_db, staging)
            _validate_sqlite_file(extracted_db)
        except HTTPException as exc:
            logger.error(
                "Restore failed | actor=%s | source=%s | stage=%s | error=%s",
                safe_actor, safe_source, "validation", exc.detail,
            )
            raise

        try:
            _migrate_if_needed(extracted_db)
        except HTTPException as exc:
            logger.error(
                "Restore failed | actor=%s | source=%s | stage=%s | error=%s",
                safe_actor, safe_source, "migration", exc.detail,
            )
            raise
        except Exception as exc:
            logger.error(
                "Restore failed | actor=%s | source=%s | stage=%s | error=%s",
                safe_actor, safe_source, "migration", exc,
            )
            raise HTTPException(
                status_code=500, detail=f"Migration failed: {exc}"
            ) from exc

        # Post-migration finalization. If this raises, the `finally` below
        # cleans up staging and the live DB / photos remain untouched.
        try:
            _finalize_restored_db(extracted_db)
        except HTTPException as exc:
            # Deliberate integrity-abort inside _finalize_restored_db is an HTTP
            # 400 — a rejected restore, not a crash. Log at warning and re-raise.
            logger.warning(
                "Restore failed | actor=%s | source=%s | stage=%s | error=%s",
                safe_actor, safe_source, "finalize", exc.detail,
            )
            raise
        except Exception as exc:
            logger.error(
                "Restore failed | actor=%s | source=%s | stage=%s | error=%s",
                safe_actor, safe_source, "finalize", exc,
            )
            raise HTTPException(
                status_code=500,
                detail=f"Post-migration finalization failed: {exc}",
            ) from exc

        # Belt-and-suspenders: bail out if a -wal somehow remains. The
        # surrounding `finally` rmtree's staging; live DB stays untouched.
        try:
            _assert_no_wal_sidecar(extracted_db)
        except HTTPException as exc:
            logger.error(
                "Restore failed | actor=%s | source=%s | stage=%s | error=%s",
                safe_actor, safe_source, "wal_guard", exc.detail,
            )
            raise

        # Pre-resolve extracted image dirs so we can count what's coming in
        # (for the completion log) and validate containment before any
        # destructive moves.
        extracted_dirs: dict[str, Path | None] = {}
        for dir_name in _IMAGE_DIR_NAMES:
            candidate = staging / dir_name
            if candidate.exists():
                _safe_resolve_under(candidate, staging)
                extracted_dirs[dir_name] = candidate
            else:
                extracted_dirs[dir_name] = None
        placed_counts = {
            name: (sum(1 for p in path.rglob("*") if p.is_file()) if path else 0)
            for name, path in extracted_dirs.items()
        }

        db_path = _db_path()
        # Release the app's WAL handle on the live DB BEFORE swapping the file,
        # then clear the now-orphaned -wal/-shm sidecars so SQLite cannot replay
        # stale WAL frames from the old DB onto the newly placed file.
        from database import engine  # noqa: PLC0415
        engine.dispose()
        _remove_wal_sidecars(db_path)
        try:
            _durable_replace(extracted_db, db_path)
        except OSError as exc:
            logger.error(
                "Restore failed | actor=%s | source=%s | stage=%s | error=%s",
                safe_actor, safe_source, "replace", exc,
            )
            raise HTTPException(
                status_code=500, detail=f"Could not replace database: {exc}"
            ) from exc
        # Belt-and-suspenders: nothing should have recreated the sidecars in
        # the tiny window between dispose() and the os.replace, but make sure.
        _remove_wal_sidecars(db_path)

        # Image dirs: rotate live -> .old (snapshot for admin review), then
        # place extracted contents — or create an empty dir when the zip did
        # not carry that image kind. Even a .db-equivalent zip (no image
        # entries) blanks the live dirs so the restored DB never references
        # photos from the previous install.
        for live, old in _image_dir_specs():
            try:
                _rotate_image_dir_to_old(live, old)
                _place_or_empty(extracted_dirs.get(live.name), live)
            except OSError as exc:
                logger.error(
                    "Restore failed | actor=%s | source=%s | stage=%s | error=%s",
                    safe_actor, safe_source, f"images:{live.name}", exc,
                )
                raise HTTPException(
                    status_code=500,
                    detail=(
                        f"Could not rotate image directory {live.name}: {exc}. "
                        f"The database has been restored but image directories "
                        f"are in an inconsistent state. The previous contents "
                        f"may be preserved at {old.name}."
                    ),
                ) from exc

        image_snapshots = _capture_image_snapshot_status()
        logger.info(
            "Restore complete | actor=%s | source=%s | restored database, "
            "placed %d firearm photo(s) and %d product image(s) | snapshots=%s",
            safe_actor, safe_source,
            placed_counts.get("firearm_photos", 0),
            placed_counts.get("products", 0),
            sorted(image_snapshots.keys()),
        )
        return {
            "success": True,
            "message": "Database and image directories restored successfully.",
            "force_logout": True,
            "logout_reason": (
                "The user database was replaced. Please log in with your "
                "restored credentials."
            ),
            "image_snapshots": image_snapshots,
        }
    finally:
        shutil.rmtree(staging, ignore_errors=True)


@router.post("/restore")
async def restore_backup(
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("admin")),
):
    """Restore from a `.db` SQLite backup or a `.zip` (db + photos) archive."""
    name = (file.filename or "").lower()
    contents = await file.read()
    source = file.filename or "upload"
    if name.endswith(".zip"):
        return await _restore_zip_impl(
            contents, actor=current_user.username, source=source
        )
    if name.endswith(".db"):
        return await _restore_sqlite_impl(
            contents, actor=current_user.username, source=source
        )
    raise HTTPException(
        status_code=400,
        detail="Upload must be a .db or .zip backup file",
    )


class RestoreFromServerRequest(BaseModel):
    filename: str
    confirm_older: bool = False


@router.post("/restore/server")
async def restore_from_server(
    body: RestoreFromServerRequest,
    current_user: User = Depends(require_role("admin")),
):
    """Restore from a backup file that already exists on the server.

    The filename must be one of the files returned by GET /backup/list. No
    browser upload. Admin only — matches the upload-restore guard. The frontend
    is responsible for its own destructive-action confirmation UX.
    """
    # Pre-flight suffix gate so we do not slurp a multi-GB file just to
    # reject it. _read_backup_file_bytes also validates the name via the
    # strict regex whitelist, but does so during the directory match.
    name_lower = (body.filename or "").lower()
    if not (name_lower.endswith(".zip") or name_lower.endswith(".db")):
        raise HTTPException(
            status_code=400,
            detail="Selected file is not a .db or .zip backup",
        )

    # iterdir-match pattern recognized as a sanitizer by stock CodeQL —
    # see docstring of _read_backup_file_bytes (#82).
    path, contents = _read_backup_file_bytes(body.filename)
    name = path.name.lower()

    if name.endswith(".zip"):
        result = await _restore_zip_impl(
            contents, actor=current_user.username, source=path.name
        )
    else:
        result = await _restore_sqlite_impl(
            contents, actor=current_user.username, source=path.name
        )

    result["restored_from"] = path.name
    return result


@router.post("/restore/sqlite", deprecated=True)
async def restore_sqlite(
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("admin")),
):
    """Deprecated alias for /backup/restore. Kept for one release cycle."""
    name = (file.filename or "").lower()
    contents = await file.read()
    source = file.filename or "upload"
    if name.endswith(".zip"):
        return await _restore_zip_impl(
            contents, actor=current_user.username, source=source
        )
    if name.endswith(".db"):
        return await _restore_sqlite_impl(
            contents, actor=current_user.username, source=source
        )
    raise HTTPException(
        status_code=400, detail="File must be a .db or .zip backup file"
    )


# ---------------------------------------------------------------------------
# POST /backup/import/preview
# ---------------------------------------------------------------------------

async def _import_preview_impl(contents: bytes) -> dict:
    """Parse JSON export and produce a non-destructive preview payload.

    Shared by `/import/preview` (upload) and `/import/preview/server` (existing
    backup on disk). Read-only — no actor/source logging required.
    """
    data = _parse_import_json(contents)

    db_path = _db_path()
    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row
    try:
        cur_migration = _current_migration(con)
        verdict = _classify_schema_migration(data.get("schema_migration"), cur_migration)

        tables = data["tables"]
        record_counts = {t: len(v) for t, v in tables.items() if isinstance(v, list)}

        # Enrich older_compatible verdict with per-table disclosure fields.
        if verdict["verdict"] == "older_compatible":
            tables_added_empty = [t for t in _EXPORT_TABLES if not tables.get(t)]
            columns_defaulted: dict[str, list[str]] = {}
            for t in _EXPORT_TABLES:
                rows = tables.get(t, [])
                if rows and isinstance(rows[0], dict):
                    export_cols = set(rows[0].keys())
                    try:
                        db_cols = {
                            row[1]
                            for row in con.execute(f"PRAGMA table_info({t})").fetchall()  # noqa: S608
                        }
                        missing = sorted(db_cols - export_cols)
                        if missing:
                            columns_defaulted[t] = missing
                    except Exception:
                        pass
            total_defaulted = sum(len(v) for v in columns_defaulted.values())
            verdict["tables_added_empty"] = tables_added_empty
            verdict["columns_defaulted"] = columns_defaulted
            verdict["summary"] = (
                f"Export schema is older — {len(tables_added_empty)} table(s) will be "
                f"empty and {total_defaulted} column(s) will use current defaults."
            )

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
        "version": data.get("ammoledger_version") or data.get("ammologger_version"),
        "schema_migration": data.get("schema_migration"),
        "current_migration": cur_migration,
        "exported_at": data.get("exported_at"),
        "record_counts": record_counts,
        "warnings": warnings,
        "user_conflicts": user_conflicts,
        "app_settings_diff": app_settings_diff,
        "ownership_summary": ownership_rows,
        "compatibility": verdict,
    }


@router.post("/import/preview")
async def import_preview(
    file: UploadFile = File(...),
    _: Any = Depends(require_role("admin")),
):
    contents = await file.read()
    return await _import_preview_impl(contents)


@router.post("/import/preview/server")
async def import_preview_from_server(
    body: RestoreFromServerRequest,
    _: Any = Depends(require_role("admin")),
):
    """Preview a JSON export that already exists in the backup directory.

    Read-only — no destructive side effects. The frontend uses this to render
    the same preview panel as the upload flow before the admin commits.
    """
    # Pre-flight suffix gate before reading; iterdir-match read is the
    # CodeQL-recognized sanitizer pattern (#83).
    if not (body.filename or "").lower().endswith(".json"):
        raise HTTPException(
            status_code=400,
            detail="Selected file is not a .json export",
        )
    _, contents = _read_backup_file_bytes(body.filename)
    return await _import_preview_impl(contents)


# ---------------------------------------------------------------------------
# POST /backup/import/commit
# ---------------------------------------------------------------------------

async def _import_commit_impl(
    contents: bytes,
    *,
    actor: str = "unknown",
    source: str = "upload",
    confirm_older: bool = False,
) -> dict:
    """Full-replace JSON import. Shared by upload and server-side entry points."""
    # Fetch inside the handler so get_logger() repairs the uvicorn-disabled
    # logger at call time. See utils/logging.py.
    logger = get_logger(__name__)
    data = _parse_import_json(contents)
    tables = data["tables"]

    safe_source = log_safe(source)
    safe_actor = log_safe(actor)
    logger.info("Import started | actor=%s | source=%s", safe_actor, safe_source)

    db_path = _db_path()

    # Classify schema before doing anything destructive.
    pre_con = sqlite3.connect(str(db_path))
    try:
        cur_migration = _current_migration(pre_con)
        verdict = _classify_schema_migration(data.get("schema_migration"), cur_migration)
    finally:
        pre_con.close()

    if verdict["verdict"] == "rejected":
        raise HTTPException(
            status_code=400,
            detail={
                "message": verdict["recommended_action"],
                "technical": (
                    f"Schema verdict: {verdict['reason']} "
                    f"(export={data.get('schema_migration')}, current={cur_migration})"
                ),
            },
        )
    if verdict["verdict"] == "older_compatible" and not confirm_older:
        raise HTTPException(
            status_code=422,
            detail={
                "message": (
                    "This export uses an older schema. Preview the import first to see "
                    "which tables will be empty and which fields will use defaults, "
                    "then confirm to proceed."
                ),
                "verdict": "older_compatible",
            },
        )

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
        logger.error(
            "Import failed | actor=%s | source=%s | error=%s",
            safe_actor, safe_source, exc,
        )
        raise HTTPException(status_code=500, detail=f"Import failed: {exc}") from exc
    finally:
        con.close()

    # Drop stale query-planner stats on the live DB. Full-replace import
    # deleted and re-inserted every row, so `sqlite_stat1` is stale. We do
    # NOT run ANALYZE here — absent stats is the only proven-clean state on
    # weak-fsync filesystems; SQLite regenerates them lazily at runtime.
    # Checkpoint on either side keeps the live file's WAL flushed so the
    # DROPs are durable. Failures are non-critical (data is already
    # committed); log and continue.
    try:
        _checkpoint_and_unwal(db_path)
        _strip_sqlite_stats(db_path)
        _checkpoint_and_unwal(db_path)
    except Exception as exc:
        logger.warning("Post-import stats rebuild failed: %s", exc)

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

    # JSON exports carry no images. The newly-imported rows reference
    # image filenames that may belong to a different install — blank both
    # image dirs and snapshot the previous contents to .old so the admin
    # can recover or discard them.
    image_rotation_warnings: list[str] = []
    for live, old in _image_dir_specs():
        try:
            _rotate_image_dir_to_old(live, old)
            _place_or_empty(None, live)
        except OSError as exc:
            msg = f"images:{live.name}: {exc}"
            logger.warning(
                "Import: image rotation failed | actor=%s | source=%s | %s",
                safe_actor, safe_source, msg,
            )
            if len(warnings) < 20:
                warnings.append(msg)
            image_rotation_warnings.append(msg)

    image_snapshots = _capture_image_snapshot_status()

    logger.info(
        "Import complete | actor=%s | source=%s | imported %d record(s) across %d table(s) | warnings=%d | snapshots=%s",
        safe_actor, safe_source,
        records_imported, sum(1 for t in _EXPORT_TABLES if tables.get(t)),
        len(warnings), sorted(image_snapshots.keys()),
    )

    return {
        "records_imported": records_imported,
        "records_skipped": 0,
        "warnings": warnings,
        "force_logout": True,
        "logout_reason": (
            "The user database was replaced as part of a full restore. "
            "Please log in with your restored credentials."
        ),
        "image_snapshots": image_snapshots,
    }


@router.post("/import/commit")
async def import_commit(
    file: UploadFile = File(...),
    confirm_older: bool = Form(False),
    current_user: User = Depends(require_role("admin")),
):
    contents = await file.read()
    return await _import_commit_impl(
        contents,
        actor=current_user.username,
        source=file.filename or "upload",
        confirm_older=confirm_older,
    )


@router.post("/import/commit/server")
async def import_commit_from_server(
    body: RestoreFromServerRequest,
    current_user: User = Depends(require_role("admin")),
):
    """Full-replace import from a JSON export already on the server.

    Mirrors `/restore/server` — `_backup_file_path` sanitizes/contains the
    filename, then bytes are read from disk and routed through the same
    `_import_commit_impl` as the upload flow. The pre-import safety backup,
    image rotation, and forced logout all apply identically.
    """
    # Pre-flight suffix gate before reading; iterdir-match read is the
    # CodeQL-recognized sanitizer pattern (#84).
    if not (body.filename or "").lower().endswith(".json"):
        raise HTTPException(
            status_code=400,
            detail="Selected file is not a .json export",
        )
    path, contents = _read_backup_file_bytes(body.filename)
    result = await _import_commit_impl(
        contents,
        actor=current_user.username,
        source=path.name,
        confirm_older=body.confirm_older,
    )
    result["restored_from"] = path.name
    return result
