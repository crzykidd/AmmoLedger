from __future__ import annotations

import re
from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, field_validator

from ._base import _OrmBase

__all__ = [
    "FirearmActionTypeRead",
    "FirearmActionTypeCreate",
    "FirearmActionTypeUpdate",
    "FirearmModelRead",
    "FirearmModelCreate",
    "FirearmModelUpdate",
    "FirearmFrameSizeRead",
    "FirearmFrameSizeCreate",
    "FirearmFrameSizeUpdate",
    "FirearmConditionRead",
    "FirearmConditionCreate",
    "FirearmConditionUpdate",
    "FirearmOpticCutRead",
    "FirearmOpticCutCreate",
    "FirearmOpticCutUpdate",
    "FirearmRailTypeRead",
    "FirearmRailTypeCreate",
    "FirearmRailTypeUpdate",
    "FirearmFinishRead",
    "FirearmFinishCreate",
    "FirearmFinishUpdate",
    "FirearmComplianceTagRead",
    "FirearmComplianceTagCreate",
    "FirearmComplianceTagUpdate",
    "FirearmUserTagRead",
    "FirearmUserTagCreate",
    "FirearmUserTagUpdate",
    "FirearmCreate",
    "FirearmPhotoRead",
    "FirearmPhotoReorderItem",
    "FirearmPhotoReorderRequest",
    "FirearmRead",
    "FirearmUpdate",
    "FirearmLogCreate",
    "FirearmLogRead",
    "FirearmLogUpdate",
]


# ---------------------------------------------------------------------------
# Firearm lookup schemas (P1a — firearm itself lands in P1b)
# ---------------------------------------------------------------------------

class FirearmActionTypeRead(_OrmBase):
    id: int
    name: str
    is_active: bool
    source: str
    community_key: Optional[str] = None
    is_imported: bool = True
    usage_count: int = 0
    firearm_usage_count: int = 0


class FirearmActionTypeCreate(BaseModel):
    name: str


class FirearmActionTypeUpdate(BaseModel):
    name: Optional[str] = None


class FirearmModelRead(_OrmBase):
    id: int
    manufacturer_id: int
    name: str
    default_caliber_id: Optional[int]
    default_action_type_id: Optional[int]
    default_barrel_length_in: Optional[float] = None
    is_active: bool
    source: str
    community_key: Optional[str] = None
    is_imported: bool = True
    # Joined names — populated by the router for cascading-dropdown UX
    manufacturer_name: Optional[str] = None
    default_caliber_name: Optional[str] = None
    default_action_type_name: Optional[str] = None
    usage_count: int = 0
    firearm_usage_count: int = 0


class FirearmModelCreate(BaseModel):
    manufacturer_id: int
    name: str
    default_caliber_id: Optional[int] = None
    default_action_type_id: Optional[int] = None
    default_barrel_length_in: Optional[float] = None

    @field_validator("default_barrel_length_in")
    @classmethod
    def _check_barrel(cls, v):
        if v is not None and v < 0:
            raise ValueError("default_barrel_length_in must be >= 0")
        return v


class FirearmModelUpdate(BaseModel):
    manufacturer_id: Optional[int] = None
    name: Optional[str] = None
    default_caliber_id: Optional[int] = None
    default_action_type_id: Optional[int] = None
    default_barrel_length_in: Optional[float] = None

    @field_validator("default_barrel_length_in")
    @classmethod
    def _check_barrel(cls, v):
        if v is not None and v < 0:
            raise ValueError("default_barrel_length_in must be >= 0")
        return v


# ---------------------------------------------------------------------------
# Firearm physical attribute lookups (v0.3.0)
#
# Frame size, optic cut, rail type, and finish all share the same
# community-curated shape as FirearmActionType. Read schemas include
# `usage_count` populated by the router.
# ---------------------------------------------------------------------------

class FirearmFrameSizeRead(_OrmBase):
    id: int
    name: str
    is_active: bool
    source: str
    community_key: Optional[str] = None
    is_imported: bool = True
    usage_count: int = 0
    firearm_usage_count: int = 0


