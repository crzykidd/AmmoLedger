import json
import os

import httpx
import yaml
from sqlalchemy import func
from sqlmodel import Session, select

from utils.logging import get_logger

logger = get_logger(__name__)

GITHUB_RAW_BASE = "https://raw.githubusercontent.com/crzykidd/AmmoLedger/main"

COMMUNITY_TABLES = {
    "dealers": {
        "github_path": "community/dealers.yaml",
        "bundled_path": "/app/community/dealers.yaml",
        "list_key": "dealers",
        "model": "Dealer",
        "fields": ["name", "url", "types", "country", "state"],
    },
    "manufacturers": {
        "github_path": "community/manufacturers.yaml",
        "bundled_path": "/app/community/manufacturers.yaml",
        "list_key": "manufacturers",
        "model": "Manufacturer",
        "fields": ["name", "url"],
    },
    "calibers": {
        "github_path": "community/calibers.yaml",
        "bundled_path": "/app/community/calibers.yaml",
        "list_key": "calibers",
        "model": "Caliber",
        "fields": ["name"],
    },
    "ammo_types": {
        "github_path": "community/ammo_types.yaml",
        "bundled_path": "/app/community/ammo_types.yaml",
        "list_key": "ammo_types",
        "model": "AmmoType",
        "fields": ["name"],
    },
}


def slugify(name: str) -> str:
    return (
        name.lower()
        .strip()
        .replace("'", "")
        .replace("&", "and")
        .replace(" ", "-")
        .replace(".", "")
        .replace(",", "")
    )


def _get_model_class(model_name: str):
    from models import AmmoType, Caliber, Dealer, Manufacturer  # noqa: PLC0415
    return {
        "Dealer": Dealer,
        "Manufacturer": Manufacturer,
        "Caliber": Caliber,
        "AmmoType": AmmoType,
    }[model_name]


def fetch_community_yaml(table_key: str):
    """Fetch YAML from GitHub; fall back to bundled copy if unavailable."""
    config = COMMUNITY_TABLES[table_key]
    url = f"{GITHUB_RAW_BASE}/{config['github_path']}"
    try:
        resp = httpx.get(url, timeout=10)
        if resp.status_code == 200:
            logger.info("Fetched %s from GitHub", table_key)
            return yaml.safe_load(resp.text)
    except Exception as e:
        logger.warning(
            "Cannot fetch %s from GitHub: %s — using bundled fallback",
            table_key, e,
        )

    bundled = config["bundled_path"]
    if os.path.exists(bundled):
        logger.info("Using bundled fallback for %s", table_key)
        with open(bundled) as f:
            return yaml.safe_load(f)

    logger.error("No community data available for %s (no GitHub, no bundled file)", table_key)
    return None


def sync_community_table(table_key: str, session: Session, first_run: bool = False) -> dict:
    """Sync one community lookup table. Returns stats dict."""
    data = fetch_community_yaml(table_key)
    if not data:
        return {"error": "No data available", "new": 0, "updated": 0, "pending": 0, "total": 0}

    config = COMMUNITY_TABLES[table_key]
    items = data.get(config["list_key"], [])
    Model = _get_model_class(config["model"])

    stats = {"new": 0, "updated": 0, "pending": 0, "total": len(items)}

    for item in items:
        if isinstance(item, str):
            item = {"name": item}
        name = item.get("name", "").strip()
        if not name:
            continue
        key = slugify(name)

        # Fast path: already matched by community_key
        existing = session.exec(
            select(Model).where(Model.community_key == key)
        ).first()

        if existing:
            changed = False
            if hasattr(existing, "url"):
                new_url = item.get("url") or ""
                if new_url and existing.url != new_url:
                    existing.url = new_url
                    changed = True
            if hasattr(existing, "types"):
                new_types = item.get("types")
                if new_types is not None:
                    serialized = json.dumps(new_types)
                    if existing.types != serialized:
                        existing.types = serialized
                        changed = True
            if hasattr(existing, "country"):
                new_country = item.get("country", "US")
                if existing.country != new_country:
                    existing.country = new_country
                    changed = True
                new_state = item.get("state")
                if existing.state != new_state:
                    existing.state = new_state
                    changed = True
            if existing.source != "community":
                existing.source = "community"
                changed = True
            if changed:
                session.add(existing)
            stats["updated"] += 1
            continue

        # Check by name (pre-existing yaml or user entry)
        existing_by_name = session.exec(
            select(Model).where(func.lower(Model.name) == name.lower())
        ).first()

        if existing_by_name:
            existing_by_name.source = "community"
            existing_by_name.community_key = key
            if hasattr(existing_by_name, "url"):
                url_val = item.get("url") or ""
                if url_val and not existing_by_name.url:
                    existing_by_name.url = url_val
            if hasattr(existing_by_name, "types"):
                new_types = item.get("types")
                if new_types is not None:
                    existing_by_name.types = json.dumps(new_types)
            if hasattr(existing_by_name, "country"):
                existing_by_name.country = item.get("country", "US")
                existing_by_name.state = item.get("state")
            session.add(existing_by_name)
            stats["updated"] += 1
            continue

        # Genuinely new entry
        fields: dict = {
            "name": name,
            "source": "community",
            "community_key": key,
            "is_active": True,
            "is_imported": first_run,
        }
        if "url" in config["fields"]:
            fields["url"] = item.get("url") or ""
        if "types" in config["fields"]:
            fields["types"] = json.dumps(item.get("types") or [])
        if "country" in config["fields"]:
            fields["country"] = item.get("country", "US")
            fields["state"] = item.get("state")

        session.add(Model(**fields))
        if first_run:
            stats["new"] += 1
        else:
            stats["pending"] += 1

    session.commit()
    return stats


def sync_all(session: Session, first_run: bool = False) -> dict:
    """Sync all community tables. Returns per-table stats."""
    results = {}
    for key in COMMUNITY_TABLES:
        try:
            results[key] = sync_community_table(key, session, first_run)
            logger.info("Community sync %s: %s", key, results[key])
        except Exception as e:
            logger.error("Community sync %s failed: %s", key, e, exc_info=True)
            results[key] = {"error": str(e), "new": 0, "updated": 0, "pending": 0}
    return results


def check_first_run(session: Session) -> bool:
    """Return True if no community-sourced dealers exist (first community sync)."""
    from models import Dealer  # noqa: PLC0415
    count = session.exec(
        select(func.count(Dealer.id)).where(Dealer.source == "community")
    ).one()
    return count == 0
