import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlmodel import Session, select

from database import get_session
from models import (
    AmmoBox,
    AmmoCondition,
    AmmoType,
    Caliber,
    Category,
    Container,
    Dealer,
    Location,
    Manufacturer,
    User,
)
from schemas import AmmoBoxCreate, AmmoBoxRead, AmmoBoxUpdate, AmmoListResponse, BulkUpdateRequest, BulkUpdateResponse
from utils.logging import get_logger
from utils.rbac import require_auth, require_role

logger = get_logger(__name__)

router = APIRouter(prefix="/ammo", tags=["ammo"])


def _visibility_filter(stmt, user: User):
    """Restrict a select(AmmoBox) statement to rows the user is allowed to see."""
    if user.role == "admin":
        return stmt
    if user.role == "member":
        return stmt.where(or_(AmmoBox.is_shared, AmmoBox.owner_id == user.id))
    return stmt.where(AmmoBox.is_shared)  # readonly: shared only


def _get_visible_box(box_id: int, user: User, db: Session) -> AmmoBox:
    """Return the box if visible to user; always 404 on miss to avoid leaking existence."""
    stmt = _visibility_filter(select(AmmoBox).where(AmmoBox.id == box_id), user)
    box = db.exec(stmt).first()
    if not box:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ammo box not found")
    return box


def _check_write(box: AmmoBox, user: User) -> None:
    """Raise 403 if user cannot modify this box."""
    if user.role == "admin":
        return
    if user.role == "member" and not box.is_shared and box.owner_id == user.id:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")


@router.get("", response_model=AmmoListResponse)
def list_ammo(
    search: Optional[str] = Query(default=None, description="Partial match on product_name or legacy_id"),
    product_name: Optional[str] = Query(default=None, description="Partial match on product name"),
    legacy_id: Optional[str] = Query(default=None, description="Partial match on legacy ID"),
    show_archived: bool = Query(default=False, description="Include archived boxes in results"),
    show_empty: bool = Query(default=False, description="Include empty (qty_remaining=0) boxes in results"),
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    stmt = _visibility_filter(select(AmmoBox), user)
    if not show_archived:
        stmt = stmt.where(AmmoBox.is_archived == False)  # noqa: E712
    if not show_empty:
        stmt = stmt.where(AmmoBox.qty_remaining > 0)
    if search:
        stmt = stmt.where(
            or_(
                AmmoBox.product_name.ilike(f"%{search}%"),
                AmmoBox.legacy_id.ilike(f"%{search}%"),
            )
        )
    if product_name:
        stmt = stmt.where(AmmoBox.product_name.ilike(f"%{product_name}%"))
    if legacy_id:
        stmt = stmt.where(AmmoBox.legacy_id.ilike(f"%{legacy_id}%"))
    boxes = list(db.exec(stmt).all())
    total_rounds = sum(b.qty_remaining for b in boxes)
    costs = [b.qty_remaining * b.cost_per_round for b in boxes if b.cost_per_round is not None]
    total_value = round(sum(costs), 2) if len(costs) == len(boxes) else None
    logger.debug("GET /ammo: %d boxes returned (archived=%s, empty=%s)", len(boxes), show_archived, show_empty)
    return AmmoListResponse(
        boxes=boxes,
        total_boxes=len(boxes),
        total_rounds=total_rounds,
        total_value=total_value,
    )


@router.post("", response_model=AmmoBoxRead, status_code=status.HTTP_201_CREATED)
def create_ammo(
    payload: AmmoBoxCreate,
    user: User = Depends(require_role("admin", "member")),
    db: Session = Depends(get_session),
):
    if payload.is_shared and user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can create shared boxes")

    qty_remaining = payload.qty_remaining if payload.qty_remaining is not None else payload.qty_original
    box = AmmoBox(
        owner_id=user.id,
        is_shared=payload.is_shared,
        caliber_id=payload.caliber_id,
        manufacturer_id=payload.manufacturer_id,
        product_name=payload.product_name,
        gr_oz=payload.gr_oz,
        weight_unit=payload.weight_unit,
        type_id=payload.type_id,
        category_id=payload.category_id,
        qty_original=payload.qty_original,
        qty_remaining=qty_remaining,
        purchase_date=payload.purchase_date,
        cost_per_round=payload.cost_per_round,
        dealer_id=payload.dealer_id,
        location_id=payload.location_id,
        container_id=payload.container_id,
        legacy_id=payload.legacy_id,
        notes=payload.notes,
    )
    db.add(box)
    db.commit()
    db.refresh(box)
    logger.debug("POST /ammo: box created id=%d", box.id)
    return box


@router.patch("/bulk-update", response_model=BulkUpdateResponse)
def bulk_update_ammo(
    payload: BulkUpdateRequest,
    user: User = Depends(require_role("admin", "member")),
    db: Session = Depends(get_session),
):
    if not payload.ids:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No IDs provided")
    if len(payload.ids) > 500:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Cannot bulk-update more than 500 boxes at once")
    if payload.notes_mode not in ("replace", "append"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="notes_mode must be 'replace' or 'append'")

    update_data = payload.updates.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No fields to update")

    if update_data.get("is_shared") is True and user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can make boxes shared")

    has_notes = "notes" in update_data
    notes_value = update_data.pop("notes", None)

    stmt = select(AmmoBox).where(AmmoBox.id.in_(payload.ids))
    boxes = list(db.exec(stmt).all())

    updated = 0
    for box in boxes:
        if user.role == "member" and box.owner_id != user.id:
            continue
        for key, value in update_data.items():
            setattr(box, key, value)
        if has_notes and notes_value:
            if payload.notes_mode == "append" and box.notes:
                box.notes = box.notes + "\n" + notes_value
            else:
                box.notes = notes_value
        elif has_notes and not notes_value:
            pass  # blank notes field means "leave unchanged"
        box.updated_at = datetime.utcnow()
        db.add(box)
        updated += 1

    db.commit()
    logger.info("Bulk update: %d boxes updated by %s", updated, user.email or user.username)
    return BulkUpdateResponse(updated=updated, failed=0)


_CSV_COLUMNS = [
    "ammologger_version", "id", "legacy_id", "caliber", "manufacturer",
    "product_name", "gr_oz", "weight_unit", "type", "category", "ammo_condition",
    "qty_original", "qty_remaining", "purchase_date", "cost_per_round",
    "dealer", "location", "container", "is_archived", "is_shared",
    "notes", "owner", "created_at", "updated_at",
]


def _build_csv(boxes: list[AmmoBox], db: Session) -> bytes:
    calibers = {r.id: r.name for r in db.exec(select(Caliber)).all()}
    manufacturers = {r.id: r.name for r in db.exec(select(Manufacturer)).all()}
    ammo_types = {r.id: r.name for r in db.exec(select(AmmoType)).all()}
    conditions = {r.id: r.name for r in db.exec(select(AmmoCondition)).all()}
    categories = {r.id: r.name for r in db.exec(select(Category)).all()}
    dealers = {r.id: r.name for r in db.exec(select(Dealer)).all()}
    locations = {r.id: r.name for r in db.exec(select(Location)).all()}
    containers = {r.id: r.name for r in db.exec(select(Container)).all()}
    users = {r.id: r.username for r in db.exec(select(User)).all()}

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=_CSV_COLUMNS, lineterminator="\n")
    writer.writeheader()
    for box in boxes:
        writer.writerow({
            "ammologger_version": "1.0",
            "id": box.id,
            "legacy_id": box.legacy_id or "",
            "caliber": calibers.get(box.caliber_id, ""),
            "manufacturer": manufacturers.get(box.manufacturer_id, ""),
            "product_name": box.product_name or "",
            "gr_oz": box.gr_oz if box.gr_oz is not None else "",
            "weight_unit": box.weight_unit or "",
            "type": ammo_types.get(box.type_id, "") if box.type_id else "",
            "category": categories.get(box.category_id, "") if box.category_id else "",
            "ammo_condition": conditions.get(box.ammo_condition_id, "") if box.ammo_condition_id else "",
            "qty_original": box.qty_original,
            "qty_remaining": box.qty_remaining,
            "purchase_date": box.purchase_date.isoformat() if box.purchase_date else "",
            "cost_per_round": box.cost_per_round if box.cost_per_round is not None else "",
            "dealer": dealers.get(box.dealer_id, "") if box.dealer_id else "",
            "location": locations.get(box.location_id, "") if box.location_id else "",
            "container": containers.get(box.container_id, "") if box.container_id else "",
            "is_archived": str(box.is_archived).lower(),
            "is_shared": str(box.is_shared).lower(),
            "notes": box.notes or "",
            "owner": users.get(box.owner_id, ""),
            "created_at": box.created_at.isoformat() if box.created_at else "",
            "updated_at": box.updated_at.isoformat() if box.updated_at else "",
        })
    return output.getvalue().encode("utf-8")


