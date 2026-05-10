from sqlalchemy import UniqueConstraint
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
    source: str = Field(default="user")  # yaml | community | user
    community_key: Optional[str] = None
    is_imported: bool = Field(default=True)


class Manufacturer(SQLModel, table=True):
    __tablename__ = "manufacturers"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(sa_column_kwargs={"unique": True})
    url: Optional[str] = None
    is_active: bool = Field(default=True)
    source: str = Field(default="user")  # yaml | community | user
    community_key: Optional[str] = None
    is_imported: bool = Field(default=True)
    types: Optional[str] = None  # JSON array: '["ammo"]' | '["firearm"]' | '["ammo","firearm"]'


class AmmoType(SQLModel, table=True):
    __tablename__ = "ammo_types"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(sa_column_kwargs={"unique": True})
    is_active: bool = Field(default=True)
    source: str = Field(default="user")  # yaml | community | user
    community_key: Optional[str] = None
    is_imported: bool = Field(default=True)


class AmmoCondition(SQLModel, table=True):
    __tablename__ = "ammo_conditions"

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
    source: str = Field(default="user")  # yaml | community | user
    community_key: Optional[str] = None
    is_imported: bool = Field(default=True)
    types: Optional[str] = None  # JSON array: '["online","local"]'
    country: Optional[str] = Field(default="US")
    state: Optional[str] = None
    is_standard_geo: bool = Field(default=True)


# ---------------------------------------------------------------------------
# Firearm lookup tables (P1a foundation; firearms table itself lands in P1b)
# ---------------------------------------------------------------------------

class FirearmActionType(SQLModel, table=True):
    __tablename__ = "firearm_action_types"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(sa_column_kwargs={"unique": True})
    is_active: bool = Field(default=True)
    source: str = Field(default="user")  # yaml | community | user
    community_key: Optional[str] = None
    is_imported: bool = Field(default=True)


class FirearmFrameSize(SQLModel, table=True):
    __tablename__ = "firearm_frame_sizes"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(sa_column_kwargs={"unique": True})
    is_active: bool = Field(default=True)
    source: str = Field(default="user")
    community_key: Optional[str] = None
    is_imported: bool = Field(default=True)


class FirearmOpticCut(SQLModel, table=True):
    __tablename__ = "firearm_optic_cuts"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(sa_column_kwargs={"unique": True})
    is_active: bool = Field(default=True)
    source: str = Field(default="user")
    community_key: Optional[str] = None
    is_imported: bool = Field(default=True)


class FirearmRailType(SQLModel, table=True):
    __tablename__ = "firearm_rail_types"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(sa_column_kwargs={"unique": True})
    is_active: bool = Field(default=True)
    source: str = Field(default="user")
    community_key: Optional[str] = None
    is_imported: bool = Field(default=True)


class FirearmFinish(SQLModel, table=True):
    __tablename__ = "firearm_finishes"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(sa_column_kwargs={"unique": True})
    is_active: bool = Field(default=True)
    source: str = Field(default="user")
    community_key: Optional[str] = None
    is_imported: bool = Field(default=True)


