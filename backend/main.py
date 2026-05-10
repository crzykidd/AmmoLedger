import os
import re
import sys
import traceback
from typing import Optional

import httpx
import yaml
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlmodel import Session, select
from starlette.middleware.sessions import SessionMiddleware
from starlette.requests import Request

from database import engine, get_session, run_migrations
from routers import auth, ammo, expenditure, lookups, users
from routers.backup import router as backup_router
from routers.community import router as community_router
from routers.firearms import router as firearms_router
from routers.firearms_importer import router as firearms_import_router
from routers.geo import router as geo_router
from routers.importer import router as import_router
from routers.products import router as products_router
from routers.range_sessions import router as range_sessions_router
from routers.tasks import router as tasks_router
from routers.thresholds import router as thresholds_router
from utils.config import (
    CONFIG_PATH,
    ensure_data_dirs,
    get_setting,
    load_and_validate_config,
    set_setting,
    validate_config,
)
from utils.logging import get_logger, setup_logging
from utils.rbac import require_auth, require_role
from utils.scheduler import reschedule, start_scheduler, stop_scheduler
from utils.seeds import sync_yaml_seeds
from utils.version_check import check_dev_branch, check_release_version, version_gt
from version import __version__, get_build_info, get_display_version

setup_logging()
logger = get_logger(__name__)

SESSION_SECRET = os.getenv("SESSION_SECRET", "dev-secret-change-in-production")
GITHUB_API_URL = "https://api.github.com/repos/crzykidd/AmmoLedger"

app = FastAPI(title="AmmoLedger API", version=__version__)

# CORSMiddleware added first → outermost → handles preflight before session processing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(ammo.router)
app.include_router(expenditure.router)
app.include_router(expenditure.expenditures_router)
app.include_router(lookups.router)
app.include_router(backup_router)
app.include_router(community_router, prefix="/community")
app.include_router(firearms_router)
app.include_router(firearms_import_router)
app.include_router(geo_router, prefix="/geo")
app.include_router(import_router, prefix="/import")
app.include_router(products_router, prefix="/products")
app.include_router(range_sessions_router)
app.include_router(tasks_router, prefix="/tasks")
app.include_router(thresholds_router, prefix="/thresholds")

_config: dict = {}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    msg = f"Unhandled: {request.method} {request.url.path}\n{tb}"
    logger.error(msg)
    print(msg, file=sys.stderr, flush=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error — check server logs"},
    )


# ---------------------------------------------------------------------------
# Version helpers
# ---------------------------------------------------------------------------

def _refresh_version_data(db: Session, force: bool = False) -> None:
    """Run both release and dev-branch version checks; update app_settings cache."""
    check_release_version(db, force=force)
    check_dev_branch(db, force=force)


def _fetch_github_releases(
    from_version: Optional[str],
    to_version: Optional[str],
) -> Optional[list]:
    """Fetch release notes from GitHub for versions newer than from_version up to to_version."""
    try:
        resp = httpx.get(
            f"{GITHUB_API_URL}/releases",
            timeout=5.0,
            headers={"Accept": "application/vnd.github+json", "User-Agent": "AmmoLedger"},
            params={"per_page": 20},
        )
        if resp.status_code != 200:
            return None

        sections = []
        for release in resp.json():
            if release.get("draft") or release.get("prerelease"):
                continue
            tag = release.get("tag_name", "").lstrip("v")
            if not tag:
                continue
            # Skip releases newer than to_version
            if to_version and version_gt(tag, to_version):
                continue
            # GitHub returns newest-first; stop once we're at or below from_version
            if from_version and not version_gt(tag, from_version):
                break
            published_at = release.get("published_at") or ""
            sections.append({
                "version": tag,
                "date": published_at[:10] if published_at else None,
                "body": release.get("body") or "",
            })

        return sections or None
    except Exception as exc:
        logger.warning("GitHub releases fetch failed: %s", exc)
        return None


def _parse_local_changelog(
    from_version: Optional[str],
    to_version: Optional[str],
) -> Optional[list]:
    """Parse CHANGELOG.md from the filesystem as a fallback."""
    candidates = [
        os.path.join(os.path.dirname(__file__), "CHANGELOG.md"),
        os.path.join(os.path.dirname(__file__), "..", "CHANGELOG.md"),
    ]
    content = None
    for path in candidates:
        try:
            with open(os.path.normpath(path)) as f:
                content = f.read()
            break
        except OSError:
            continue

    if content is None:
        return None

    sections = []
    current_ver: Optional[str] = None
    current_date: Optional[str] = None
    current_lines: list[str] = []

    for line in content.splitlines():
        m = re.match(r"^## \[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?", line)
        if m:
            if current_ver and current_ver.lower() != "unreleased":
                sections.append({
                    "version": current_ver,
                    "date": current_date,
                    "body": "\n".join(current_lines).strip(),
                })
            current_ver = m.group(1)
            current_date = m.group(2)
            current_lines = []
        elif current_ver:
            current_lines.append(line)

    if current_ver and current_ver.lower() != "unreleased":
        sections.append({
            "version": current_ver,
            "date": current_date,
            "body": "\n".join(current_lines).strip(),
        })

    filtered = []
    for s in sections:
        tag = s["version"]
        if to_version and version_gt(tag, to_version):
            continue
        if from_version and not version_gt(tag, from_version):
            continue
        filtered.append(s)

    return filtered or None


