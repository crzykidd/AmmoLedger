"""Firearms CSV import: validate / preview / confirm.

Mirrors backend/routers/importer.py (ammo) intentionally. Kept in its own
module so firearm-specific logic (cascading model lookup, multi-value tag
parsing, synthetic firearm_log entries for round counts) can evolve
independently of ammo import.
"""
import csv
import io
import json
from datetime import date as date_type

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlmodel import Session, select

from database import engine, get_session
from models import (
    Caliber,
    Dealer,
    Firearm,
    FirearmActionType,
    FirearmComplianceTag,
    FirearmComplianceTagLink,
    FirearmFinish,
    FirearmFrameSize,
    FirearmLog,
    FirearmModel,
    FirearmOpticCut,
    FirearmRailType,
    FirearmUserTag,
    FirearmUserTagLink,
    Manufacturer,
    User,
)
# Reuse common helpers from the ammo importer — these are shape-stable and we
# explicitly want firearm import to follow the same flow conventions.
from routers.importer import (
    _apply_remap,
    _consume_token,
    _generate_token,
    _is_similar,
    _parse_date,
    _parse_datetime,
    _parse_float,
    _parse_int,
    _validate_token,
)
from utils.logging import get_logger
from utils.pre_import_backup import trigger_pre_import_backup
from utils.rbac import require_auth, require_role

logger = get_logger(__name__)

router = APIRouter(prefix="/import/firearms", tags=["firearms_import"])


# ---------------------------------------------------------------------------
# Column definitions
# ---------------------------------------------------------------------------

# All columns the v0.3.0 export produces. Required-ness is enforced by
# _validate_row, not by column presence; extra columns are silently ignored.
ALL_COLUMNS = {
    "id", "owner_username", "is_shared", "manufacturer", "model",
    "custom_model_name", "display_model", "firearm_type", "action_type",
    "caliber", "caliber_notes", "serial", "barrel_length_in",
    "frame_size", "optic_cut", "rail_type", "finish", "standard_capacity",
    "purchase_date", "purchase_price", "dealer", "notes", "photo_count",
    "rounds_lifetime", "rounds_since_clean", "last_cleaned_at",
    "service_interval_rounds", "service_interval_days", "cleaning_status",
    "compliance_tags", "user_tags", "created_at", "updated_at",
}

# Derived/system fields — round-trip compatibility: they appear in exports
# but don't drive import behavior. Surfaces as a header-level warning when
# present so the user knows the column was ignored.
SILENT_IGNORE_COLUMNS = {"display_model", "cleaning_status", "photo_count"}

# Single-value lookup columns and their underlying models.
SINGLE_LOOKUP_COLUMNS = {
    "manufacturer": Manufacturer,
    "caliber": Caliber,
    "action_type": FirearmActionType,
    "dealer": Dealer,
    "frame_size": FirearmFrameSize,
    "optic_cut": FirearmOpticCut,
    "rail_type": FirearmRailType,
    "finish": FirearmFinish,
}

# Cascading lookup: model is scoped under its row's manufacturer.
CASCADING_LOOKUP_COLUMN = "model"  # → FirearmModel, scoped by manufacturer

# Multi-value pipe-separated columns.
MULTI_VALUE_COLUMNS = {
    "compliance_tags": FirearmComplianceTag,
    "user_tags": FirearmUserTag,
}

# Community-curated lookups: similarity matches default to "use_existing".
# user_tags + dealer are user-scoped so they default to "import_new".
COMMUNITY_FIELDS = {
    "manufacturer", "caliber", "action_type", "model",
    "frame_size", "optic_cut", "rail_type", "finish",
    "compliance_tags",
}


def _table_key_for(Model) -> str:
    return {
        Manufacturer: "manufacturers",
        Caliber: "calibers",
        FirearmActionType: "firearm_action_types",
        Dealer: "dealers",
        FirearmFrameSize: "firearm_frame_sizes",
        FirearmOpticCut: "firearm_optic_cuts",
        FirearmRailType: "firearm_rail_types",
        FirearmFinish: "firearm_finishes",
        FirearmModel: "firearm_models",
        FirearmComplianceTag: "firearm_compliance_tags",
        FirearmUserTag: "firearm_user_tags",
    }[Model]


