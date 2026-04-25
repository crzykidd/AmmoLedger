import os

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlmodel import Session
from starlette.middleware.sessions import SessionMiddleware

from database import engine, get_session, run_migrations
from utils.config import ensure_data_dirs, get_setting, load_and_validate_config, set_setting
from utils.seeds import sync_yaml_seeds
from routers import auth, ammo, expenditure, lookups
from utils.rbac import require_auth
from version import __version__

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
app.include_router(ammo.router)
app.include_router(expenditure.router)
app.include_router(lookups.router)


def _record_version() -> None:
    """Store current version in app_settings; log upgrades."""
    with Session(engine) as db:
        last_seen = get_setting(db, "last_seen_version")
        if last_seen and last_seen != __version__:
            print(f"AmmoLedger upgraded: {last_seen} → {__version__}")
        set_setting(db, "last_seen_version", __version__)
        set_setting(db, "current_version", __version__)
        db.commit()


@app.on_event("startup")
def on_startup():
    print(f"AmmoLedger v{__version__} starting...")
    config = load_and_validate_config()  # validate config first — exits if invalid in production
    run_migrations()                     # apply pending Alembic migrations
    ensure_data_dirs()                   # create /data/backups and /data/uploads
    sync_yaml_seeds(config)              # versioned smart sync from defaults.yaml
    _record_version()                    # store version in app_settings; detect upgrades


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
    }
