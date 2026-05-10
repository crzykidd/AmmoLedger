import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlmodel import Session, select

from database import get_session
from models import (
    AmmoCondition,
    AmmoType,
    Caliber,
    Category,
    Container,
    Dealer,
    FirearmActionType,
    FirearmComplianceTag,
    FirearmFinish,
    FirearmFrameSize,
    FirearmModel,
    FirearmOpticCut,
    FirearmRailType,
    FirearmUserTag,
    Location,
    Manufacturer,
    User,
)
from schemas import (
    ContainerCreate,
    ContainerRead,
    DealerCreate,
    DealerRead,
    FirearmActionTypeCreate,
    FirearmActionTypeRead,
    FirearmActionTypeUpdate,
    FirearmComplianceTagCreate,
    FirearmComplianceTagRead,
    FirearmComplianceTagUpdate,
    FirearmFinishCreate,
    FirearmFinishRead,
    FirearmFinishUpdate,
    FirearmFrameSizeCreate,
    FirearmFrameSizeRead,
    FirearmFrameSizeUpdate,
    FirearmModelCreate,
    FirearmModelRead,
    FirearmModelUpdate,
    FirearmOpticCutCreate,
    FirearmOpticCutRead,
    FirearmOpticCutUpdate,
    FirearmRailTypeCreate,
    FirearmRailTypeRead,
    FirearmRailTypeUpdate,
    FirearmUserTagCreate,
    FirearmUserTagRead,
    FirearmUserTagUpdate,
    LocationCreate,
    LocationRead,
    LookupCreate,
    LookupRead,
    LookupUpdate,
    ManufacturerCreate,
    ManufacturerRead,
)
from utils.rbac import require_auth, require_role

router = APIRouter(tags=["lookups"])

# ---------------------------------------------------------------------------
# Table config — maps URL key → (model class, ammo_box FK column or None)
# ---------------------------------------------------------------------------

_TABLE_CONFIG: dict = {
    "calibers": Caliber,
    "manufacturers": Manufacturer,
    "ammo-types": AmmoType,
    "categories": Category,
    "ammo-conditions": AmmoCondition,
    "dealers": Dealer,
    "locations": Location,
    "containers": Container,
    # Firearm lookups (usage counts are firearm-table-driven; not wired into
    # the ammo_box-centric _COUNT_SQL above, so usage_count stays 0 here).
    "firearm-models": FirearmModel,
    "firearm-action-types": FirearmActionType,
    "firearm-compliance-tags": FirearmComplianceTag,
    "firearm-frame-sizes": FirearmFrameSize,
    "firearm-optic-cuts": FirearmOpticCut,
    "firearm-rail-types": FirearmRailType,
    "firearm-finishes": FirearmFinish,
}

# SQL fragments that count non-archived ammo_box rows per lookup entry
_COUNT_SQL: dict[str, str] = {
    "calibers":
        "SELECT caliber_id, COUNT(*) FROM ammo_box WHERE is_archived=0 GROUP BY caliber_id",
    "manufacturers":
        "SELECT manufacturer_id, COUNT(*) FROM ammo_box WHERE is_archived=0 GROUP BY manufacturer_id",
    "ammo-types":
        "SELECT type_id, COUNT(*) FROM ammo_box WHERE is_archived=0 AND type_id IS NOT NULL GROUP BY type_id",
    "categories":
        "SELECT category_id, COUNT(*) FROM ammo_box WHERE is_archived=0 AND category_id IS NOT NULL GROUP BY category_id",
    "ammo-conditions":
        "SELECT ammo_condition_id, COUNT(*) FROM ammo_box WHERE is_archived=0 AND ammo_condition_id IS NOT NULL GROUP BY ammo_condition_id",
    "dealers":
        "SELECT dealer_id, COUNT(*) FROM ammo_box WHERE is_archived=0 AND dealer_id IS NOT NULL GROUP BY dealer_id",
    "containers":
        "SELECT container_id, COUNT(*) FROM ammo_box WHERE is_archived=0 AND container_id IS NOT NULL GROUP BY container_id",
    "locations":
        "SELECT location_id, COUNT(*) FROM ammo_box WHERE is_archived=0 AND location_id IS NOT NULL GROUP BY location_id",
}

_SINGLE_COUNT_SQL: dict[str, str] = {
    "calibers": "SELECT COUNT(*) FROM ammo_box WHERE caliber_id=:id AND is_archived=0",
    "manufacturers": "SELECT COUNT(*) FROM ammo_box WHERE manufacturer_id=:id AND is_archived=0",
    "ammo-types": "SELECT COUNT(*) FROM ammo_box WHERE type_id=:id AND is_archived=0",
    "categories": "SELECT COUNT(*) FROM ammo_box WHERE category_id=:id AND is_archived=0",
    "ammo-conditions": "SELECT COUNT(*) FROM ammo_box WHERE ammo_condition_id=:id AND is_archived=0",
    "dealers": "SELECT COUNT(*) FROM ammo_box WHERE dealer_id=:id AND is_archived=0",
    "containers": "SELECT COUNT(*) FROM ammo_box WHERE container_id=:id AND is_archived=0",
    "locations":
        "SELECT COUNT(*) FROM ammo_box WHERE location_id=:id AND is_archived=0",
}


