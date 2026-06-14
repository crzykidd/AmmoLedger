from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel

from ._base import _OrmBase

__all__ = [
    "BulkAmmoUpdate",
    "BulkUpdateRequest",
    "BulkUpdateResponse",
    "RecentExpenditureRead",
    "TaskHistoryRead",
    "TaskRegistryRead",
    "TaskRegistryUpdate",
    "NotificationRead",
]


class BulkAmmoUpdate(BaseModel):
    product_id: Optional[int] = None
    manufacturer_id: Optional[int] = None
    type_id: Optional[int] = None
    category_id: Optional[int] = None
    ammo_condition_id: Optional[int] = None
    dealer_id: Optional[int] = None
    location_id: Optional[int] = None
    container_id: Optional[int] = None
    is_shared: Optional[bool] = None
    cost_per_round: Optional[float] = None
    notes: Optional[str] = None


class BulkUpdateRequest(BaseModel):
    ids: List[int]
    updates: BulkAmmoUpdate
    notes_mode: str = "replace"  # "replace" | "append"


class BulkUpdateResponse(BaseModel):
    updated: int
    failed: int


class RecentExpenditureRead(BaseModel):
    id: int
    ammo_box_id: int
    caliber_name: str
    manufacturer_name: str
    product_name: Optional[str]
    rounds_used: int
    date: date
    logged_by_name: str
    notes: Optional[str]


class TaskHistoryRead(_OrmBase):
    id: int
    task_name: str
    started_at: datetime
    ended_at: Optional[datetime]
    duration_ms: Optional[int]
    status: str
    error_message: Optional[str]
    details: Optional[str]
    triggered_by: str


class TaskRegistryRead(_OrmBase):
    id: int
    task_key: str
    name: str
    description: Optional[str]
    interval_type: str
    interval_value: str
    enabled: bool
    last_run_at: Optional[datetime]
    last_status: Optional[str]
    last_duration_ms: Optional[int]
    next_run_at: Optional[datetime]
    created_at: datetime
    warnings: Optional[List[str]] = None


class TaskRegistryUpdate(BaseModel):
    enabled: Optional[bool] = None
    interval_type: Optional[str] = None
    interval_value: Optional[str] = None


class NotificationRead(_OrmBase):
    id: int
    user_id: Optional[int]
    type: str
    title: str
    message: str
    is_read: bool
    created_at: datetime
    read_at: Optional[datetime]
