"""Range Sessions API (P3 + P6 CSV export).

Multi-line range sessions tying firearms to ammo boxes. Each line optionally
references a firearm and/or an ammo box and records rounds_fired. Side
effects are routed through the existing models so we never have a parallel
deduction path:

- Ammo deduction: writes an ExpenditureLog row (log_type='expend') tagged
  with range_session_line_id pointing back at the line. Editing or deleting
  the session/line reverses by querying on that link.
- Firearm counters: rounds_lifetime AND rounds_since_clean are incremented
  on the firearm directly. Reversal decrements the same fields, clamped at 0.

All session-level mutations happen inside one DB transaction — a partial
overdraw on the second line of a multi-line POST rolls back the entire
session insert.

RBAC mirrors firearms/ammo:
- admin: sees and writes everything
- member: sees own + shared sessions; can write own non-shared sessions
- read_only: sees shared only; no writes

Visibility into the *referenced* firearm/box for a line uses each domain's
existing visibility rules. Following the existing /ammo/:id/expend semantic,
a member can fire from a shared box even though they cannot otherwise
modify it.
"""
import csv
import io
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_
from sqlmodel import Session, select

from database import get_session
from models import (
    AmmoBox,
    Caliber,
    ExpenditureLog,
    Firearm,
    FirearmModel,
    Manufacturer,
    RangeSession,
    RangeSessionLine,
    User,
)
from routers.ammo import _get_visible_box
from routers.firearms import _get_visible_firearm
from schemas import (
    RangeSessionCreate,
    RangeSessionLineCreate,
    RangeSessionLineRead,
    RangeSessionLineUpdate,
    RangeSessionListItem,
    RangeSessionRead,
    RangeSessionUpdate,
)
from utils.logging import get_logger
from utils.rbac import require_auth, require_role

logger = get_logger(__name__)

router = APIRouter(prefix="/range-sessions", tags=["range_sessions"])


# ---------------------------------------------------------------------------
# Visibility / write helpers
# ---------------------------------------------------------------------------

def _visibility_filter(stmt, user: User):
    if user.role == "admin":
        return stmt
    if user.role == "member":
        return stmt.where(or_(RangeSession.is_shared, RangeSession.owner_id == user.id))
    return stmt.where(RangeSession.is_shared)  # read_only


def _get_visible_session(session_id: int, user: User, db: Session) -> RangeSession:
    stmt = _visibility_filter(
        select(RangeSession).where(RangeSession.id == session_id), user
    )
    s = db.exec(stmt).first()
    if not s:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Range session not found"
        )
    return s


def _check_write(session: RangeSession, user: User) -> None:
    if user.role == "admin":
        return
    if (
        user.role == "member"
        and not session.is_shared
        and session.owner_id == user.id
    ):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions"
    )


# ---------------------------------------------------------------------------
# Side-effect helpers
# ---------------------------------------------------------------------------

def _apply_session_line(
    line: RangeSessionLine,
    rounds_fired: int,
    firearm_id: Optional[int],
    ammo_box_id: Optional[int],
    user: User,
    session_date: date,
    db: Session,
) -> Optional[ExpenditureLog]:
    """Apply the side effects of a session line.

    - If ``ammo_box_id`` is set and ``rounds_fired > 0``: deduct from the box
      and write an ExpenditureLog row tagged with ``range_session_line_id``.
      Visibility on the box is required; per existing /expend semantics any
      user who can see a shared box may draw from it.
    - If ``firearm_id`` is set and ``rounds_fired > 0``: bump
      ``rounds_lifetime`` and ``rounds_since_clean`` on the firearm.

    The caller is responsible for committing the transaction.
    """
    expend_log: Optional[ExpenditureLog] = None
    if ammo_box_id is not None and rounds_fired > 0:
        box = _get_visible_box(ammo_box_id, user, db)
        if rounds_fired > box.qty_remaining:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Cannot fire {rounds_fired} rounds from box #{box.id} — "
                    f"only {box.qty_remaining} remaining"
                ),
            )
        box.qty_remaining -= rounds_fired
        box.updated_at = datetime.utcnow()
        db.add(box)
        expend_log = ExpenditureLog(
            ammo_box_id=box.id,
            logged_by=user.id,
            rounds_used=rounds_fired,
            date=session_date,
            log_type="expend",
            notes=f"Range session #{line.session_id}",
            range_session_line_id=line.id,
        )
        db.add(expend_log)

    if firearm_id is not None and rounds_fired > 0:
        firearm = _get_visible_firearm(firearm_id, user, db)
        firearm.rounds_lifetime += rounds_fired
        firearm.rounds_since_clean += rounds_fired
        firearm.updated_at = datetime.utcnow()
        db.add(firearm)

    return expend_log