# ---------------------------------------------------------------------------
# Multi-value parsing
# ---------------------------------------------------------------------------

def _parse_multi_value(raw: str) -> list[str]:
    """Pipe-separated values, trimmed, blanks dropped."""
    if not raw:
        return []
    return [v.strip() for v in raw.split("|") if v.strip()]


# ---------------------------------------------------------------------------
# Per-row validation
# ---------------------------------------------------------------------------

def _validate_row(row: dict[str, str], row_num: int) -> tuple[list[dict], list[dict]]:
    """Return (errors, warnings) for a single CSV row."""
    errors: list[dict] = []
    warnings: list[dict] = []

    # manufacturer: required
    if not row.get("manufacturer", "").strip():
        errors.append({"row": row_num, "field": "manufacturer",
                       "message": "manufacturer is required"})

    # firearm_type: required, must be in enum
    ft = row.get("firearm_type", "").strip().lower()
    if not ft:
        errors.append({"row": row_num, "field": "firearm_type",
                       "message": "firearm_type is required"})
    elif ft not in {"pistol", "rifle", "shotgun", "other"}:
        errors.append({"row": row_num, "field": "firearm_type",
                       "message": f"firearm_type must be pistol|rifle|shotgun|other (got '{ft}')"})

    # caliber: required
    if not row.get("caliber", "").strip():
        errors.append({"row": row_num, "field": "caliber",
                       "message": "caliber is required"})

    # model OR custom_model_name: at least one required (matches CHECK constraint)
    has_model = bool(row.get("model", "").strip())
    has_custom = bool(row.get("custom_model_name", "").strip())
    if not has_model and not has_custom:
        errors.append({"row": row_num, "field": "model",
                       "message": "either model or custom_model_name is required"})

    # Numeric warnings — non-blocking; invalid → null
    for field in ("barrel_length_in", "purchase_price"):
        v = row.get(field, "").strip()
        if not v:
            continue
        parsed = _parse_float(v)
        if parsed is None:
            warnings.append({"row": row_num, "field": field,
                             "message": f"{field} is not a valid number — will be set to null"})
        elif parsed < 0:
            warnings.append({"row": row_num, "field": field,
                             "message": f"{field} is negative — will be set to null"})

    for field in ("rounds_lifetime", "rounds_since_clean", "standard_capacity",
                  "service_interval_rounds", "service_interval_days"):
        v = row.get(field, "").strip()
        if not v:
            continue
        parsed = _parse_int(v)
        if parsed is None or parsed < 0:
            warnings.append({"row": row_num, "field": field,
                             "message": f"{field} is not a non-negative integer — will be set to null/0"})

    # rounds_since_clean must be ≤ rounds_lifetime when both set
    rl_raw = row.get("rounds_lifetime", "").strip()
    rsc_raw = row.get("rounds_since_clean", "").strip()
    rl = _parse_int(rl_raw) if rl_raw else None
    rsc = _parse_int(rsc_raw) if rsc_raw else None
    if rl is not None and rsc is not None and rsc > rl:
        warnings.append({"row": row_num, "field": "rounds_since_clean",
                         "message": f"rounds_since_clean ({rsc}) exceeds rounds_lifetime ({rl}) — will clamp to lifetime"})

    # Date warnings (purchase_date, last_cleaned_at)
    for field in ("purchase_date", "last_cleaned_at"):
        v = row.get(field, "").strip()
        if v and _parse_date(v) is None:
            warnings.append({"row": row_num, "field": field,
                             "message": f"{field} is not a valid ISO date — will be set to null"})

    # Datetime warnings (created_at, updated_at)
    for field in ("created_at", "updated_at"):
        v = row.get(field, "").strip()
        if v and _parse_datetime(v) is None:
            warnings.append({"row": row_num, "field": field,
                             "message": f"{field} is not a valid ISO datetime — will use current time"})

    return errors, warnings


# ---------------------------------------------------------------------------
# Lookup collection helpers
# ---------------------------------------------------------------------------

def _collect_single_lookup_values(rows: list[dict]) -> dict[str, set[str]]:
    """Per-column unique non-blank values."""
    result: dict[str, set[str]] = {col: set() for col in SINGLE_LOOKUP_COLUMNS}
    for row in rows:
        for col in SINGLE_LOOKUP_COLUMNS:
            val = row.get(col, "").strip()
            if val:
                result[col].add(val)
    return result