def _get_count_map(table: str, db: Session) -> dict[int, int]:
    sql = _COUNT_SQL.get(table)
    if not sql:
        return {}
    rows = db.execute(text(sql)).all()
    return {row[0]: row[1] for row in rows}


def _get_single_count(table: str, entry_id: int, db: Session) -> int:
    sql = _SINGLE_COUNT_SQL.get(table)
    if not sql:
        return 0
    row = db.execute(text(sql), {"id": entry_id}).fetchone()
    return row[0] if row else 0


def _fetch_entries(model_class, table_name: str, active_only: bool, db: Session) -> list:
    """Return all entries as dicts, with usage_count when active_only=False."""
    stmt = select(model_class)
    if active_only:
        stmt = stmt.where(model_class.is_active == True)  # noqa: E712
        # Community-synced tables: only show entries the admin has approved
        if hasattr(model_class, "is_imported"):
            stmt = stmt.where(model_class.is_imported == True)  # noqa: E712
    entries = db.exec(stmt).all()

    count_map = _get_count_map(table_name, db) if not active_only else {}

    result = []
    for e in entries:
        d = e.model_dump()
        d["usage_count"] = count_map.get(e.id, 0)
        result.append(d)
    return result


# ---------------------------------------------------------------------------
# Calibers
# ---------------------------------------------------------------------------

@router.get("/calibers", response_model=list[LookupRead])
def list_calibers(
    active_only: bool = Query(True),
    user=Depends(require_auth),
    db: Session = Depends(get_session),
):
    return _fetch_entries(Caliber, "calibers", active_only, db)


