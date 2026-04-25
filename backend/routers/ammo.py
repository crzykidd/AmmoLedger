from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlmodel import Session, select

from database import get_session
from models import AmmoBox, User
from schemas import AmmoBoxCreate, AmmoBoxRead, AmmoBoxUpdate, AmmoListResponse
from utils.rbac import require_auth, require_role

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
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    stmt = _visibility_filter(select(AmmoBox), user)
    if not show_archived:
        stmt = stmt.where(AmmoBox.is_archived == False)  # noqa: E712
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
        container_id=payload.container_id,
        legacy_id=payload.legacy_id,
        notes=payload.notes,
    )
    db.add(box)
    db.commit()
    db.refresh(box)
    return box


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
