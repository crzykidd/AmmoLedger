from __future__ import annotations

import json
from typing import Optional

from pydantic import BaseModel, field_validator

from ._base import _OrmBase

__all__ = [
    "LookupRead",
    "LookupCreate",
    "ManufacturerRead",
    "ManufacturerCreate",
    "ManufacturerUpdate",
    "DealerRead",
    "DealerCreate",
    "DealerUpdate",
    "LocationRead",
    "LocationCreate",
    "ContainerRead",
    "ContainerCreate",
    "LookupUpdate",
]


class LookupRead(_OrmBase):
    id: int
    name: str
    is_active: bool
    source: str
    community_key: Optional[str] = None
    is_imported: bool = True
    usage_count: int = 0
    firearm_usage_count: int = 0


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
    firearm_usage_count: int = 0


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
    firearm_usage_count: int = 0


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
    firearm_usage_count: int = 0


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
    firearm_usage_count: int = 0


class ContainerCreate(BaseModel):
    name: str
    location_id: Optional[int] = None
    notes: Optional[str] = None


class LookupUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