def _reverse_session_line(line: RangeSessionLine, db: Session) -> None:
    """Undo the side effects of a session line.

    Restores box ``qty_remaining`` and removes the matching ExpenditureLog
    rows; decrements firearm counters (clamped at 0). Caller commits.
    """
    expend_logs = db.exec(
        select(ExpenditureLog).where(ExpenditureLog.range_session_line_id == line.id)
    ).all()
    for log in expend_logs:
        box = db.get(AmmoBox, log.ammo_box_id)
        if box is not None:
            box.qty_remaining += log.rounds_used
            box.updated_at = datetime.utcnow()
            db.add(box)
        db.delete(log)

    if line.firearm_id is not None and line.rounds_fired > 0:
        firearm = db.get(Firearm, line.firearm_id)
        if firearm is not None:
            firearm.rounds_lifetime = max(
                0, firearm.rounds_lifetime - line.rounds_fired
            )
            firearm.rounds_since_clean = max(
                0, firearm.rounds_since_clean - line.rounds_fired
            )
            firearm.updated_at = datetime.utcnow()
            db.add(firearm)


# ---------------------------------------------------------------------------
# Bulk-load helpers — mirror the N+1-avoidance pattern in routers/products.py
# ---------------------------------------------------------------------------

def _build_owner_name_map(sessions: list[RangeSession], db: Session) -> dict[int, str]:
    if not sessions:
        return {}
    owner_ids = {s.owner_id for s in sessions}
    users = db.exec(select(User).where(User.id.in_(owner_ids))).all()
    return {
        u.id: (f"{u.first_name} {u.last_name}".strip() or (u.email or u.username))
        for u in users
    }


def _firearm_display_for(
    firearm_id: Optional[int],
    firearm_map: dict[int, Firearm],
    mfr_map: dict[int, str],
    model_map: dict[int, str],
) -> Optional[str]:
    if firearm_id is None:
        return None
    f = firearm_map.get(firearm_id)
    if f is None:
        return None
    mfr_name = mfr_map.get(f.manufacturer_id, "")
    model_name = (
        model_map.get(f.firearm_model_id)
        if f.firearm_model_id is not None
        else None
    ) or f.custom_model_name or ""
    display = f"{mfr_name} {model_name}".strip()
    return display or None


def _box_display_for(
    box_id: Optional[int],
    box_map: dict[int, AmmoBox],
    cal_map: dict[int, str],
    mfr_map: dict[int, str],
) -> Optional[str]:
    if box_id is None:
        return None
    b = box_map.get(box_id)
    if b is None:
        return None
    cal = cal_map.get(b.caliber_id, "")
    mfr = mfr_map.get(b.manufacturer_id, "")
    parts = [p for p in (cal, mfr, b.product_name) if p]
    inner = " ".join(parts).strip()
    return f"Box #{b.id} ({inner})" if inner else f"Box #{b.id}"