@router.get("/export/csv")
def export_ammo_csv(
    search: Optional[str] = Query(default=None),
    show_archived: bool = Query(default=False),
    show_empty: bool = Query(default=False),
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    stmt = _visibility_filter(select(AmmoBox), user)
    if not show_archived:
        stmt = stmt.where(AmmoBox.is_archived == False)  # noqa: E712
    if not show_empty:
        stmt = stmt.where(AmmoBox.qty_remaining > 0)
    if search:
        stmt = stmt.where(
            or_(
                AmmoBox.product_name.ilike(f"%{search}%"),
                AmmoBox.legacy_id.ilike(f"%{search}%"),
            )
        )
    boxes = list(db.exec(stmt).all())
    csv_bytes = _build_csv(boxes, db)
    date_str = datetime.now().strftime("%Y-%m-%d")
    filename = f"ammoledger_export_{date_str}.csv"
    logger.info("CSV export: %d boxes for %s", len(boxes), user.email or user.username)
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/{box_id}", response_model=AmmoBoxRead)
def get_ammo(
    box_id: int,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    return _get_visible_box(box_id, user, db)


@router.patch("/{box_id}", response_model=AmmoBoxRead)
def update_ammo(
    box_id: int,
    payload: AmmoBoxUpdate,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    box = _get_visible_box(box_id, user, db)
    _check_write(box, user)

    if payload.is_shared is True and user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can make boxes shared")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(box, key, value)
    box.updated_at = datetime.utcnow()
    db.add(box)
    db.commit()
    db.refresh(box)
    logger.debug("PATCH /ammo/%d: updated", box_id)
    return box


@router.delete("/{box_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ammo(
    box_id: int,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    box = _get_visible_box(box_id, user, db)
    _check_write(box, user)
    db.delete(box)
    db.commit()
    logger.debug("DELETE /ammo/%d: deleted by %s", box_id, user.email or user.username)
