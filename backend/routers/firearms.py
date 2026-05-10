"""Firearms registry + firearm event log API.

Visibility model mirrors AmmoBox / Product:
- admin sees everything
- member sees their own + shared
- read-only sees shared only

The firearm event log (cleaning | service | note) is nested under each
firearm. Editing or deleting a log entry triggers recalculation of the
firearm's denormalized cleaning state (last_cleaned_at,
rounds_since_clean) from the full log history, so those snapshot fields
never drift from the source of truth.

Cleaning status (`ok` | `due_soon` | `overdue`) is computed at read time
from `service_interval_rounds`, `service_interval_days`,
`rounds_since_clean`, and `last_cleaned_at`.
"""
import csv
import io
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, or_
from sqlmodel import Session, select

from database import get_session
from models import (
    Caliber,
    Dealer,
    Firearm,
    FirearmActionType,
    FirearmComplianceTag,
    FirearmComplianceTagLink,
    FirearmFinish,
    FirearmFrameSize,
    FirearmLog,
    FirearmModel,
    FirearmOpticCut,
    FirearmPhoto,
    FirearmRailType,
    FirearmUserTag,
    FirearmUserTagLink,
    Manufacturer,
    User,
)
from schemas import (
    FirearmComplianceTagRead,
    FirearmCreate,
    FirearmLogCreate,
    FirearmLogRead,
    FirearmLogUpdate,
    FirearmRead,
    FirearmUpdate,
    FirearmUserTagRead,
)
from utils.logging import get_logger
from utils.rbac import require_auth, require_role

logger = get_logger(__name__)

router = APIRouter(prefix="/firearms", tags=["firearms"])


# ---------------------------------------------------------------------------
# Visibility / write helpers
# ---------------------------------------------------------------------------

def _visibility_filter(stmt, user: User):
    """Restrict a select(Firearm) statement to rows the user can see."""
    if user.role == "admin":
        return stmt
    if user.role == "member":
        return stmt.where(or_(Firearm.is_shared, Firearm.owner_id == user.id))
    return stmt.where(Firearm.is_shared)  # read_only: shared only


def _get_visible_firearm(firearm_id: int, user: User, db: Session) -> Firearm:
    """Return firearm if visible to user; always 404 on miss to avoid leaking existence."""
    stmt = _visibility_filter(select(Firearm).where(Firearm.id == firearm_id), user)
    f = db.exec(stmt).first()
    if not f:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Firearm not found")
    return f


def _check_write(firearm: Firearm, user: User) -> None:
    """Raise 403 if the user cannot modify this firearm."""
    if user.role == "admin":
        return
    # Members can edit their own *non-shared* firearms. Shared firearms are
    # admin-managed.
    if user.role == "member" and not firearm.is_shared and firearm.owner_id == user.id:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")


# ---------------------------------------------------------------------------
# Cleaning status (pure function)
# ---------------------------------------------------------------------------

def _cleaning_status(firearm: Firearm, today: date) -> str:
    """Return 'ok' | 'due_soon' | 'overdue' based on configured service intervals.

    - overdue: round counter ≥ rounds threshold, OR days since last clean ≥
      days threshold. If days threshold is set but the firearm has never
      been cleaned, treat as overdue.
    - due_soon: within 80% of either threshold.
    - ok: otherwise (including the case where no intervals are set).
    """
    overdue_round = (
        firearm.service_interval_rounds is not None
        and firearm.rounds_since_clean >= firearm.service_interval_rounds
    )
    overdue_time = (
        firearm.service_interval_days is not None
        and firearm.last_cleaned_at is not None
        and (today - firearm.last_cleaned_at).days >= firearm.service_interval_days
    )
    overdue_time_never = (
        firearm.service_interval_days is not None
        and firearm.last_cleaned_at is None
    )
    if overdue_round or overdue_time or overdue_time_never:
        return "overdue"

    soon_round = (
        firearm.service_interval_rounds is not None
        and firearm.rounds_since_clean >= int(0.8 * firearm.service_interval_rounds)
    )
    soon_time = (
        firearm.service_interval_days is not None
        and firearm.last_cleaned_at is not None
        and (today - firearm.last_cleaned_at).days >= int(0.8 * firearm.service_interval_days)
    )
    if soon_round or soon_time:
        return "due_soon"
    return "ok"


# ---------------------------------------------------------------------------
# Bulk-load helper — mirrors routers/products.py::_build_maps
# ---------------------------------------------------------------------------

