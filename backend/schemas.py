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


class ManufacturerRead(_OrmBase):
    id: int
    name: str
    url: Optional[str]
    is_active: bool
    source: str


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
    container_id: Optional[int] = None
    legacy_id: Optional[str] = None
    notes: Optional[str] = None


class AmmoBoxUpdate(BaseModel):
    is_shared: Optional[bool] = None
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