@router.post("/calibers", response_model=LookupRead, status_code=status.HTTP_201_CREATED)
def create_caliber(
    payload: LookupCreate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    if db.exec(select(Caliber).where(Caliber.name == payload.name)).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Caliber already exists")
    c = Caliber(name=payload.name)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


# ---------------------------------------------------------------------------
# Manufacturers
# ---------------------------------------------------------------------------

@router.get("/manufacturers", response_model=list[ManufacturerRead])
def list_manufacturers(
    active_only: bool = Query(True),
    type: str | None = Query(
        None,
        regex="^(ammo|firearm)$",
        description="Filter to manufacturers whose types JSON array contains this value.",
    ),
    user=Depends(require_auth),
    db: Session = Depends(get_session),
):
    entries = _fetch_entries(Manufacturer, "manufacturers", active_only, db)
    if not type:
        return entries
    # Filter in Python — `types` is a JSON-encoded TEXT column, not queryable
    # by SQLite operators in a portable way. NULL falls back to ["ammo"] so
    # any pre-migration row stays visible for ammo callers (defensive — the
    # 0002 migration backfills, so NULL should never reach this code path).
    filtered: list[dict] = []
    for entry in entries:
        raw = entry.get("types")
        if raw is None:
            entry_types = ["ammo"]
        else:
            try:
                parsed = json.loads(raw)
                entry_types = parsed if isinstance(parsed, list) else []
            except json.JSONDecodeError:
                entry_types = []
        if type in entry_types:
            filtered.append(entry)
    return filtered


@router.post("/manufacturers", response_model=ManufacturerRead, status_code=status.HTTP_201_CREATED)
def create_manufacturer(
    payload: ManufacturerCreate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    if db.exec(select(Manufacturer).where(Manufacturer.name == payload.name)).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Manufacturer already exists")
    m = Manufacturer(
        name=payload.name,
        url=payload.url or None,
        types=payload.types,  # already JSON-encoded by the schema validator
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@router.patch("/manufacturers/{entry_id}/types", response_model=ManufacturerRead)
def update_manufacturer_types(
    entry_id: int,
    payload: dict,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    """Replace the types array on a manufacturer.

    Body: ``{"types": ["ammo"] | ["firearm"] | ["ammo","firearm"]}``.
    Validation matches ManufacturerCreate.types — JSON list of {"ammo","firearm"}.
    """
    from schemas import _validate_mfr_types  # noqa: PLC0415

    m = db.get(Manufacturer, entry_id)
    if not m:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Manufacturer not found")
    try:
        m.types = _validate_mfr_types(payload.get("types"))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    db.add(m)
    db.commit()
    db.refresh(m)
    d = m.model_dump()
    d["usage_count"] = _get_single_count("manufacturers", entry_id, db)
    return d


# ---------------------------------------------------------------------------
# Ammo Types
# ---------------------------------------------------------------------------

@router.get("/ammo-types", response_model=list[LookupRead])
def list_ammo_types(
    active_only: bool = Query(True),
    user=Depends(require_auth),
    db: Session = Depends(get_session),
):
    return _fetch_entries(AmmoType, "ammo-types", active_only, db)


@router.post("/ammo-types", response_model=LookupRead, status_code=status.HTTP_201_CREATED)
def create_ammo_type(
    payload: LookupCreate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    if db.exec(select(AmmoType).where(AmmoType.name == payload.name)).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ammo type already exists")
    t = AmmoType(name=payload.name)
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


# ---------------------------------------------------------------------------
# Ammo Conditions
# ---------------------------------------------------------------------------

@router.get("/ammo-conditions", response_model=list[LookupRead])
def list_ammo_conditions(
    active_only: bool = Query(True),
    user=Depends(require_auth),
    db: Session = Depends(get_session),
):
    return _fetch_entries(AmmoCondition, "ammo-conditions", active_only, db)


@router.post("/ammo-conditions", response_model=LookupRead, status_code=status.HTTP_201_CREATED)
def create_ammo_condition(
    payload: LookupCreate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    if db.exec(select(AmmoCondition).where(AmmoCondition.name == payload.name)).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Condition already exists")
    c = AmmoCondition(name=payload.name)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------

@router.get("/categories", response_model=list[LookupRead])
def list_categories(
    active_only: bool = Query(True),
    user=Depends(require_auth),
    db: Session = Depends(get_session),
):
    return _fetch_entries(Category, "categories", active_only, db)


@router.post("/categories", response_model=LookupRead, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: LookupCreate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    if db.exec(select(Category).where(Category.name == payload.name)).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category already exists")
    c = Category(name=payload.name)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


# ---------------------------------------------------------------------------
# Dealers
# ---------------------------------------------------------------------------

@router.get("/dealers", response_model=list[DealerRead])
def list_dealers(
    active_only: bool = Query(True),
    user=Depends(require_auth),
    db: Session = Depends(get_session),
):
    return _fetch_entries(Dealer, "dealers", active_only, db)


@router.post("/dealers", response_model=DealerRead, status_code=status.HTTP_201_CREATED)
def create_dealer(
    payload: DealerCreate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    if db.exec(select(Dealer).where(Dealer.name == payload.name)).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Dealer already exists")
    d = Dealer(name=payload.name, url=payload.url)
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


# ---------------------------------------------------------------------------
# Locations
# ---------------------------------------------------------------------------

@router.get("/locations", response_model=list[LocationRead])
def list_locations(
    active_only: bool = Query(True),
    user=Depends(require_auth),
    db: Session = Depends(get_session),
):
    return _fetch_entries(Location, "locations", active_only, db)


@router.post("/locations", response_model=LocationRead, status_code=status.HTTP_201_CREATED)
def create_location(
    payload: LocationCreate,
    user=Depends(require_role("admin", "member")),
    db: Session = Depends(get_session),
):
    loc = Location(name=payload.name, notes=payload.notes)
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc


# ---------------------------------------------------------------------------
# Containers
# ---------------------------------------------------------------------------

@router.get("/containers", response_model=list[ContainerRead])
def list_containers(
    active_only: bool = Query(True),
    user=Depends(require_auth),
    db: Session = Depends(get_session),
):
    return _fetch_entries(Container, "containers", active_only, db)


@router.post("/containers", response_model=ContainerRead, status_code=status.HTTP_201_CREATED)
def create_container(
    payload: ContainerCreate,
    user=Depends(require_role("admin", "member")),
    db: Session = Depends(get_session),
):
    c = Container(name=payload.name, location_id=payload.location_id, notes=payload.notes)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


# ---------------------------------------------------------------------------
# Generic admin endpoints — /lookups/{table}/{id}
# ---------------------------------------------------------------------------

def _resolve_table(table: str) -> type:
    model_class = _TABLE_CONFIG.get(table)
    if model_class is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown lookup table")
    return model_class


@router.patch("/lookups/{table}/{entry_id}")
def update_lookup_entry(
    table: str,
    entry_id: int,
    payload: LookupUpdate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    """Update name and/or URL for any lookup entry."""
    model_class = _resolve_table(table)
    entry = db.get(model_class, entry_id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name cannot be empty")
        existing = db.exec(
            select(model_class)
            .where(model_class.name == name)
            .where(model_class.id != entry_id)
        ).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Name already exists")
        if entry.source == "community" and name.lower() != entry.name.lower():
            entry.source = "local"
            if hasattr(entry, "community_key"):
                entry.community_key = None
        entry.name = name

    if payload.url is not None and hasattr(entry, "url"):
        entry.url = payload.url or None

    db.add(entry)
    db.commit()
    db.refresh(entry)
    d = entry.model_dump()
    d["usage_count"] = _get_single_count(table, entry_id, db)
    return d


@router.patch("/lookups/{table}/{entry_id}/toggle-active")
def toggle_lookup_active(
    table: str,
    entry_id: int,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    """Toggle is_active for a lookup entry (hide/unhide)."""
    model_class = _resolve_table(table)
    entry = db.get(model_class, entry_id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    entry.is_active = not entry.is_active
    db.add(entry)
    db.commit()
    db.refresh(entry)
    d = entry.model_dump()
    d["usage_count"] = _get_single_count(table, entry_id, db)
    return d


@router.delete("/lookups/{table}/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lookup_entry(
    table: str,
    entry_id: int,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    """Permanently delete a user-created lookup entry that has no ammo boxes using it."""
    model_class = _resolve_table(table)
    entry = db.get(model_class, entry_id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")

    if entry.source not in ("user", "local"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete community entries — use Hide instead",
        )

    count = _get_single_count(table, entry_id, db)
    if count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete — used by {count} boxes",
        )

    db.delete(entry)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# Firearm Action Types — community-managed flat list
# ---------------------------------------------------------------------------

def _action_type_dict(entry: FirearmActionType) -> dict:
    d = entry.model_dump()
    d["usage_count"] = 0  # firearms table ships in P1b
    return d


@router.get("/firearm-action-types", response_model=list[FirearmActionTypeRead])
def list_firearm_action_types(
    active_only: bool = Query(True),
    user=Depends(require_auth),
    db: Session = Depends(get_session),
):
    stmt = select(FirearmActionType)
    if active_only:
        stmt = stmt.where(FirearmActionType.is_active == True)  # noqa: E712
        stmt = stmt.where(FirearmActionType.is_imported == True)  # noqa: E712
    return [_action_type_dict(e) for e in db.exec(stmt).all()]


@router.post(
    "/firearm-action-types",
    response_model=FirearmActionTypeRead,
    status_code=status.HTTP_201_CREATED,
)
def create_firearm_action_type(
    payload: FirearmActionTypeCreate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    if db.exec(select(FirearmActionType).where(FirearmActionType.name == name)).first():
        raise HTTPException(status_code=409, detail="Action type already exists")
    e = FirearmActionType(name=name)
    db.add(e)
    db.commit()
    db.refresh(e)
    return _action_type_dict(e)


@router.patch("/firearm-action-types/{entry_id}", response_model=FirearmActionTypeRead)
def update_firearm_action_type(
    entry_id: int,
    payload: FirearmActionTypeUpdate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    e = db.get(FirearmActionType, entry_id)
    if not e:
        raise HTTPException(status_code=404, detail="Action type not found")
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        clash = db.exec(
            select(FirearmActionType)
            .where(FirearmActionType.name == name)
            .where(FirearmActionType.id != entry_id)
        ).first()
        if clash:
            raise HTTPException(status_code=409, detail="Name already exists")
        if e.source == "community" and name.lower() != e.name.lower():
            e.source = "local"
            e.community_key = None
        e.name = name
    db.add(e)
    db.commit()
    db.refresh(e)
    return _action_type_dict(e)


@router.delete(
    "/firearm-action-types/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_firearm_action_type(
    entry_id: int,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    e = db.get(FirearmActionType, entry_id)
    if not e:
        raise HTTPException(status_code=404, detail="Action type not found")
    if e.source not in ("user", "local"):
        raise HTTPException(
            status_code=400,
            detail="Cannot delete community entries — use Hide instead",
        )
    # When P1b ships firearm_models we'll need a usage count guard here.
    db.delete(e)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# Firearm Models — community-managed; resolves manufacturer/caliber/action names
# ---------------------------------------------------------------------------

def _resolve_model_names(model: FirearmModel, db: Session) -> dict:
    d = model.model_dump()
    mfr = db.get(Manufacturer, model.manufacturer_id)
    d["manufacturer_name"] = mfr.name if mfr else None
    if model.default_caliber_id is not None:
        cal = db.get(Caliber, model.default_caliber_id)
        d["default_caliber_name"] = cal.name if cal else None
    else:
        d["default_caliber_name"] = None
    if model.default_action_type_id is not None:
        act = db.get(FirearmActionType, model.default_action_type_id)
        d["default_action_type_name"] = act.name if act else None
    else:
        d["default_action_type_name"] = None
    d["usage_count"] = 0  # firearms table ships in P1b
    return d


@router.get("/firearm-models", response_model=list[FirearmModelRead])
def list_firearm_models(
    active_only: bool = Query(True),
    manufacturer_id: int | None = Query(None),
    user=Depends(require_auth),
    db: Session = Depends(get_session),
):
    stmt = select(FirearmModel)
    if active_only:
        stmt = stmt.where(FirearmModel.is_active == True)  # noqa: E712
        stmt = stmt.where(FirearmModel.is_imported == True)  # noqa: E712
    if manufacturer_id is not None:
        stmt = stmt.where(FirearmModel.manufacturer_id == manufacturer_id)
    return [_resolve_model_names(m, db) for m in db.exec(stmt).all()]


@router.post(
    "/firearm-models",
    response_model=FirearmModelRead,
    status_code=status.HTTP_201_CREATED,
)
def create_firearm_model(
    payload: FirearmModelCreate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    if not db.get(Manufacturer, payload.manufacturer_id):
        raise HTTPException(status_code=400, detail="manufacturer_id does not exist")
    if payload.default_caliber_id is not None and not db.get(Caliber, payload.default_caliber_id):
        raise HTTPException(status_code=400, detail="default_caliber_id does not exist")
    if (
        payload.default_action_type_id is not None
        and not db.get(FirearmActionType, payload.default_action_type_id)
    ):
        raise HTTPException(status_code=400, detail="default_action_type_id does not exist")

    clash = db.exec(
        select(FirearmModel)
        .where(FirearmModel.manufacturer_id == payload.manufacturer_id)
        .where(FirearmModel.name == name)
    ).first()
    if clash:
        raise HTTPException(status_code=409, detail="Model already exists for this manufacturer")

    m = FirearmModel(
        manufacturer_id=payload.manufacturer_id,
        name=name,
        default_caliber_id=payload.default_caliber_id,
        default_action_type_id=payload.default_action_type_id,
        default_barrel_length_in=payload.default_barrel_length_in,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _resolve_model_names(m, db)


@router.patch("/firearm-models/{entry_id}", response_model=FirearmModelRead)
def update_firearm_model(
    entry_id: int,
    payload: FirearmModelUpdate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    m = db.get(FirearmModel, entry_id)
    if not m:
        raise HTTPException(status_code=404, detail="Model not found")

    new_name = m.name if payload.name is None else payload.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    new_mfr_id = m.manufacturer_id if payload.manufacturer_id is None else payload.manufacturer_id

    if payload.manufacturer_id is not None and not db.get(Manufacturer, new_mfr_id):
        raise HTTPException(status_code=400, detail="manufacturer_id does not exist")
    if payload.default_caliber_id is not None and not db.get(Caliber, payload.default_caliber_id):
        raise HTTPException(status_code=400, detail="default_caliber_id does not exist")
    if (
        payload.default_action_type_id is not None
        and not db.get(FirearmActionType, payload.default_action_type_id)
    ):
        raise HTTPException(status_code=400, detail="default_action_type_id does not exist")

    if new_name != m.name or new_mfr_id != m.manufacturer_id:
        clash = db.exec(
            select(FirearmModel)
            .where(FirearmModel.manufacturer_id == new_mfr_id)
            .where(FirearmModel.name == new_name)
            .where(FirearmModel.id != entry_id)
        ).first()
        if clash:
            raise HTTPException(status_code=409, detail="Model already exists for this manufacturer")
        if m.source == "community":
            m.source = "local"
            m.community_key = None

    m.manufacturer_id = new_mfr_id
    m.name = new_name
    if payload.default_caliber_id is not None:
        m.default_caliber_id = payload.default_caliber_id or None
    if payload.default_action_type_id is not None:
        m.default_action_type_id = payload.default_action_type_id or None
    if payload.default_barrel_length_in is not None:
        m.default_barrel_length_in = payload.default_barrel_length_in

    db.add(m)
    db.commit()
    db.refresh(m)
    return _resolve_model_names(m, db)


@router.delete(
    "/firearm-models/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_firearm_model(
    entry_id: int,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    m = db.get(FirearmModel, entry_id)
    if not m:
        raise HTTPException(status_code=404, detail="Model not found")
    if m.source not in ("user", "local"):
        raise HTTPException(
            status_code=400,
            detail="Cannot delete community entries — use Hide instead",
        )
    db.delete(m)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# Firearm Compliance Tags — community-managed; jurisdiction-grouped
# ---------------------------------------------------------------------------

def _compliance_tag_dict(t: FirearmComplianceTag) -> dict:
    d = t.model_dump()
    d["usage_count"] = 0  # firearms table ships in P1b
    return d


@router.get("/firearm-compliance-tags", response_model=list[FirearmComplianceTagRead])
def list_firearm_compliance_tags(
    active_only: bool = Query(True),
    user=Depends(require_auth),
    db: Session = Depends(get_session),
):
    stmt = select(FirearmComplianceTag)
    if active_only:
        stmt = stmt.where(FirearmComplianceTag.is_active == True)  # noqa: E712
        stmt = stmt.where(FirearmComplianceTag.is_imported == True)  # noqa: E712
    return [_compliance_tag_dict(t) for t in db.exec(stmt).all()]


@router.post(
    "/firearm-compliance-tags",
    response_model=FirearmComplianceTagRead,
    status_code=status.HTTP_201_CREATED,
)
def create_firearm_compliance_tag(
    payload: FirearmComplianceTagCreate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    if db.exec(select(FirearmComplianceTag).where(FirearmComplianceTag.name == name)).first():
        raise HTTPException(status_code=409, detail="Tag already exists")
    t = FirearmComplianceTag(
        name=name,
        description=payload.description,
        jurisdiction=payload.jurisdiction,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _compliance_tag_dict(t)


@router.patch(
    "/firearm-compliance-tags/{entry_id}",
    response_model=FirearmComplianceTagRead,
)
def update_firearm_compliance_tag(
    entry_id: int,
    payload: FirearmComplianceTagUpdate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    t = db.get(FirearmComplianceTag, entry_id)
    if not t:
        raise HTTPException(status_code=404, detail="Tag not found")
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        clash = db.exec(
            select(FirearmComplianceTag)
            .where(FirearmComplianceTag.name == name)
            .where(FirearmComplianceTag.id != entry_id)
        ).first()
        if clash:
            raise HTTPException(status_code=409, detail="Name already exists")
        if t.source == "community" and name.lower() != t.name.lower():
            t.source = "local"
            t.community_key = None
        t.name = name
    if payload.description is not None:
        t.description = payload.description or None
    if payload.jurisdiction is not None:
        t.jurisdiction = payload.jurisdiction or None
    db.add(t)
    db.commit()
    db.refresh(t)
    return _compliance_tag_dict(t)


@router.delete(
    "/firearm-compliance-tags/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_firearm_compliance_tag(
    entry_id: int,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    t = db.get(FirearmComplianceTag, entry_id)
    if not t:
        raise HTTPException(status_code=404, detail="Tag not found")
    if t.source not in ("user", "local"):
        raise HTTPException(
            status_code=400,
            detail="Cannot delete community entries — use Hide instead",
        )
    db.delete(t)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# Firearm User Tags — owner-scoped, free-form colored tags. NOT community.
# ---------------------------------------------------------------------------

@router.get("/firearm-user-tags", response_model=list[FirearmUserTagRead])
def list_firearm_user_tags(
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    """Return only the calling user's tags."""
    rows = db.exec(
        select(FirearmUserTag).where(FirearmUserTag.owner_id == user.id)
    ).all()
    return rows


@router.post(
    "/firearm-user-tags",
    response_model=FirearmUserTagRead,
    status_code=status.HTTP_201_CREATED,
)
def create_firearm_user_tag(
    payload: FirearmUserTagCreate,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    clash = db.exec(
        select(FirearmUserTag)
        .where(FirearmUserTag.owner_id == user.id)
        .where(FirearmUserTag.name == name)
    ).first()
    if clash:
        raise HTTPException(status_code=409, detail="You already have a tag with that name")
    t = FirearmUserTag(owner_id=user.id, name=name, color=payload.color)
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.patch("/firearm-user-tags/{entry_id}", response_model=FirearmUserTagRead)
def update_firearm_user_tag(
    entry_id: int,
    payload: FirearmUserTagUpdate,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    t = db.get(FirearmUserTag, entry_id)
    if not t:
        raise HTTPException(status_code=404, detail="Tag not found")
    if t.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Tag not found")  # don't leak existence
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        clash = db.exec(
            select(FirearmUserTag)
            .where(FirearmUserTag.owner_id == user.id)
            .where(FirearmUserTag.name == name)
            .where(FirearmUserTag.id != entry_id)
        ).first()
        if clash:
            raise HTTPException(status_code=409, detail="You already have a tag with that name")
        t.name = name
    if payload.color is not None:
        t.color = payload.color or None  # validator already coerced "" to None
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.delete(
    "/firearm-user-tags/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_firearm_user_tag(
    entry_id: int,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    t = db.get(FirearmUserTag, entry_id)
    if not t or t.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Tag not found")
    db.delete(t)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# Firearm physical attribute lookups (v0.3.0)
#
# Frame size, optic cut, rail type, finish — same shape and CRUD pattern as
# firearm_action_types. The endpoints below are intentionally near-identical
# blocks rather than a generic helper because the dependency-injected types
# differ per route and the per-table 404 / 409 messages stay readable.
# ---------------------------------------------------------------------------

def _attr_lookup_dict(entry) -> dict:
    """Common shape for the four physical-attribute lookup reads.

    `usage_count` is left at 0 — the firearms table writes here happen via
    FK on the firearms row, but a usage rollup would require a separate
    aggregate query that isn't worth the cost on the lookups admin page.
    """
    d = entry.model_dump()
    d["usage_count"] = 0
    return d


# Firearm Frame Sizes ---------------------------------------------------------

@router.get("/firearm-frame-sizes", response_model=list[FirearmFrameSizeRead])
def list_firearm_frame_sizes(
    active_only: bool = Query(True),
    user=Depends(require_auth),
    db: Session = Depends(get_session),
):
    stmt = select(FirearmFrameSize)
    if active_only:
        stmt = stmt.where(FirearmFrameSize.is_active == True)  # noqa: E712
        stmt = stmt.where(FirearmFrameSize.is_imported == True)  # noqa: E712
    return [_attr_lookup_dict(e) for e in db.exec(stmt).all()]


@router.post(
    "/firearm-frame-sizes",
    response_model=FirearmFrameSizeRead,
    status_code=status.HTTP_201_CREATED,
)
def create_firearm_frame_size(
    payload: FirearmFrameSizeCreate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    if db.exec(select(FirearmFrameSize).where(FirearmFrameSize.name == name)).first():
        raise HTTPException(status_code=409, detail="Frame size already exists")
    e = FirearmFrameSize(name=name)
    db.add(e)
    db.commit()
    db.refresh(e)
    return _attr_lookup_dict(e)


@router.patch("/firearm-frame-sizes/{entry_id}", response_model=FirearmFrameSizeRead)
def update_firearm_frame_size(
    entry_id: int,
    payload: FirearmFrameSizeUpdate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    e = db.get(FirearmFrameSize, entry_id)
    if not e:
        raise HTTPException(status_code=404, detail="Frame size not found")
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        clash = db.exec(
            select(FirearmFrameSize)
            .where(FirearmFrameSize.name == name)
            .where(FirearmFrameSize.id != entry_id)
        ).first()
        if clash:
            raise HTTPException(status_code=409, detail="Name already exists")
        if e.source == "community" and name.lower() != e.name.lower():
            e.source = "local"
            e.community_key = None
        e.name = name
    db.add(e)
    db.commit()
    db.refresh(e)
    return _attr_lookup_dict(e)


@router.delete(
    "/firearm-frame-sizes/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_firearm_frame_size(
    entry_id: int,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    e = db.get(FirearmFrameSize, entry_id)
    if not e:
        raise HTTPException(status_code=404, detail="Frame size not found")
    if e.source not in ("user", "local"):
        raise HTTPException(
            status_code=400,
            detail="Cannot delete community entries — use Hide instead",
        )
    db.delete(e)
    db.commit()
    return None


# Firearm Optic Cuts ----------------------------------------------------------

@router.get("/firearm-optic-cuts", response_model=list[FirearmOpticCutRead])
def list_firearm_optic_cuts(
    active_only: bool = Query(True),
    user=Depends(require_auth),
    db: Session = Depends(get_session),
):
    stmt = select(FirearmOpticCut)
    if active_only:
        stmt = stmt.where(FirearmOpticCut.is_active == True)  # noqa: E712
        stmt = stmt.where(FirearmOpticCut.is_imported == True)  # noqa: E712
    return [_attr_lookup_dict(e) for e in db.exec(stmt).all()]


@router.post(
    "/firearm-optic-cuts",
    response_model=FirearmOpticCutRead,
    status_code=status.HTTP_201_CREATED,
)
def create_firearm_optic_cut(
    payload: FirearmOpticCutCreate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    if db.exec(select(FirearmOpticCut).where(FirearmOpticCut.name == name)).first():
        raise HTTPException(status_code=409, detail="Optic cut already exists")
    e = FirearmOpticCut(name=name)
    db.add(e)
    db.commit()
    db.refresh(e)
    return _attr_lookup_dict(e)


@router.patch("/firearm-optic-cuts/{entry_id}", response_model=FirearmOpticCutRead)
def update_firearm_optic_cut(
    entry_id: int,
    payload: FirearmOpticCutUpdate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    e = db.get(FirearmOpticCut, entry_id)
    if not e:
        raise HTTPException(status_code=404, detail="Optic cut not found")
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        clash = db.exec(
            select(FirearmOpticCut)
            .where(FirearmOpticCut.name == name)
            .where(FirearmOpticCut.id != entry_id)
        ).first()
        if clash:
            raise HTTPException(status_code=409, detail="Name already exists")
        if e.source == "community" and name.lower() != e.name.lower():
            e.source = "local"
            e.community_key = None
        e.name = name
    db.add(e)
    db.commit()
    db.refresh(e)
    return _attr_lookup_dict(e)


@router.delete(
    "/firearm-optic-cuts/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_firearm_optic_cut(
    entry_id: int,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    e = db.get(FirearmOpticCut, entry_id)
    if not e:
        raise HTTPException(status_code=404, detail="Optic cut not found")
    if e.source not in ("user", "local"):
        raise HTTPException(
            status_code=400,
            detail="Cannot delete community entries — use Hide instead",
        )
    db.delete(e)
    db.commit()
    return None


# Firearm Rail Types ----------------------------------------------------------

@router.get("/firearm-rail-types", response_model=list[FirearmRailTypeRead])
def list_firearm_rail_types(
    active_only: bool = Query(True),
    user=Depends(require_auth),
    db: Session = Depends(get_session),
):
    stmt = select(FirearmRailType)
    if active_only:
        stmt = stmt.where(FirearmRailType.is_active == True)  # noqa: E712
        stmt = stmt.where(FirearmRailType.is_imported == True)  # noqa: E712
    return [_attr_lookup_dict(e) for e in db.exec(stmt).all()]


@router.post(
    "/firearm-rail-types",
    response_model=FirearmRailTypeRead,
    status_code=status.HTTP_201_CREATED,
)
def create_firearm_rail_type(
    payload: FirearmRailTypeCreate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    if db.exec(select(FirearmRailType).where(FirearmRailType.name == name)).first():
        raise HTTPException(status_code=409, detail="Rail type already exists")
    e = FirearmRailType(name=name)
    db.add(e)
    db.commit()
    db.refresh(e)
    return _attr_lookup_dict(e)


@router.patch("/firearm-rail-types/{entry_id}", response_model=FirearmRailTypeRead)
def update_firearm_rail_type(
    entry_id: int,
    payload: FirearmRailTypeUpdate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    e = db.get(FirearmRailType, entry_id)
    if not e:
        raise HTTPException(status_code=404, detail="Rail type not found")
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        clash = db.exec(
            select(FirearmRailType)
            .where(FirearmRailType.name == name)
            .where(FirearmRailType.id != entry_id)
        ).first()
        if clash:
            raise HTTPException(status_code=409, detail="Name already exists")
        if e.source == "community" and name.lower() != e.name.lower():
            e.source = "local"
            e.community_key = None
        e.name = name
    db.add(e)
    db.commit()
    db.refresh(e)
    return _attr_lookup_dict(e)


@router.delete(
    "/firearm-rail-types/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_firearm_rail_type(
    entry_id: int,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    e = db.get(FirearmRailType, entry_id)
    if not e:
        raise HTTPException(status_code=404, detail="Rail type not found")
    if e.source not in ("user", "local"):
        raise HTTPException(
            status_code=400,
            detail="Cannot delete community entries — use Hide instead",
        )
    db.delete(e)
    db.commit()
    return None


# Firearm Finishes ------------------------------------------------------------

@router.get("/firearm-finishes", response_model=list[FirearmFinishRead])
def list_firearm_finishes(
    active_only: bool = Query(True),
    user=Depends(require_auth),
    db: Session = Depends(get_session),
):
    stmt = select(FirearmFinish)
    if active_only:
        stmt = stmt.where(FirearmFinish.is_active == True)  # noqa: E712
        stmt = stmt.where(FirearmFinish.is_imported == True)  # noqa: E712
    return [_attr_lookup_dict(e) for e in db.exec(stmt).all()]


@router.post(
    "/firearm-finishes",
    response_model=FirearmFinishRead,
    status_code=status.HTTP_201_CREATED,
)
def create_firearm_finish(
    payload: FirearmFinishCreate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    if db.exec(select(FirearmFinish).where(FirearmFinish.name == name)).first():
        raise HTTPException(status_code=409, detail="Finish already exists")
    e = FirearmFinish(name=name)
    db.add(e)
    db.commit()
    db.refresh(e)
    return _attr_lookup_dict(e)


@router.patch("/firearm-finishes/{entry_id}", response_model=FirearmFinishRead)
def update_firearm_finish(
    entry_id: int,
    payload: FirearmFinishUpdate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    e = db.get(FirearmFinish, entry_id)
    if not e:
        raise HTTPException(status_code=404, detail="Finish not found")
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        clash = db.exec(
            select(FirearmFinish)
            .where(FirearmFinish.name == name)
            .where(FirearmFinish.id != entry_id)
        ).first()
        if clash:
            raise HTTPException(status_code=409, detail="Name already exists")
        if e.source == "community" and name.lower() != e.name.lower():
            e.source = "local"
            e.community_key = None
        e.name = name
    db.add(e)
    db.commit()
    db.refresh(e)
    return _attr_lookup_dict(e)


@router.delete(
    "/firearm-finishes/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_firearm_finish(
    entry_id: int,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    e = db.get(FirearmFinish, entry_id)
    if not e:
        raise HTTPException(status_code=404, detail="Finish not found")
    if e.source not in ("user", "local"):
        raise HTTPException(
            status_code=400,
            detail="Cannot delete community entries — use Hide instead",
        )
    db.delete(e)
    db.commit()
    return None
