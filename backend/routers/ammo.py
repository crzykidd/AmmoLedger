import csv
import io
import json
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import aliased
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
    ExpenditureLog,
    Location,
    Manufacturer,
    Product,
    User,
)
from schemas import (
    AmmoBoxCreate,
    AmmoBoxRead,
    AmmoBoxUpdate,
    AmmoListResponse,
    BulkUpdateRequest,
    BulkUpdateResponse,
    SplitParentRead,
    SplitRequest,
    SplitResponse,
)
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


def _build_split_note(child_specs: list[int], child_ids: list[int], split_type: str) -> str:
    n = len(child_specs)
    total = sum(child_specs)
    today = date.today().isoformat()

    # 3 or fewer children → comma list; 4+ → range with en-dash (U+2013)
    if n <= 3:
        ids_str = ", ".join(f"#{i}" for i in child_ids)
    else:
        ids_str = f"#{child_ids[0]}–#{child_ids[-1]}"

    all_same = len(set(child_specs)) == 1
    s = child_specs[0] if all_same else None

    if split_type == "full":
        if all_same:
            return f"[Split {today}] Fully split into {n} × {s}-round boxes ({ids_str})"
        return f"[Split {today}] Fully split into {n} boxes ({total} rounds total) → {ids_str}"
    # partial
    if all_same:
        return f"[Split {today}] Split off {n} × {s}-round boxes ({total} rounds) → {ids_str}"
    return f"[Split {today}] Split off {n} boxes ({total} rounds) → {ids_str}"


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
    # Boxes that have children are always included regardless of archive/empty filters —
    # fully-split parents must remain visible so users can access their notes and history.
    _ChildBox = aliased(AmmoBox)
    _has_children = (
        select(_ChildBox.id).where(_ChildBox.split_from_id == AmmoBox.id).exists()
    )
    if not show_archived:
        stmt = stmt.where(or_(AmmoBox.is_archived == False, _has_children))  # noqa: E712
    if not show_empty:
        stmt = stmt.where(or_(AmmoBox.qty_remaining > 0, _has_children))
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

    # Handle product reassignment — pull key fields from the new product
    product_sync_data: dict = {}
    if "product_id" in update_data:
        new_product_id = update_data.pop("product_id")
        if new_product_id is not None:
            product = db.get(Product, new_product_id)
            if not product:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Product ID {new_product_id} not found",
                )
            product_sync_data = {
                "product_id": product.id,
                "caliber_id": product.caliber_id,
                "manufacturer_id": product.manufacturer_id,
                "product_name": product.product_name,
                "gr_oz": product.gr_oz,
                "weight_unit": product.weight_unit,
                "type_id": product.type_id,
                "category_id": product.category_id,
                "ammo_condition_id": product.ammo_condition_id,
            }
        else:
            product_sync_data = {"product_id": None}

    stmt = select(AmmoBox).where(AmmoBox.id.in_(payload.ids))
    boxes = list(db.exec(stmt).all())

    updated = 0
    for box in boxes:
        if user.role == "member" and box.owner_id != user.id:
            continue
        for key, value in product_sync_data.items():
            setattr(box, key, value)
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