class FirearmFrameSizeCreate(BaseModel):
    name: str


class FirearmFrameSizeUpdate(BaseModel):
    name: Optional[str] = None


class FirearmConditionRead(_OrmBase):
    id: int
    name: str
    is_active: bool
    source: str
    community_key: Optional[str] = None
    is_imported: bool = True
    usage_count: int = 0
    firearm_usage_count: int = 0


class FirearmConditionCreate(BaseModel):
    name: str


class FirearmConditionUpdate(BaseModel):
    name: Optional[str] = None


class FirearmOpticCutRead(_OrmBase):
    id: int
    name: str
    is_active: bool
    source: str
    community_key: Optional[str] = None
    is_imported: bool = True
    usage_count: int = 0
    firearm_usage_count: int = 0


class FirearmOpticCutCreate(BaseModel):
    name: str


class FirearmOpticCutUpdate(BaseModel):
    name: Optional[str] = None


class FirearmRailTypeRead(_OrmBase):
    id: int
    name: str
    is_active: bool
    source: str
    community_key: Optional[str] = None
    is_imported: bool = True
    usage_count: int = 0
    firearm_usage_count: int = 0


class FirearmRailTypeCreate(BaseModel):
    name: str


class FirearmRailTypeUpdate(BaseModel):
    name: Optional[str] = None


class FirearmFinishRead(_OrmBase):
    id: int
    name: str
    is_active: bool
    source: str
    community_key: Optional[str] = None
    is_imported: bool = True
    usage_count: int = 0
    firearm_usage_count: int = 0


class FirearmFinishCreate(BaseModel):
    name: str


class FirearmFinishUpdate(BaseModel):
    name: Optional[str] = None


class FirearmComplianceTagRead(_OrmBase):
    id: int
    name: str
    description: Optional[str]
    jurisdiction: Optional[str]
    is_active: bool
    source: str
    community_key: Optional[str] = None
    is_imported: bool = True
    usage_count: int = 0
    firearm_usage_count: int = 0


class FirearmComplianceTagCreate(BaseModel):
    name: str
    description: Optional[str] = None
    jurisdiction: Optional[str] = None


class FirearmComplianceTagUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    jurisdiction: Optional[str] = None


_HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _validate_hex_color(value: Optional[str]) -> Optional[str]:
    if value is None or value == "":
        return None
    if not isinstance(value, str) or not _HEX_COLOR_RE.match(value):
        raise ValueError("color must match ^#[0-9A-Fa-f]{6}$ or be null")
    return value


class FirearmUserTagRead(_OrmBase):
    id: int
    owner_id: int
    name: str
    color: Optional[str]
    created_at: datetime


class FirearmUserTagCreate(BaseModel):
    name: str
    color: Optional[str] = None

    @field_validator("color", mode="before")
    @classmethod
    def _check_color(cls, v):
        return _validate_hex_color(v)


class FirearmUserTagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None

    @field_validator("color", mode="before")
    @classmethod
    def _check_color(cls, v):
        return _validate_hex_color(v)


# ---------------------------------------------------------------------------
# Firearm schemas (P1b — registry + event log)
# ---------------------------------------------------------------------------

_VALID_FIREARM_TYPES = {"pistol", "rifle", "shotgun", "other"}
_VALID_FIREARM_EVENT_TYPES = {"cleaning", "service", "note"}


_VALID_WEIGHT_UNITS = {"OZ", "LB"}


