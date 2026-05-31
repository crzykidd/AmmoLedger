from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, field_validator

from ._base import _Date, _OrmBase

__all__ = [
    "RangeSessionLineCreate",
    "RangeSessionLineRead",
    "RangeSessionLineUpdate",
    "RangeSessionCreate",
    "RangeSessionRead",
    "RangeSessionUpdate",
    "RangeSessionListItem",
]


class RangeSessionLineCreate(BaseModel):
    firearm_id: Optional[int] = None
    ammo_box_id: Optional[int] = None
    rounds_fired: int
    notes: Optional[str] = None

    @field_validator("rounds_fired")
    @classmethod
    def _check_rounds(cls, v: int) -> int:
        if v < 0:
            raise ValueError("rounds_fired must be >= 0")
        return v

    def model_post_init(self, __context) -> None:
        if self.firearm_id is None and self.ammo_box_id is None:
            raise ValueError(
                "each line must reference at least one of firearm_id or ammo_box_id"
            )


class RangeSessionLineRead(_OrmBase):
    id: int
    session_id: int
    firearm_id: Optional[int] = None
    firearm_display: Optional[str] = None  # "Manufacturer Model"
    ammo_box_id: Optional[int] = None
    ammo_box_display: Optional[str] = None  # "Box #N (Caliber Mfg Product)"
    rounds_fired: int
    notes: Optional[str] = None
    created_at: datetime


class RangeSessionLineUpdate(BaseModel):
    firearm_id: Optional[int] = None
    ammo_box_id: Optional[int] = None
    rounds_fired: Optional[int] = None
    notes: Optional[str] = None

    @field_validator("rounds_fired")
    @classmethod
    def _check_rounds(cls, v):
        if v is not None and v < 0:
            raise ValueError("rounds_fired must be >= 0")
        return v


class RangeSessionCreate(BaseModel):
    is_shared: bool = False
    date: date
    location_name: Optional[str] = None
    notes: Optional[str] = None
    lines: List[RangeSessionLineCreate] = []

    def model_post_init(self, __context) -> None:
        if not self.lines:
            raise ValueError("a range session must have at least one line")


class RangeSessionRead(_OrmBase):
    id: int
    owner_id: int
    owner_name: str
    is_shared: bool
    date: date
    location_name: Optional[str] = None
    notes: Optional[str] = None
    lines: List[RangeSessionLineRead] = []
    total_rounds: int
    distinct_firearms: int
    distinct_boxes: int
    created_at: datetime
    updated_at: datetime


class RangeSessionUpdate(BaseModel):
    """Header-only update. Lines are managed via the line endpoints."""
    is_shared: Optional[bool] = None
    date: Optional[_Date] = None
    location_name: Optional[str] = None
    notes: Optional[str] = None


class RangeSessionListItem(BaseModel):
    """Compact list shape — no embedded lines, just totals for the index page."""
    id: int
    date: date
    location_name: Optional[str] = None
    owner_id: int
    owner_name: str
    is_shared: bool
    total_rounds: int
    distinct_firearms: int
    distinct_boxes: int
    line_count: int
    # Populated only when the list endpoint is filtered by firearm_id — sums
    # rounds_fired across this session's lines that reference the filter
    # firearm. Lets the firearm detail Sessions tab show per-firearm totals
    # without an N+1 fetch loop.
    rounds_for_filter_firearm: Optional[int] = None