_EMPTY_MAPS: dict = {
    "manufacturer": {},
    "model": {},
    "action": {},
    "caliber": {},
    "dealer": {},
    "frame_size": {},
    "optic_cut": {},
    "rail_type": {},
    "finish": {},
    "compliance_tags": {},
    "user_tags": {},
    "photo_count": {},
    "default_photo": {},
}


def _build_firearm_maps(firearms: list[Firearm], db: Session) -> dict:
    """Batch-load all lookup names + tag links for a list of firearms.

    ~10-12 queries total, regardless of list size — avoids per-row N+1.
    """
    if not firearms:
        return {**_EMPTY_MAPS}

    mfr_ids = {f.manufacturer_id for f in firearms}
    model_ids = {f.firearm_model_id for f in firearms if f.firearm_model_id}
    action_ids = {f.action_type_id for f in firearms if f.action_type_id}
    caliber_ids = {f.caliber_id for f in firearms}
    dealer_ids = {f.dealer_id for f in firearms if f.dealer_id}
    frame_size_ids = {f.frame_size_id for f in firearms if f.frame_size_id}
    optic_cut_ids = {f.optic_cut_id for f in firearms if f.optic_cut_id}
    rail_type_ids = {f.rail_type_id for f in firearms if f.rail_type_id}
    finish_ids = {f.finish_id for f in firearms if f.finish_id}
    firearm_ids = [f.id for f in firearms if f.id is not None]

    mfr_map = {
        m.id: m.name
        for m in db.exec(select(Manufacturer).where(Manufacturer.id.in_(mfr_ids))).all()
    } if mfr_ids else {}
    model_map = {
        m.id: m.name
        for m in db.exec(select(FirearmModel).where(FirearmModel.id.in_(model_ids))).all()
    } if model_ids else {}
    action_map = {
        a.id: a.name
        for a in db.exec(select(FirearmActionType).where(FirearmActionType.id.in_(action_ids))).all()
    } if action_ids else {}
    caliber_map = {
        c.id: c.name
        for c in db.exec(select(Caliber).where(Caliber.id.in_(caliber_ids))).all()
    } if caliber_ids else {}
    dealer_map = {
        d.id: d.name
        for d in db.exec(select(Dealer).where(Dealer.id.in_(dealer_ids))).all()
    } if dealer_ids else {}
    frame_size_map = {
        x.id: x.name
        for x in db.exec(select(FirearmFrameSize).where(FirearmFrameSize.id.in_(frame_size_ids))).all()
    } if frame_size_ids else {}
    optic_cut_map = {
        x.id: x.name
        for x in db.exec(select(FirearmOpticCut).where(FirearmOpticCut.id.in_(optic_cut_ids))).all()
    } if optic_cut_ids else {}
    rail_type_map = {
        x.id: x.name
        for x in db.exec(select(FirearmRailType).where(FirearmRailType.id.in_(rail_type_ids))).all()
    } if rail_type_ids else {}
    finish_map = {
        x.id: x.name
        for x in db.exec(select(FirearmFinish).where(FirearmFinish.id.in_(finish_ids))).all()
    } if finish_ids else {}

    # Tag links — two queries per side (link rows + tag rows).
    comp_link_rows = list(
        db.exec(
            select(FirearmComplianceTagLink).where(
                FirearmComplianceTagLink.firearm_id.in_(firearm_ids)
            )
        ).all()
    ) if firearm_ids else []
    comp_tag_ids = {l.tag_id for l in comp_link_rows}
    comp_tag_map = {
        t.id: t
        for t in db.exec(
            select(FirearmComplianceTag).where(FirearmComplianceTag.id.in_(comp_tag_ids))
        ).all()
    } if comp_tag_ids else {}
    comp_by_firearm: dict[int, list[FirearmComplianceTag]] = {}
    for link in comp_link_rows:
        tag = comp_tag_map.get(link.tag_id)
        if tag is not None:
            comp_by_firearm.setdefault(link.firearm_id, []).append(tag)

    user_link_rows = list(
        db.exec(
            select(FirearmUserTagLink).where(FirearmUserTagLink.firearm_id.in_(firearm_ids))
        ).all()
    ) if firearm_ids else []
    user_tag_ids = {l.tag_id for l in user_link_rows}
    user_tag_map = {
        t.id: t
        for t in db.exec(
            select(FirearmUserTag).where(FirearmUserTag.id.in_(user_tag_ids))
        ).all()
    } if user_tag_ids else {}
    user_by_firearm: dict[int, list[FirearmUserTag]] = {}
    for link in user_link_rows:
        tag = user_tag_map.get(link.tag_id)
        if tag is not None:
            user_by_firearm.setdefault(link.firearm_id, []).append(tag)

    # Photo summary — single grouped query for count, plus a small fetch
    # for default photos (capped at 1 per firearm by the partial unique
    # index, so this stays O(N firearms with photos)).
    photo_count_map: dict[int, int] = {}
    default_photo_map: dict[int, FirearmPhoto] = {}
    if firearm_ids:
        count_rows = db.exec(
            select(FirearmPhoto.firearm_id, func.count(FirearmPhoto.id))
            .where(FirearmPhoto.firearm_id.in_(firearm_ids))
            .group_by(FirearmPhoto.firearm_id)
        ).all()
        for row in count_rows:
            fid, count = row
            photo_count_map[fid] = count

        default_rows = db.exec(
            select(FirearmPhoto)
            .where(FirearmPhoto.firearm_id.in_(firearm_ids))
            .where(FirearmPhoto.is_default == True)  # noqa: E712
        ).all()
        for p in default_rows:
            default_photo_map[p.firearm_id] = p

    return {
        "manufacturer": mfr_map,
        "model": model_map,
        "action": action_map,
        "caliber": caliber_map,
        "dealer": dealer_map,
        "frame_size": frame_size_map,
        "optic_cut": optic_cut_map,
        "rail_type": rail_type_map,
        "finish": finish_map,
        "compliance_tags": comp_by_firearm,
        "user_tags": user_by_firearm,
        "photo_count": photo_count_map,
        "default_photo": default_photo_map,
    }


