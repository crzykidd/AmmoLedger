from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import run_migrations

app = FastAPI(title="AmmoLedger API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    run_migrations()
    # sync_yaml_seeds()  — Phase 2
    # check_first_run()  — Phase 2 (auth)


@app.get("/health")
def health():
    return {"status": "ok"}
