from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlmodel import Session, select

from database import get_session
from models import AmmoCondition, AmmoType, Caliber, Category, Container, Dealer, Location, Manufacturer
from schemas import (
    ContainerCreate,
    ContainerRead,
    DealerCreate,
    DealerRead,
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
    user=Depends(require_auth),
    db: Session = Depends(get_session),
):
    return _fetch_entries(Manufacturer, "manufacturers", active_only, db)


@router.post("/manufacturers", response_model=ManufacturerRead, status_code=status.HTTP_201_CREATED)
def create_manufacturer(
    payload: ManufacturerCreate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    if db.exec(select(Manufacturer).where(Manufacturer.name == payload.name)).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Manufacturer already exists")
    m = Manufacturer(name=payload.name, url=payload.url or None)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


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

    if entry.source != "user":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete YAML-seeded entries — use Hide instead",
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