def _enrich_firearm_with_maps(f: Firearm, maps: dict, today: date) -> FirearmRead:
    model_name = maps["model"].get(f.firearm_model_id) if f.firearm_model_id else None
    display_model = model_name or f.custom_model_name or ""
    photo_count = maps["photo_count"].get(f.id, 0)
    default_photo = maps["default_photo"].get(f.id)
    default_photo_url = (
        f"/firearms/{f.id}/photos/{default_photo.id}" if default_photo else None
    )
    default_photo_thumb_url = (
        f"/firearms/{f.id}/photos/{default_photo.id}/thumb" if default_photo else None
    )
    return FirearmRead(
        id=f.id,
        owner_id=f.owner_id,
        is_shared=f.is_shared,
        manufacturer_id=f.manufacturer_id,
        manufacturer_name=maps["manufacturer"].get(f.manufacturer_id),
        firearm_model_id=f.firearm_model_id,
        firearm_model_name=model_name,
        custom_model_name=f.custom_model_name,
        display_model=display_model,
        firearm_type=f.firearm_type,
        action_type_id=f.action_type_id,
        action_type_name=maps["action"].get(f.action_type_id) if f.action_type_id else None,
        caliber_id=f.caliber_id,
        caliber_name=maps["caliber"].get(f.caliber_id),
        caliber_notes=f.caliber_notes,
        serial=f.serial,
        barrel_length_in=f.barrel_length_in,
        frame_size_id=f.frame_size_id,
        frame_size_name=maps["frame_size"].get(f.frame_size_id) if f.frame_size_id else None,
        optic_cut_id=f.optic_cut_id,
        optic_cut_name=maps["optic_cut"].get(f.optic_cut_id) if f.optic_cut_id else None,
        rail_type_id=f.rail_type_id,
        rail_type_name=maps["rail_type"].get(f.rail_type_id) if f.rail_type_id else None,
        finish_id=f.finish_id,
        finish_name=maps["finish"].get(f.finish_id) if f.finish_id else None,
        standard_capacity=f.standard_capacity,
        purchase_date=f.purchase_date,
        purchase_price=f.purchase_price,
        dealer_id=f.dealer_id,
        dealer_name=maps["dealer"].get(f.dealer_id) if f.dealer_id else None,
        notes=f.notes,
        rounds_lifetime=f.rounds_lifetime,
        rounds_since_clean=f.rounds_since_clean,
        last_cleaned_at=f.last_cleaned_at,
        service_interval_rounds=f.service_interval_rounds,
        service_interval_days=f.service_interval_days,
        cleaning_status=_cleaning_status(f, today),
        compliance_tags=[
            FirearmComplianceTagRead.model_validate(t)
            for t in maps["compliance_tags"].get(f.id, [])
        ],
        user_tags=[
            FirearmUserTagRead.model_validate(t)
            for t in maps["user_tags"].get(f.id, [])
        ],
        photo_count=photo_count,
        default_photo_url=default_photo_url,
        default_photo_thumb_url=default_photo_thumb_url,
        created_at=f.created_at,
        updated_at=f.updated_at,
    )