def _build_line_lookup_maps(lines: list[RangeSessionLine], db: Session) -> dict:
    firearm_ids = {ln.firearm_id for ln in lines if ln.firearm_id is not None}
    box_ids = {ln.ammo_box_id for ln in lines if ln.ammo_box_id is not None}

    firearms = (
        db.exec(select(Firearm).where(Firearm.id.in_(firearm_ids))).all()
        if firearm_ids
        else []
    )
    boxes = (
        db.exec(select(AmmoBox).where(AmmoBox.id.in_(box_ids))).all()
        if box_ids
        else []
    )

    firearm_map = {f.id: f for f in firearms}
    box_map = {b.id: b for b in boxes}

    mfr_ids = {f.manufacturer_id for f in firearms} | {b.manufacturer_id for b in boxes}
    cal_ids = {b.caliber_id for b in boxes}
    model_ids = {f.firearm_model_id for f in firearms if f.firearm_model_id is not None}

    mfr_map = (
        {m.id: m.name for m in db.exec(
            select(Manufacturer).where(Manufacturer.id.in_(mfr_ids))
        ).all()}
        if mfr_ids
        else {}
    )
    cal_map = (
        {c.id: c.name for c in db.exec(
            select(Caliber).where(Caliber.id.in_(cal_ids))
        ).all()}
        if cal_ids
        else {}
    )
    model_map = (
        {m.id: m.name for m in db.exec(
            select(FirearmModel).where(FirearmModel.id.in_(model_ids))
        ).all()}
        if model_ids
        else {}
    )

    return {
        "firearm": firearm_map,
        "box": box_map,
        "mfr": mfr_map,
        "cal": cal_map,
        "model": model_map,
    }


def _enrich_line_with_maps(line: RangeSessionLine, maps: dict) -> RangeSessionLineRead:
    return RangeSessionLineRead(
        id=line.id,
        session_id=line.session_id,
        firearm_id=line.firearm_id,
        firearm_display=_firearm_display_for(
            line.firearm_id, maps["firearm"], maps["mfr"], maps["model"]
        ),
        ammo_box_id=line.ammo_box_id,
        ammo_box_display=_box_display_for(
            line.ammo_box_id, maps["box"], maps["cal"], maps["mfr"]
        ),
        rounds_fired=line.rounds_fired,
        notes=line.notes,
        created_at=line.created_at,
    )


def _enrich_line(line: RangeSessionLine, db: Session) -> RangeSessionLineRead:
    return _enrich_line_with_maps(line, _build_line_lookup_maps([line], db))