class FirearmModel(SQLModel, table=True):
    __tablename__ = "firearm_models"
    __table_args__ = (
        UniqueConstraint("manufacturer_id", "name", name="uq_firearm_models_mfr_name"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    manufacturer_id: int = Field(foreign_key="manufacturers.id")
    name: str
    default_caliber_id: Optional[int] = Field(default=None, foreign_key="calibers.id")
    default_action_type_id: Optional[int] = Field(
        default=None, foreign_key="firearm_action_types.id"
    )
    default_barrel_length_in: Optional[float] = None
    is_active: bool = Field(default=True)
    source: str = Field(default="user")
    community_key: Optional[str] = None
    is_imported: bool = Field(default=True)


class FirearmComplianceTag(SQLModel, table=True):
    __tablename__ = "firearm_compliance_tags"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(sa_column_kwargs={"unique": True})
    description: Optional[str] = None
    jurisdiction: Optional[str] = None  # "CA" | "NY" | "NFA" | "Federal" — UI grouping
    is_active: bool = Field(default=True)
    source: str = Field(default="community")
    community_key: Optional[str] = None
    is_imported: bool = Field(default=True)


class FirearmUserTag(SQLModel, table=True):
    __tablename__ = "firearm_user_tags"
    __table_args__ = (
        UniqueConstraint("owner_id", "name", name="uq_firearm_user_tags_owner_name"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="users.id")
    name: str
    color: Optional[str] = None  # validated as ^#[0-9A-Fa-f]{6}$ on the API layer
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Firearms (P1b)
# ---------------------------------------------------------------------------

class Firearm(SQLModel, table=True):
    __tablename__ = "firearms"

    id: Optional[int] = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="users.id")
    is_shared: bool = Field(default=False)

    manufacturer_id: int = Field(foreign_key="manufacturers.id")
    firearm_model_id: Optional[int] = Field(default=None, foreign_key="firearm_models.id")
    custom_model_name: Optional[str] = None

    firearm_type: str  # pistol | rifle | shotgun | other
    action_type_id: Optional[int] = Field(default=None, foreign_key="firearm_action_types.id")

    caliber_id: int = Field(foreign_key="calibers.id")
    caliber_notes: Optional[str] = None

    serial: Optional[str] = None
    barrel_length_in: Optional[float] = None
    # Physical attribute FKs (v0.3.0). Replaces the previous free-text `finish`.
    frame_size_id: Optional[int] = Field(default=None, foreign_key="firearm_frame_sizes.id")
    optic_cut_id: Optional[int] = Field(default=None, foreign_key="firearm_optic_cuts.id")
    rail_type_id: Optional[int] = Field(default=None, foreign_key="firearm_rail_types.id")
    finish_id: Optional[int] = Field(default=None, foreign_key="firearm_finishes.id")
    standard_capacity: Optional[int] = None
    purchase_date: Optional[date] = None
    purchase_price: Optional[float] = None
    dealer_id: Optional[int] = Field(default=None, foreign_key="dealers.id")
    notes: Optional[str] = None

    rounds_lifetime: int = Field(default=0)
    rounds_since_clean: int = Field(default=0)
    last_cleaned_at: Optional[date] = None
    service_interval_rounds: Optional[int] = None
    service_interval_days: Optional[int] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class FirearmLog(SQLModel, table=True):
    __tablename__ = "firearm_log"

    id: Optional[int] = Field(default=None, primary_key=True)
    firearm_id: int = Field(foreign_key="firearms.id")
    event_type: str  # cleaning | service | note
    event_date: date
    rounds_at_event: int
    notes: Optional[str] = None
    logged_by: int = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class FirearmComplianceTagLink(SQLModel, table=True):
    __tablename__ = "firearm_compliance_tag_links"

    firearm_id: int = Field(foreign_key="firearms.id", primary_key=True)
    tag_id: int = Field(foreign_key="firearm_compliance_tags.id", primary_key=True)


class FirearmUserTagLink(SQLModel, table=True):
    __tablename__ = "firearm_user_tag_links"

    firearm_id: int = Field(foreign_key="firearms.id", primary_key=True)
    tag_id: int = Field(foreign_key="firearm_user_tags.id", primary_key=True)


class FirearmPhoto(SQLModel, table=True):
    __tablename__ = "firearm_photos"

    id: Optional[int] = Field(default=None, primary_key=True)
    firearm_id: int = Field(foreign_key="firearms.id")
    filename: str
    original_name: Optional[str] = None
    content_type: str
    size_bytes: int
    width: int
    height: int
    is_default: bool = Field(default=False)
    sort_order: int = Field(default=0)
    uploaded_by: int = Field(foreign_key="users.id")
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------

class Location(SQLModel, table=True):
    __tablename__ = "locations"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    notes: Optional[str] = None
    is_active: bool = Field(default=True)
    source: str = Field(default="user")


class Container(SQLModel, table=True):
    __tablename__ = "containers"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    location_id: Optional[int] = Field(default=None, foreign_key="locations.id")
    notes: Optional[str] = None
    is_active: bool = Field(default=True)
    source: str = Field(default="user")


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(sa_column_kwargs={"unique": True})  # kept for DB compat; set to email on create
    email: Optional[str] = None
    first_name: str = Field(default="")
    last_name: str = Field(default="")
    password_hash: str
    role: str = Field(default="member")  # admin | member | readonly
    is_active: bool = Field(default=True)
    must_change_password: bool = Field(default=False)
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
    ammo_condition_id: Optional[int] = Field(default=None, foreign_key="ammo_conditions.id")
    category_id: Optional[int] = Field(default=None, foreign_key="categories.id")
    qty_original: int
    qty_remaining: int
    purchase_date: Optional[date] = None
    cost_per_round: Optional[float] = None
    dealer_id: Optional[int] = Field(default=None, foreign_key="dealers.id")
    location_id: Optional[int] = Field(default=None, foreign_key="locations.id")
    container_id: Optional[int] = Field(default=None, foreign_key="containers.id")
    product_id: Optional[int] = Field(default=None, foreign_key="products.id")
    legacy_id: Optional[str] = None
    notes: Optional[str] = None
    split_from_id: Optional[int] = Field(default=None, foreign_key="ammo_box.id")
    is_archived: bool = Field(default=False)
    archive_reason: Optional[str] = None  # split | empty | manual | imported
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Product Catalog
# ---------------------------------------------------------------------------

class Product(SQLModel, table=True):
    __tablename__ = "products"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    caliber_id: int = Field(foreign_key="calibers.id")
    manufacturer_id: int = Field(foreign_key="manufacturers.id")
    product_name: Optional[str] = None
    gr_oz: Optional[float] = None
    weight_unit: Optional[str] = Field(default="GR")
    type_id: Optional[int] = Field(default=None, foreign_key="ammo_types.id")
    category_id: Optional[int] = Field(default=None, foreign_key="categories.id")
    ammo_condition_id: Optional[int] = Field(default=None, foreign_key="ammo_conditions.id")
    default_cost: Optional[float] = None
    upc: Optional[str] = None
    image_path: Optional[str] = None
    notes: Optional[str] = None
    owner_id: int = Field(foreign_key="users.id")
    is_shared: bool = Field(default=True)
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
    log_type: str = Field(default="expend")  # expend | split | adjust
    related_ids: Optional[str] = None  # JSON array of related box IDs
    notes: Optional[str] = None
    # NULL for ad-hoc /ammo/:id/expend rows; set when an entry was created by a
    # range session line (P3) so deletion of the line can reverse the deduction.
    range_session_line_id: Optional[int] = Field(
        default=None, foreign_key="range_session_lines.id"
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Range Sessions (P3)
# ---------------------------------------------------------------------------

class RangeSession(SQLModel, table=True):
    __tablename__ = "range_sessions"

    id: Optional[int] = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="users.id")
    is_shared: bool = Field(default=False)
    date: date
    location_name: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class RangeSessionLine(SQLModel, table=True):
    __tablename__ = "range_session_lines"

    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="range_sessions.id")
    firearm_id: Optional[int] = Field(default=None, foreign_key="firearms.id")
    ammo_box_id: Optional[int] = Field(default=None, foreign_key="ammo_box.id")
    rounds_fired: int = Field(default=0)
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Invitations
# ---------------------------------------------------------------------------

class Invitation(SQLModel, table=True):
    __tablename__ = "invitations"

    id: Optional[int] = Field(default=None, primary_key=True)
    token: str = Field(sa_column_kwargs={"unique": True})
    created_by: int = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime
    used_at: Optional[datetime] = None
    used_by: Optional[int] = Field(default=None, foreign_key="users.id")
    role: str  # admin | member | readonly
    email_hint: Optional[str] = None
    is_revoked: bool = Field(default=False)


# ---------------------------------------------------------------------------
# Password History
# ---------------------------------------------------------------------------

class PasswordHistory(SQLModel, table=True):
    __tablename__ = "password_history"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id")
    password_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Password Reset Tokens
# ---------------------------------------------------------------------------

class PasswordResetToken(SQLModel, table=True):
    __tablename__ = "password_reset_tokens"

    id: Optional[int] = Field(default=None, primary_key=True)
    token: str = Field(sa_column_kwargs={"unique": True})
    user_id: int = Field(foreign_key="users.id")
    created_by: int = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime
    used_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

class Notification(SQLModel, table=True):
    __tablename__ = "notifications"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="users.id")  # null = system-wide
    type: str  # low_stock | backup_failure | backup_success | import_complete | new_user | update_available
    title: str
    message: str
    is_read: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    read_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------