def _enrich_firearm(f: Firearm, db: Session) -> FirearmRead:
    return _enrich_firearm_with_maps(f, _build_firearm_maps([f], db), date.today())


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def _validate_manufacturer_is_firearm(mfr: Optional[Manufacturer]) -> None:
    """Manufacturer must include 'firearm' in its types JSON column."""
    if mfr is None:
        raise HTTPException(status_code=422, detail="manufacturer_id not found")
    raw = mfr.types
    types: list[str] = []
    if raw:
        try:
            import json  # noqa: PLC0415
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                types = [t for t in parsed if isinstance(t, str)]
        except Exception:
            pass
    if "firearm" not in types:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Manufacturer '{mfr.name}' is not flagged as a firearm manufacturer "
                f"(types={types or '[]'}). Update the manufacturer's types or pick another."
            ),
        )


def _validate_model_belongs_to_manufacturer(
    db: Session, firearm_model_id: Optional[int], manufacturer_id: int
) -> None:
    if firearm_model_id is None:
        return
    fm = db.get(FirearmModel, firearm_model_id)
    if fm is None:
        raise HTTPException(status_code=422, detail="firearm_model_id not found")
    if fm.manufacturer_id != manufacturer_id:
        raise HTTPException(
            status_code=422,
            detail=(
                f"firearm_model_id {firearm_model_id} belongs to manufacturer "
                f"{fm.manufacturer_id}, not {manufacturer_id}"
            ),
        )


def _validate_user_tags(
    db: Session, user_tag_ids: list[int], user: User
) -> None:
    """User tags must belong to the requesting user (admins can use any)."""
    if not user_tag_ids:
        return
    rows = db.exec(
        select(FirearmUserTag).where(FirearmUserTag.id.in_(user_tag_ids))
    ).all()
    found = {r.id for r in rows}
    missing = set(user_tag_ids) - found
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"user_tag_ids not found: {sorted(missing)}",
        )
    if user.role != "admin":
        bad = [r.id for r in rows if r.owner_id != user.id]
        if bad:
            raise HTTPException(
                status_code=422,
                detail=f"user_tag_ids belong to another user: {sorted(bad)}",
            )


def _validate_attribute_fk(
    db: Session, model_class, value: Optional[int], field_name: str
) -> None:
    """Generic guard for the four physical-attribute FK columns.

    `value` may be None (clearing the attribute). When set, the row must exist
    AND be active — picking a hidden community entry is a 422.
    """
    if value is None:
        return
    row = db.get(model_class, value)
    if row is None or not row.is_active:
        raise HTTPException(
            status_code=422,
            detail=f"{field_name} not found or not active",
        )


def _validate_compliance_tags(db: Session, tag_ids: list[int]) -> None:
    if not tag_ids:
        return
    rows = db.exec(
        select(FirearmComplianceTag.id).where(FirearmComplianceTag.id.in_(tag_ids))
    ).all()
    found = {r if isinstance(r, int) else r[0] for r in rows}
    missing = set(tag_ids) - found
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"compliance_tag_ids not found: {sorted(missing)}",
        )


# ---------------------------------------------------------------------------
# Cleaning-state recalculation
# ---------------------------------------------------------------------------

def _recalculate_firearm_clean_state(firearm: Firearm, db: Session) -> None:
    """Recompute denormalized cleaning fields from the firearm_log table.

    Run this after any insert/update/delete on firearm_log so the snapshot
    fields on the firearm row never drift from the source of truth.
    Caller commits.
    """
    last_cleaning = db.exec(
        select(FirearmLog)
        .where(FirearmLog.firearm_id == firearm.id, FirearmLog.event_type == "cleaning")
        .order_by(FirearmLog.event_date.desc(), FirearmLog.id.desc())
    ).first()
    if last_cleaning:
        firearm.last_cleaned_at = last_cleaning.event_date
        firearm.rounds_since_clean = max(
            0, firearm.rounds_lifetime - last_cleaning.rounds_at_event
        )
    else:
        firearm.last_cleaned_at = None
        firearm.rounds_since_clean = firearm.rounds_lifetime
    firearm.updated_at = datetime.utcnow()


# ===========================================================================
# Firearms — CRUD
# ===========================================================================

