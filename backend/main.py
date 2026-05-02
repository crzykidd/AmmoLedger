import os
import re
import sys
import traceback
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
import yaml
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlmodel import Session
from starlette.middleware.sessions import SessionMiddleware
from starlette.requests import Request

from database import engine, get_session, run_migrations
from routers import auth, ammo, expenditure, lookups, users
from routers.backup import router as backup_router
from routers.importer import router as import_router
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
from version import __version__

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
app.include_router(import_router, prefix="/import")
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

def _version_gt(a: str, b: str) -> bool:
    """Return True if version a is strictly greater than version b."""
    try:
        def parse(v: str):
            return tuple(int(x) for x in v.lstrip("v").split(".")[:3])
        return parse(a) > parse(b)
    except Exception:
        return False


def _fetch_github_latest(db: Session, force: bool = False) -> None:
    """Check GitHub for the latest release; update app_settings cache if stale (>24 h)."""
    last_checked_str = get_setting(db, "version_last_checked")
    now = datetime.now(timezone.utc)

    if not force and last_checked_str:
        try:
            last_checked = datetime.fromisoformat(last_checked_str)
            if last_checked.tzinfo is None:
                last_checked = last_checked.replace(tzinfo=timezone.utc)
            if (now - last_checked) < timedelta(hours=24):
                return
        except ValueError:
            pass

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
                set_setting(db, "latest_version", latest)
                set_setting(db, "update_available", "true" if _version_gt(latest, __version__) else "false")
    except Exception as exc:
        logger.warning("GitHub version check failed: %s", exc)

    set_setting(db, "version_last_checked", now.isoformat())
    db.commit()


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
            if to_version and _version_gt(tag, to_version):
                continue
            # GitHub returns newest-first; stop once we're at or below from_version
            if from_version and not _version_gt(tag, from_version):
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
        if to_version and _version_gt(tag, to_version):
            continue
        if from_version and not _version_gt(tag, from_version):
            continue
        filtered.append(s)

    return filtered or None


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
    logger.info("AmmoLedger v%s starting...", __version__)
    _config = load_and_validate_config()
    logger.info("Config loaded from %s", CONFIG_PATH)
    run_migrations()
    logger.info("Migrations complete")
    ensure_data_dirs()
    sync_yaml_seeds(_config)
    logger.info("Defaults synced")
    _record_version()
    start_scheduler(_config)
    logger.info("Server ready")


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


@app.get("/system/version")
def system_version(user=Depends(require_auth), db=Depends(get_session)):
    _fetch_github_latest(db)
    latest = get_setting(db, "latest_version")
    update_available_raw = get_setting(db, "update_available")
    update_available = update_available_raw == "true" if update_available_raw else False
    last_checked = get_setting(db, "version_last_checked")
    upgraded_from = get_setting(db, "upgraded_from") or None
    return {
        "version": __version__,
        "latest_version": latest,
        "update_available": update_available,
        "build_sha": os.environ.get("GIT_SHA") or None,
        "last_checked": last_checked,
        "upgraded_from": upgraded_from,
    }


@app.post("/system/version/check")
def force_version_check(_=Depends(require_role("admin")), db=Depends(get_session)):
    """Force a fresh GitHub version check, bypassing the 24-hour cache."""
    _fetch_github_latest(db, force=True)
    latest = get_setting(db, "latest_version")
    update_available_raw = get_setting(db, "update_available")
    update_available = update_available_raw == "true" if update_available_raw else False
    last_checked = get_setting(db, "version_last_checked")
    upgraded_from = get_setting(db, "upgraded_from") or None
    return {
        "version": __version__,
        "latest_version": latest,
        "update_available": update_available,
        "build_sha": os.environ.get("GIT_SHA") or None,
        "last_checked": last_checked,
        "upgraded_from": upgraded_from,
    }


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