def _seed_task_registry(config: dict) -> None:
    """Ensure all task definitions exist in the task_registry table."""
    from models import TaskRegistry  # noqa: PLC0415
    from utils.task_definitions import TASK_DEFINITIONS  # noqa: PLC0415

    backup_schedule = str((config.get("backup") or {}).get("schedule", "03:00")).strip()

    with Session(engine) as db:
        for defn in TASK_DEFINITIONS:
            existing = db.exec(
                select(TaskRegistry).where(TaskRegistry.task_key == defn["task_key"])
            ).first()
            if existing:
                existing.name = defn["name"]
                existing.description = defn["description"]
                db.add(existing)
            else:
                interval_value = defn["interval_value"]
                if defn["task_key"] == "scheduled_backup" and backup_schedule:
                    interval_value = backup_schedule
                db.add(TaskRegistry(
                    task_key=defn["task_key"],
                    name=defn["name"],
                    description=defn["description"],
                    interval_type=defn["interval_type"],
                    interval_value=interval_value,
                    enabled=defn["enabled"],
                ))
        db.commit()
    logger.info("Task registry seeded")


def _record_version() -> None:
    with Session(engine) as db:
        last_seen = get_setting(db, "last_seen_version")
        if last_seen and last_seen != __version__:
            logger.info("AmmoLedger upgraded: %s → %s", last_seen, __version__)
            set_setting(db, "upgraded_from", last_seen)
        set_setting(db, "last_seen_version", __version__)
        set_setting(db, "current_version", __version__)
        db.commit()


@app.on_event("startup")
def on_startup():
    global _config

    # Check /data is writable before doing anything else
    _data_dir = os.path.dirname(CONFIG_PATH)  # typically /data
    _test_file = os.path.join(_data_dir, ".write_test")
    try:
        with open(_test_file, "w") as _f:
            _f.write("ok")
        os.remove(_test_file)
    except PermissionError:
        _border = "═" * 67
        print(
            f"\n{_border}\n"
            f"  ERROR: {_data_dir} directory is not writable\n"
            f"{_border}\n"
            f"\n"
            f"  AmmoLedger needs write access to {_data_dir} for the database,\n"
            f"  config files, and backups.\n"
            f"\n"
            f"  Fix by setting ownership on your host data directory:\n"
            f"\n"
            f"    sudo chown -R 1000:1000 /path/to/your/data\n"
            f"\n"
            f"  The path is whatever you mounted to {_data_dir} in your\n"
            f"  docker-compose.yml volumes section.\n"
            f"\n"
            f"  Example:\n"
            f"    volumes:\n"
            f"      - /var/docker/ammoledger/data:{_data_dir}\n"
            f"\n"
            f"    sudo chown -R 1000:1000 /var/docker/ammoledger/data\n"
            f"\n"
            f"  Then restart the container.\n"
            f"\n"
            f"  For more info see:\n"
            f"  https://github.com/crzykidd/AmmoLedger/blob/main/docs/INSTALL.md\n"
            f"{_border}\n",
            flush=True,
        )
        raise SystemExit(1)

    logger.info("AmmoLedger %s starting...", get_display_version())
    print(f"✓ AmmoLedger {get_display_version()} starting", flush=True)
    _config = load_and_validate_config()
    logger.info("Config loaded from %s", CONFIG_PATH)
    print("✓ Config loaded", flush=True)
    run_migrations()
    logger.info("Migrations complete")
    print("✓ Migrations complete", flush=True)
    ensure_data_dirs()
    sync_yaml_seeds(_config)
    logger.info("Defaults synced")
    print("✓ Defaults synced", flush=True)
    _seed_task_registry(_config)
    logger.info("Task registry ready")
    print("✓ Task registry ready", flush=True)
    _record_version()

    # Community sync — auto-import on first run, add pending on subsequent runs
    try:
        from utils.community_sync import check_first_run, sync_all  # noqa: PLC0415
        with Session(engine) as _csync_session:
            _first_run = check_first_run(_csync_session)
            sync_all(_csync_session, first_run=_first_run)
        logger.info("Community sync complete (first_run=%s)", _first_run)
        print("✓ Community sync complete", flush=True)
    except Exception as _csync_err:
        logger.warning("Community sync failed on startup: %s", _csync_err)
        print(f"⚠ Community sync failed: {_csync_err}", flush=True)

    start_scheduler(_config)
    logger.info("Scheduler started")
    print("✓ Scheduler started", flush=True)
    logger.info("Server ready")
    print(f"✓ AmmoLedger {get_display_version()} ready", flush=True)


