from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime


class AmmoBase(SQLModel):
    caliber: str               # e.g. "9mm", ".308 Win"
    brand: str                 # e.g. "Federal", "Hornady"
    grain: int                 # bullet weight in grains, e.g. 115
    quantity: int              # rounds on hand
    notes: Optional[str] = None


class Ammo(AmmoBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AmmoCreate(AmmoBase):
    pass


class AmmoUpdate(SQLModel):
    caliber: Optional[str] = None
    brand: Optional[str] = None
    grain: Optional[int] = None
    quantity: Optional[int] = None
    notes: Optional[str] = None


class AmmoRead(AmmoBase):
    id: int
    created_at: datetime
    updated_at: datetime


# --- Range Session log ---

class RangeSessionBase(SQLModel):
    ammo_id: int = Field(foreign_key="ammo.id")
    rounds_used: int
    date: datetime = Field(default_factory=datetime.utcnow)
    notes: Optional[str] = None


class RangeSession(RangeSessionBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)


class RangeSessionCreate(RangeSessionBase):
    pass


class RangeSessionRead(RangeSessionBase):
    id: int
