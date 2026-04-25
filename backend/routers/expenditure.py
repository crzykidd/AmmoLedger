from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from database import get_session
from models import ExpenditureLog, User
from routers.ammo import _get_visible_box
from schemas import ExpenditureRead, ExpendRequest, ExpendResponse
from utils.rbac import require_role

router = APIRouter(prefix="/ammo", tags=["expenditure"])


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
