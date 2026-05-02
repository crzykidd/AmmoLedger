import os
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlmodel import Session, select

from database import get_session
from models import (
    AmmoBox,
    AmmoCondition,
    AmmoType,
    Caliber,
    Category,
    Manufacturer,
    Product,
    User,
)
from schemas import AutoGenerateResponse, ProductCreate, ProductRead, ProductUpdate
from utils.config import UPLOADS_PATH
from utils.logging import get_logger
from utils.rbac import require_auth, require_role

logger = get_logger(__name__)

router = APIRouter(tags=["products"])

PRODUCTS_UPLOAD_DIR = Path(UPLOADS_PATH) / "products"
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_name(
    manufacturer_name: str,
    product_name: Optional[str],
    caliber_name: str,
    gr_oz: Optional[float],
    weight_unit: Optional[str],
    type_name: Optional[str],
) -> str:
    parts: list[str] = [manufacturer_name]
    if product_name:
        parts.append(product_name)
    parts.append(caliber_name)
    if gr_oz is not None:
        unit = (weight_unit or "gr").lower()
        parts.append(f"{gr_oz:g}{unit}")
    if type_name:
        parts.append(type_name)
    return " ".join(parts)


def _enrich(product: Product, db: Session) -> ProductRead:
    caliber = db.get(Caliber, product.caliber_id)
    mfr = db.get(Manufacturer, product.manufacturer_id)
    ammo_type = db.get(AmmoType, product.type_id) if product.type_id else None
    category = db.get(Category, product.category_id) if product.category_id else None
    condition = db.get(AmmoCondition, product.ammo_condition_id) if product.ammo_condition_id else None

    usage = db.exec(
        select(func.count()).where(AmmoBox.product_id == product.id)
    ).one()

    data = ProductRead.model_validate(product)
    data.caliber_name = caliber.name if caliber else None
    data.manufacturer_name = mfr.name if mfr else None
    data.type_name = ammo_type.name if ammo_type else None
    data.category_name = category.name if category else None
    data.condition_name = condition.name if condition else None
    data.usage_count = usage
    return data


def _visibility_filter(stmt, user: User):
    if user.role == "admin":
        return stmt
    from sqlalchemy import or_
    return stmt.where(or_(Product.is_shared == True, Product.owner_id == user.id))


def _check_write(product: Product, user: User) -> None:
    if user.role == "admin":
        return
    if product.owner_id != user.id:
        raise HTTPException(status_code=403, detail="You do not have permission to modify this product")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", response_model=list[ProductRead])