@router.get("", response_model=list[FirearmRead])
def list_firearms(
    firearm_type: Optional[str] = Query(default=None),
    manufacturer_id: Optional[int] = Query(default=None),
    caliber_id: Optional[int] = Query(default=None),
    cleaning_status: Optional[str] = Query(
        default=None,
        description=(
            "Single value (ok | due_soon | overdue) or comma-separated list "
            "(e.g. 'due_soon,overdue'). Default returns all."
        ),
    ),
    compliance_tag_id: Optional[int] = Query(default=None),
    user_tag_id: Optional[int] = Query(default=None),
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    stmt = _visibility_filter(select(Firearm), user)
    if firearm_type:
        stmt = stmt.where(Firearm.firearm_type == firearm_type)
    if manufacturer_id is not None:
        stmt = stmt.where(Firearm.manufacturer_id == manufacturer_id)
    if caliber_id is not None:
        stmt = stmt.where(Firearm.caliber_id == caliber_id)

    # Tag filters via subquery on the link tables.
    if compliance_tag_id is not None:
        stmt = stmt.where(
            Firearm.id.in_(
                select(FirearmComplianceTagLink.firearm_id).where(
                    FirearmComplianceTagLink.tag_id == compliance_tag_id
                )
            )
        )
    if user_tag_id is not None:
        stmt = stmt.where(
            Firearm.id.in_(
                select(FirearmUserTagLink.firearm_id).where(
                    FirearmUserTagLink.tag_id == user_tag_id
                )
            )
        )

    firearms = list(db.exec(stmt.order_by(Firearm.id)).all())
    maps = _build_firearm_maps(firearms, db)
    today = date.today()
    enriched = [_enrich_firearm_with_maps(f, maps, today) for f in firearms]

    if cleaning_status:
        wanted = {s.strip() for s in cleaning_status.split(",") if s.strip()}
        invalid = wanted - {"ok", "due_soon", "overdue"}
        if invalid:
            raise HTTPException(
                status_code=422,
                detail=(
                    "cleaning_status values must be ok | due_soon | overdue "
                    f"(got: {sorted(invalid)})"
                ),
            )
        enriched = [e for e in enriched if e.cleaning_status in wanted]

    return enriched


@router.post("", response_model=FirearmRead, status_code=status.HTTP_201_CREATED)
def create_firearm(
    payload: FirearmCreate,
    user: User = Depends(require_role("admin", "member")),
    db: Session = Depends(get_session),
):
    if payload.is_shared and user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can create shared firearms",
        )

    mfr = db.get(Manufacturer, payload.manufacturer_id)
    _validate_manufacturer_is_firearm(mfr)
    _validate_model_belongs_to_manufacturer(db, payload.firearm_model_id, payload.manufacturer_id)

    if not db.get(Caliber, payload.caliber_id):
        raise HTTPException(status_code=422, detail="caliber_id not found")
    if payload.action_type_id is not None and not db.get(FirearmActionType, payload.action_type_id):
        raise HTTPException(status_code=422, detail="action_type_id not found")
    if payload.dealer_id is not None and not db.get(Dealer, payload.dealer_id):
        raise HTTPException(status_code=422, detail="dealer_id not found")

    _validate_attribute_fk(db, FirearmFrameSize, payload.frame_size_id, "frame_size_id")
    _validate_attribute_fk(db, FirearmOpticCut,  payload.optic_cut_id,  "optic_cut_id")
    _validate_attribute_fk(db, FirearmRailType,  payload.rail_type_id,  "rail_type_id")
    _validate_attribute_fk(db, FirearmFinish,    payload.finish_id,     "finish_id")

    _validate_compliance_tags(db, payload.compliance_tag_ids)
    _validate_user_tags(db, payload.user_tag_ids, user)

    firearm = Firearm(
        owner_id=user.id,
        is_shared=payload.is_shared,
        manufacturer_id=payload.manufacturer_id,
        firearm_model_id=payload.firearm_model_id,
        custom_model_name=payload.custom_model_name,
        firearm_type=payload.firearm_type,
        action_type_id=payload.action_type_id,
        caliber_id=payload.caliber_id,
        caliber_notes=payload.caliber_notes,
        serial=payload.serial,
        barrel_length_in=payload.barrel_length_in,
        frame_size_id=payload.frame_size_id,
        optic_cut_id=payload.optic_cut_id,
        rail_type_id=payload.rail_type_id,
        finish_id=payload.finish_id,
        standard_capacity=payload.standard_capacity,
        purchase_date=payload.purchase_date,
        purchase_price=payload.purchase_price,
        dealer_id=payload.dealer_id,
        notes=payload.notes,
        service_interval_rounds=payload.service_interval_rounds,
        service_interval_days=payload.service_interval_days,
    )
    db.add(firearm)
    db.flush()  # need firearm.id for tag links

    for tag_id in payload.compliance_tag_ids:
        db.add(FirearmComplianceTagLink(firearm_id=firearm.id, tag_id=tag_id))
    for tag_id in payload.user_tag_ids:
        db.add(FirearmUserTagLink(firearm_id=firearm.id, tag_id=tag_id))

    db.commit()
    db.refresh(firearm)
    logger.info("Firearm created: id=%d owner=%d", firearm.id, firearm.owner_id)
    return _enrich_firearm(firearm, db)