def _collect_multi_lookup_values(rows: list[dict]) -> dict[str, set[str]]:
    """Per-column unique non-blank multi-values."""
    result: dict[str, set[str]] = {col: set() for col in MULTI_VALUE_COLUMNS}
    for row in rows:
        for col in MULTI_VALUE_COLUMNS:
            for v in _parse_multi_value(row.get(col, "")):
                result[col].add(v)
    return result


def _collect_model_values_by_manufacturer(rows: list[dict]) -> dict[str, set[str]]:
    """Model values grouped by manufacturer name (cascading lookup).

    Rows missing model OR manufacturer are skipped.
    """
    result: dict[str, set[str]] = {}
    for row in rows:
        mfr = row.get("manufacturer", "").strip()
        model = row.get("model", "").strip()
        if mfr and model:
            result.setdefault(mfr, set()).add(model)
    return result


# ---------------------------------------------------------------------------
# New-value detection + similarity matching
# ---------------------------------------------------------------------------

def _check_new_values(db: Session, rows: list[dict]) -> tuple[dict, list[dict]]:
    """Returns (new_values, similarity_matches).

    new_values shape: {table_key: [unmatched values]}.
    Plus a special key `firearm_models_by_manufacturer: {mfr: [unmatched models]}`
    for the cascading firearm_models lookup.

    similarity_matches: [{field, csv_value, existing_value, table_key,
                          manufacturer_context?, default_action}]
    """
    new_values: dict = {}
    similarity_matches: list[dict] = []

    # Single-value lookups
    single_values = _collect_single_lookup_values(rows)
    for col, Model in SINGLE_LOOKUP_COLUMNS.items():
        incoming = single_values.get(col, set())
        if not incoming:
            continue
        existing_rows = db.exec(select(Model)).all()
        existing_names = [r.name for r in existing_rows]
        existing_lower = {n.lower(): n for n in existing_names}

        col_new: list[str] = []
        for val in sorted(incoming):
            if val.lower() in existing_lower:
                continue
            col_new.append(val)
            for existing_name in existing_names:
                if _is_similar(val, existing_name, col):
                    similarity_matches.append({
                        "field": col,
                        "csv_value": val,
                        "existing_value": existing_name,
                        "table_key": _table_key_for(Model),
                        "default_action": "use_existing" if col in COMMUNITY_FIELDS else "import_new",
                    })
                    break
        if col_new:
            new_values[_table_key_for(Model)] = col_new

    # Multi-value lookups (compliance_tags, user_tags)
    multi_values = _collect_multi_lookup_values(rows)
    for col, Model in MULTI_VALUE_COLUMNS.items():
        incoming = multi_values.get(col, set())
        if not incoming:
            continue
        existing_rows = db.exec(select(Model)).all()
        existing_names = [r.name for r in existing_rows]
        existing_lower = {n.lower(): n for n in existing_names}

        col_new: list[str] = []
        for val in sorted(incoming):
            if val.lower() in existing_lower:
                continue
            col_new.append(val)
            for existing_name in existing_names:
                if _is_similar(val, existing_name, col):
                    similarity_matches.append({
                        "field": col,
                        "csv_value": val,
                        "existing_value": existing_name,
                        "table_key": _table_key_for(Model),
                        "default_action": "use_existing" if col in COMMUNITY_FIELDS else "import_new",
                    })
                    break
        if col_new:
            new_values[_table_key_for(Model)] = col_new

    # Cascading: firearm_models scoped by manufacturer.
    # If the manufacturer itself is unmatched, skip — its models will be
    # handled when the user resolves the manufacturer (a brand-new
    # manufacturer has no existing models to compare against).
    models_by_mfr = _collect_model_values_by_manufacturer(rows)
    new_models: dict[str, list[str]] = {}
    for mfr_name, model_names in models_by_mfr.items():
        mfr = db.exec(
            select(Manufacturer).where(func.lower(Manufacturer.name) == mfr_name.lower())
        ).first()
        if not mfr:
            continue
        existing_models = db.exec(
            select(FirearmModel).where(FirearmModel.manufacturer_id == mfr.id)
        ).all()
        existing_model_names = [m.name for m in existing_models]
        existing_lower = {n.lower(): n for n in existing_model_names}

        unmatched_models: list[str] = []
        for model_name in sorted(model_names):
            if model_name.lower() in existing_lower:
                continue
            unmatched_models.append(model_name)
            for existing_name in existing_model_names:
                if _is_similar(model_name, existing_name, "model"):
                    similarity_matches.append({
                        "field": "model",
                        "csv_value": model_name,
                        "existing_value": existing_name,
                        "table_key": "firearm_models",
                        "manufacturer_context": mfr.name,
                        "default_action": "use_existing",
                    })
                    break
        if unmatched_models:
            new_models[mfr_name] = unmatched_models

    if new_models:
        new_values["firearm_models_by_manufacturer"] = new_models

    return new_values, similarity_matches