def list_products(
    search: Optional[str] = Query(None),
    caliber_id: Optional[int] = Query(None),
    manufacturer_id: Optional[int] = Query(None),
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    stmt = select(Product)
    stmt = _visibility_filter(stmt, user)
    if caliber_id:
        stmt = stmt.where(Product.caliber_id == caliber_id)
    if manufacturer_id:
        stmt = stmt.where(Product.manufacturer_id == manufacturer_id)
    products = db.exec(stmt.order_by(Product.name)).all()

    if search:
        q = search.lower()
        products = [p for p in products if q in p.name.lower()]

    return [_enrich(p, db) for p in products]


@router.get("/auto-generate", response_model=AutoGenerateResponse)
def auto_generate_products(
    user: User = Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    """
    Scan all ammo_box records and create products from unique
    (caliber_id, manufacturer_id, product_name, gr_oz, type_id) combinations.
    Back-fills product_id on all matching boxes.
    """
    boxes = db.exec(select(AmmoBox)).all()

    # Group boxes by their product fingerprint
    groups: dict[tuple, list[AmmoBox]] = {}
    for box in boxes:
        key = (
            box.caliber_id,
            box.manufacturer_id,
            box.product_name or "",
            box.gr_oz if box.gr_oz is not None else -1,
            box.type_id if box.type_id is not None else -1,
        )
        groups.setdefault(key, []).append(box)

    products_created = 0
    boxes_linked = 0

    for key, group in groups.items():
        caliber_id, manufacturer_id, pn_coalesced, gr_oz_coalesced, type_id_coalesced = key
        product_name = pn_coalesced or None
        gr_oz = gr_oz_coalesced if gr_oz_coalesced != -1 else None
        type_id = type_id_coalesced if type_id_coalesced != -1 else None

        # Find existing product via COALESCE-equivalent Python logic
        existing_stmt = (
            select(Product)
            .where(Product.caliber_id == caliber_id)
            .where(Product.manufacturer_id == manufacturer_id)
        )
        candidates = db.exec(existing_stmt).all()
        existing = None
        for c in candidates:
            c_pn = c.product_name or ""
            c_gr = c.gr_oz if c.gr_oz is not None else -1
            c_ti = c.type_id if c.type_id is not None else -1
            if c_pn == pn_coalesced and c_gr == gr_oz_coalesced and c_ti == type_id_coalesced:
                existing = c
                break

        if existing is None:
            # Determine most common category and condition among group boxes
            cat_ids = [b.category_id for b in group if b.category_id is not None]
            cond_ids = [b.ammo_condition_id for b in group if b.ammo_condition_id is not None]
            category_id = Counter(cat_ids).most_common(1)[0][0] if cat_ids else None
            condition_id = Counter(cond_ids).most_common(1)[0][0] if cond_ids else None

            # Average cost (exclude zero/None)
            costs = [b.cost_per_round for b in group if b.cost_per_round and b.cost_per_round > 0]
            default_cost = sum(costs) / len(costs) if costs else None

            weight_unit = next((b.weight_unit for b in group if b.weight_unit), None)

            caliber = db.get(Caliber, caliber_id)
            mfr = db.get(Manufacturer, manufacturer_id)
            ammo_type = db.get(AmmoType, type_id) if type_id else None

            name = _build_name(
                mfr.name if mfr else "Unknown",
                product_name,
                caliber.name if caliber else "Unknown",
                gr_oz,
                weight_unit,
                ammo_type.name if ammo_type else None,
            )

            existing = Product(
                name=name,
                caliber_id=caliber_id,
                manufacturer_id=manufacturer_id,
                product_name=product_name,
                gr_oz=gr_oz,
                weight_unit=weight_unit,
                type_id=type_id,
                category_id=category_id,
                ammo_condition_id=condition_id,
                default_cost=round(default_cost, 4) if default_cost else None,
                owner_id=user.id,
                is_shared=True,
            )
            db.add(existing)
            db.flush()  # get id before linking
            products_created += 1

        # Back-fill product_id on all boxes in this group
        for box in group:
            if box.product_id != existing.id:
                box.product_id = existing.id
                db.add(box)
                boxes_linked += 1

    db.commit()
    logger.info("auto-generate: created %d products, linked %d boxes", products_created, boxes_linked)
    return AutoGenerateResponse(
        products_created=products_created,
        boxes_linked=boxes_linked,
        boxes_unlinked=0,
    )


@router.get("/{product_id}", response_model=ProductRead)
def get_product(
    product_id: int,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    stmt = _visibility_filter(select(Product).where(Product.id == product_id), user)
    if not db.exec(stmt).first():
        raise HTTPException(status_code=403, detail="Access denied")
    return _enrich(product, db)


@router.post("", response_model=ProductRead, status_code=201)
def create_product(
    body: ProductCreate,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    if user.role == "read_only":
        raise HTTPException(status_code=403, detail="Read-only users cannot create products")

    caliber = db.get(Caliber, body.caliber_id)
    mfr = db.get(Manufacturer, body.manufacturer_id)
    if not caliber:
        raise HTTPException(status_code=422, detail="caliber_id not found")
    if not mfr:
        raise HTTPException(status_code=422, detail="manufacturer_id not found")

    ammo_type = db.get(AmmoType, body.type_id) if body.type_id else None

    # Duplicate check
    candidates = db.exec(
        select(Product)
        .where(Product.caliber_id == body.caliber_id)
        .where(Product.manufacturer_id == body.manufacturer_id)
    ).all()
    pn_new = body.product_name or ""
    gr_new = body.gr_oz if body.gr_oz is not None else -1
    ti_new = body.type_id if body.type_id is not None else -1
    for c in candidates:
        if (c.product_name or "") == pn_new and \
                (c.gr_oz if c.gr_oz is not None else -1) == gr_new and \
                (c.type_id if c.type_id is not None else -1) == ti_new:
            raise HTTPException(
                status_code=409,
                detail=f"A product with this combination already exists: {c.name}",
            )

    name = _build_name(
        mfr.name,
        body.product_name,
        caliber.name,
        body.gr_oz,
        body.weight_unit,
        ammo_type.name if ammo_type else None,
    )

    product = Product(
        name=name,
        owner_id=user.id,
        **body.model_dump(),
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    logger.info("product created: %d %s by user %d", product.id, product.name, user.id)
    return _enrich(product, db)


@router.put("/{product_id}", response_model=ProductRead)
def update_product(
    product_id: int,
    body: ProductUpdate,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    _check_write(product, user)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(product, field, value)

    # Regenerate name
    caliber = db.get(Caliber, product.caliber_id)
    mfr = db.get(Manufacturer, product.manufacturer_id)
    ammo_type = db.get(AmmoType, product.type_id) if product.type_id else None
    product.name = _build_name(
        mfr.name if mfr else "Unknown",
        product.product_name,
        caliber.name if caliber else "Unknown",
        product.gr_oz,
        product.weight_unit,
        ammo_type.name if ammo_type else None,
    )
    product.updated_at = datetime.utcnow()

    db.add(product)
    db.commit()
    db.refresh(product)
    return _enrich(product, db)


@router.delete("/{product_id}", status_code=204)
def delete_product(
    product_id: int,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    _check_write(product, user)

    usage = db.exec(
        select(func.count()).where(AmmoBox.product_id == product_id)
    ).one()
    if usage > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Product is used by {usage} box{'es' if usage != 1 else ''} — unlink them first or reassign them",
        )

    # Delete image file if present
    if product.image_path:
        try:
            Path(product.image_path).unlink(missing_ok=True)
        except OSError:
            pass

    db.delete(product)
    db.commit()


@router.post("/{product_id}/image", response_model=ProductRead)
async def upload_product_image(
    product_id: int,
    file: UploadFile = File(...),
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    _check_write(product, user)

    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail=f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

    contents = await file.read()
    if len(contents) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds 5 MB limit")

    PRODUCTS_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    # Remove old image
    if product.image_path:
        try:
            Path(product.image_path).unlink(missing_ok=True)
        except OSError:
            pass

    dest = PRODUCTS_UPLOAD_DIR / f"{product_id}.{ext}"
    dest.write_bytes(contents)

    product.image_path = str(dest)
    product.updated_at = datetime.utcnow()
    db.add(product)
    db.commit()
    db.refresh(product)
    return _enrich(product, db)


@router.delete("/{product_id}/image", response_model=ProductRead)
def delete_product_image(
    product_id: int,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    _check_write(product, user)

    if product.image_path:
        try:
            Path(product.image_path).unlink(missing_ok=True)
        except OSError:
            pass
        product.image_path = None
        product.updated_at = datetime.utcnow()
        db.add(product)
        db.commit()
        db.refresh(product)

    return _enrich(product, db)


@router.get("/{product_id}/image")
def get_product_image(
    product_id: int,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    product = db.get(Product, product_id)
    if not product or not product.image_path:
        raise HTTPException(status_code=404, detail="No image set for this product")

    path = Path(product.image_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Image file not found")

    ext = path.suffix.lstrip(".").lower()
    media_types = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
    }
    media_type = media_types.get(ext, "application/octet-stream")
    return FileResponse(str(path), media_type=media_type)
