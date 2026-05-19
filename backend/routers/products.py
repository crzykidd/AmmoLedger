import re
import secrets
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy import select as sa_select
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
from schemas import (
    AutoGenerateResponse,
    ImageFromSearchRequest,
    ImagePreviewRequest,
    ProductCreate,
    ProductRead,
    ProductUpdate,
    ProductUpdateResponse,
)
from utils.config import UPLOADS_PATH
from utils.image_search import ImageSearchNotConfigured, get_provider
from utils.logging import get_logger
from utils.rbac import require_auth, require_role

logger = get_logger(__name__)

router = APIRouter(tags=["products"])

PRODUCTS_UPLOAD_DIR = Path(UPLOADS_PATH) / "products"
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
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


def _build_maps(products: list, db: Session) -> dict:
    """Batch-load all lookup data for a list of products (~7 queries total)."""
    if not products:
        return {"caliber": {}, "manufacturer": {}, "ammo_type": {}, "category": {}, "condition": {}, "usage": {}}

    caliber_ids = {p.caliber_id for p in products if p.caliber_id}
    mfr_ids = {p.manufacturer_id for p in products if p.manufacturer_id}
    type_ids = {p.type_id for p in products if p.type_id}
    category_ids = {p.category_id for p in products if p.category_id}
    condition_ids = {p.ammo_condition_id for p in products if p.ammo_condition_id}
    product_ids = [p.id for p in products]

    caliber_map = {c.id: c.name for c in db.exec(select(Caliber).where(Caliber.id.in_(caliber_ids))).all()} if caliber_ids else {}
    mfr_map = {m.id: m.name for m in db.exec(select(Manufacturer).where(Manufacturer.id.in_(mfr_ids))).all()} if mfr_ids else {}
    type_map = {t.id: t.name for t in db.exec(select(AmmoType).where(AmmoType.id.in_(type_ids))).all()} if type_ids else {}
    category_map = {c.id: c.name for c in db.exec(select(Category).where(Category.id.in_(category_ids))).all()} if category_ids else {}
    condition_map = {c.id: c.name for c in db.exec(select(AmmoCondition).where(AmmoCondition.id.in_(condition_ids))).all()} if condition_ids else {}

    usage_rows = db.execute(
        sa_select(AmmoBox.product_id, func.count().label("cnt"))
        .where(AmmoBox.product_id.in_(product_ids))
        .group_by(AmmoBox.product_id)
    ).fetchall()
    usage_map = {r[0]: r[1] for r in usage_rows}

    return {
        "caliber": caliber_map,
        "manufacturer": mfr_map,
        "ammo_type": type_map,
        "category": category_map,
        "condition": condition_map,
        "usage": usage_map,
    }


def _enrich(product: Product, db: Session) -> ProductRead:
    return _enrich_with_maps(product, _build_maps([product], db))


def _enrich_with_maps(product: Product, maps: dict) -> ProductRead:
    data = ProductRead.model_validate(product)
    data.caliber_name = maps["caliber"].get(product.caliber_id)
    data.manufacturer_name = maps["manufacturer"].get(product.manufacturer_id)
    data.type_name = maps["ammo_type"].get(product.type_id) if product.type_id else None
    data.category_name = maps["category"].get(product.category_id) if product.category_id else None
    data.condition_name = maps["condition"].get(product.ammo_condition_id) if product.ammo_condition_id else None
    data.usage_count = maps["usage"].get(product.id, 0)
    return data


def _visibility_filter(stmt, user: User):
    if user.role == "admin":
        return stmt
    from sqlalchemy import or_
    return stmt.where(or_(Product.is_shared, Product.owner_id == user.id))


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

    maps = _build_maps(products, db)
    return [_enrich_with_maps(p, maps) for p in products]


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


_BOX_SYNC_FIELDS = (
    "caliber_id", "manufacturer_id", "product_name", "gr_oz",
    "weight_unit", "type_id", "category_id", "ammo_condition_id",
)