_CSV_COLUMNS = [
    "id", "owner_username", "is_shared", "manufacturer", "model",
    "custom_model_name", "display_model", "firearm_type", "action_type",
    "caliber", "caliber_notes", "serial", "barrel_length_in",
    "frame_size", "optic_cut", "rail_type", "finish", "standard_capacity",
    "purchase_date", "purchase_price", "dealer", "notes", "photo_count",
    "rounds_lifetime",
    "rounds_since_clean", "last_cleaned_at", "service_interval_rounds",
    "service_interval_days", "cleaning_status", "compliance_tags", "user_tags",
    "created_at", "updated_at",
]


def _build_firearm_csv(
    firearms: list[Firearm], maps: dict, db: Session, today: date
) -> bytes:
    user_ids = {f.owner_id for f in firearms}
    users_map = {
        u.id: u.username
        for u in db.exec(select(User).where(User.id.in_(user_ids))).all()
    } if user_ids else {}

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=_CSV_COLUMNS, lineterminator="\n")
    writer.writeheader()
    for f in firearms:
        model_name = maps["model"].get(f.firearm_model_id) if f.firearm_model_id else None
        display_model = model_name or f.custom_model_name or ""
        compliance_tags = maps["compliance_tags"].get(f.id, [])
        user_tags = maps["user_tags"].get(f.id, [])
        writer.writerow({
            "id": f.id,
            "owner_username": users_map.get(f.owner_id, ""),
            "is_shared": str(f.is_shared).lower(),
            "manufacturer": maps["manufacturer"].get(f.manufacturer_id, ""),
            "model": model_name or "",
            "custom_model_name": f.custom_model_name or "",
            "display_model": display_model,
            "firearm_type": f.firearm_type or "",
            "action_type": maps["action"].get(f.action_type_id, "") if f.action_type_id else "",
            "caliber": maps["caliber"].get(f.caliber_id, ""),
            "caliber_notes": f.caliber_notes or "",
            "serial": f.serial or "",
            "barrel_length_in": f.barrel_length_in if f.barrel_length_in is not None else "",
            "frame_size": maps["frame_size"].get(f.frame_size_id, "") if f.frame_size_id else "",
            "optic_cut": maps["optic_cut"].get(f.optic_cut_id, "") if f.optic_cut_id else "",
            "rail_type": maps["rail_type"].get(f.rail_type_id, "") if f.rail_type_id else "",
            "finish": maps["finish"].get(f.finish_id, "") if f.finish_id else "",
            "standard_capacity": f.standard_capacity if f.standard_capacity is not None else "",
            "purchase_date": f.purchase_date.isoformat() if f.purchase_date else "",
            "purchase_price": f.purchase_price if f.purchase_price is not None else "",
            "dealer": maps["dealer"].get(f.dealer_id, "") if f.dealer_id else "",
            "notes": f.notes or "",
            "photo_count": maps["photo_count"].get(f.id, 0),
            "rounds_lifetime": f.rounds_lifetime,
            "rounds_since_clean": f.rounds_since_clean,
            "last_cleaned_at": f.last_cleaned_at.isoformat() if f.last_cleaned_at else "",
            "service_interval_rounds": f.service_interval_rounds if f.service_interval_rounds is not None else "",
            "service_interval_days": f.service_interval_days if f.service_interval_days is not None else "",
            "cleaning_status": _cleaning_status(f, today),
            "compliance_tags": " | ".join(t.name for t in compliance_tags),
            "user_tags": " | ".join(t.name for t in user_tags),
            "created_at": f.created_at.isoformat() if f.created_at else "",
            "updated_at": f.updated_at.isoformat() if f.updated_at else "",
        })
    return output.getvalue().encode("utf-8")