# ---------------------------------------------------------------------------
# Resolution helpers (used by confirm)
# ---------------------------------------------------------------------------

def _resolve_or_create(db: Session, Model, name: str, **extra) -> int:
    """Case-insensitive find-or-create. New rows get source='user'."""
    existing = db.exec(
        select(Model).where(func.lower(Model.name) == name.lower())
    ).first()
    if existing:
        return existing.id
    fields: dict = {"name": name, "source": "user"}
    if hasattr(Model, "is_active"):
        fields["is_active"] = True
    if hasattr(Model, "is_imported"):
        fields["is_imported"] = False
    fields.update(extra)
    new = Model(**fields)
    db.add(new)
    db.flush()
    return new.id


def _resolve_firearm_model(
    db: Session, manufacturer_id: int, model_name: str
) -> int:
    """Cascading: model scoped to manufacturer. Find-or-create."""
    existing = db.exec(
        select(FirearmModel)
        .where(FirearmModel.manufacturer_id == manufacturer_id)
        .where(func.lower(FirearmModel.name) == model_name.lower())
    ).first()
    if existing:
        return existing.id
    new = FirearmModel(
        manufacturer_id=manufacturer_id,
        name=model_name,
        source="user",
        is_active=True,
        is_imported=False,
    )
    db.add(new)
    db.flush()
    return new.id


def _resolve_user_tag(db: Session, owner_id: int, name: str) -> int:
    """User tags are owner-scoped — find within owner's tags or create."""
    existing = db.exec(
        select(FirearmUserTag)
        .where(FirearmUserTag.owner_id == owner_id)
        .where(func.lower(FirearmUserTag.name) == name.lower())
    ).first()
    if existing:
        return existing.id
    new = FirearmUserTag(owner_id=owner_id, name=name, color=None)
    db.add(new)
    db.flush()
    return new.id


def _resolve_compliance_tag(db: Session, name: str) -> int:
    """Compliance tags are global. Find-or-create with source='user', no jurisdiction."""
    existing = db.exec(
        select(FirearmComplianceTag)
        .where(func.lower(FirearmComplianceTag.name) == name.lower())
    ).first()
    if existing:
        return existing.id
    new = FirearmComplianceTag(
        name=name,
        source="user",
        jurisdiction=None,
        is_active=True,
        is_imported=False,
    )
    db.add(new)
    db.flush()
    return new.id


def _ensure_manufacturer_is_firearm(db: Session, manufacturer_id: int) -> None:
    """Union 'firearm' into the manufacturer's types JSON column.

    Brand-new manufacturers already get types=["firearm"] when created by
    _resolve_or_create; this helper handles the case where the user remapped
    to an existing ammo-only manufacturer.
    """
    mfr = db.get(Manufacturer, manufacturer_id)
    if not mfr:
        return
    raw = mfr.types
    types: list[str] = []
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                types = [t for t in parsed if isinstance(t, str)]
        except Exception:
            pass
    if "firearm" not in types:
        types.append("firearm")
        mfr.types = json.dumps(types)
        db.add(mfr)


# ---------------------------------------------------------------------------
# CSV parsing
# ---------------------------------------------------------------------------

