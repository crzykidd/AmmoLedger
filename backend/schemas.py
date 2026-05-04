from __future__ import annotations

import re
from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, model_serializer

# Matches naive ISO datetime strings: YYYY-MM-DDTHH:MM:SS or YYYY-MM-DDTHH:MM:SS.ffffff
_NAIVE_ISO_RE = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$')


class _OrmBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    @model_serializer(mode="wrap")
    def _serialize_utc(self, handler):
        data = handler(self)
        if not isinstance(data, dict):
            return data
        for key in list(data.keys()):
            v = data[key]
            if isinstance(v, datetime) and v.tzinfo is None:
                data[key] = v.isoformat() + "Z"
            elif isinstance(v, str) and _NAIVE_ISO_RE.match(v):
                data[key] = v + "Z"
        return data


# ---------------------------------------------------------------------------
# Lookup schemas
# ---------------------------------------------------------------------------

class LookupRead(_OrmBase):
    id: int
    name: str
    is_active: bool
    source: str
    community_key: Optional[str] = None
    is_imported: bool = True
    usage_count: int = 0


class LookupCreate(BaseModel):
    name: str


class ManufacturerRead(_OrmBase):
    id: int
    name: str
    url: Optional[str]
    is_active: bool
    source: str
    community_key: Optional[str] = None
    is_imported: bool = True
    usage_count: int = 0


class ManufacturerCreate(BaseModel):
    name: str
    url: Optional[str] = None


class ManufacturerUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None


class DealerRead(_OrmBase):
    id: int
    name: str
    url: Optional[str]
    is_active: bool
    source: str
    community_key: Optional[str] = None
    is_imported: bool = True
    types: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    is_standard_geo: bool = True
    usage_count: int = 0


class DealerCreate(BaseModel):
    name: str
    url: Optional[str] = None


class DealerUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None


class LocationRead(_OrmBase):
    id: int
    name: str
    notes: Optional[str]
    is_active: bool
    source: str
    usage_count: int = 0


class LocationCreate(BaseModel):
    name: str
    notes: Optional[str] = None


class ContainerRead(_OrmBase):
    id: int
    name: str
    location_id: Optional[int]
    notes: Optional[str]
    is_active: bool
    source: str
    usage_count: int = 0


class ContainerCreate(BaseModel):
    name: str
    location_id: Optional[int] = None
    notes: Optional[str] = None


class LookupUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None


# ---------------------------------------------------------------------------
# Product schemas
# ---------------------------------------------------------------------------

class ProductRead(_OrmBase):
    id: int
    name: str
    caliber_id: int
    manufacturer_id: int
    product_name: Optional[str]
    gr_oz: Optional[float]
    weight_unit: Optional[str]
    type_id: Optional[int]
    category_id: Optional[int]
    ammo_condition_id: Optional[int]
    default_cost: Optional[float]
    upc: Optional[str]
    image_path: Optional[str]
    notes: Optional[str]
    owner_id: int
    is_shared: bool
    created_at: datetime
    updated_at: datetime
    # Joined names (populated in router)
    caliber_name: Optional[str] = None
    manufacturer_name: Optional[str] = None
    type_name: Optional[str] = None
    category_name: Optional[str] = None
    condition_name: Optional[str] = None
    usage_count: int = 0


class ProductCreate(BaseModel):
    caliber_id: int
    manufacturer_id: int
    product_name: Optional[str] = None
    gr_oz: Optional[float] = None
    weight_unit: Optional[str] = "GR"
    type_id: Optional[int] = None
    category_id: Optional[int] = None
    ammo_condition_id: Optional[int] = None
    default_cost: Optional[float] = None
    upc: Optional[str] = None
    notes: Optional[str] = None
    is_shared: bool = True


class ProductUpdate(BaseModel):
    caliber_id: Optional[int] = None
    manufacturer_id: Optional[int] = None
    product_name: Optional[str] = None
    gr_oz: Optional[float] = None
    weight_unit: Optional[str] = None
    type_id: Optional[int] = None
    category_id: Optional[int] = None
    ammo_condition_id: Optional[int] = None
    default_cost: Optional[float] = None
    upc: Optional[str] = None
    notes: Optional[str] = None
    is_shared: Optional[bool] = None


