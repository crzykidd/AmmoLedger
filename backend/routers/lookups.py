from fastapi import APIRouter, Depends, HTTPException, status
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
    ManufacturerCreate,
    ManufacturerRead,
    ManufacturerUpdate,
)
from utils.rbac import require_auth, require_role

router = APIRouter(tags=["lookups"])


# ---------------------------------------------------------------------------
# Calibers
# ---------------------------------------------------------------------------

@router.get("/calibers", response_model=list[LookupRead])
def list_calibers(user=Depends(require_auth), db: Session = Depends(get_session)):
    return db.exec(select(Caliber).where(Caliber.is_active)).all()


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
def list_manufacturers(user=Depends(require_auth), db: Session = Depends(get_session)):
    return db.exec(select(Manufacturer).where(Manufacturer.is_active)).all()


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


@router.patch("/manufacturers/{manufacturer_id}", response_model=ManufacturerRead)
def update_manufacturer(
    manufacturer_id: int,
    payload: ManufacturerUpdate,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    m = db.get(Manufacturer, manufacturer_id)
    if not m:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Manufacturer not found")
    if payload.name is not None:
        existing = db.exec(
            select(Manufacturer).where(Manufacturer.name == payload.name).where(Manufacturer.id != manufacturer_id)
        ).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Manufacturer name already exists")
        m.name = payload.name
    if payload.url is not None:
        m.url = payload.url or None
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


# ---------------------------------------------------------------------------
# Ammo Types
# ---------------------------------------------------------------------------

@router.get("/ammo-types", response_model=list[LookupRead])
def list_ammo_types(user=Depends(require_auth), db: Session = Depends(get_session)):
    return db.exec(select(AmmoType).where(AmmoType.is_active)).all()


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
def list_ammo_conditions(user=Depends(require_auth), db: Session = Depends(get_session)):
    return db.exec(select(AmmoCondition).where(AmmoCondition.is_active)).all()


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
def list_categories(user=Depends(require_auth), db: Session = Depends(get_session)):
    return db.exec(select(Category).where(Category.is_active)).all()


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
def list_dealers(user=Depends(require_auth), db: Session = Depends(get_session)):
    return db.exec(select(Dealer).where(Dealer.is_active)).all()


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
def list_locations(user=Depends(require_auth), db: Session = Depends(get_session)):
    return db.exec(select(Location)).all()


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
def list_containers(user=Depends(require_auth), db: Session = Depends(get_session)):
    return db.exec(select(Container)).all()


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