def _enrich_session(session: RangeSession, db: Session) -> RangeSessionRead:
    lines = list(
        db.exec(
            select(RangeSessionLine)
            .where(RangeSessionLine.session_id == session.id)
            .order_by(RangeSessionLine.id)
        ).all()
    )
    line_maps = _build_line_lookup_maps(lines, db)
    owner_map = _build_owner_name_map([session], db)
    line_reads = [_enrich_line_with_maps(ln, line_maps) for ln in lines]
    distinct_firearms = len({ln.firearm_id for ln in lines if ln.firearm_id is not None})
    distinct_boxes = len({ln.ammo_box_id for ln in lines if ln.ammo_box_id is not None})
    return RangeSessionRead(
        id=session.id,
        owner_id=session.owner_id,
        owner_name=owner_map.get(session.owner_id, ""),
        is_shared=session.is_shared,
        date=session.date,
        location_name=session.location_name,
        notes=session.notes,
        lines=line_reads,
        total_rounds=sum(ln.rounds_fired for ln in lines),
        distinct_firearms=distinct_firearms,
        distinct_boxes=distinct_boxes,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


# ---------------------------------------------------------------------------
# Endpoints — sessions
# ---------------------------------------------------------------------------

@router.get("", response_model=list[RangeSessionListItem])
def list_sessions(
    firearm_id: Optional[int] = Query(default=None),
    after: Optional[date] = Query(default=None),
    before: Optional[date] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    stmt = _visibility_filter(select(RangeSession), user)
    if after is not None:
        stmt = stmt.where(RangeSession.date >= after)
    if before is not None:
        stmt = stmt.where(RangeSession.date <= before)
    if firearm_id is not None:
        stmt = stmt.where(
            RangeSession.id.in_(
                select(RangeSessionLine.session_id).where(
                    RangeSessionLine.firearm_id == firearm_id
                )
            )
        )

    sessions = list(
        db.exec(
            stmt.order_by(RangeSession.date.desc(), RangeSession.id.desc()).limit(limit)
        ).all()
    )
    if not sessions:
        return []

    session_ids = [s.id for s in sessions]

    # Per-session aggregates in one grouped query — total_rounds, line_count.
    agg_rows = db.exec(
        select(
            RangeSessionLine.session_id,
            func.coalesce(func.sum(RangeSessionLine.rounds_fired), 0).label("total_rounds"),
            func.count(RangeSessionLine.id).label("line_count"),
        )
        .where(RangeSessionLine.session_id.in_(session_ids))
        .group_by(RangeSessionLine.session_id)
    ).all()
    agg_map = {r.session_id: (r.total_rounds, r.line_count) for r in agg_rows}

    # Distinct firearm / box counts per session — pull once, count in Python.
    line_pair_rows = db.exec(
        select(
            RangeSessionLine.session_id,
            RangeSessionLine.firearm_id,
            RangeSessionLine.ammo_box_id,
        ).where(RangeSessionLine.session_id.in_(session_ids))
    ).all()
    distinct_firearms_map: dict[int, set[int]] = {}
    distinct_boxes_map: dict[int, set[int]] = {}
    for sid, fid, bid in line_pair_rows:
        if fid is not None:
            distinct_firearms_map.setdefault(sid, set()).add(fid)
        if bid is not None:
            distinct_boxes_map.setdefault(sid, set()).add(bid)

    # Per-firearm rounds aggregate — only computed when filtered. One grouped
    # query summing rounds_fired for the filter firearm, keyed by session.
    rounds_for_filter_map: dict[int, int] = {}
    if firearm_id is not None:
        per_firearm_rows = db.exec(
            select(
                RangeSessionLine.session_id,
                func.coalesce(func.sum(RangeSessionLine.rounds_fired), 0).label("rounds"),
            )
            .where(
                RangeSessionLine.session_id.in_(session_ids),
                RangeSessionLine.firearm_id == firearm_id,
            )
            .group_by(RangeSessionLine.session_id)
        ).all()
        rounds_for_filter_map = {r.session_id: r.rounds for r in per_firearm_rows}

    owner_map = _build_owner_name_map(sessions, db)
    out: list[RangeSessionListItem] = []
    for s in sessions:
        total_rounds, line_count = agg_map.get(s.id, (0, 0))
        out.append(
            RangeSessionListItem(
                id=s.id,
                date=s.date,
                location_name=s.location_name,
                owner_id=s.owner_id,
                owner_name=owner_map.get(s.owner_id, ""),
                is_shared=s.is_shared,
                total_rounds=total_rounds,
                distinct_firearms=len(distinct_firearms_map.get(s.id, set())),
                distinct_boxes=len(distinct_boxes_map.get(s.id, set())),
                line_count=line_count,
                rounds_for_filter_firearm=(
                    rounds_for_filter_map.get(s.id, 0) if firearm_id is not None else None
                ),
            )
        )
    return out


@router.post("", response_model=RangeSessionRead, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: RangeSessionCreate,
    user: User = Depends(require_role("admin", "member")),
    db: Session = Depends(get_session),
):
    if payload.is_shared and user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can create shared sessions",
        )

    now = datetime.utcnow()
    session = RangeSession(
        owner_id=user.id,
        is_shared=payload.is_shared,
        date=payload.date,
        location_name=payload.location_name,
        notes=payload.notes,
        created_at=now,
        updated_at=now,
    )
    db.add(session)
    db.flush()  # need session.id for line FK

    for spec in payload.lines:
        line = RangeSessionLine(
            session_id=session.id,
            firearm_id=spec.firearm_id,
            ammo_box_id=spec.ammo_box_id,
            rounds_fired=spec.rounds_fired,
            notes=spec.notes,
            created_at=now,
        )
        db.add(line)
        db.flush()  # need line.id for the expend log FK
        # _apply_session_line raises HTTPException on overdraw — get_session
        # closes without commit, so all flushed-but-uncommitted rows roll back.
        _apply_session_line(
            line,
            spec.rounds_fired,
            spec.firearm_id,
            spec.ammo_box_id,
            user,
            session.date,
            db,
        )

    db.commit()
    db.refresh(session)
    logger.info(
        "Range session created: id=%d owner=%d lines=%d",
        session.id, session.owner_id, len(payload.lines),
    )
    return _enrich_session(session, db)


_CSV_COLUMNS = [
    "session_id", "session_date", "location", "owner_username", "is_shared",
    "line_id", "firearm_id", "firearm_display", "ammo_box_id",
    "ammo_box_display", "caliber", "rounds_fired", "line_notes",
    "session_notes", "created_at",
]


def _build_session_csv(
    sessions: list[RangeSession],
    lines_by_session: dict[int, list[RangeSessionLine]],
    line_maps: dict,
    db: Session,
) -> bytes:
    user_ids = {s.owner_id for s in sessions}
    username_map = {
        u.id: u.username
        for u in db.exec(select(User).where(User.id.in_(user_ids))).all()
    } if user_ids else {}

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=_CSV_COLUMNS, lineterminator="\n")
    writer.writeheader()
    for s in sessions:
        lines = lines_by_session.get(s.id, [])
        if not lines:
            # Sessions must have at least one line, but be defensive — emit a
            # single row with empty line columns rather than dropping the session.
            writer.writerow({
                "session_id": s.id,
                "session_date": s.date.isoformat() if s.date else "",
                "location": s.location_name or "",
                "owner_username": username_map.get(s.owner_id, ""),
                "is_shared": str(s.is_shared).lower(),
                "line_id": "",
                "firearm_id": "",
                "firearm_display": "",
                "ammo_box_id": "",
                "ammo_box_display": "",
                "caliber": "",
                "rounds_fired": "",
                "line_notes": "",
                "session_notes": s.notes or "",
                "created_at": s.created_at.isoformat() if s.created_at else "",
            })
            continue
        for line in lines:
            firearm_display = _firearm_display_for(
                line.firearm_id, line_maps["firearm"], line_maps["mfr"], line_maps["model"]
            )
            ammo_box_display = _box_display_for(
                line.ammo_box_id, line_maps["box"], line_maps["cal"], line_maps["mfr"]
            )
            box = line_maps["box"].get(line.ammo_box_id) if line.ammo_box_id else None
            caliber_name = line_maps["cal"].get(box.caliber_id) if box else ""
            writer.writerow({
                "session_id": s.id,
                "session_date": s.date.isoformat() if s.date else "",
                "location": s.location_name or "",
                "owner_username": username_map.get(s.owner_id, ""),
                "is_shared": str(s.is_shared).lower(),
                "line_id": line.id,
                "firearm_id": line.firearm_id if line.firearm_id is not None else "",
                "firearm_display": firearm_display or "",
                "ammo_box_id": line.ammo_box_id if line.ammo_box_id is not None else "",
                "ammo_box_display": ammo_box_display or "",
                "caliber": caliber_name or "",
                "rounds_fired": line.rounds_fired,
                "line_notes": line.notes or "",
                "session_notes": s.notes or "",
                "created_at": line.created_at.isoformat() if line.created_at else "",
            })
    return output.getvalue().encode("utf-8")


