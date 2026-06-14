from __future__ import annotations

from typing import List

from pydantic import BaseModel

__all__ = [
    "ThresholdDefaultUpdate",
    "CaliberThresholdRead",
    "CaliberThresholdCreate",
    "LocationThresholdRead",
    "LocationThresholdCreate",
    "LowStockCaliberItem",
    "LowStockLocationItem",
    "LowStockResponse",
    "CaliberStatus",
    "LocationStatus",
    "ThresholdStatusResponse",
]


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