@router.put("/{product_id}", response_model=ProductUpdateResponse)
def update_product(
    product_id: int,
    body: ProductUpdate,
    sync_boxes: bool = Query(False),
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

    # Duplicate check (exclude self)
    candidates = db.exec(
        select(Product)
        .where(Product.caliber_id == product.caliber_id)
        .where(Product.manufacturer_id == product.manufacturer_id)
        .where(Product.id != product_id)
    ).all()
    pn_new = product.product_name or ""
    gr_new = product.gr_oz if product.gr_oz is not None else -1
    ti_new = product.type_id if product.type_id is not None else -1
    for c in candidates:
        if (c.product_name or "") == pn_new and \
                (c.gr_oz if c.gr_oz is not None else -1) == gr_new and \
                (c.type_id if c.type_id is not None else -1) == ti_new:
            raise HTTPException(
                status_code=409,
                detail=f"A product with this combination already exists: {c.name}",
            )

    product.updated_at = datetime.utcnow()
    db.add(product)
    db.commit()
    db.refresh(product)

    boxes_updated = 0
    if sync_boxes:
        boxes = db.exec(
            select(AmmoBox).where(AmmoBox.product_id == product_id)
        ).all()
        for box in boxes:
            for field in _BOX_SYNC_FIELDS:
                setattr(box, field, getattr(product, field))
            box.updated_at = datetime.utcnow()
            db.add(box)
        if boxes:
            db.commit()
            boxes_updated = len(boxes)
            logger.info("synced %d boxes from product %d", boxes_updated, product_id)

    return ProductUpdateResponse(product=_enrich(product, db), boxes_updated=boxes_updated)


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

    ext = Path(file.filename).suffix.lower() if file.filename else ".jpg"
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=422, detail=f"Unsupported image format. Allowed: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}")

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

    # Use product.id from the DB result (trusted integer), not product_id from URL (tainted)
    safe_id = int(product.id)
    dest = PRODUCTS_UPLOAD_DIR / f"{safe_id}{ext}"
    resolved = dest.resolve()
    if not resolved.is_relative_to(PRODUCTS_UPLOAD_DIR.resolve()):
        raise HTTPException(status_code=400, detail="Invalid file path")
    resolved.write_bytes(contents)

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


# ---------------------------------------------------------------------------
# Image search endpoints (Find Image Online feature)
# ---------------------------------------------------------------------------

_PREVIEW_DIR = Path("/tmp/ammoledger_image_previews")
_PREVIEW_TTL_SECONDS = 15 * 60


def _cleanup_stale_previews(preview_dir: Path) -> None:
    import time
    cutoff = time.time() - _PREVIEW_TTL_SECONDS
    try:
        for f in preview_dir.glob("*.bin"):
            try:
                if f.stat().st_mtime < cutoff:
                    f.unlink(missing_ok=True)
                    meta = f.with_suffix(".meta")
                    meta.unlink(missing_ok=True)
            except OSError:
                pass
    except OSError as exc:
        logger.debug("preview cleanup: %s", exc)


# Preview tokens are produced by secrets.token_urlsafe(24), which yields a
# 32-character string from the alphabet [A-Za-z0-9_-]. We still apply the
# regex as a first-line reject for obviously malformed input, but the
# returned Path objects come from Path.iterdir() — never from f-string
# concatenation with the user-supplied token. This is the pattern CodeQL
# recognizes as a path-injection sanitizer.
_PREVIEW_TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{32}$")


