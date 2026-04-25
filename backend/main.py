from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from datetime import datetime
from typing import List

from database import create_db_and_tables, get_session
from models import (
    Ammo, AmmoCreate, AmmoUpdate, AmmoRead,
    RangeSession, RangeSessionCreate, RangeSessionRead,
)

app = FastAPI(title="AmmoLedger API", version="0.1.0")

# Allow the React frontend to talk to the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    create_db_and_tables()


# --- Health check ---

@app.get("/health")
def health():
    return {"status": "ok"}


# --- Ammo inventory routes ---

@app.get("/ammo", response_model=List[AmmoRead])
def list_ammo(session: Session = Depends(get_session)):
    return session.exec(select(Ammo)).all()


@app.get("/ammo/{ammo_id}", response_model=AmmoRead)
def get_ammo(ammo_id: int, session: Session = Depends(get_session)):
    ammo = session.get(Ammo, ammo_id)
    if not ammo:
        raise HTTPException(status_code=404, detail="Ammo not found")
    return ammo


@app.post("/ammo", response_model=AmmoRead, status_code=201)
def create_ammo(ammo: AmmoCreate, session: Session = Depends(get_session)):
    db_ammo = Ammo.from_orm(ammo)
    session.add(db_ammo)
    session.commit()
    session.refresh(db_ammo)
    return db_ammo


@app.patch("/ammo/{ammo_id}", response_model=AmmoRead)
def update_ammo(ammo_id: int, ammo: AmmoUpdate, session: Session = Depends(get_session)):
    db_ammo = session.get(Ammo, ammo_id)
    if not db_ammo:
        raise HTTPException(status_code=404, detail="Ammo not found")
    ammo_data = ammo.dict(exclude_unset=True)
    for key, value in ammo_data.items():
        setattr(db_ammo, key, value)
    db_ammo.updated_at = datetime.utcnow()
    session.add(db_ammo)
    session.commit()
    session.refresh(db_ammo)
    return db_ammo


@app.delete("/ammo/{ammo_id}", status_code=204)
def delete_ammo(ammo_id: int, session: Session = Depends(get_session)):
    db_ammo = session.get(Ammo, ammo_id)
    if not db_ammo:
        raise HTTPException(status_code=404, detail="Ammo not found")
    session.delete(db_ammo)
    session.commit()


# --- Range session routes ---

@app.get("/sessions", response_model=List[RangeSessionRead])
def list_sessions(session: Session = Depends(get_session)):
    return session.exec(select(RangeSession)).all()


@app.post("/sessions", response_model=RangeSessionRead, status_code=201)
def log_range_session(
    range_session: RangeSessionCreate,
    session: Session = Depends(get_session)
):
    # Deduct rounds from inventory
    ammo = session.get(Ammo, range_session.ammo_id)
    if not ammo:
        raise HTTPException(status_code=404, detail="Ammo not found")
    if ammo.quantity < range_session.rounds_used:
        raise HTTPException(status_code=400, detail="Not enough rounds in inventory")

    ammo.quantity -= range_session.rounds_used
    ammo.updated_at = datetime.utcnow()
    session.add(ammo)

    db_session = RangeSession.from_orm(range_session)
    session.add(db_session)
    session.commit()
    session.refresh(db_session)
    return db_session
