import os

import yaml
from sqlmodel import Session, select

from database import engine
from models import AmmoType, Caliber, Category, Dealer, Manufacturer
from utils.config import DEFAULTS_PATH


def sync_yaml_seeds() -> None:
    """
    Insert any lookup-table entries defined in defaults.yaml that are not
    already present in the database.  Existing entries are never modified.
    """
    with open(DEFAULTS_PATH) as f:
        data = yaml.safe_load(f)

    with Session(engine) as db:
        for name in data.get("calibers", []):
            if not db.exec(select(Caliber).where(Caliber.name == name)).first():
                db.add(Caliber(name=name, source="yaml"))

        for name in data.get("manufacturers", []):
            if not db.exec(select(Manufacturer).where(Manufacturer.name == name)).first():
                db.add(Manufacturer(name=name, source="yaml"))

        for name in data.get("ammo_types", []):
            if not db.exec(select(AmmoType).where(AmmoType.name == name)).first():
                db.add(AmmoType(name=name, source="yaml"))

        for name in data.get("categories", []):
            if not db.exec(select(Category).where(Category.name == name)).first():
                db.add(Category(name=name, source="yaml"))

        for item in data.get("dealers", []):
            if not db.exec(select(Dealer).where(Dealer.name == item["name"])).first():
                db.add(Dealer(name=item["name"], url=item.get("url"), source="yaml"))

        db.commit()
