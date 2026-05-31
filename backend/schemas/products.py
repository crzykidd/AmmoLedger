from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from ._base import _OrmBase

__all__ = [
    "ProductRead",
    "ProductCreate",
    "ProductUpdate",
    "ProductUpdateResponse",
    "AutoGenerateResponse",
    "ImagePreviewRequest",
    "ImageCropBox",
    "ImageFromSearchRequest",
]


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
    empty_count: int = 0
    archived_count: int = 0


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