@router.get("/export/csv")
def export_firearms_csv(
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    """Export the user's visible firearms as CSV.

    Respects the same visibility filter as GET /firearms (members see own +
    shared, read-only sees shared only). One row per firearm; multi-value
    tag fields collapsed to pipe-separated lists.
    """
    stmt = _visibility_filter(select(Firearm), user).order_by(Firearm.id)
    firearms = list(db.exec(stmt).all())
    maps = _build_firearm_maps(firearms, db)
    today = date.today()
    csv_bytes = _build_firearm_csv(firearms, maps, db, today)
    date_str = datetime.now().strftime("%Y%m%d")
    filename = f"firearms_{date_str}.csv"
    logger.info("Firearms CSV export: %d rows for %s", len(firearms), user.email or user.username)
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{firearm_id}", response_model=FirearmRead)
def get_firearm(
    firearm_id: int,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    f = _get_visible_firearm(firearm_id, user, db)
    return _enrich_firearm(f, db)


@router.patch("/{firearm_id}", response_model=FirearmRead)
def update_firearm(
    firearm_id: int,
    payload: FirearmUpdate,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    firearm = _get_visible_firearm(firearm_id, user, db)
    _check_write(firearm, user)

    if payload.is_shared is True and user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can make firearms shared",
        )

    update_data = payload.model_dump(exclude_unset=True)
    compliance_ids = update_data.pop("compliance_tag_ids", None)
    user_tag_ids = update_data.pop("user_tag_ids", None)

    # Compute the post-update model/custom-name pair so we can enforce the
    # CHECK constraint at the API layer (clearer error than a SQLite IntegrityError).
    new_model_id = update_data.get("firearm_model_id", firearm.firearm_model_id) \
        if "firearm_model_id" in update_data else firearm.firearm_model_id
    new_custom_name = update_data.get("custom_model_name", firearm.custom_model_name) \
        if "custom_model_name" in update_data else firearm.custom_model_name
    if new_model_id is None and not new_custom_name:
        raise HTTPException(
            status_code=422,
            detail="either firearm_model_id or custom_model_name must be provided",
        )

    # Revalidate FKs that were touched (or that depend on a touched FK).
    new_mfr_id = update_data.get("manufacturer_id", firearm.manufacturer_id)
    if "manufacturer_id" in update_data:
        mfr = db.get(Manufacturer, new_mfr_id)
        _validate_manufacturer_is_firearm(mfr)
    if "firearm_model_id" in update_data or "manufacturer_id" in update_data:
        _validate_model_belongs_to_manufacturer(db, new_model_id, new_mfr_id)
    if "caliber_id" in update_data and not db.get(Caliber, update_data["caliber_id"]):
        raise HTTPException(status_code=422, detail="caliber_id not found")
    if "action_type_id" in update_data and update_data["action_type_id"] is not None \
            and not db.get(FirearmActionType, update_data["action_type_id"]):
        raise HTTPException(status_code=422, detail="action_type_id not found")
    if "dealer_id" in update_data and update_data["dealer_id"] is not None \
            and not db.get(Dealer, update_data["dealer_id"]):
        raise HTTPException(status_code=422, detail="dealer_id not found")
    if "frame_size_id" in update_data:
        _validate_attribute_fk(db, FirearmFrameSize, update_data["frame_size_id"], "frame_size_id")
    if "optic_cut_id" in update_data:
        _validate_attribute_fk(db, FirearmOpticCut,  update_data["optic_cut_id"],  "optic_cut_id")
    if "rail_type_id" in update_data:
        _validate_attribute_fk(db, FirearmRailType,  update_data["rail_type_id"],  "rail_type_id")
    if "finish_id" in update_data:
        _validate_attribute_fk(db, FirearmFinish,    update_data["finish_id"],     "finish_id")

    for key, value in update_data.items():
        setattr(firearm, key, value)

    # Replace tag link sets if provided
    if compliance_ids is not None:
        _validate_compliance_tags(db, compliance_ids)
        db.exec(
            delete(FirearmComplianceTagLink).where(
                FirearmComplianceTagLink.firearm_id == firearm.id
            )
        )
        for tag_id in compliance_ids:
            db.add(FirearmComplianceTagLink(firearm_id=firearm.id, tag_id=tag_id))

    if user_tag_ids is not None:
        _validate_user_tags(db, user_tag_ids, user)
        db.exec(
            delete(FirearmUserTagLink).where(FirearmUserTagLink.firearm_id == firearm.id)
        )
        for tag_id in user_tag_ids:
            db.add(FirearmUserTagLink(firearm_id=firearm.id, tag_id=tag_id))

    firearm.updated_at = datetime.utcnow()
    db.add(firearm)
    db.commit()
    db.refresh(firearm)
    return _enrich_firearm(firearm, db)


@router.delete("/{firearm_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_firearm(
    firearm_id: int,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    firearm = _get_visible_firearm(firearm_id, user, db)
    _check_write(firearm, user)
    # Cascade explicitly — FKs aren't ON DELETE CASCADE in the migration so
    # ordering is under our control.
    db.exec(delete(FirearmLog).where(FirearmLog.firearm_id == firearm_id))
    db.exec(
        delete(FirearmComplianceTagLink).where(
            FirearmComplianceTagLink.firearm_id == firearm_id
        )
    )
    db.exec(
        delete(FirearmUserTagLink).where(FirearmUserTagLink.firearm_id == firearm_id)
    )
    db.exec(delete(FirearmPhoto).where(FirearmPhoto.firearm_id == firearm_id))
    db.delete(firearm)
    db.commit()

    from utils.firearm_photos import delete_firearm_photo_dir  # noqa: PLC0415
    delete_firearm_photo_dir(firearm_id)

    logger.info("Firearm deleted: id=%d by %s", firearm_id, user.email or user.username)


# ===========================================================================
# Firearm log — nested under /firearms/{firearm_id}/log
# ===========================================================================

def _resolve_log_user_names(
    rows: list[FirearmLog], db: Session
) -> dict[int, str]:
    user_ids = {r.logged_by for r in rows}
    if not user_ids:
        return {}
    users = db.exec(select(User).where(User.id.in_(user_ids))).all()
    return {u.id: f"{u.first_name} {u.last_name}".strip() or (u.email or u.username) for u in users}


def _to_log_read(row: FirearmLog, name_map: dict[int, str]) -> FirearmLogRead:
    return FirearmLogRead(
        id=row.id,
        firearm_id=row.firearm_id,
        event_type=row.event_type,
        event_date=row.event_date,
        rounds_at_event=row.rounds_at_event,
        notes=row.notes,
        logged_by=row.logged_by,
        logged_by_name=name_map.get(row.logged_by, ""),
        created_at=row.created_at,
    )


@router.get("/{firearm_id}/log", response_model=list[FirearmLogRead])
def list_firearm_log(
    firearm_id: int,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    _get_visible_firearm(firearm_id, user, db)  # visibility check
    rows = list(
        db.exec(
            select(FirearmLog)
            .where(FirearmLog.firearm_id == firearm_id)
            .order_by(FirearmLog.event_date.desc(), FirearmLog.id.desc())
        ).all()
    )
    name_map = _resolve_log_user_names(rows, db)
    return [_to_log_read(r, name_map) for r in rows]


@router.post(
    "/{firearm_id}/log",
    response_model=FirearmLogRead,
    status_code=status.HTTP_201_CREATED,
)
def create_firearm_log_entry(
    firearm_id: int,
    payload: FirearmLogCreate,
    user: User = Depends(require_role("admin", "member")),
    db: Session = Depends(get_session),
):
    firearm = _get_visible_firearm(firearm_id, user, db)
    _check_write(firearm, user)

    rounds_at_event = (
        payload.rounds_at_event
        if payload.rounds_at_event is not None
        else firearm.rounds_lifetime
    )

    log = FirearmLog(
        firearm_id=firearm.id,
        event_type=payload.event_type,
        event_date=payload.event_date,
        rounds_at_event=rounds_at_event,
        notes=payload.notes,
        logged_by=user.id,
    )
    db.add(log)
    db.flush()

    # Always recompute denormalized fields — cheap and keeps the snapshot
    # honest even if a non-cleaning event nudges things in the future.
    _recalculate_firearm_clean_state(firearm, db)
    db.add(firearm)
    db.commit()
    db.refresh(log)

    name_map = _resolve_log_user_names([log], db)
    return _to_log_read(log, name_map)


@router.patch("/{firearm_id}/log/{log_id}", response_model=FirearmLogRead)
def update_firearm_log_entry(
    firearm_id: int,
    log_id: int,
    payload: FirearmLogUpdate,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    firearm = _get_visible_firearm(firearm_id, user, db)
    _check_write(firearm, user)

    log = db.get(FirearmLog, log_id)
    if not log or log.firearm_id != firearm_id:
        raise HTTPException(status_code=404, detail="Log entry not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(log, key, value)
    db.add(log)
    db.flush()

    _recalculate_firearm_clean_state(firearm, db)
    db.add(firearm)
    db.commit()
    db.refresh(log)

    name_map = _resolve_log_user_names([log], db)
    return _to_log_read(log, name_map)


@router.delete("/{firearm_id}/log/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_firearm_log_entry(
    firearm_id: int,
    log_id: int,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    firearm = _get_visible_firearm(firearm_id, user, db)
    _check_write(firearm, user)

    log = db.get(FirearmLog, log_id)
    if not log or log.firearm_id != firearm_id:
        raise HTTPException(status_code=404, detail="Log entry not found")

    db.delete(log)
    db.flush()
    _recalculate_firearm_clean_state(firearm, db)
    db.add(firearm)
    db.commit()
