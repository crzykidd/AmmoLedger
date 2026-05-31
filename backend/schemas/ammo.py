from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel

from ._base import _OrmBase

__all__ = [
    "AmmoBoxRead",
    "AmmoBoxCreate",
    "AmmoBoxUpdate",
    "AmmoListResponse",
    "SplitParentRead",
    "ExpenditureRead",
    "ExpendRequest",
    "ExpendResponse",
    "SplitChildSpec",
    "SplitRequest",
    "SplitResponse",
]


class AmmoBoxRead(_OrmBase):
    id: int
    owner_id: int
    is_shared: bool
    product_id: Optional[int]
    caliber_id: int
    manufacturer_id: int
    product_name: Optional[str]
    gr_oz: Optional[float]
    weight_unit: Optional[str]
    type_id: Optional[int]
    ammo_condition_id: Optional[int]
    category_id: Optional[int]
    qty_original: int
    qty_remaining: int
    purchase_date: Optional[date]
    cost_per_round: Optional[float]
    dealer_id: Optional[int]
    location_id: Optional[int]
    container_id: Optional[int]
    legacy_id: Optional[str]
    notes: Optional[str]
    split_from_id: Optional[int]
    is_archived: bool
    archive_reason: Optional[str]
    created_at: datetime
    updated_at: datetime


class AmmoBoxCreate(BaseModel):
    caliber_id: int
    manufacturer_id: int
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    qty_original: int
    qty_remaining: Optional[int] = None  # defaults to qty_original if omitted
    is_shared: bool = False
    gr_oz: Optional[float] = None
    weight_unit: Optional[str] = None
    type_id: Optional[int] = None
    ammo_condition_id: Optional[int] = None
    category_id: Optional[int] = None
    purchase_date: Optional[date] = None
    cost_per_round: Optional[float] = None
    dealer_id: Optional[int] = None
    location_id: Optional[int] = None
    container_id: Optional[int] = None
    legacy_id: Optional[str] = None
    notes: Optional[str] = None


class AmmoBoxUpdate(BaseModel):
    is_shared: Optional[bool] = None
    product_id: Optional[int] = None
    caliber_id: Optional[int] = None
    manufacturer_id: Optional[int] = None
    product_name: Optional[str] = None
    gr_oz: Optional[float] = None
    weight_unit: Optional[str] = None
    type_id: Optional[int] = None
    ammo_condition_id: Optional[int] = None
    category_id: Optional[int] = None
    qty_original: Optional[int] = None
    qty_remaining: Optional[int] = None
    purchase_date: Optional[date] = None
    cost_per_round: Optional[float] = None
    dealer_id: Optional[int] = None
    location_id: Optional[int] = None
    container_id: Optional[int] = None
    legacy_id: Optional[str] = None
    notes: Optional[str] = None
    is_archived: Optional[bool] = None
    archive_reason: Optional[str] = None


class AmmoListResponse(BaseModel):
    boxes: List[AmmoBoxRead]
    total_boxes: int
    total_rounds: int
    total_value: Optional[float]  # None when any visible box lacks cost_per_round


class SplitParentRead(_OrmBase):
    id: int
    caliber_id: int
    manufacturer_id: int
    product_name: Optional[str]
    qty_original: int
    qty_remaining: int
    is_archived: bool
    archive_reason: Optional[str]
    notes: Optional[str]  # null when not visible to current user
    purchase_date: Optional[date]
    created_at: datetime
    updated_at: datetime
    caliber_name: str
    manufacturer_name: str


class ExpenditureRead(_OrmBase):
    id: int
    ammo_box_id: int
    logged_by: int
    rounds_used: int
    date: date
    log_type: str
    related_ids: Optional[str]
    notes: Optional[str]
    created_at: datetime


class ExpendRequest(BaseModel):
    rounds_used: int
    date: date
    notes: Optional[str] = None


class ExpendResponse(BaseModel):
    box: AmmoBoxRead
    log_entry: ExpenditureRead


class SplitChildSpec(BaseModel):
    qty_original: int


class SplitRequest(BaseModel):
    split_type: str  # "full" | "partial"
    children: List[SplitChildSpec]


class SplitResponse(BaseModel):
    parent: AmmoBoxRead
    children: List[AmmoBoxRead]
    log_entry: ExpenditureRead