@app.on_event("shutdown")
def on_shutdown():
    stop_scheduler()


@app.get("/health")
def health():
    return {"status": "ok", "version": __version__}


@app.get("/system/health")
def system_health(db=Depends(get_session)):
    try:
        db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception:
        db_status = "error"
    return {"status": "ok", "version": __version__, "database": db_status}


def _build_version_response(db: Session) -> dict:
    latest = get_setting(db, "latest_version")
    update_available_raw = get_setting(db, "update_available")
    update_available = update_available_raw == "true" if update_available_raw else False
    last_checked = get_setting(db, "version_last_checked")
    upgraded_from = get_setting(db, "upgraded_from") or None

    dev_behind_raw = get_setting(db, "dev_behind_by")
    try:
        dev_behind_by: Optional[int] = int(dev_behind_raw) if dev_behind_raw not in (None, "") else None
    except ValueError:
        dev_behind_by = None
    dev_latest_sha = get_setting(db, "dev_latest_sha") or None
    dev_latest_message = get_setting(db, "dev_latest_message") or None

    return {
        "version": __version__,
        "display_version": get_display_version(),
        "build": get_build_info(),
        "latest_version": latest,
        "update_available": update_available,
        "build_sha": os.environ.get("GIT_SHA") or None,
        "last_checked": last_checked,
        "upgraded_from": upgraded_from,
        "dev_behind_by": dev_behind_by,
        "dev_latest_sha": dev_latest_sha,
        "dev_latest_message": dev_latest_message,
    }


@app.get("/system/version")
def system_version(user=Depends(require_auth), db=Depends(get_session)):
    _refresh_version_data(db)
    return _build_version_response(db)


@app.post("/system/version/check")
def force_version_check(_=Depends(require_role("admin")), db=Depends(get_session)):
    """Force a fresh GitHub version check, bypassing the 24-hour cache."""
    _refresh_version_data(db, force=True)
    return _build_version_response(db)


@app.get("/system/changelog")
def get_changelog(
    from_version: Optional[str] = Query(None),
    to_version: Optional[str] = Query(None),
    _=Depends(require_auth),
):
    """Return release notes between from_version (exclusive) and to_version (inclusive)."""
    sections = _fetch_github_releases(from_version, to_version)
    if sections is not None:
        return {"source": "github", "sections": sections}

    sections = _parse_local_changelog(from_version, to_version)
    if sections is not None:
        return {"source": "local", "sections": sections}

    return {"source": "unavailable", "sections": []}


@app.post("/system/version/dismiss-upgrade")
def dismiss_upgrade(_=Depends(require_auth), db=Depends(get_session)):
    """Clear the upgraded_from flag so the What's New modal won't appear again."""
    set_setting(db, "upgraded_from", "")
    db.commit()
    return {"ok": True}


@app.get("/system/config")
def get_system_config(_=Depends(require_role("admin"))):
    """Return the safe subset of config.yaml relevant to the admin UI."""
    try:
        with open(CONFIG_PATH) as f:
            cfg = yaml.safe_load(f) or {}
    except Exception:
        cfg = _config
    backup = cfg.get("backup") or {}
    return {
        "backup": {
            "enabled": bool(backup.get("enabled", True)),
            "schedule": str(backup.get("schedule", "03:00")),
            "retention_days": int(backup.get("retention_days", 30)),
        }
    }


@app.post("/system/config")
def save_system_config(body: dict, _=Depends(require_role("admin"))):
    """Persist backup config changes to config.yaml and reschedule the backup job."""
    incoming = (body.get("backup") or {}) if isinstance(body, dict) else {}

    patch = {
        "enabled": bool(incoming.get("enabled", True)),
        "schedule": str(incoming.get("schedule", "03:00")),
        "retention_days": int(incoming.get("retention_days", 30)),
    }
    test_cfg = {"backup": patch, "security": {"session_secret": "x" * 32}, "app": {"session_timeout_hours": 8}}
    result = validate_config(test_cfg)
    backup_errors = [e for e in result["errors"] if e.startswith("[backup")]
    if backup_errors:
        raise HTTPException(status_code=400, detail="; ".join(backup_errors))

    try:
        with open(CONFIG_PATH) as f:
            cfg = yaml.safe_load(f) or {}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not read config.yaml: {exc}") from exc

    if "backup" not in cfg or not isinstance(cfg["backup"], dict):
        cfg["backup"] = {}
    cfg["backup"].update(patch)

    try:
        with open(CONFIG_PATH, "w") as f:
            yaml.dump(cfg, f, default_flow_style=False, allow_unicode=True)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not write config.yaml: {exc}") from exc

    reschedule(cfg)

    return {"backup": patch}
