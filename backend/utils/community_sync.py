import json
import os

import httpx
import yaml
from sqlalchemy import func
from sqlmodel import Session, select

from utils.logging import get_logger

logger = get_logger(__name__)


def _github_raw_base() -> str:
    """Pick the GitHub branch to fetch community YAMLs from.

    Dev builds (anything where GIT_BRANCH is set and not `main` or a release
    tag) read from the dev branch, so `:dev` images can pick up newly-added
    community files (lookup tables, manufacturers, etc.) before they ship to
    main. Stable / release / unknown-environment installs stay on main.

    Override with `AL_COMMUNITY_BRANCH` when you need to point a specific
    install at a feature branch for testing.
    """
    override = os.environ.get("AL_COMMUNITY_BRANCH")
    if override:
        return f"https://raw.githubusercontent.com/crzykidd/AmmoLedger/{override}"
    branch = os.environ.get("GIT_BRANCH", "")
    if branch and branch != "main" and not branch.startswith("v"):
        return "https://raw.githubusercontent.com/crzykidd/AmmoLedger/dev"
    return "https://raw.githubusercontent.com/crzykidd/AmmoLedger/main"


GITHUB_RAW_BASE = _github_raw_base()

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
        # `types` is the merged ammo/firearm domains marker (P1a). The curator
        # populates this in community/manufacturers.yaml; existing entries that
        # don't list `types` keep whatever the migration backfilled (["ammo"]).
        "fields": ["name", "url", "types"],
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
    "firearm_action_types": {
        "github_path": "community/firearm_action_types.yaml",
        "bundled_path": "/app/community/firearm_action_types.yaml",
        "list_key": "firearm_action_types",
        "model": "FirearmActionType",
        "fields": ["name"],
    },
    "firearm_frame_sizes": {
        "github_path": "community/firearm_frame_sizes.yaml",
        "bundled_path": "/app/community/firearm_frame_sizes.yaml",
        "list_key": "firearm_frame_sizes",
        "model": "FirearmFrameSize",
        "fields": ["name"],
    },
    "firearm_optic_cuts": {
        "github_path": "community/firearm_optic_cuts.yaml",
        "bundled_path": "/app/community/firearm_optic_cuts.yaml",
        "list_key": "firearm_optic_cuts",
        "model": "FirearmOpticCut",
        "fields": ["name"],
    },
    "firearm_rail_types": {
        "github_path": "community/firearm_rail_types.yaml",
        "bundled_path": "/app/community/firearm_rail_types.yaml",
        "list_key": "firearm_rail_types",
        "model": "FirearmRailType",
        "fields": ["name"],
    },
    "firearm_finishes": {
        "github_path": "community/firearm_finishes.yaml",
        "bundled_path": "/app/community/firearm_finishes.yaml",
        "list_key": "firearm_finishes",
        "model": "FirearmFinish",
        "fields": ["name"],
    },
    "firearm_models": {
        "github_path": "community/firearm_models.yaml",
        "bundled_path": "/app/community/firearm_models.yaml",
        "list_key": "firearm_models",
        "model": "FirearmModel",
        # FK lookups are resolved by community_key via _resolve_firearm_model_fks.
        # `default_barrel_length_in` is a plain scalar field handled below in the
        # update + insert paths (added v0.3.0 for the form-drawer auto-fill cascade).
        "fields": [
            "name",
            "manufacturer_key",
            "default_caliber_key",
            "default_action_type_key",
            "default_barrel_length_in",
        ],
    },
    "firearm_compliance_tags": {
        "github_path": "community/firearm_compliance_tags.yaml",
        "bundled_path": "/app/community/firearm_compliance_tags.yaml",
        "list_key": "firearm_compliance_tags",
        "model": "FirearmComplianceTag",
        "fields": ["name", "description", "jurisdiction"],
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
    from models import (  # noqa: PLC0415
        AmmoType,
        Caliber,
        Dealer,
        FirearmActionType,
        FirearmComplianceTag,
        FirearmFinish,
        FirearmFrameSize,
        FirearmModel,
        FirearmOpticCut,
        FirearmRailType,
        Manufacturer,
    )
    return {
        "Dealer": Dealer,
        "Manufacturer": Manufacturer,
        "Caliber": Caliber,
        "AmmoType": AmmoType,
        "FirearmActionType": FirearmActionType,
        "FirearmFrameSize": FirearmFrameSize,
        "FirearmOpticCut": FirearmOpticCut,
        "FirearmRailType": FirearmRailType,
        "FirearmFinish": FirearmFinish,
        "FirearmModel": FirearmModel,
        "FirearmComplianceTag": FirearmComplianceTag,
    }[model_name]


def _resolve_firearm_model_fks(item: dict, session) -> dict | None:
    """Translate community_key references in a firearm_models row to FK ids.

    Required: manufacturer_key. Optional: default_caliber_key, default_action_type_key.
    Returns None if the manufacturer is missing — caller should skip the row.
    """
    from models import Caliber, FirearmActionType, Manufacturer  # noqa: PLC0415
    from sqlmodel import select  # noqa: PLC0415

    mfr_key = item.get("manufacturer_key")
    if not mfr_key:
        return None
    mfr = session.exec(
        select(Manufacturer).where(Manufacturer.community_key == mfr_key)
    ).first()
    if not mfr:
        return None

    resolved: dict = {"manufacturer_id": mfr.id}

    cal_key = item.get("default_caliber_key")
    if cal_key:
        cal = session.exec(
            select(Caliber).where(Caliber.community_key == cal_key)
        ).first()
        resolved["default_caliber_id"] = cal.id if cal else None
    else:
        resolved["default_caliber_id"] = None

    act_key = item.get("default_action_type_key")
    if act_key:
        act = session.exec(
            select(FirearmActionType).where(FirearmActionType.community_key == act_key)
        ).first()
        resolved["default_action_type_id"] = act.id if act else None
    else:
        resolved["default_action_type_id"] = None

    return resolved


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


def _merge_manufacturer_types(existing_raw: str | None, incoming: list | None) -> str | None:
    """Union the existing types JSON with incoming types from community YAML.

    Manufacturers shared between ammo and firearm domains keep both markers.
    Returns the JSON string to write, or None if no change is needed.
    """
    if incoming is None:
        return existing_raw  # nothing to merge
    if existing_raw:
        try:
            existing_list = json.loads(existing_raw)
            if not isinstance(existing_list, list):
                existing_list = []
        except json.JSONDecodeError:
            existing_list = []
    else:
        existing_list = []
    merged = list(existing_list)
    for v in incoming:
        if v not in merged:
            merged.append(v)
    return json.dumps(merged)


def sync_community_table(table_key: str, session: Session, first_run: bool = False) -> dict:
    """Sync one community lookup table. Returns stats dict."""
    data = fetch_community_yaml(table_key)
    if not data:
        return {"error": "No data available", "new": 0, "updated": 0, "pending": 0, "total": 0}

    config = COMMUNITY_TABLES[table_key]
    items = data.get(config["list_key"], [])
    Model = _get_model_class(config["model"])
    is_firearm_models = config["model"] == "FirearmModel"

    stats = {"new": 0, "updated": 0, "pending": 0, "total": len(items)}

    for item in items:
        if isinstance(item, str):
            item = {"name": item}
        name = item.get("name", "").strip()
        if not name:
            continue
        # firearm_models entries provide an explicit community_key in the YAML
        # since slugifying just the model name would clash across manufacturers
        # (e.g. Glock 17 vs Sig P17). Other tables fall back to slugify.
        key = (item.get("community_key") or "").strip() or slugify(name)

        fk_resolved: dict | None = None
        if is_firearm_models:
            fk_resolved = _resolve_firearm_model_fks(item, session)
            if fk_resolved is None:
                logger.warning(
                    "Skipping firearm model %r: missing/unknown manufacturer_key %r",
                    name, item.get("manufacturer_key"),
                )
                continue

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
                incoming_types = item.get("types")
                if incoming_types is not None:
                    merged = _merge_manufacturer_types(existing.types, incoming_types)
                    if merged != existing.types:
                        existing.types = merged
                        changed = True
            if hasattr(existing, "description"):
                new_desc = item.get("description")
                if new_desc is not None and existing.description != new_desc:
                    existing.description = new_desc
                    changed = True
            if hasattr(existing, "jurisdiction"):
                new_jur = item.get("jurisdiction")
                if new_jur is not None and existing.jurisdiction != new_jur:
                    existing.jurisdiction = new_jur
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
            if fk_resolved is not None:
                for fk_field, fk_val in fk_resolved.items():
                    if getattr(existing, fk_field) != fk_val:
                        setattr(existing, fk_field, fk_val)
                        changed = True
            # firearm_models also carries default_barrel_length_in as a
            # plain scalar (added v0.3.0 for the form-drawer auto-fill).
            if is_firearm_models:
                incoming_barrel = item.get("default_barrel_length_in")
                if getattr(existing, "default_barrel_length_in", None) != incoming_barrel:
                    existing.default_barrel_length_in = incoming_barrel
                    changed = True
            if existing.source != "community":
                existing.source = "community"
                changed = True
            if changed:
                session.add(existing)
            stats["updated"] += 1
            continue

        # Check by name (pre-existing yaml or user entry).
        # Firearm models scope name-uniqueness by manufacturer (the unique
        # constraint is (manufacturer_id, name), not name alone).
        if is_firearm_models and fk_resolved is not None:
            existing_by_name = session.exec(
                select(Model)
                .where(func.lower(Model.name) == name.lower())
                .where(Model.manufacturer_id == fk_resolved["manufacturer_id"])
            ).first()
        else:
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
                incoming_types = item.get("types")
                if incoming_types is not None:
                    existing_by_name.types = _merge_manufacturer_types(
                        existing_by_name.types, incoming_types,
                    )
            if hasattr(existing_by_name, "description"):
                if item.get("description") is not None:
                    existing_by_name.description = item.get("description")
            if hasattr(existing_by_name, "jurisdiction"):
                if item.get("jurisdiction") is not None:
                    existing_by_name.jurisdiction = item.get("jurisdiction")
            if hasattr(existing_by_name, "country"):
                existing_by_name.country = item.get("country", "US")
                existing_by_name.state = item.get("state")
            if fk_resolved is not None:
                for fk_field, fk_val in fk_resolved.items():
                    setattr(existing_by_name, fk_field, fk_val)
            if is_firearm_models:
                existing_by_name.default_barrel_length_in = item.get(
                    "default_barrel_length_in"
                )
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
        if "description" in config["fields"]:
            fields["description"] = item.get("description")
        if "jurisdiction" in config["fields"]:
            fields["jurisdiction"] = item.get("jurisdiction")
        if "country" in config["fields"]:
            fields["country"] = item.get("country", "US")
            fields["state"] = item.get("state")
        if fk_resolved is not None:
            fields.update(fk_resolved)
        if is_firearm_models:
            fields["default_barrel_length_in"] = item.get("default_barrel_length_in")

        session.add(Model(**fields))
        if first_run:
            stats["new"] += 1
        else:
            stats["pending"] += 1

    # Orphan demotion: community entries no longer in the YAML get demoted to local.
    # Use the same key resolution as the create step (explicit community_key first,
    # then fall back to slugify) — otherwise tables that ship explicit keys (the
    # firearm lookups) would see every row demoted on every sync.
    yaml_keys = set()
    for item in items:
        if isinstance(item, str):
            item = {"name": item}
        raw_name = item.get("name", "").strip()
        if not raw_name:
            continue
        key = (item.get("community_key") or "").strip() or slugify(raw_name)
        yaml_keys.add(key)

    orphan_candidates = session.exec(
        select(Model).where(
            Model.source == "community",
            Model.community_key != None,  # noqa: E711
        )
    ).all()
    orphans = [o for o in orphan_candidates if o.community_key not in yaml_keys]
    stats["demoted"] = len(orphans)
    for orphan in orphans:
        logger.info("Demoting orphan community entry: %s (key=%s)", orphan.name, orphan.community_key)
        orphan.source = "local"
        orphan.community_key = None
        session.add(orphan)

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