@router.post("/{box_id}/split", response_model=SplitResponse, status_code=status.HTTP_201_CREATED)
def split_ammo(
    box_id: int,
    payload: SplitRequest,
    user: User = Depends(require_role("admin", "member")),
    db: Session = Depends(get_session),
):
    box = _get_visible_box(box_id, user, db)
    _check_write(box, user)

    if payload.split_type not in ("full", "partial"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="split_type must be 'full' or 'partial'")
    if box.is_archived:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Cannot split an archived box")
    if box.qty_remaining < 2:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Parent box must have at least 2 rounds remaining to split")
    if len(payload.children) < 2:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="At least 2 boxes are required for a split")
    for child in payload.children:
        if child.qty_original < 1:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Each new box must have at least 1 round")

    total_split = sum(c.qty_original for c in payload.children)

    if total_split > box.qty_remaining:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Split total ({total_split}) exceeds parent qty_remaining ({box.qty_remaining})",
        )
    if payload.split_type == "full" and total_split != box.qty_remaining:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Full split children ({total_split}) must equal parent qty_remaining ({box.qty_remaining})",
        )

    now = datetime.utcnow()

    # 1. Create child records; flush to get IDs before building the note
    children: list[AmmoBox] = []
    for spec in payload.children:
        child = AmmoBox(
            owner_id=box.owner_id,
            is_shared=box.is_shared,
            caliber_id=box.caliber_id,
            manufacturer_id=box.manufacturer_id,
            product_name=box.product_name,
            gr_oz=box.gr_oz,
            weight_unit=box.weight_unit,
            type_id=box.type_id,
            ammo_condition_id=box.ammo_condition_id,
            category_id=box.category_id,
            purchase_date=box.purchase_date,
            cost_per_round=box.cost_per_round,
            dealer_id=box.dealer_id,
            container_id=None,
            location_id=None,
            notes=f"[Split {date.today().isoformat()}] Split from #{box.id}",
            legacy_id=None,
            product_id=None,
            qty_original=spec.qty_original,
            qty_remaining=spec.qty_original,
            split_from_id=box.id,
            is_archived=False,
            archive_reason=None,
            created_at=now,
            updated_at=now,
        )
        db.add(child)
        children.append(child)
    db.flush()

    child_ids = [c.id for c in children]
    child_specs = [c.qty_original for c in children]

    # 2. Build the note line
    split_note = _build_split_note(child_specs, child_ids, payload.split_type)
    logger.debug("Split note: %s", split_note)

    # 3. Reduce parent qty_remaining; archive if full split
    if payload.split_type == "full":
        box.qty_remaining = 0
        box.is_archived = True
        box.archive_reason = "split"
    else:
        box.qty_remaining -= total_split
    box.updated_at = now

    # 4. Append note to parent (never replace existing notes)
    if box.notes:
        box.notes = box.notes + "\n" + split_note
    else:
        box.notes = split_note

    # 5. Write log entry on the parent
    log = ExpenditureLog(
        ammo_box_id=box.id,
        logged_by=user.id,
        rounds_used=total_split,
        date=date.today(),
        log_type="split",
        related_ids=json.dumps(child_ids),
        notes=None,
    )
    db.add(log)

    # 6. Commit and refresh
    db.commit()
    db.refresh(box)
    for child in children:
        db.refresh(child)
    db.refresh(log)

    logger.info(
        "Split: box %d → %d children (%s split, %d rounds), by %s",
        box.id, len(children), payload.split_type, total_split, user.email or user.username,
    )
    return SplitResponse(parent=box, children=children, log_entry=log)


def _is_parent_visible(owner_id: int, is_shared: bool, user: User) -> bool:
    if user.role == "admin":
        return True
    if user.role == "member":
        return is_shared or owner_id == user.id
    return is_shared  # readonly


@router.get("/split-parents", response_model=list[SplitParentRead])
def list_split_parents(
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    """Return metadata for every box that has at least one child (split parent).

    Used by the Group By 'Split Parent' header to show parent info even when
    the parent is filtered out or invisible to the current user. Notes are
    nulled out when the parent isn't visible under normal RBAC rules; all
    other metadata is always returned so headers render correctly.
    """
    from sqlalchemy.orm import aliased as _aliased
    ChildBox = _aliased(AmmoBox)
    has_children_subq = (
        select(ChildBox.id).where(ChildBox.split_from_id == AmmoBox.id).exists()
    )
    stmt = (
        select(
            AmmoBox.id,
            AmmoBox.owner_id,
            AmmoBox.is_shared,
            AmmoBox.caliber_id,
            AmmoBox.manufacturer_id,
            AmmoBox.product_name,
            AmmoBox.qty_original,
            AmmoBox.qty_remaining,
            AmmoBox.is_archived,
            AmmoBox.archive_reason,
            AmmoBox.notes,
            AmmoBox.purchase_date,
            AmmoBox.created_at,
            AmmoBox.updated_at,
            Caliber.name.label("caliber_name"),
            Manufacturer.name.label("manufacturer_name"),
        )
        .join(Caliber, AmmoBox.caliber_id == Caliber.id)
        .join(Manufacturer, AmmoBox.manufacturer_id == Manufacturer.id)
        .where(has_children_subq)
        .order_by(AmmoBox.id.asc())
    )
    rows = db.exec(stmt).all()
    result = []
    for r in rows:
        visible = _is_parent_visible(r.owner_id, r.is_shared, user)
        result.append(
            SplitParentRead(
                id=r.id,
                caliber_id=r.caliber_id,
                manufacturer_id=r.manufacturer_id,
                product_name=r.product_name,
                qty_original=r.qty_original,
                qty_remaining=r.qty_remaining,
                is_archived=r.is_archived,
                archive_reason=r.archive_reason,
                notes=r.notes if visible else None,
                purchase_date=r.purchase_date,
                created_at=r.created_at,
                updated_at=r.updated_at,
                caliber_name=r.caliber_name,
                manufacturer_name=r.manufacturer_name,
            )
        )
    return result


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
    _ChildBox = aliased(AmmoBox)
    _has_children = (
        select(_ChildBox.id).where(_ChildBox.split_from_id == AmmoBox.id).exists()
    )
    if not show_archived:
        stmt = stmt.where(or_(AmmoBox.is_archived == False, _has_children))  # noqa: E712
    if not show_empty:
        stmt = stmt.where(or_(AmmoBox.qty_remaining > 0, _has_children))
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