def _lookup_preview_paths(token: str) -> Optional[tuple[Path, Path]]:
    """
    Resolve a preview token to its on-disk (.bin, .meta) Path pair by
    enumerating _PREVIEW_DIR and matching the file stem against the
    token. Returns None if no matching file exists (caller should
    respond with 404).

    The Path objects returned originate from Path.iterdir() — the OS's
    directory entries — not from user-controlled string concatenation.
    This is the sanitizer pattern documented for CodeQL's py/path-injection
    query.

    Raises HTTPException(400) for obviously malformed tokens (failing
    fast before touching the filesystem).
    """
    if _PREVIEW_TOKEN_RE.fullmatch(token) is None:
        raise HTTPException(status_code=400, detail="Invalid token")

    try:
        entries = list(_PREVIEW_DIR.iterdir())
    except (OSError, FileNotFoundError):
        return None

    bin_path: Optional[Path] = None
    meta_path: Optional[Path] = None
    for entry in entries:
        # `entry` is a Path object from iterdir(); its name is the actual
        # on-disk filename, not anything derived from user input.
        if entry.name == f"{token}.bin":
            bin_path = entry
        elif entry.name == f"{token}.meta":
            meta_path = entry
        if bin_path is not None and meta_path is not None:
            break

    if bin_path is None:
        return None
    # meta_path may be None if the .meta file was lost; that's not fatal
    # for the GET endpoint (it falls back to JPEG), but we surface it so
    # the caller can decide. Return a synthetic Path for the meta slot
    # only if it doesn't need to exist; otherwise return None to mean
    # "no preview." Practically, .bin existence is the only requirement.
    return (bin_path, meta_path if meta_path is not None else _PREVIEW_DIR / "__missing__")


@router.get("/{product_id}/image/search")
async def search_product_images(
    product_id: int,
    q: str = Query(..., min_length=1, max_length=200),
    page: int = Query(0, ge=0, le=20),
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    _check_write(product, user)

    try:
        provider = get_provider()
    except ImageSearchNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))

    try:
        results = await provider.search(q, page=page)
    except httpx.HTTPStatusError as e:
        logger.warning("image search provider returned %s: %s", e.response.status_code, e.response.text[:200])
        raise HTTPException(status_code=502, detail="Image search provider returned an error")
    except httpx.HTTPError as e:
        logger.warning("image search provider request failed: %s", e)
        raise HTTPException(status_code=502, detail="Image search provider unreachable")

    return {
        "query": q,
        "page": page,
        "results": [r.__dict__ for r in results],
    }


@router.post("/{product_id}/image/preview")
async def preview_product_image(
    product_id: int,
    body: ImagePreviewRequest,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    _check_write(product, user)

    if not (body.source_url.startswith("http://") or body.source_url.startswith("https://")):
        raise HTTPException(status_code=422, detail="source_url must be http(s)")

    MAX_FETCH_BYTES = 10 * 1024 * 1024
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            async with client.stream("GET", body.source_url) as resp:
                resp.raise_for_status()
                content_type = resp.headers.get("content-type", "").lower()
                if not content_type.startswith("image/"):
                    raise HTTPException(status_code=422, detail=f"URL did not return an image (got {content_type})")
                chunks: list[bytes] = []
                total = 0
                async for chunk in resp.aiter_bytes():
                    total += len(chunk)
                    if total > MAX_FETCH_BYTES:
                        raise HTTPException(status_code=413, detail="Source image exceeds 10 MB limit")
                    chunks.append(chunk)
                raw = b"".join(chunks)
    except HTTPException:
        raise
    except httpx.HTTPError as e:
        logger.warning("preview fetch failed: %s", e)
        raise HTTPException(status_code=502, detail="Could not fetch source image")

    from io import BytesIO
    from PIL import Image, UnidentifiedImageError
    try:
        img = Image.open(BytesIO(raw))
        img.verify()
        img = Image.open(BytesIO(raw))
        width, height = img.size
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=422, detail="Source URL is not a valid image")

    fmt = (img.format or "").upper()
    if fmt in ("HEIC", "HEIF"):
        raise HTTPException(status_code=422, detail="HEIC/HEIF not supported — export as JPEG and try again")

    _PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    token = secrets.token_urlsafe(24)
    temp_path = _PREVIEW_DIR / f"{token}.bin"
    temp_path.write_bytes(raw)

    meta_path = _PREVIEW_DIR / f"{token}.meta"
    meta_path.write_text(f"{fmt}\n{width}\n{height}\n", encoding="utf-8")

    _cleanup_stale_previews(_PREVIEW_DIR)

    return {
        "preview_token": token,
        "preview_url": f"/api/products/{product_id}/image/preview/{token}",
        "width": width,
        "height": height,
    }