class CaliberThreshold(SQLModel, table=True):
    __tablename__ = "caliber_thresholds"
    __table_args__ = (UniqueConstraint("caliber_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    caliber_id: int = Field(foreign_key="calibers.id")
    owner_id: int = Field(foreign_key="users.id")
    rounds: int
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class LocationThreshold(SQLModel, table=True):
    __tablename__ = "location_thresholds"
    __table_args__ = (UniqueConstraint("location_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    location_id: int = Field(foreign_key="locations.id")
    owner_id: int = Field(foreign_key="users.id")
    rounds: int
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# App Settings
# ---------------------------------------------------------------------------

class AppSettings(SQLModel, table=True):
    __tablename__ = "app_settings"

    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(sa_column_kwargs={"unique": True})
    value: str
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Task Registry / History
# ---------------------------------------------------------------------------

class TaskHistory(SQLModel, table=True):
    __tablename__ = "task_history"

    id: Optional[int] = Field(default=None, primary_key=True)
    task_name: str
    started_at: datetime = Field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    status: str = Field(default="running")  # running | ok | failed | skipped
    error_message: Optional[str] = None
    details: Optional[str] = None  # JSON string for task-specific stats
    triggered_by: str = Field(default="scheduler")  # scheduler | manual


class TaskRegistry(SQLModel, table=True):
    __tablename__ = "task_registry"

    id: Optional[int] = Field(default=None, primary_key=True)
    task_key: str = Field(sa_column_kwargs={"unique": True})
    name: str
    description: Optional[str] = None
    interval_type: str  # hours | daily | cron
    interval_value: str  # "24", "03:00"
    enabled: bool = Field(default=True)
    last_run_at: Optional[datetime] = None
    last_status: Optional[str] = None
    last_duration_ms: Optional[int] = None
    next_run_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
