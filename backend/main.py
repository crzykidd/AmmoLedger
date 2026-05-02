import os

import yaml
from fastapi import Depends, FastAPI, HTTPException
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
    logger.error(
        "Unhandled exception on %s %s",
        request.method,
        request.url.path,
        exc_info=exc,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error — check server logs"},
    )


def _record_version() -> None:
    with Session(engine) as db:
        last_seen = get_setting(db, "last_seen_version")
        if last_seen and last_seen != __version__:
            logger.info("AmmoLedger upgraded: %s → %s", last_seen, __version__)
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
    latest = get_setting(db, "latest_version")
    update_available_raw = get_setting(db, "update_available")
    update_available = update_available_raw == "true" if update_available_raw else False
    return {
        "version": __version__,
        "latest_version": latest,
        "update_available": update_available,
        "build_sha": os.environ.get("GIT_SHA") or None,
    }


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
