import os
from pathlib import Path

from utils.logging import get_logger
import yaml
from sqlalchemy import func
from sqlmodel import Session, select

from database import engine
from models import AmmoCondition, Category, Dealer, FirearmCondition
from utils.config import DEFAULTS_PATH, _BUNDLED_DEFAULTS, get_setting, set_setting

logger = get_logger(__name__)

# Simple lookup tables: (yaml_key, Model)
# Calibers, ammo_types, manufacturers, and dealers are now community-managed.
_SIMPLE_TABLES = [
    ("ammo_conditions", AmmoCondition),
    ("categories", Category),
    ("firearm_conditions", FirearmCondition),
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
            logger.debug("Added %s to %s", yaml_name, section)
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
                logger.debug("Deactivated %s from %s", row.name, section)
                deactivated += 1

    return added, skipped, deactivated


def _sync_acquisition_sources(db: Session, sources: list, update_existing: bool) -> tuple[int, int]:
    """Seed acquisition sources (Gift, Found, etc.) into the dealers table as source='yaml'."""
    added = skipped = 0
    for name in sources:
        existing = db.exec(
            select(Dealer).where(func.lower(Dealer.name) == name.lower())
        ).first()
        if not existing:
            db.add(Dealer(name=name, url=None, source="yaml", is_imported=True))
            logger.debug("Added acquisition source: %s", name)
            added += 1
        else:
            skipped += 1
    return added, skipped


def sync_yaml_seeds(config: dict) -> None:
    defaults_path = Path(DEFAULTS_PATH)
    if defaults_path.exists() and os.access(defaults_path, os.R_OK):
        read_path = defaults_path
    else:
        logger.warning(
            "Cannot read %s — permission denied or file missing. "
            "Using bundled defaults from %s.",
            DEFAULTS_PATH, _BUNDLED_DEFAULTS,
        )
        read_path = _BUNDLED_DEFAULTS

    with open(read_path) as f:
        data = yaml.safe_load(f)

    yaml_version = str(data.get("version", "unknown"))
    defaults_cfg = config.get("defaults", {})
    sync_on_startup = defaults_cfg.get("sync_on_startup", True)
    update_existing = defaults_cfg.get("update_existing", False)
    allow_removal = defaults_cfg.get("allow_removal", False)

    with Session(engine) as db:
        db_version = get_setting(db, "defaults_version")

        logger.info("Defaults sync: version %s", yaml_version)

        if db_version == yaml_version and not sync_on_startup:
            logger.debug("Defaults up to date (v%s), skipping sync", yaml_version)
            return

        total_added = total_skipped = total_deactivated = 0

        for section, Model in _SIMPLE_TABLES:
            entries = data.get(section, [])
            logger.debug("Seeding %s: %d entries", section, len(entries))
            a, s, d = _sync_simple(db, section, Model, entries, update_existing, allow_removal)
            total_added += a
            total_skipped += s
            total_deactivated += d

        acq_sources = data.get("acquisition_sources", [])
        if acq_sources:
            logger.debug("Seeding acquisition sources: %d entries", len(acq_sources))
            a, s = _sync_acquisition_sources(db, acq_sources, update_existing)
            total_added += a
            total_skipped += s

        set_setting(db, "defaults_version", yaml_version)
        db.commit()

    logger.info(
        "Defaults sync complete: %d added, %d skipped, %d deactivated (v%s)",
        total_added, total_skipped, total_deactivated, yaml_version,
    )
