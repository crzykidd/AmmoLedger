import os
import yaml
from sqlmodel import Session, select

from database import engine
from models import Caliber, Manufacturer, AmmoType, Category, Dealer


def sync_yaml_seeds() -> None:
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    defaults_path = os.path.join(base_dir, "defaults.yaml")

    with open(defaults_path) as f:
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
