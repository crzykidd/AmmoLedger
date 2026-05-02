from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy import select as sa_select
from sqlmodel import Session, select

from database import get_session
from models import AmmoBox, CaliberThreshold, Caliber, Location, LocationThreshold
from schemas import (
    CaliberThresholdCreate,
    CaliberThresholdRead,
    LocationThresholdCreate,
    LocationThresholdRead,
    LowStockCaliberItem,
    LowStockLocationItem,
    LowStockResponse,
    ThresholdDefaultUpdate,
)
from utils.config import get_setting, set_setting
from utils.rbac import require_auth, require_role
from sqlalchemy import text

router = APIRouter(tags=["thresholds"])


def _get_default_rounds(db: Session) -> int:
    raw = get_setting(db, "threshold_default_rounds")
    try:
        return int(raw) if raw else 200
    except (ValueError, TypeError):
        return 200


# ---------------------------------------------------------------------------
# GET /thresholds/default
# PUT /thresholds/default
# ---------------------------------------------------------------------------

@router.get("/default")
def get_default(user: Any = Depends(require_auth), db: Session = Depends(get_session)):
    return {"rounds": _get_default_rounds(db)}


@router.put("/default")
def update_default(
    body: ThresholdDefaultUpdate,
    _: Any = Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    if body.rounds < 0:
        raise HTTPException(status_code=400, detail="rounds must be >= 0")
    set_setting(db, "threshold_default_rounds", str(body.rounds))
    db.commit()
    return {"rounds": body.rounds}


# ---------------------------------------------------------------------------
# GET /thresholds/calibers
# POST /thresholds/calibers
# DELETE /thresholds/calibers/{caliber_id}
# ---------------------------------------------------------------------------

@router.get("/calibers")
def list_caliber_thresholds(
    user: Any = Depends(require_auth),
    db: Session = Depends(get_session),
):
    thresholds = db.exec(select(CaliberThreshold)).all()
    if not thresholds:
        return []

    caliber_ids = [t.caliber_id for t in thresholds]
    calibers = db.exec(select(Caliber).where(Caliber.id.in_(caliber_ids))).all()
    caliber_map = {c.id: c.name for c in calibers}

    rows = db.execute(
        sa_select(AmmoBox.caliber_id, func.sum(AmmoBox.qty_remaining).label("total"))
        .where(AmmoBox.caliber_id.in_(caliber_ids), AmmoBox.is_archived == False)  # noqa: E712
        .group_by(AmmoBox.caliber_id)
    ).fetchall()
    rounds_map = {r[0]: r[1] or 0 for r in rows}

    return [
        CaliberThresholdRead(
            id=t.id,
            caliber_id=t.caliber_id,
            caliber_name=caliber_map.get(t.caliber_id, "Unknown"),
            rounds=t.rounds,
            rounds_on_hand=rounds_map.get(t.caliber_id, 0),
            is_low=rounds_map.get(t.caliber_id, 0) < t.rounds,
        )
        for t in thresholds
    ]


@router.post("/calibers", status_code=201)
def upsert_caliber_threshold(
    body: CaliberThresholdCreate,
    user: Any = Depends(require_auth),
    db: Session = Depends(get_session),
):
    if body.rounds < 0:
        raise HTTPException(status_code=400, detail="rounds must be >= 0")
    if not db.get(Caliber, body.caliber_id):
        raise HTTPException(status_code=404, detail="Caliber not found")

    existing = db.exec(
        select(CaliberThreshold).where(CaliberThreshold.caliber_id == body.caliber_id)
    ).first()

    if existing:
        existing.rounds = body.rounds
        existing.updated_at = datetime.utcnow()
        db.add(existing)
    else:
        db.add(CaliberThreshold(caliber_id=body.caliber_id, owner_id=user.id, rounds=body.rounds))

    db.commit()
    return {"caliber_id": body.caliber_id, "rounds": body.rounds}


@router.delete("/calibers/{caliber_id}", status_code=204)
def delete_caliber_threshold(
    caliber_id: int,
    _: Any = Depends(require_auth),
    db: Session = Depends(get_session),
):
    threshold = db.exec(
        select(CaliberThreshold).where(CaliberThreshold.caliber_id == caliber_id)
    ).first()
    if not threshold:
        raise HTTPException(status_code=404, detail="Caliber threshold not found")
    db.delete(threshold)
    db.commit()


# ---------------------------------------------------------------------------
# GET /thresholds/locations
# POST /thresholds/locations
# DELETE /thresholds/locations/{location_id}
# ---------------------------------------------------------------------------

@router.get("/locations")
def list_location_thresholds(
    user: Any = Depends(require_auth),
    db: Session = Depends(get_session),
):
    thresholds = db.exec(select(LocationThreshold)).all()
    if not thresholds:
        return []

    result = []
    for t in thresholds:
        loc = db.get(Location, t.location_id)
        row = db.execute(
            text("""
                SELECT COALESCE(SUM(ab.qty_remaining), 0)
                FROM ammo_box ab
                JOIN containers c ON ab.container_id = c.id
                WHERE c.location_id = :loc_id AND ab.is_archived = 0
            """),
            {"loc_id": t.location_id},
        ).fetchone()
        on_hand = row[0] if row else 0
        result.append(
            LocationThresholdRead(
                id=t.id,
                location_id=t.location_id,
                location_name=loc.name if loc else "Unknown",
                rounds=t.rounds,
                rounds_on_hand=on_hand,
                is_low=on_hand < t.rounds,
            )
        )
    return result


@router.post("/locations", status_code=201)
def upsert_location_threshold(
    body: LocationThresholdCreate,
    user: Any = Depends(require_auth),
    db: Session = Depends(get_session),
):
    if body.rounds < 0:
        raise HTTPException(status_code=400, detail="rounds must be >= 0")
    if not db.get(Location, body.location_id):
        raise HTTPException(status_code=404, detail="Location not found")

    existing = db.exec(
        select(LocationThreshold).where(LocationThreshold.location_id == body.location_id)
    ).first()

    if existing:
        existing.rounds = body.rounds
        existing.updated_at = datetime.utcnow()
        db.add(existing)
    else:
        db.add(LocationThreshold(location_id=body.location_id, owner_id=user.id, rounds=body.rounds))

    db.commit()
    return {"location_id": body.location_id, "rounds": body.rounds}


@router.delete("/locations/{location_id}", status_code=204)
def delete_location_threshold(
    location_id: int,
    _: Any = Depends(require_auth),
    db: Session = Depends(get_session),
):
    threshold = db.exec(
        select(LocationThreshold).where(LocationThreshold.location_id == location_id)
    ).first()
    if not threshold:
        raise HTTPException(status_code=404, detail="Location threshold not found")
    db.delete(threshold)
    db.commit()


# ---------------------------------------------------------------------------
# GET /thresholds/low-stock
# ---------------------------------------------------------------------------

@router.get("/low-stock")
def get_low_stock(
    user: Any = Depends(require_auth),
    db: Session = Depends(get_session),
):
    default_rounds = _get_default_rounds(db)

    # Sum rounds on hand by caliber across all non-archived boxes
    caliber_rows = db.execute(
        sa_select(AmmoBox.caliber_id, func.sum(AmmoBox.qty_remaining).label("total"))
        .where(AmmoBox.is_archived == False)  # noqa: E712
        .group_by(AmmoBox.caliber_id)
    ).fetchall()
    caliber_totals = {r[0]: r[1] or 0 for r in caliber_rows}

    # Per-caliber threshold overrides
    cal_threshold_map = {
        t.caliber_id: t.rounds
        for t in db.exec(select(CaliberThreshold)).all()
    }

    # Caliber names
    if caliber_totals:
        calibers = db.exec(select(Caliber).where(Caliber.id.in_(list(caliber_totals.keys())))).all()
        caliber_name_map = {c.id: c.name for c in calibers}
    else:
        caliber_name_map = {}

    low_calibers = []
    for cal_id, on_hand in caliber_totals.items():
        threshold = cal_threshold_map.get(cal_id, default_rounds)
        if on_hand < threshold:
            low_calibers.append(
                LowStockCaliberItem(
                    caliber_id=cal_id,
                    caliber_name=caliber_name_map.get(cal_id, "Unknown"),
                    rounds_on_hand=on_hand,
                    threshold=threshold,
                )
            )
    low_calibers.sort(key=lambda x: x.rounds_on_hand)

    # Locations: only those with explicit thresholds
    loc_thresholds = db.exec(select(LocationThreshold)).all()
    low_locations = []
    for lt in loc_thresholds:
        row = db.execute(
            text("""
                SELECT COALESCE(SUM(ab.qty_remaining), 0)
                FROM ammo_box ab
                JOIN containers c ON ab.container_id = c.id
                WHERE c.location_id = :loc_id AND ab.is_archived = 0
            """),
            {"loc_id": lt.location_id},
        ).fetchone()
        on_hand = row[0] if row else 0
        if on_hand < lt.rounds:
            loc = db.get(Location, lt.location_id)
            low_locations.append(
                LowStockLocationItem(
                    location_id=lt.location_id,
                    location_name=loc.name if loc else "Unknown",
                    rounds_on_hand=on_hand,
                    threshold=lt.rounds,
                )
            )
    low_locations.sort(key=lambda x: x.rounds_on_hand)

    return LowStockResponse(calibers=low_calibers, locations=low_locations)
