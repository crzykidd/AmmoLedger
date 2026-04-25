from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class _OrmBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Lookup schemas
# ---------------------------------------------------------------------------

class LookupRead(_OrmBase):
    id: int
    name: str
    is_active: bool
    source: str


class LookupCreate(BaseModel):
    name: str


class DealerRead(_OrmBase):
    id: int
    name: str
    url: Optional[str]
    is_active: bool
    source: str


class DealerCreate(BaseModel):
    name: str
    url: Optional[str] = None


class LocationRead(_OrmBase):
    id: int
    name: str
    notes: Optional[str]


class LocationCreate(BaseModel):
    name: str
    notes: Optional[str] = None


class ContainerRead(_OrmBase):
    id: int
    name: str
    location_id: Optional[int]
    notes: Optional[str]


class ContainerCreate(BaseModel):
    name: str
    location_id: Optional[int] = None
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Ammo box schemas
# ---------------------------------------------------------------------------

class AmmoBoxRead(_OrmBase):
    id: int
    owner_id: int
    is_shared: bool
    caliber_id: int
    manufacturer_id: int
    gr_oz: Optional[float]
    weight_unit: Optional[str]
    type_id: Optional[int]
    category_id: Optional[int]
    qty_original: int
    qty_remaining: int
    purchase_date: Optional[date]
    cost_per_round: Optional[float]
    dealer_id: Optional[int]
    container_id: Optional[int]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime


class AmmoBoxCreate(BaseModel):
    caliber_id: int
    manufacturer_id: int
    qty_original: int
    qty_remaining: Optional[int] = None  # defaults to qty_original if omitted
    is_shared: bool = False
    gr_oz: Optional[float] = None
    weight_unit: Optional[str] = None
    type_id: Optional[int] = None
    category_id: Optional[int] = None
    purchase_date: Optional[date] = None
    cost_per_round: Optional[float] = None
    dealer_id: Optional[int] = None
    container_id: Optional[int] = None
    notes: Optional[str] = None


class AmmoBoxUpdate(BaseModel):
    is_shared: Optional[bool] = None
    caliber_id: Optional[int] = None
    manufacturer_id: Optional[int] = None
    gr_oz: Optional[float] = None
    weight_unit: Optional[str] = None
    type_id: Optional[int] = None
    category_id: Optional[int] = None
    qty_original: Optional[int] = None
    qty_remaining: Optional[int] = None
    purchase_date: Optional[date] = None
    cost_per_round: Optional[float] = None
    dealer_id: Optional[int] = None
    container_id: Optional[int] = None
    notes: Optional[str] = None


class AmmoListResponse(BaseModel):
    boxes: List[AmmoBoxRead]
    total_boxes: int
    total_rounds: int
    total_value: Optional[float]  # None when any visible box lacks cost_per_round


# ---------------------------------------------------------------------------
# Expenditure schemas
# ---------------------------------------------------------------------------

class ExpenditureRead(_OrmBase):
    id: int
    ammo_box_id: int
    logged_by: int
    rounds_used: int
    date: date
    notes: Optional[str]
    created_at: datetime


class ExpendRequest(BaseModel):
    rounds_used: int
    date: date
    notes: Optional[str] = None


class ExpendResponse(BaseModel):
    box: AmmoBoxRead
    log_entry: ExpenditureRead