def _parse_csv(content: bytes) -> tuple[list[dict[str, str]], list[str]]:
    """Return (rows, headers). Raises HTTPException on malformed input."""
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise HTTPException(status_code=400, detail="CSV file is empty or has no headers")

    headers = [h.strip() for h in reader.fieldnames]
    norm_map = {h.lower(): h for h in headers}

    rows: list[dict[str, str]] = []
    for raw_row in reader:
        row: dict[str, str] = {}
        for col in ALL_COLUMNS:
            orig = norm_map.get(col)
            row[col] = raw_row.get(orig, "").strip() if orig else ""
        rows.append(row)

    return rows, headers


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/validate")
async def validate_firearms_import(
    file: UploadFile = File(...),
    user=Depends(require_auth),
    db: Session = Depends(get_session),
):
    content = await file.read()
    logger.info("Firearm import validate started: %s, %d bytes",
                file.filename or "unknown", len(content))

    rows, headers = _parse_csv(content)
    if not rows:
        raise HTTPException(status_code=422, detail="CSV file contains no data rows")

    all_errors: list[dict] = []
    all_warnings: list[dict] = []
    importable = 0

    headers_lower = [h.lower().strip() for h in headers]
    if "id" in headers_lower:
        all_warnings.append({"row": None, "field": "id",
                             "message": "id column found — ignored (every imported row creates a new firearm)"})
    for derived_col in sorted(SILENT_IGNORE_COLUMNS):
        if derived_col in headers_lower:
            all_warnings.append({
                "row": None, "field": derived_col,
                "message": f"{derived_col} is a derived field — ignored on import",
            })

    for i, row in enumerate(rows, start=2):  # row 1 = header
        errs, warns = _validate_row(row, i)
        all_errors.extend(errs)
        all_warnings.extend(warns)
        if not errs:
            importable += 1

    if importable == 0:
        raise HTTPException(status_code=422,
                            detail="No importable rows found — all rows have errors")

    new_values, similarity_matches = _check_new_values(db, rows)

    # User-tag namespace is owner-scoped: replace the global pass with names
    # that don't already exist for THIS user.
    user_tag_names_in_csv: set[str] = set()
    for row in rows:
        for v in _parse_multi_value(row.get("user_tags", "")):
            user_tag_names_in_csv.add(v)
    if user_tag_names_in_csv:
        owned = db.exec(
            select(FirearmUserTag.name).where(FirearmUserTag.owner_id == user.id)
        ).all()
        owned_lower = {n.lower() for n in owned}
        truly_new = [n for n in sorted(user_tag_names_in_csv)
                     if n.lower() not in owned_lower]
        if truly_new:
            new_values["firearm_user_tags"] = truly_new
        elif "firearm_user_tags" in new_values:
            # The global pass surfaced names that this user already owns.
            del new_values["firearm_user_tags"]

    token, expires_at = _generate_token(db, importable)

    logger.info("Firearm import validate complete: %d valid, %d errors, %d warnings",
                importable, len(all_errors), len(all_warnings))
    return {
        "valid": len(all_errors) == 0,
        "total_rows": len(rows),
        "importable_rows": importable,
        "error_rows": len(rows) - importable,
        "warning_count": len(all_warnings),
        "new_values": new_values,
        "similarity_matches": similarity_matches,
        "errors": all_errors,
        "warnings": all_warnings,
        "validation_token": token,
        "token_expires_at": expires_at.isoformat(),
    }


