import json

import yaml
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from database import get_session
from models import (
    AmmoType,
    Caliber,
    Dealer,
    FirearmActionType,
    FirearmComplianceTag,
    FirearmModel,
    Manufacturer,
)
from utils.community_sync import COMMUNITY_TABLES
from utils.rbac import require_auth, require_role

router = APIRouter(tags=["community"])

_COMMUNITY_MODELS = {
    "dealers": Dealer,
    "manufacturers": Manufacturer,
    "calibers": Caliber,
    "ammo_types": AmmoType,
    "firearm_action_types": FirearmActionType,
    "firearm_models": FirearmModel,
    "firearm_compliance_tags": FirearmComplianceTag,
}

GITHUB_EDIT_BASE = "https://github.com/crzykidd/AmmoLedger/edit/main/community"


def _resolve_model(table: str):
    model = _COMMUNITY_MODELS.get(table)
    if model is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown community table: {table}. Valid: {list(_COMMUNITY_MODELS)}",
        )
    return model


@router.get("/status")
def get_community_status(
    _=Depends(require_auth),
    db: Session = Depends(get_session),
):
    """Return sync status for each community-managed table."""
    from utils.config import get_setting  # noqa: PLC0415

    result = {}
    for key, Model in _COMMUNITY_MODELS.items():
        community_q = select(func.count(Model.id)).where(Model.source == "community")
        total = db.exec(community_q).one()
        imported_count = db.exec(
            select(func.count(Model.id)).where(
                Model.source == "community",
                Model.is_imported == True,  # noqa: E712
            )
        ).one()
        pending = db.exec(
            select(func.count(Model.id)).where(
                Model.source == "community",
                Model.is_imported == False,  # noqa: E712
            )
        ).one()
        hidden = db.exec(
            select(func.count(Model.id)).where(
                Model.source == "community",
                Model.is_active == False,  # noqa: E712
            )
        ).one()
        last_synced = get_setting(db, f"community_last_synced_{key}")
        result[key] = {
            "total": total,
            "imported": imported_count,
            "pending": pending,
            "hidden": hidden,
            "last_synced": last_synced,
        }
    return result


class _TableIds(BaseModel):
    table: str
    ids: list[int]


@router.post("/sync")
def trigger_community_sync(
    _=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    """Force a manual community sync via the task runner."""
    from utils.task_definitions import TASK_FUNCTIONS  # noqa: PLC0415
    from utils.task_runner import run_task  # noqa: PLC0415

    task_fn = TASK_FUNCTIONS.get("community_sync")
    if task_fn is None:
        raise HTTPException(status_code=500, detail="community_sync task not registered")

    history_id = run_task("community_sync", task_fn, triggered_by="manual")
    return {"history_id": history_id, "message": "Community sync complete"}


@router.post("/import")
def import_community_entries(
    body: _TableIds,
    _=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    """Set is_imported=True on specified community entries."""
    Model = _resolve_model(body.table)
    updated = []
    for entry_id in body.ids:
        entry = db.get(Model, entry_id)
        if entry and entry.source == "community":
            entry.is_imported = True
            db.add(entry)
            updated.append(entry.id)
    db.commit()
    return {"imported": len(updated), "ids": updated}


@router.post("/hide")
def hide_community_entries(
    body: _TableIds,
    _=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    """Set is_active=False on specified entries."""
    Model = _resolve_model(body.table)
    for entry_id in body.ids:
        entry = db.get(Model, entry_id)
        if entry:
            entry.is_active = False
            db.add(entry)
    db.commit()
    return {"ok": True}


@router.post("/unhide")
def unhide_community_entries(
    body: _TableIds,
    _=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    """Set is_active=True on specified entries."""
    Model = _resolve_model(body.table)
    for entry_id in body.ids:
        entry = db.get(Model, entry_id)
        if entry:
            entry.is_active = True
            db.add(entry)
    db.commit()
    return {"ok": True}


@router.get("/contribute/{table}")
def get_contribute_yaml(
    table: str,
    _=Depends(require_auth),
    db: Session = Depends(get_session),
):
    """Return YAML text of user-created entries not yet in the community list."""
    Model = _resolve_model(table)
    cfg = COMMUNITY_TABLES.get(table)
    if not cfg:
        raise HTTPException(status_code=404, detail="Unknown table")

    stmt = select(Model).where(Model.source == "user")
    if table == "dealers" and hasattr(Model, "is_standard_geo"):
        stmt = stmt.where(Model.is_standard_geo == True)  # noqa: E712

    user_entries = db.exec(stmt).all()

    docs = []
    for entry in sorted(user_entries, key=lambda e: e.name):
        d: dict = {"name": entry.name}
        if hasattr(entry, "url"):
            d["url"] = entry.url or ""
        if table == "dealers":
            raw_types = entry.types
            if raw_types:
                try:
                    d["types"] = json.loads(raw_types)
                except Exception:
                    d["types"] = []
            else:
                d["types"] = []
            d["country"] = entry.country or "US"
            if entry.state:
                d["state"] = entry.state
        elif table == "manufacturers":
            raw_types = getattr(entry, "types", None)
            if raw_types:
                try:
                    d["types"] = json.loads(raw_types)
                except Exception:
                    d["types"] = []
        elif table == "firearm_compliance_tags":
            d["description"] = entry.description or ""
            d["jurisdiction"] = entry.jurisdiction or ""
        elif table == "firearm_models":
            # Emit FK references by community_key so community curators get a
            # portable record. Falls back to empty string when the linked row
            # has no community_key (user-created caliber, etc.).
            from models import (  # noqa: PLC0415
                Caliber,
                FirearmActionType,
                Manufacturer,
            )
            mfr = db.get(Manufacturer, entry.manufacturer_id)
            d["manufacturer_key"] = mfr.community_key if mfr and mfr.community_key else ""
            if entry.default_caliber_id:
                cal = db.get(Caliber, entry.default_caliber_id)
                d["default_caliber_key"] = cal.community_key if cal and cal.community_key else ""
            if entry.default_action_type_id:
                act = db.get(FirearmActionType, entry.default_action_type_id)
                d["default_action_type_key"] = act.community_key if act and act.community_key else ""
        docs.append(d)

    yaml_text = yaml.dump(docs, default_flow_style=False, allow_unicode=True) if docs else ""

    return {
        "yaml": yaml_text,
        "count": len(docs),
        "github_url": f"{GITHUB_EDIT_BASE}/{table}.yaml",
    }