@router.get("/{product_id}/image/preview/{token}")
def get_preview_image(
    product_id: int,
    token: str,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    _check_write(product, user)

    # Path objects returned by the lookup helper originate from
    # Path.iterdir(); they are not constructed from user-supplied data.
    paths = _lookup_preview_paths(token)
    if paths is None:
        raise HTTPException(status_code=404, detail="Preview not found or expired")
    path, meta_path = paths

    # Defense-in-depth: confirm the discovered path is still under the
    # preview dir. Should be unreachable since iterdir() returns only
    # direct children, but the check costs nothing.
    try:
        if not path.resolve().is_relative_to(_PREVIEW_DIR.resolve()):
            raise HTTPException(status_code=404, detail="Preview not found or expired")
    except ValueError:
        raise HTTPException(status_code=404, detail="Preview not found or expired")

    fmt = "JPEG"
    if meta_path.exists():
        try:
            fmt = meta_path.read_text(encoding="utf-8").splitlines()[0]
        except OSError:
            pass
    media_types = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp", "GIF": "image/gif"}
    return FileResponse(str(path), media_type=media_types.get(fmt, "application/octet-stream"))


@router.post("/{product_id}/image/from-search", response_model=ProductRead)
def commit_searched_image(
    product_id: int,
    body: ImageFromSearchRequest,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    _check_write(product, user)

    # Path objects returned by the lookup helper originate from
    # Path.iterdir(); they are not constructed from user-supplied data.
    try:
        paths = _lookup_preview_paths(body.preview_token)
    except HTTPException as exc:
        if exc.status_code == 400:
            raise HTTPException(status_code=400, detail="Invalid preview token")
        raise
    if paths is None:
        raise HTTPException(status_code=404, detail="Preview not found or expired")
    temp_path, meta_path = paths

    # Defense-in-depth: confirm the discovered path is still under the
    # preview dir. Should be unreachable since iterdir() returns only
    # direct children, but the check costs nothing.
    try:
        if not temp_path.resolve().is_relative_to(_PREVIEW_DIR.resolve()):
            raise HTTPException(status_code=404, detail="Preview not found or expired")
    except ValueError:
        raise HTTPException(status_code=404, detail="Preview not found or expired")

    from PIL import Image, ImageOps
    img = Image.open(temp_path)
    img = ImageOps.exif_transpose(img)

    if body.crop is not None:
        c = body.crop
        x = max(0, min(c.x, img.width - 1))
        y = max(0, min(c.y, img.height - 1))
        w = max(1, min(c.width, img.width - x))
        h = max(1, min(c.height, img.height - y))
        img = img.crop((x, y, x + w, y + h))

    MAX_DIM = 2048
    if max(img.width, img.height) > MAX_DIM:
        img.thumbnail((MAX_DIM, MAX_DIM), Image.Resampling.LANCZOS)

    if img.mode in ("RGBA", "LA", "P"):
        rgb = Image.new("RGB", img.size, (255, 255, 255))
        rgb.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
        img = rgb
    elif img.mode != "RGB":
        img = img.convert("RGB")

    if product.image_path:
        try:
            Path(product.image_path).unlink(missing_ok=True)
        except OSError:
            pass

    PRODUCTS_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_id = int(product.id)
    dest = PRODUCTS_UPLOAD_DIR / f"{safe_id}.jpg"
    resolved = dest.resolve()
    try:
        if not resolved.is_relative_to(PRODUCTS_UPLOAD_DIR.resolve()):
            raise HTTPException(status_code=400, detail="Invalid file path")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file path")
    img.save(str(resolved), format="JPEG", quality=85, optimize=True)

    product.image_path = str(dest)
    product.updated_at = datetime.utcnow()
    db.add(product)
    db.commit()
    db.refresh(product)

    try:
        temp_path.unlink(missing_ok=True)
        meta_path.unlink(missing_ok=True)
    except OSError:
        pass

    logger.info("product %d image set via search by user %d", product.id, user.id)
    return _enrich(product, db)