class ProductUpdateResponse(BaseModel):
    product: ProductRead
    boxes_updated: int = 0


class AutoGenerateResponse(BaseModel):
    products_created: int
    boxes_linked: int
    boxes_unlinked: int


# ---------------------------------------------------------------------------
# Ammo box schemas
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Expenditure schemas
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# User schemas
# ---------------------------------------------------------------------------

class UserRead(_OrmBase):
    id: int
    email: str
    first_name: str
    last_name: str
    role: str
    is_active: bool
    must_change_password: bool
    created_at: datetime
    last_login_at: Optional[datetime]


class UserUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None


# ---------------------------------------------------------------------------
# Registration and password management schemas
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    token: str
    first_name: str
    last_name: str
    email: str
    password: str
    confirm_password: str


class PasswordResetRequest(BaseModel):
    new_password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str


# ---------------------------------------------------------------------------
# Invitation schemas
# ---------------------------------------------------------------------------

class InvitationCreate(BaseModel):
    role: str  # admin | member | readonly
    email_hint: Optional[str] = None
    expires_hours: int = 72


class InvitationRead(_OrmBase):
    id: int
    token: str
    created_by: int
    created_at: datetime
    expires_at: datetime
    used_at: Optional[datetime]
    used_by: Optional[int]
    role: str
    email_hint: Optional[str]
    is_revoked: bool


class InviteRead(BaseModel):
    """InvitationRead with computed status and invite_url."""
    id: int
    token: str
    created_by: int
    created_at: datetime
    expires_at: datetime
    used_at: Optional[datetime]
    used_by: Optional[int]
    role: str
    email_hint: Optional[str]
    is_revoked: bool
    status: str          # valid | expired | used | revoked
    invite_url: Optional[str] = None


# ---------------------------------------------------------------------------
# Bulk update schemas
# ---------------------------------------------------------------------------

class BulkAmmoUpdate(BaseModel):
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


# ---------------------------------------------------------------------------
# Threshold schemas
# ---------------------------------------------------------------------------

class ThresholdDefaultUpdate(BaseModel):
    rounds: int


class CaliberThresholdRead(BaseModel):
    id: int
    caliber_id: int
    caliber_name: str
    rounds: int
    rounds_on_hand: int
    is_low: bool


class CaliberThresholdCreate(BaseModel):
    caliber_id: int
    rounds: int


class LocationThresholdRead(BaseModel):
    id: int
    location_id: int
    location_name: str
    rounds: int
    rounds_on_hand: int
    is_low: bool


class LocationThresholdCreate(BaseModel):
    location_id: int
    rounds: int


class LowStockCaliberItem(BaseModel):
    caliber_id: int
    caliber_name: str
    rounds_on_hand: int
    threshold: int


class LowStockLocationItem(BaseModel):
    location_id: int
    location_name: str
    rounds_on_hand: int
    threshold: int


class LowStockResponse(BaseModel):
    calibers: List[LowStockCaliberItem]
    locations: List[LowStockLocationItem]


class CaliberStatus(BaseModel):
    caliber_id: int
    caliber_name: str
    rounds_on_hand: int
    threshold: int
    is_low: bool
    is_override: bool


class LocationStatus(BaseModel):
    location_id: int
    location_name: str
    rounds_on_hand: int
    threshold: int
    is_low: bool


class ThresholdStatusResponse(BaseModel):
    calibers: List[CaliberStatus]
    locations: List[LocationStatus]
    default_rounds: int


# ---------------------------------------------------------------------------
# Recent expenditure schema
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Task schemas
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Notification schemas
# ---------------------------------------------------------------------------

class NotificationRead(_OrmBase):
    id: int
    user_id: Optional[int]
    type: str
    title: str
    message: str
    is_read: bool
    created_at: datetime
    read_at: Optional[datetime]
