from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime, date


# ---------------------------------------------------------------------------
# Lookup tables
# ---------------------------------------------------------------------------

class Caliber(SQLModel, table=True):
    __tablename__ = "calibers"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(sa_column_kwargs={"unique": True})
    is_active: bool = Field(default=True)
    source: str = Field(default="user")  # yaml | user


class Manufacturer(SQLModel, table=True):
    __tablename__ = "manufacturers"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(sa_column_kwargs={"unique": True})
    is_active: bool = Field(default=True)
    source: str = Field(default="user")


class AmmoType(SQLModel, table=True):
    __tablename__ = "ammo_types"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(sa_column_kwargs={"unique": True})
    is_active: bool = Field(default=True)
    source: str = Field(default="user")


class Category(SQLModel, table=True):
    __tablename__ = "categories"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(sa_column_kwargs={"unique": True})
    is_active: bool = Field(default=True)
    source: str = Field(default="user")


class Dealer(SQLModel, table=True):
    __tablename__ = "dealers"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(sa_column_kwargs={"unique": True})
    url: Optional[str] = None
    is_active: bool = Field(default=True)
    source: str = Field(default="user")


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------

class Location(SQLModel, table=True):
    __tablename__ = "locations"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    notes: Optional[str] = None


class Container(SQLModel, table=True):
    __tablename__ = "containers"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    location_id: Optional[int] = Field(default=None, foreign_key="locations.id")
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(sa_column_kwargs={"unique": True})
    email: Optional[str] = None
    password_hash: str
    role: str = Field(default="member")  # admin | member | readonly
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_login_at: Optional[datetime] = None
    created_by: Optional[int] = Field(default=None, foreign_key="users.id")


# ---------------------------------------------------------------------------
# Ammo Box
# ---------------------------------------------------------------------------

class AmmoBox(SQLModel, table=True):
    __tablename__ = "ammo_box"

    id: Optional[int] = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="users.id")
    is_shared: bool = Field(default=False)
    caliber_id: int = Field(foreign_key="calibers.id")
    manufacturer_id: int = Field(foreign_key="manufacturers.id")
    product_name: Optional[str] = None
    gr_oz: Optional[float] = None
    weight_unit: Optional[str] = None  # GR | OZ
    type_id: Optional[int] = Field(default=None, foreign_key="ammo_types.id")
    category_id: Optional[int] = Field(default=None, foreign_key="categories.id")
    qty_original: int
    qty_remaining: int
    purchase_date: Optional[date] = None
    cost_per_round: Optional[float] = None
    dealer_id: Optional[int] = Field(default=None, foreign_key="dealers.id")
    container_id: Optional[int] = Field(default=None, foreign_key="containers.id")
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Expenditure Log
# ---------------------------------------------------------------------------

class ExpenditureLog(SQLModel, table=True):
    __tablename__ = "expenditure_log"

    id: Optional[int] = Field(default=None, primary_key=True)
    ammo_box_id: int = Field(foreign_key="ammo_box.id")
    logged_by: int = Field(foreign_key="users.id")
    rounds_used: int
    date: date
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