class FirearmCreate(BaseModel):
    is_shared: bool = False
    manufacturer_id: int
    firearm_model_id: Optional[int] = None
    custom_model_name: Optional[str] = None
    firearm_type: str
    action_type_id: Optional[int] = None
    caliber_id: int
    caliber_notes: Optional[str] = None
    serial: Optional[str] = None
    # v0.3.0 polish — identity + specifications
    nickname: Optional[str] = None
    firearm_condition_id: Optional[int] = None
    sight_radius_in: Optional[float] = None
    weight: Optional[float] = None
    weight_unit: Optional[str] = None
    twist_rate: Optional[str] = None
    barrel_length_in: Optional[float] = None
    # Physical attribute FKs (v0.3.0 — replaces free-text finish).
    frame_size_id: Optional[int] = None
    optic_cut_id: Optional[int] = None
    rail_type_id: Optional[int] = None
    finish_id: Optional[int] = None
    standard_capacity: Optional[int] = None
    purchase_date: Optional[date] = None
    purchase_price: Optional[float] = None
    dealer_id: Optional[int] = None
    notes: Optional[str] = None
    service_interval_rounds: Optional[int] = None
    service_interval_days: Optional[int] = None
    compliance_tag_ids: List[int] = []
    user_tag_ids: List[int] = []

    @field_validator("firearm_type")
    @classmethod
    def _check_firearm_type(cls, v: str) -> str:
        if v not in _VALID_FIREARM_TYPES:
            raise ValueError(
                f"firearm_type must be one of {sorted(_VALID_FIREARM_TYPES)}; got {v!r}"
            )
        return v

    @field_validator("weight_unit")
    @classmethod
    def _check_weight_unit(cls, v):
        if v is None:
            return v
        v = v.strip().upper()
        if v not in _VALID_WEIGHT_UNITS:
            raise ValueError(f"weight_unit must be one of {sorted(_VALID_WEIGHT_UNITS)} or null; got {v!r}")
        return v

    @field_validator("twist_rate")
    @classmethod
    def _check_twist_rate(cls, v):
        if v is None:
            return v
        v = v.strip()
        return v if v else None

    @field_validator("sight_radius_in")
    @classmethod
    def _check_sight_radius(cls, v):
        if v is not None and v < 0:
            raise ValueError("sight_radius_in must be >= 0")
        return v

    @field_validator("weight")
    @classmethod
    def _check_weight(cls, v):
        if v is not None and v < 0:
            raise ValueError("weight must be >= 0")
        return v

    @field_validator("barrel_length_in")
    @classmethod
    def _check_barrel(cls, v):
        if v is not None and v < 0:
            raise ValueError("barrel_length_in must be >= 0")
        return v

    @field_validator("standard_capacity")
    @classmethod
    def _check_capacity(cls, v):
        if v is not None and v < 0:
            raise ValueError("standard_capacity must be >= 0")
        return v

    @field_validator("purchase_price")
    @classmethod
    def _check_price(cls, v):
        if v is not None and v < 0:
            raise ValueError("purchase_price must be >= 0")
        return v

    @field_validator("service_interval_rounds")
    @classmethod
    def _check_si_rounds(cls, v):
        if v is not None and v < 1:
            raise ValueError("service_interval_rounds must be >= 1")
        return v

    @field_validator("service_interval_days")
    @classmethod
    def _check_si_days(cls, v):
        if v is not None and v < 1:
            raise ValueError("service_interval_days must be >= 1")
        return v

    def model_post_init(self, __context) -> None:
        if self.firearm_model_id is None and not self.custom_model_name:
            raise ValueError(
                "either firearm_model_id or custom_model_name must be provided"
            )
        if self.weight is not None and self.weight_unit is None:
            raise ValueError("weight_unit must be provided when weight is set (OZ or LB)")


class FirearmPhotoRead(BaseModel):
    id: int
    firearm_id: int
    original_name: Optional[str] = None
    content_type: str
    size_bytes: int
    width: int
    height: int
    is_default: bool
    sort_order: int
    uploaded_by: int
    uploaded_at: datetime
    # Server-rendered URLs. The on-disk filename is intentionally not
    # exposed — both endpoints are auth-gated.
    url: str        # full-size: /firearms/{firearm_id}/photos/{photo_id}
    thumb_url: str  # thumbnail: /firearms/{firearm_id}/photos/{photo_id}/thumb


