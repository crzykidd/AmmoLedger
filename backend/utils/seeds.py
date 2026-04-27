import logging

import yaml
from sqlalchemy import func
from sqlmodel import Session, select

from database import engine
from models import AmmoCondition, AmmoType, Caliber, Category, Dealer, Manufacturer
from utils.config import DEFAULTS_PATH, get_setting, set_setting

logger = logging.getLogger(__name__)

# Simple lookup tables: (yaml_key, Model)
_SIMPLE_TABLES = [
    ("calibers", Caliber),
    ("ammo_types", AmmoType),
    ("ammo_conditions", AmmoCondition),
    ("categories", Category),
]


def _sync_simple(db: Session, section: str, Model, yaml_names: list,
                 update_existing: bool, allow_removal: bool) -> tuple[int, int, int]:
    added = skipped = deactivated = 0
    yaml_lower = {n.lower(): n for n in yaml_names}

    for yaml_name in yaml_names:
        existing = db.exec(
            select(Model).where(func.lower(Model.name) == yaml_name.lower())
        ).first()

        if not existing:
            db.add(Model(name=yaml_name, source="yaml"))
            logger.info("Added %s: %s", section, yaml_name)
            added += 1
        elif existing.source == "user":
            skipped += 1
        else:  # source == "yaml"
            if update_existing and existing.name != yaml_name:
                existing.name = yaml_name
                db.add(existing)
            skipped += 1

    if allow_removal:
        yaml_rows = db.exec(
            select(Model).where(Model.source == "yaml").where(Model.is_active)
        ).all()
        for row in yaml_rows:
            if row.name.lower() not in yaml_lower:
                row.is_active = False
                db.add(row)
                logger.info("Deactivated %s: %s", section, row.name)
                deactivated += 1

    return added, skipped, deactivated


def _sync_manufacturers(db: Session, yaml_entries: list,
                        update_existing: bool, allow_removal: bool) -> tuple[int, int, int]:
    """Sync manufacturers — entries can be plain strings or dicts with name+url."""
    added = skipped = deactivated = 0

    def _normalise(entry) -> dict:
        if isinstance(entry, str):
            return {"name": entry, "url": None}
        return {"name": entry["name"], "url": entry.get("url") or None}

    items = [_normalise(e) for e in yaml_entries]
    yaml_lower = {item["name"].lower(): item for item in items}

    for item in items:
        existing = db.exec(
            select(Manufacturer).where(func.lower(Manufacturer.name) == item["name"].lower())
        ).first()

        if not existing:
            db.add(Manufacturer(name=item["name"], url=item["url"], source="yaml"))
            logger.info("Added manufacturers: %s", item["name"])
            added += 1
        elif existing.source == "user":
            skipped += 1
        else:  # source == "yaml"
            changed = False
            if update_existing and existing.name != item["name"]:
                existing.name = item["name"]
                changed = True
            # Update url if DB has none and yaml provides one
            if existing.url is None and item["url"]:
                existing.url = item["url"]
                changed = True
            if changed:
                db.add(existing)
            skipped += 1

    if allow_removal:
        yaml_rows = db.exec(
            select(Manufacturer).where(Manufacturer.source == "yaml").where(Manufacturer.is_active)
        ).all()
        for row in yaml_rows:
            if row.name.lower() not in yaml_lower:
                row.is_active = False
                db.add(row)
                logger.info("Deactivated manufacturers: %s", row.name)
                deactivated += 1

    return added, skipped, deactivated


def _sync_dealers(db: Session, yaml_dealers: list,
                  update_existing: bool, allow_removal: bool) -> tuple[int, int, int]:
    added = skipped = deactivated = 0
    yaml_lower = {item["name"].lower(): item for item in yaml_dealers}

    for item in yaml_dealers:
        existing = db.exec(
            select(Dealer).where(func.lower(Dealer.name) == item["name"].lower())
        ).first()

        if not existing:
            db.add(Dealer(name=item["name"], url=item.get("url"), source="yaml"))
            logger.info("Added dealers: %s", item["name"])
            added += 1
        elif existing.source == "user":
            skipped += 1
        else:  # source == "yaml"
            if update_existing:
                existing.name = item["name"]
                existing.url = item.get("url")
                db.add(existing)
            skipped += 1

    if allow_removal:
        yaml_rows = db.exec(
            select(Dealer).where(Dealer.source == "yaml").where(Dealer.is_active)
        ).all()
        for row in yaml_rows:
            if row.name.lower() not in yaml_lower:
                row.is_active = False
                db.add(row)
                logger.info("Deactivated dealers: %s", row.name)
                deactivated += 1

    return added, skipped, deactivated


def sync_yaml_seeds(config: dict) -> None:
    with open(DEFAULTS_PATH) as f:
        data = yaml.safe_load(f)

    yaml_version = str(data.get("version", "unknown"))
    defaults_cfg = config.get("defaults", {})
    sync_on_startup = defaults_cfg.get("sync_on_startup", True)
    update_existing = defaults_cfg.get("update_existing", False)
    allow_removal = defaults_cfg.get("allow_removal", False)

    with Session(engine) as db:
        db_version = get_setting(db, "defaults_version")

        if db_version == yaml_version and not sync_on_startup:
            logger.info("Defaults up to date (v%s), skipping sync", yaml_version)
            return

        total_added = total_skipped = total_deactivated = 0

        for section, Model in _SIMPLE_TABLES:
            a, s, d = _sync_simple(
                db, section, Model,
                data.get(section, []),
                update_existing, allow_removal,
            )
            total_added += a
            total_skipped += s
            total_deactivated += d

        a, s, d = _sync_manufacturers(
            db, data.get("manufacturers", []),
            update_existing, allow_removal,
        )
        total_added += a
        total_skipped += s
        total_deactivated += d

        a, s, d = _sync_dealers(
            db, data.get("dealers", []),
            update_existing, allow_removal,
        )
        total_added += a
        total_skipped += s
        total_deactivated += d

        set_setting(db, "defaults_version", yaml_version)
        db.commit()

    logger.info(
        "Defaults sync complete: %d added, %d skipped, %d deactivated. Version: %s",
        total_added, total_skipped, total_deactivated, yaml_version,
    )
