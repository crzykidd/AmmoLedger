from __future__ import annotations

import json
import re
from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, field_validator, model_serializer

# Matches naive ISO datetime strings: YYYY-MM-DDTHH:MM:SS or YYYY-MM-DDTHH:MM:SS.ffffff
_NAIVE_ISO_RE = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$')

# PEP 563 (`from __future__ import annotations`) defers annotation evaluation.
# When Pydantic resolves `Optional[date]` on a field also named `date`, the
# class attribute `date = None` shadows the imported `datetime.date` in the
# local namespace, yielding `NoneType` instead of the intended type. Using a
# private alias breaks the shadow without changing any public interface.
_Date = date


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


_VALID_MFR_TYPES = {"ammo", "firearm"}


def _validate_mfr_types(value):
    """Accept None | list[str] | JSON-encoded list. Stores as a JSON string.

    Each list element must be in {"ammo", "firearm"}. Returns the JSON-encoded
    string the DB column holds, so create/update payloads land verbatim on the
    column without further coercion.
    """
    if value is None:
        return None
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ValueError(f"types must be a JSON array of strings: {exc}") from exc
    else:
        parsed = value
    if not isinstance(parsed, list):
        raise ValueError("types must be a JSON array")
    cleaned: list[str] = []
    for item in parsed:
        if not isinstance(item, str):
            raise ValueError("types entries must be strings")
        if item not in _VALID_MFR_TYPES:
            raise ValueError(
                f"types entries must be one of {sorted(_VALID_MFR_TYPES)}; got {item!r}"
            )
        if item not in cleaned:
            cleaned.append(item)
    return json.dumps(cleaned)


class ManufacturerRead(_OrmBase):
    id: int
    name: str
    url: Optional[str]
    is_active: bool
    source: str
    community_key: Optional[str] = None
    is_imported: bool = True
    types: Optional[str] = None  # JSON-encoded array, e.g. '["ammo","firearm"]'
    usage_count: int = 0


class ManufacturerCreate(BaseModel):
    name: str
    url: Optional[str] = None
    types: Optional[str] = None

    @field_validator("types", mode="before")
    @classmethod
    def _check_types(cls, v):
        return _validate_mfr_types(v)


class ManufacturerUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    types: Optional[str] = None

    @field_validator("types", mode="before")
    @classmethod
    def _check_types(cls, v):
        return _validate_mfr_types(v)


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


class ImagePreviewRequest(BaseModel):
    source_url: str


class ImageCropBox(BaseModel):
    x: int
    y: int
    width: int
    height: int


class ImageFromSearchRequest(BaseModel):
    preview_token: str
    crop: Optional[ImageCropBox] = None


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


class SplitChildSpec(BaseModel):
    qty_original: int


class SplitRequest(BaseModel):
    split_type: str  # "full" | "partial"
    children: List[SplitChildSpec]


class SplitResponse(BaseModel):
    parent: AmmoBoxRead
    children: List[AmmoBoxRead]
    log_entry: ExpenditureRead


# ---------------------------------------------------------------------------
# Range Session schemas (P3)
# ---------------------------------------------------------------------------

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