class FirearmPhotoReorderItem(BaseModel):
    photo_id: int
    sort_order: int


class FirearmPhotoReorderRequest(BaseModel):
    items: List[FirearmPhotoReorderItem]


class FirearmRead(_OrmBase):
    id: int
    owner_id: int
    is_shared: bool

    manufacturer_id: int
    manufacturer_name: Optional[str] = None
    firearm_model_id: Optional[int] = None
    firearm_model_name: Optional[str] = None
    custom_model_name: Optional[str] = None
    display_model: str  # firearm_model_name OR custom_model_name (frontend convenience)

    firearm_type: str
    action_type_id: Optional[int] = None
    action_type_name: Optional[str] = None

    caliber_id: int
    caliber_name: Optional[str] = None
    caliber_notes: Optional[str] = None

    serial: Optional[str] = None
    # v0.3.0 polish — identity + specifications
    nickname: Optional[str] = None
    firearm_condition_id: Optional[int] = None
    firearm_condition_name: Optional[str] = None
    sight_radius_in: Optional[float] = None
    weight: Optional[float] = None
    weight_unit: Optional[str] = None
    twist_rate: Optional[str] = None
    barrel_length_in: Optional[float] = None
    # Physical attribute FKs (v0.3.0 — replaces free-text finish). Resolved
    # name fields populated by the router for read-time convenience.
    frame_size_id: Optional[int] = None
    frame_size_name: Optional[str] = None
    optic_cut_id: Optional[int] = None
    optic_cut_name: Optional[str] = None
    rail_type_id: Optional[int] = None
    rail_type_name: Optional[str] = None
    finish_id: Optional[int] = None
    finish_name: Optional[str] = None
    standard_capacity: Optional[int] = None
    purchase_date: Optional[date] = None
    purchase_price: Optional[float] = None
    dealer_id: Optional[int] = None
    dealer_name: Optional[str] = None
    notes: Optional[str] = None

    rounds_lifetime: int
    rounds_since_clean: int
    last_cleaned_at: Optional[date] = None
    service_interval_rounds: Optional[int] = None
    service_interval_days: Optional[int] = None
    cleaning_status: str  # ok | due_soon | overdue

    compliance_tags: List[FirearmComplianceTagRead] = []
    user_tags: List[FirearmUserTagRead] = []

    # Photo summary — populated by the router from a single grouped query.
    photo_count: int = 0
    default_photo_url: Optional[str] = None
    default_photo_thumb_url: Optional[str] = None

    created_at: datetime
    updated_at: datetime