@router.post("/confirm")
async def confirm_firearms_import(
    file: UploadFile = File(...),
    validation_token: str = Form(...),
    is_shared: bool = Form(False),
    value_remaps: str = Form("{}"),
    user=Depends(require_role("admin", "member")),
    db: Session = Depends(get_session),
):
    content = await file.read()
    logger.info("Firearm import confirm started: %s, is_shared=%s",
                file.filename or "unknown", is_shared)

    if is_shared and user.role != "admin":
        raise HTTPException(status_code=403,
                            detail="Only admins can import firearms as shared")

    try:
        remaps: dict[str, dict[str, str]] = json.loads(value_remaps)
    except (json.JSONDecodeError, TypeError):
        remaps = {}

    _validate_token(db, validation_token)

    rows, _headers = _parse_csv(content)

    # Pre-import backup — block if it fails
    try:
        backup_filename = trigger_pre_import_backup()
        logger.info("Pre-import backup created: %s", backup_filename)
    except RuntimeError as exc:
        raise HTTPException(status_code=500,
                            detail=f"Pre-import backup failed: {exc}") from exc

    _consume_token(db, validation_token)

    imported = 0
    skipped = 0
    log_entries_created = 0
    warnings: list[dict] = []

    with Session(engine) as import_db:
        for i, row in enumerate(rows, start=2):
            errs, row_warns = _validate_row(row, i)
            warnings.extend(row_warns)
            if errs:
                skipped += 1
                continue

            # Resolve required lookups (apply remaps first)
            mfr_raw = _apply_remap(row["manufacturer"].strip(), "manufacturer", remaps)
            mfr_id = _resolve_or_create(
                import_db, Manufacturer, mfr_raw,
                types=json.dumps(["firearm"]),  # default for brand-new manufacturer
            )
            _ensure_manufacturer_is_firearm(import_db, mfr_id)

            cal_raw = _apply_remap(row["caliber"].strip(), "caliber", remaps)
            cal_id = _resolve_or_create(import_db, Caliber, cal_raw)

            firearm_type = row["firearm_type"].strip().lower()

            # Optional lookups
            action_type_id: int | None = None
            action_raw = _apply_remap(row.get("action_type", "").strip(), "action_type", remaps)
            if action_raw:
                action_type_id = _resolve_or_create(import_db, FirearmActionType, action_raw)

            dealer_id: int | None = None
            dealer_raw = _apply_remap(row.get("dealer", "").strip(), "dealer", remaps)
            if dealer_raw:
                dealer_id = _resolve_or_create(import_db, Dealer, dealer_raw)

            # Physical attribute FK columns (v0.3.0 polish). All four share the
            # FirearmActionType shape — find-or-create with source='user'.
            frame_size_id: int | None = None
            fs_raw = _apply_remap(row.get("frame_size", "").strip(), "frame_size", remaps)
            if fs_raw:
                frame_size_id = _resolve_or_create(import_db, FirearmFrameSize, fs_raw)

            optic_cut_id: int | None = None
            oc_raw = _apply_remap(row.get("optic_cut", "").strip(), "optic_cut", remaps)
            if oc_raw:
                optic_cut_id = _resolve_or_create(import_db, FirearmOpticCut, oc_raw)

            rail_type_id: int | None = None
            rt_raw = _apply_remap(row.get("rail_type", "").strip(), "rail_type", remaps)
            if rt_raw:
                rail_type_id = _resolve_or_create(import_db, FirearmRailType, rt_raw)

            finish_id: int | None = None
            fn_raw = _apply_remap(row.get("finish", "").strip(), "finish", remaps)
            if fn_raw:
                finish_id = _resolve_or_create(import_db, FirearmFinish, fn_raw)

            # Cascading model: resolve scoped to manufacturer
            firearm_model_id: int | None = None
            model_raw = _apply_remap(row.get("model", "").strip(), "model", remaps)
            custom_name = row.get("custom_model_name", "").strip() or None
            if model_raw:
                firearm_model_id = _resolve_firearm_model(import_db, mfr_id, model_raw)
                # When model is set, custom_model_name is cleared (matches form behavior)
                custom_name = None
            elif not custom_name:
                # Already caught by _validate_row, but defensive
                skipped += 1
                continue

            # Owner resolution
            owner_raw = row.get("owner_username", "").strip()
            owner_id = user.id
            if owner_raw and user.role == "admin":
                found = import_db.exec(
                    select(User).where(User.username == owner_raw)
                ).first()
                if found:
                    owner_id = found.id
                else:
                    warnings.append({"row": i, "field": "owner_username",
                                     "message": f"User '{owner_raw}' not found — assigned to current user"})
            # Non-admins: silently force to themselves (matches the form's
            # security-by-default; no warning needed).

            # Numeric fields
            barrel_raw = row.get("barrel_length_in", "").strip()
            barrel_length = _parse_float(barrel_raw) if barrel_raw else None
            if barrel_length is not None and barrel_length < 0:
                barrel_length = None

            price_raw = row.get("purchase_price", "").strip()
            purchase_price = _parse_float(price_raw) if price_raw else None
            if purchase_price is not None and purchase_price < 0:
                purchase_price = None

            rl_raw = row.get("rounds_lifetime", "").strip()
            rounds_lifetime = _parse_int(rl_raw) if rl_raw else 0
            if rounds_lifetime is None or rounds_lifetime < 0:
                rounds_lifetime = 0

            rsc_raw = row.get("rounds_since_clean", "").strip()
            rsc_parsed = _parse_int(rsc_raw) if rsc_raw else None
            if rsc_parsed is None or rsc_parsed < 0:
                rounds_since_clean = rounds_lifetime
            else:
                rounds_since_clean = min(rsc_parsed, rounds_lifetime)

            sc_raw = row.get("standard_capacity", "").strip()
            std_cap = _parse_int(sc_raw) if sc_raw else None
            if std_cap is not None and std_cap < 0:
                std_cap = None

            sir_raw = row.get("service_interval_rounds", "").strip()
            sir = _parse_int(sir_raw) if sir_raw else None
            if sir is not None and sir < 1:
                sir = None

            sid_raw = row.get("service_interval_days", "").strip()
            sid = _parse_int(sid_raw) if sid_raw else None
            if sid is not None and sid < 1:
                sid = None

            pd_raw = row.get("purchase_date", "").strip()
            purchase_date = _parse_date(pd_raw) if pd_raw else None

            lc_raw = row.get("last_cleaned_at", "").strip()
            last_cleaned_at = _parse_date(lc_raw) if lc_raw else None

            ca_raw = row.get("created_at", "").strip()
            created_at = _parse_datetime(ca_raw) if ca_raw else None

            ua_raw = row.get("updated_at", "").strip()
            updated_at = _parse_datetime(ua_raw) if ua_raw else None

            firearm = Firearm(
                owner_id=owner_id,
                is_shared=is_shared,
                manufacturer_id=mfr_id,
                firearm_model_id=firearm_model_id,
                custom_model_name=custom_name,
                firearm_type=firearm_type,
                action_type_id=action_type_id,
                caliber_id=cal_id,
                caliber_notes=row.get("caliber_notes", "").strip() or None,
                serial=row.get("serial", "").strip() or None,
                barrel_length_in=barrel_length,
                frame_size_id=frame_size_id,
                optic_cut_id=optic_cut_id,
                rail_type_id=rail_type_id,
                finish_id=finish_id,
                standard_capacity=std_cap,
                purchase_date=purchase_date,
                purchase_price=purchase_price,
                dealer_id=dealer_id,
                notes=row.get("notes", "").strip() or None,
                rounds_lifetime=rounds_lifetime,
                rounds_since_clean=rounds_since_clean,
                last_cleaned_at=last_cleaned_at,
                service_interval_rounds=sir,
                service_interval_days=sid,
            )
            if created_at is not None:
                firearm.created_at = created_at
            if updated_at is not None:
                firearm.updated_at = updated_at

            import_db.add(firearm)
            import_db.flush()  # need firearm.id for tag links + log entries

            # Tag links
            for tag_name in _parse_multi_value(row.get("compliance_tags", "")):
                tag_name_remapped = _apply_remap(tag_name, "compliance_tags", remaps)
                tag_id = _resolve_compliance_tag(import_db, tag_name_remapped)
                exists = import_db.exec(
                    select(FirearmComplianceTagLink)
                    .where(FirearmComplianceTagLink.firearm_id == firearm.id)
                    .where(FirearmComplianceTagLink.tag_id == tag_id)
                ).first()
                if not exists:
                    import_db.add(FirearmComplianceTagLink(
                        firearm_id=firearm.id, tag_id=tag_id))

            for tag_name in _parse_multi_value(row.get("user_tags", "")):
                tag_name_remapped = _apply_remap(tag_name, "user_tags", remaps)
                tag_id = _resolve_user_tag(import_db, owner_id, tag_name_remapped)
                exists = import_db.exec(
                    select(FirearmUserTagLink)
                    .where(FirearmUserTagLink.firearm_id == firearm.id)
                    .where(FirearmUserTagLink.tag_id == tag_id)
                ).first()
                if not exists:
                    import_db.add(FirearmUserTagLink(
                        firearm_id=firearm.id, tag_id=tag_id))

            # Synthetic firearm_log entries seed history so the cleaning-state
            # recalc remains internally consistent on subsequent log edits.
            today = date_type.today()
            if rounds_lifetime > 0:
                seed_date = purchase_date or today
                import_db.add(FirearmLog(
                    firearm_id=firearm.id,
                    event_type="note",
                    event_date=seed_date,
                    rounds_at_event=0,  # baseline: at purchase, gun had 0 rounds
                    notes=f"Imported from CSV — initial round count {rounds_lifetime}",
                    logged_by=user.id,
                ))
                log_entries_created += 1
            if last_cleaned_at is not None:
                cleaning_rounds = max(0, rounds_lifetime - rounds_since_clean)
                import_db.add(FirearmLog(
                    firearm_id=firearm.id,
                    event_type="cleaning",
                    event_date=last_cleaned_at,
                    rounds_at_event=cleaning_rounds,
                    notes="Imported from CSV — last cleaning before import",
                    logged_by=user.id,
                ))
                log_entries_created += 1

            imported += 1
            if imported % 100 == 0:
                logger.debug("Inserted firearm %d", imported)

        import_db.commit()

        # Count user-source rows in the lookup tables that are populated by
        # this importer. Mirrors the ammo importer's heuristic: a coarse
        # number, not a strict delta.
        new_lookups_created = sum(
            len(import_db.exec(select(Model).where(Model.source == "user")).all())
            for Model in [
                Manufacturer, Caliber, FirearmActionType, Dealer,
                FirearmFrameSize, FirearmOpticCut, FirearmRailType, FirearmFinish,
                FirearmModel, FirearmComplianceTag,
            ]
        )

    logger.info("Firearm import complete: %d imported, %d skipped", imported, skipped)
    return {
        "success": True,
        "imported": imported,
        "skipped": skipped,
        "new_lookup_values_created": new_lookups_created,
        "synthetic_log_entries_created": log_entries_created,
        "pre_import_backup": backup_filename,
        "warnings": warnings,
    }


