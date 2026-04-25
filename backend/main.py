import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from database import run_migrations
from utils.config import load_config
from utils.seeds import sync_yaml_seeds
from routers import auth, ammo, expenditure, lookups

SESSION_SECRET = os.getenv("SESSION_SECRET", "dev-secret-change-in-production")

app = FastAPI(title="AmmoLedger API", version="0.1.0")

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


@app.on_event("startup")
def on_startup():
    run_migrations()              # apply pending Alembic migrations first
    config = load_config()        # ensure dirs, copy defaults if missing, create config if missing
    sync_yaml_seeds(config)       # versioned smart sync from defaults.yaml


@app.get("/health")
def health():
    return {"status": "ok"}