class FirearmUpdate(BaseModel):
    is_shared: Optional[bool] = None
    manufacturer_id: Optional[int] = None
    firearm_model_id: Optional[int] = None
    custom_model_name: Optional[str] = None
    firearm_type: Optional[str] = None
    action_type_id: Optional[int] = None
    caliber_id: Optional[int] = None
    caliber_notes: Optional[str] = None
    serial: Optional[str] = None
    # v0.3.0 polish — identity + specifications
    nickname: Optional[str] = None
    firearm_condition_id: Optional[int] = None
    sight_radius_in: Optional[float] = None
    weight: Optional[float] = None
    weight_unit: Optional[str] = None
    twist_rate: Optional[str] = None
    barrel_length_in: Optional[float] = None
    # Physical attribute FKs (v0.3.0).
    frame_size_id: Optional[int] = None
    optic_cut_id: Optional[int] = None
    rail_type_id: Optional[int] = None
    finish_id: Optional[int] = None
    standard_capacity: Optional[int] = None
    purchase_date: Optional[date] = None
    purchase_price: Optional[float] = None
    dealer_id: Optional[int] = None
    notes: Optional[str] = None
    service_interval_rounds: Optional[int] = None
    service_interval_days: Optional[int] = None
    compliance_tag_ids: Optional[List[int]] = None  # if provided, replaces full set
    user_tag_ids: Optional[List[int]] = None        # if provided, replaces full set

    @field_validator("firearm_type")
    @classmethod
    def _check_firearm_type(cls, v):
        if v is not None and v not in _VALID_FIREARM_TYPES:
            raise ValueError(
                f"firearm_type must be one of {sorted(_VALID_FIREARM_TYPES)}; got {v!r}"
            )
        return v

    @field_validator("weight_unit")
    @classmethod
    def _check_weight_unit(cls, v):
        if v is None:
            return v
        v = v.strip().upper()
        if v not in _VALID_WEIGHT_UNITS:
            raise ValueError(f"weight_unit must be one of {sorted(_VALID_WEIGHT_UNITS)} or null; got {v!r}")
        return v

    @field_validator("twist_rate")
    @classmethod
    def _check_twist_rate(cls, v):
        if v is None:
            return v
        v = v.strip()
        return v if v else None

    @field_validator("sight_radius_in")
    @classmethod
    def _check_sight_radius(cls, v):
        if v is not None and v < 0:
            raise ValueError("sight_radius_in must be >= 0")
        return v

    @field_validator("weight")
    @classmethod
    def _check_weight(cls, v):
        if v is not None and v < 0:
            raise ValueError("weight must be >= 0")
        return v

    @field_validator("barrel_length_in")
    @classmethod
    def _check_barrel(cls, v):
        if v is not None and v < 0:
            raise ValueError("barrel_length_in must be >= 0")
        return v

    @field_validator("standard_capacity")
    @classmethod
    def _check_capacity(cls, v):
        if v is not None and v < 0:
            raise ValueError("standard_capacity must be >= 0")
        return v

    @field_validator("purchase_price")
    @classmethod
    def _check_price(cls, v):
        if v is not None and v < 0:
            raise ValueError("purchase_price must be >= 0")
        return v

    @field_validator("service_interval_rounds")
    @classmethod
    def _check_si_rounds(cls, v):
        if v is not None and v < 1:
            raise ValueError("service_interval_rounds must be >= 1")
        return v

    @field_validator("service_interval_days")
    @classmethod
    def _check_si_days(cls, v):
        if v is not None and v < 1:
            raise ValueError("service_interval_days must be >= 1")
        return v


class FirearmLogCreate(BaseModel):
    event_type: str
    event_date: date
    # Snapshot of firearm.rounds_lifetime at event time. None → server snapshots
    # the firearm's current rounds_lifetime when the row is inserted.
    rounds_at_event: Optional[int] = None
    notes: Optional[str] = None

    @field_validator("event_type")
    @classmethod
    def _check_event_type(cls, v: str) -> str:
        if v not in _VALID_FIREARM_EVENT_TYPES:
            raise ValueError(
                f"event_type must be one of {sorted(_VALID_FIREARM_EVENT_TYPES)}; got {v!r}"
            )
        return v

    @field_validator("rounds_at_event")
    @classmethod
    def _check_rounds(cls, v):
        if v is not None and v < 0:
            raise ValueError("rounds_at_event must be >= 0")
        return v


class FirearmLogRead(_OrmBase):
    id: int
    firearm_id: int
    event_type: str
    event_date: date
    rounds_at_event: int
    notes: Optional[str] = None
    logged_by: int
    logged_by_name: str
    created_at: datetime


class FirearmLogUpdate(BaseModel):
    event_type: Optional[str] = None
    event_date: Optional[date] = None
    rounds_at_event: Optional[int] = None
    notes: Optional[str] = None

    @field_validator("event_type")
    @classmethod
    def _check_event_type(cls, v):
        if v is not None and v not in _VALID_FIREARM_EVENT_TYPES:
            raise ValueError(
                f"event_type must be one of {sorted(_VALID_FIREARM_EVENT_TYPES)}; got {v!r}"
            )
        return v

    @field_validator("rounds_at_event")
    @classmethod
    def _check_rounds(cls, v):
        if v is not None and v < 0:
            raise ValueError("rounds_at_event must be >= 0")
        return v