@router.get("/export/csv")
def export_sessions_csv(
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    """Export visible range sessions as a denormalized CSV (one row per line)."""
    stmt = _visibility_filter(select(RangeSession), user).order_by(
        RangeSession.date.desc(), RangeSession.id.desc()
    )
    sessions = list(db.exec(stmt).all())
    if sessions:
        session_ids = [s.id for s in sessions]
        all_lines = list(
            db.exec(
                select(RangeSessionLine)
                .where(RangeSessionLine.session_id.in_(session_ids))
                .order_by(RangeSessionLine.session_id, RangeSessionLine.id)
            ).all()
        )
        lines_by_session: dict[int, list[RangeSessionLine]] = {}
        for ln in all_lines:
            lines_by_session.setdefault(ln.session_id, []).append(ln)
        line_maps = _build_line_lookup_maps(all_lines, db)
    else:
        lines_by_session = {}
        line_maps = {"firearm": {}, "box": {}, "mfr": {}, "cal": {}, "model": {}}

    csv_bytes = _build_session_csv(sessions, lines_by_session, line_maps, db)
    date_str = datetime.now().strftime("%Y%m%d")
    filename = f"range_sessions_{date_str}.csv"
    logger.info(
        "Range sessions CSV export: %d sessions for %s",
        len(sessions), user.email or user.username,
    )
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{session_id}", response_model=RangeSessionRead)
def get_session_endpoint(
    session_id: int,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    s = _get_visible_session(session_id, user, db)
    return _enrich_session(s, db)


@router.patch("/{session_id}", response_model=RangeSessionRead)
def update_session(
    session_id: int,
    payload: RangeSessionUpdate,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    s = _get_visible_session(session_id, user, db)
    _check_write(s, user)
    if payload.is_shared is True and user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can make sessions shared",
        )
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(s, key, value)
    s.updated_at = datetime.utcnow()
    db.add(s)
    db.commit()
    db.refresh(s)
    return _enrich_session(s, db)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: int,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    s = _get_visible_session(session_id, user, db)
    _check_write(s, user)
    lines = list(
        db.exec(
            select(RangeSessionLine).where(RangeSessionLine.session_id == s.id)
        ).all()
    )
    for line in lines:
        _reverse_session_line(line, db)
    for line in lines:
        db.delete(line)
    db.delete(s)
    db.commit()
    logger.info("Range session deleted: id=%d by %s", session_id, user.email or user.username)


# ---------------------------------------------------------------------------
# Endpoints — line management
# ---------------------------------------------------------------------------

@router.post(
    "/{session_id}/lines",
    response_model=RangeSessionLineRead,
    status_code=status.HTTP_201_CREATED,
)
def add_session_line(
    session_id: int,
    payload: RangeSessionLineCreate,
    user: User = Depends(require_role("admin", "member")),
    db: Session = Depends(get_session),
):
    s = _get_visible_session(session_id, user, db)
    _check_write(s, user)

    line = RangeSessionLine(
        session_id=s.id,
        firearm_id=payload.firearm_id,
        ammo_box_id=payload.ammo_box_id,
        rounds_fired=payload.rounds_fired,
        notes=payload.notes,
    )
    db.add(line)
    db.flush()
    _apply_session_line(
        line,
        payload.rounds_fired,
        payload.firearm_id,
        payload.ammo_box_id,
        user,
        s.date,
        db,
    )
    s.updated_at = datetime.utcnow()
    db.add(s)
    db.commit()
    db.refresh(line)
    return _enrich_line(line, db)


@router.patch(
    "/{session_id}/lines/{line_id}",
    response_model=RangeSessionLineRead,
)
def update_session_line(
    session_id: int,
    line_id: int,
    payload: RangeSessionLineUpdate,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    """Reverse the line, apply patched values, then commit.

    Modeling a partial line update without reversal is a bug-magnet — the
    counters and quantities have to net out correctly across firearm and
    box swaps. Reversing first and re-applying afterwards collapses every
    edge case into the same code path.
    """
    s = _get_visible_session(session_id, user, db)
    _check_write(s, user)

    line = db.get(RangeSessionLine, line_id)
    if line is None or line.session_id != s.id:
        raise HTTPException(status_code=404, detail="Session line not found")

    _reverse_session_line(line, db)

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(line, key, value)

    if line.firearm_id is None and line.ammo_box_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Line must reference at least one of firearm or ammo box",
        )
    if line.rounds_fired < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="rounds_fired must be >= 0",
        )

    db.add(line)
    db.flush()
    _apply_session_line(
        line,
        line.rounds_fired,
        line.firearm_id,
        line.ammo_box_id,
        user,
        s.date,
        db,
    )
    s.updated_at = datetime.utcnow()
    db.add(s)
    db.commit()
    db.refresh(line)
    return _enrich_line(line, db)


@router.delete(
    "/{session_id}/lines/{line_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_session_line(
    session_id: int,
    line_id: int,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    s = _get_visible_session(session_id, user, db)
    _check_write(s, user)
    line = db.get(RangeSessionLine, line_id)
    if line is None or line.session_id != s.id:
        raise HTTPException(status_code=404, detail="Session line not found")

    line_count = db.exec(
        select(func.count())
        .select_from(RangeSessionLine)
        .where(RangeSessionLine.session_id == s.id)
    ).first()
    if line_count is not None and line_count <= 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot delete the last line of a session. Delete the session instead.",
        )

    _reverse_session_line(line, db)
    db.delete(line)
    s.updated_at = datetime.utcnow()
    db.add(s)
    db.commit()