@router.get("/template")
def get_firearms_template(user=Depends(require_auth)):
    """Download a blank-with-examples CSV template matching the v0.3.0 export shape."""
    columns = [
        "manufacturer", "model", "custom_model_name", "firearm_type",
        "action_type", "caliber", "caliber_notes", "serial",
        "barrel_length_in", "frame_size", "optic_cut", "rail_type", "finish",
        "standard_capacity", "purchase_date", "purchase_price",
        "dealer", "notes", "rounds_lifetime", "rounds_since_clean",
        "last_cleaned_at", "service_interval_rounds", "service_interval_days",
        "compliance_tags", "user_tags", "is_shared", "owner_username",
        "created_at", "updated_at",
    ]
    example_rows = [
        {
            "manufacturer": "Glock", "model": "19 Gen 5", "custom_model_name": "",
            "firearm_type": "pistol", "action_type": "Semi-auto pistol",
            "caliber": "9mm Luger", "caliber_notes": "",
            "serial": "ABC123", "barrel_length_in": "4.02",
            "frame_size": "Compact", "optic_cut": "RMR", "rail_type": "Picatinny",
            "finish": "nDLC", "standard_capacity": "15",
            "purchase_date": "2024-08-12", "purchase_price": "599.00",
            "dealer": "Local Gun Shop", "notes": "EDC",
            "rounds_lifetime": "1250", "rounds_since_clean": "180",
            "last_cleaned_at": "2025-04-22",
            "service_interval_rounds": "500", "service_interval_days": "60",
            "compliance_tags": "", "user_tags": "Carry | EDC",
            "is_shared": "false", "owner_username": "",
            "created_at": "", "updated_at": "",
        },
        {
            "manufacturer": "Custom Builder", "model": "", "custom_model_name": "Custom 1911",
            "firearm_type": "pistol", "action_type": "Semi-auto pistol",
            "caliber": "45 ACP", "caliber_notes": "",
            "serial": "", "barrel_length_in": "5.0",
            "frame_size": "", "optic_cut": "None", "rail_type": "None",
            "finish": "Stainless", "standard_capacity": "8",
            "purchase_date": "2023-03-15", "purchase_price": "2200.00",
            "dealer": "", "notes": "Custom build",
            "rounds_lifetime": "300", "rounds_since_clean": "300",
            "last_cleaned_at": "",
            "service_interval_rounds": "", "service_interval_days": "",
            "compliance_tags": "", "user_tags": "Heirloom",
            "is_shared": "false", "owner_username": "",
            "created_at": "", "updated_at": "",
        },
    ]

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=columns, lineterminator="\n")
    writer.writeheader()
    writer.writerows(example_rows)

    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="firearms_import_template.csv"'},
    )
