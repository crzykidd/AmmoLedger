from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy import select as sa_select
from sqlmodel import Session, select

from database import get_session
from models import AmmoBox, Caliber, ExpenditureLog, Manufacturer, User
from routers.ammo import _get_visible_box
from schemas import ExpenditureRead, ExpendRequest, ExpendResponse, RecentExpenditureRead
from utils.rbac import require_auth, require_role

router = APIRouter(prefix="/ammo", tags=["expenditure"])
expenditures_router = APIRouter(prefix="/expenditures", tags=["expenditure"])


@router.get("/{box_id}/history", response_model=list[ExpenditureRead])
def get_history(
    box_id: int,
    user: User = Depends(require_role("admin", "member")),
    db: Session = Depends(get_session),
):
    box = _get_visible_box(box_id, user, db)
    stmt = select(ExpenditureLog).where(ExpenditureLog.ammo_box_id == box.id)
    if user.role != "admin":
        stmt = stmt.where(ExpenditureLog.logged_by == user.id)
    return db.exec(stmt.order_by(ExpenditureLog.date.desc())).all()


@router.post("/{box_id}/expend", response_model=ExpendResponse, status_code=status.HTTP_201_CREATED)
def expend_ammo(
    box_id: int,
    payload: ExpendRequest,
    user: User = Depends(require_role("admin", "member")),
    db: Session = Depends(get_session),
):
    box = _get_visible_box(box_id, user, db)

    if payload.rounds_used <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="rounds_used must be positive")

    if payload.rounds_used > box.qty_remaining:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot expend {payload.rounds_used} rounds — only {box.qty_remaining} remaining",
        )

    box.qty_remaining -= payload.rounds_used
    box.updated_at = datetime.utcnow()

    log = ExpenditureLog(
        ammo_box_id=box.id,
        logged_by=user.id,
        rounds_used=payload.rounds_used,
        date=payload.date,
        notes=payload.notes,
    )
    db.add(box)
    db.add(log)
    db.commit()
    db.refresh(box)
    db.refresh(log)
    return ExpendResponse(box=box, log_entry=log)


@expenditures_router.get("/recent", response_model=list[RecentExpenditureRead])
def get_recent_expenditures(
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    """Return last 10 expend-type log entries visible to the current user."""
    stmt = (
        sa_select(
            ExpenditureLog.id,
            ExpenditureLog.ammo_box_id,
            Caliber.name.label("caliber_name"),
            Manufacturer.name.label("manufacturer_name"),
            AmmoBox.product_name,
            ExpenditureLog.rounds_used,
            ExpenditureLog.date,
            ExpenditureLog.notes,
            User.first_name,
            User.last_name,
        )
        .join(AmmoBox, ExpenditureLog.ammo_box_id == AmmoBox.id)
        .join(Caliber, AmmoBox.caliber_id == Caliber.id)
        .join(Manufacturer, AmmoBox.manufacturer_id == Manufacturer.id)
        .join(User, ExpenditureLog.logged_by == User.id)
        .where(ExpenditureLog.log_type == "expend")
    )
    if user.role != "admin":
        if user.role == "member":
            stmt = stmt.where(or_(AmmoBox.is_shared == True, AmmoBox.owner_id == user.id))  # noqa: E712
        else:
            stmt = stmt.where(AmmoBox.is_shared == True)  # noqa: E712
    stmt = stmt.order_by(ExpenditureLog.date.desc(), ExpenditureLog.id.desc()).limit(10)
    rows = db.exec(stmt).all()
    return [
        RecentExpenditureRead(
            id=row.id,
            ammo_box_id=row.ammo_box_id,
            caliber_name=row.caliber_name,
            manufacturer_name=row.manufacturer_name,
            product_name=row.product_name,
            rounds_used=row.rounds_used,
            date=row.date,
            logged_by_name=f"{row.first_name} {row.last_name}".strip(),
            notes=row.notes,
        )
        for row in rows
    ]
