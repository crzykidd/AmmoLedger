import csv
import io
import json
import re
import secrets
from datetime import datetime, timedelta, date as date_type

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func, text
from sqlmodel import Session, select

from database import engine, get_session
from models import (
    AmmoBox,
    AmmoCondition,
    AmmoType,
    Caliber,
    Category,
    Container,
    Dealer,
    Location,
    Manufacturer,
    Product,
    User,
)
from utils.config import get_setting, set_setting
from utils.logging import get_logger
from utils.pre_import_backup import trigger_pre_import_backup
from utils.rbac import require_auth

logger = get_logger(__name__)

router = APIRouter(tags=["import"])

VALID_COLUMNS = {
    "ammologger_version", "id", "legacy_id", "caliber", "manufacturer",
    "product_name", "gr_oz", "weight_unit", "type", "category",
    "ammo_condition", "qty_original", "qty_remaining", "purchase_date",
    "cost_per_round", "dealer", "location", "container", "is_archived", "notes",
    "owner", "created_at", "updated_at",
}

TOKEN_TTL_MINUTES = 15


# ---------------------------------------------------------------------------
# Levenshtein distance (simple DP, no external dependency)
# ---------------------------------------------------------------------------

def _levenshtein(a: str, b: str) -> int:
    a, b = a.lower(), b.lower()
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for ch_a in a:
        curr = [prev[0] + 1]
        for j, ch_b in enumerate(b):
            curr.append(min(prev[j + 1] + 1, curr[j] + 1, prev[j] + (ch_a != ch_b)))
        prev = curr
    return prev[-1]


# ---------------------------------------------------------------------------
# Product matching helpers
# ---------------------------------------------------------------------------

def _product_key(caliber_id, manufacturer_id, product_name, gr_oz, type_id) -> tuple:
    """COALESCE-style key for null-safe product deduplication matching."""
    return (
        caliber_id,
        manufacturer_id,
        (product_name or "").strip().lower(),
        gr_oz if gr_oz is not None else -1,
        type_id if type_id is not None else -1,
    )


# ---------------------------------------------------------------------------
# CSV parsing helpers
# ---------------------------------------------------------------------------

def _get(row: dict[str, str], key: str) -> str:
    return row.get(key, "").strip()


def _parse_int(val: str) -> int | None:
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _parse_float(val: str) -> float | None:
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _parse_date(val: str) -> date_type | None:
    try:
        return date_type.fromisoformat(val)
    except (ValueError, TypeError):
        return None


def _parse_datetime(val: str) -> datetime | None:
    try:
        return datetime.fromisoformat(val)
    except (ValueError, TypeError):
        return None


def _validate_row(row: dict[str, str], row_num: int) -> tuple[list[dict], list[dict]]:
    """Return (errors, warnings) for a single CSV row."""
    errors: list[dict] = []
    warnings: list[dict] = []

    caliber = _get(row, "caliber")
    if not caliber:
        errors.append({"row": row_num, "field": "caliber", "message": "Caliber is required"})

    qty_original_raw = _get(row, "qty_original")
    qty_remaining_raw = _get(row, "qty_remaining")

    if not qty_original_raw:
        errors.append({"row": row_num, "field": "qty_original", "message": "qty_original is required"})
        qty_original = None
    else:
        qty_original = _parse_int(qty_original_raw)
        if qty_original is None or qty_original <= 0:
            errors.append({"row": row_num, "field": "qty_original", "message": "qty_original must be a positive integer"})
            qty_original = None

    if not qty_remaining_raw:
        errors.append({"row": row_num, "field": "qty_remaining", "message": "qty_remaining is required"})
    else:
        qty_remaining = _parse_int(qty_remaining_raw)
        if qty_remaining is None or qty_remaining < 0:
            errors.append({"row": row_num, "field": "qty_remaining", "message": "qty_remaining must be a non-negative integer"})
        elif qty_original is not None and qty_remaining > qty_original:
            errors.append({"row": row_num, "field": "qty_remaining", "message": f"qty_remaining ({qty_remaining}) exceeds qty_original ({qty_original})"})

    purchase_date = _get(row, "purchase_date")
    if purchase_date and _parse_date(purchase_date) is None:
        warnings.append({"row": row_num, "field": "purchase_date", "message": "Date format not recognized — will be set to null"})

    cost_raw = _get(row, "cost_per_round")
    if cost_raw and _parse_float(cost_raw) is None:
        warnings.append({"row": row_num, "field": "cost_per_round", "message": "cost_per_round is not a valid decimal — will be set to 0"})

    is_archived_raw = _get(row, "is_archived")
    if is_archived_raw and is_archived_raw.lower() not in ("true", "false", ""):
        warnings.append({"row": row_num, "field": "is_archived", "message": "is_archived not 'true' or 'false' — will default to false"})

    gr_oz_raw = _get(row, "gr_oz")
    if gr_oz_raw and _parse_float(gr_oz_raw) is None:
        warnings.append({"row": row_num, "field": "gr_oz", "message": "gr_oz is not a valid number — will be set to null"})

    return errors, warnings


# ---------------------------------------------------------------------------
# Caliber similarity helpers
# ---------------------------------------------------------------------------

def _normalize_caliber(name: str) -> str:
    """Strip leading dot, collapse whitespace, lowercase — '45 ACP' == '.45 ACP'."""
    return re.sub(r'\s+', ' ', name.lstrip('.')).strip().lower()


def _extract_caliber_number(name: str) -> str | None:
    """Return the leading numeric token from a caliber name, or None."""
    m = re.match(r'\.?\s*(\d+(?:\.\d+)?)', name.strip())
    return m.group(1) if m else None


def _extract_trailing_number(name: str) -> str | None:
    """Return the normalized trailing number from a name, or None.

    Handles: 'Ammo Can #1' → '1', 'AmmoCan 03' → '3', 'Safe-2' → '2'.
    Leading zeros are stripped so '01' == '1'.
    """
    m = re.search(r'[#\-]?\s*(\d+)\s*$', name.strip())
    return (m.group(1).lstrip('0') or '0') if m else None


COMMUNITY_FIELDS = {"caliber", "manufacturer", "type", "dealer"}


def _is_similar(val: str, existing: str, column: str) -> bool:
    """Return True if val looks like a typo of existing but is not an exact match."""
    if column == "caliber":
        if _normalize_caliber(val) == _normalize_caliber(existing):
            return False
        n_val = _extract_caliber_number(val)
        n_existing = _extract_caliber_number(existing)
        if n_val is not None and n_existing is not None and n_val != n_existing:
            return False
    else:
        # Numbered items (containers, locations, etc.) must share the same trailing number
        num_val = _extract_trailing_number(val)
        num_existing = _extract_trailing_number(existing)
        if num_val is not None and num_existing is not None and num_val != num_existing:
            return False
    max_dist = 1 if (len(val) <= 6 or len(existing) <= 6) else 2
    dist = _levenshtein(val, existing)
    return 0 < dist <= max_dist


# ---------------------------------------------------------------------------
# Lookup resolution helpers
# ---------------------------------------------------------------------------

LOOKUP_MODELS = {
    "calibers": Caliber,
    "manufacturers": Manufacturer,
    "ammo_types": AmmoType,
    "categories": Category,
    "ammo_conditions": AmmoCondition,
    "dealers": Dealer,
    "locations": Location,
    "containers": Container,
}

# CSV column name → (db table key, Model)
COLUMN_TO_LOOKUP = {
    "caliber": ("calibers", Caliber),
    "manufacturer": ("manufacturers", Manufacturer),
    "type": ("ammo_types", AmmoType),
    "category": ("categories", Category),
    "ammo_condition": ("ammo_conditions", AmmoCondition),
    "dealer": ("dealers", Dealer),
    "location": ("locations", Location),
    "container": ("containers", Container),
}


def _collect_lookup_values(rows: list[dict[str, str]]) -> dict[str, set[str]]:
    """Collect unique non-blank values for each lookup column."""
    result: dict[str, set[str]] = {col: set() for col in COLUMN_TO_LOOKUP}
    for row in rows:
        for col in COLUMN_TO_LOOKUP:
            val = _get(row, col)
            if val:
                result[col].add(val)
    return result


def _check_new_values(
    db: Session,
    lookup_values: dict[str, set[str]],
) -> tuple[dict[str, list[str]], list[dict]]:
    """
    Returns:
      new_values: {table_key: [new values not yet in DB]}
      similarity_matches: [{field, csv_value, existing_value, table_key}]
    """
    new_values: dict[str, list[str]] = {}
    similarity_matches: list[dict] = []

    for col, (table_key, Model) in COLUMN_TO_LOOKUP.items():
        incoming = lookup_values.get(col, set())
        if not incoming:
            continue

        existing_rows = db.exec(select(Model)).all()
        existing_names = [r.name for r in existing_rows]
        existing_lower = {n.lower(): n for n in existing_names}
        existing_normalized = (
            {_normalize_caliber(n): n for n in existing_names}
            if col == "caliber" else {}
        )

        col_new: list[str] = []
        for val in sorted(incoming):
            if val.lower() in existing_lower:
                continue
            if col == "caliber" and _normalize_caliber(val) in existing_normalized:
                continue
            col_new.append(val)
            # fuzzy check against all existing
            for existing_name in existing_names:
                if _is_similar(val, existing_name, col):
                    similarity_matches.append({
                        "field": col,
                        "csv_value": val,
                        "existing_value": existing_name,
                        "table_key": table_key,
                        "default_action": "use_existing" if col in COMMUNITY_FIELDS else "import_new",
                    })
                    break

        if col_new:
            new_values[table_key] = col_new

    return new_values, similarity_matches


# ---------------------------------------------------------------------------
# Remap helper
# ---------------------------------------------------------------------------

def _apply_remap(value: str, column: str, remaps: dict[str, dict[str, str]]) -> str:
    """If a remap exists for this column+value, return the mapped value; otherwise return as-is."""
    return remaps.get(column, {}).get(value, value)


# ---------------------------------------------------------------------------
# Token helpers
# ---------------------------------------------------------------------------

def _generate_token(db: Session, row_count: int) -> tuple[str, datetime]:
    token = secrets.token_urlsafe(16)
    expires_at = datetime.utcnow() + timedelta(minutes=TOKEN_TTL_MINUTES)
    set_setting(db, f"import_token_{token}", json.dumps({
        "expires_at": expires_at.isoformat(),
        "row_count": row_count,
    }))
    db.commit()
    return token, expires_at


def _validate_token(db: Session, token: str) -> None:
    raw = get_setting(db, f"import_token_{token}")
    if not raw:
        raise HTTPException(status_code=400, detail="Invalid or expired validation token — please re-validate")
    data = json.loads(raw)
    expires_at = datetime.fromisoformat(data["expires_at"])
    if datetime.utcnow() > expires_at:
        raise HTTPException(status_code=400, detail="Validation token has expired — please re-validate")


def _consume_token(db: Session, token: str) -> None:
    from models import AppSettings
    row = db.exec(select(AppSettings).where(AppSettings.key == f"import_token_{token}")).first()
    if row:
        db.delete(row)
        db.commit()


# ---------------------------------------------------------------------------
# CSV parsing entry point
# ---------------------------------------------------------------------------

def _parse_csv(content: bytes) -> tuple[list[dict[str, str]], list[str]]:
    """Return (rows, headers). Raises HTTPException on malformed input."""
    try:
        text = content.decode("utf-8-sig")  # handle BOM
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise HTTPException(status_code=400, detail="CSV file is empty or has no headers")

    # Normalize headers (strip whitespace, lower for matching)
    headers = [h.strip() for h in reader.fieldnames]
    norm_map = {h.lower(): h for h in headers}  # lower → original header

    # Build rows using only valid columns, keyed by lowercase column name
    rows = []
    for raw_row in reader:
        row: dict[str, str] = {}
        for col in VALID_COLUMNS:
            orig = norm_map.get(col)
            row[col] = raw_row.get(orig, "").strip() if orig else ""
        rows.append(row)

    return rows, headers


# ---------------------------------------------------------------------------
# Lookup resolution for import/confirm
# ---------------------------------------------------------------------------

def _resolve_or_create(db: Session, Model, name: str) -> int:
    """Get or create a lookup entry, return its id."""
    existing = db.exec(
        select(Model).where(func.lower(Model.name) == name.lower())
    ).first()
    if existing:
        return existing.id
    new = Model(name=name, source="user")
    db.add(new)
    db.flush()
    return new.id


def _resolve_location(db: Session, name: str) -> int:
    existing = db.exec(
        select(Location).where(func.lower(Location.name) == name.lower())
    ).first()
    if existing:
        return existing.id
    new = Location(name=name)
    db.add(new)
    db.flush()
    return new.id


def _resolve_container(db: Session, name: str, location_id: int | None = None) -> int:
    existing = db.exec(
        select(Container).where(func.lower(Container.name) == name.lower())
    ).first()
    if existing:
        return existing.id
    new = Container(name=name, location_id=location_id)
    db.add(new)
    db.flush()
    return new.id


# ---------------------------------------------------------------------------
# Legacy ID analysis
# ---------------------------------------------------------------------------

def _analyze_legacy_ids(rows: list[dict[str, str]], db: Session) -> dict:
    """
    Inspect legacy_id values across all rows and determine eligibility
    for legacy ID mode (using legacy_id as the actual ammo_box.id).
    """
    blank_count = 0
    non_integer_found = False
    candidate_ids: list[int] = []

    for row in rows:
        val = _get(row, "legacy_id")
        if not val:
            blank_count += 1
            continue
        parsed = _parse_int(val)
        if parsed is None or parsed <= 0:
            non_integer_found = True
        else:
            candidate_ids.append(parsed)

    all_integers = not non_integer_found

    # Check for conflicts with existing ammo_box IDs
    conflicting_ids: list[int] = []
    if candidate_ids:
        existing_ids = set(db.exec(select(AmmoBox.id)).all())
        conflicting_ids = sorted(i for i in candidate_ids if i in existing_ids)

    conflict_count = len(conflicting_ids)
    has_more_conflicts = conflict_count > 10
    eligible = all_integers and conflict_count == 0

    return {
        "all_integers": all_integers,
        "conflict_count": conflict_count,
        "conflicting_ids": conflicting_ids[:10],
        "has_more_conflicts": has_more_conflicts,
        "blank_count": blank_count,
        "eligible": eligible,
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/validate")
async def validate_import(
    file: UploadFile = File(...),
    user=Depends(require_auth),
    db: Session = Depends(get_session),
):
    try:
        content = await file.read()
        logger.info("Import validate started: %s, %d bytes", file.filename or "unknown", len(content))

        rows, _headers = _parse_csv(content)
        logger.debug("Parsed %d rows, %d headers found", len(rows), len(_headers))

        if not rows:
            raise HTTPException(status_code=422, detail="CSV file contains no data rows")

        all_errors: list[dict] = []
        all_warnings: list[dict] = []
        importable = 0

        headers_lower = [h.lower().strip() for h in _headers]
        if "id" in headers_lower:
            all_warnings.append({
                "row": None,
                "field": "id",
                "message": "id column found — ignored (use legacy_id for ID mapping)",
            })

        for i, row in enumerate(rows, start=2):  # row 1 = header
            errs, warns = _validate_row(row, i)
            all_errors.extend(errs)
            all_warnings.extend(warns)
            if not errs:
                importable += 1

        if importable == 0:
            raise HTTPException(status_code=422, detail="No importable rows found — all rows have errors")

        lookup_values = _collect_lookup_values(rows)
        new_values, similarity_matches = _check_new_values(db, lookup_values)

        legacy_id_mode = _analyze_legacy_ids(rows, db)
        logger.debug(
            "Legacy ID analysis: all_integers=%s, conflicts=%d, eligible=%s",
            legacy_id_mode["all_integers"],
            legacy_id_mode["conflict_count"],
            legacy_id_mode["eligible"],
        )
        token, expires_at = _generate_token(db, importable)

        logger.info(
            "Import validate complete: %d valid, %d errors, %d warnings",
            importable, len(all_errors), len(all_warnings),
        )
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
            "legacy_id_mode": legacy_id_mode,
            "validation_token": token,
            "token_expires_at": expires_at.isoformat(),
        }
    except HTTPException:
        raise
    except Exception:
        logger.error("Import validate failed for %s", file.filename or "unknown", exc_info=True)
        raise


@router.post("/confirm")
async def confirm_import(
    file: UploadFile = File(...),
    validation_token: str = Form(...),
    use_legacy_ids: bool = Form(False),
    is_shared: bool = Form(True),
    value_remaps: str = Form("{}"),
    user=Depends(require_auth),
    db: Session = Depends(get_session),
):
    try:
        content = await file.read()
        logger.info(
            "Import confirm started: %s, use_legacy_ids=%s, is_shared=%s",
            file.filename or "unknown", use_legacy_ids, is_shared,
        )

        try:
            remaps: dict[str, dict[str, str]] = json.loads(value_remaps)
        except (json.JSONDecodeError, TypeError):
            remaps = {}

        _validate_token(db, validation_token)

        rows, _headers = _parse_csv(content)

        # Guard: if caller requested legacy ID mode, verify eligibility against fresh data
        if use_legacy_ids:
            analysis = _analyze_legacy_ids(rows, db)
            if not analysis["eligible"]:
                raise HTTPException(
                    status_code=400,
                    detail="Legacy ID mode not available — conflicts exist or IDs are not all integers",
                )

        # Pre-import backup — block if it fails
        try:
            backup_filename = trigger_pre_import_backup()
            logger.info("Pre-import backup created: %s", backup_filename)
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=f"Pre-import backup failed: {exc}") from exc

        _consume_token(db, validation_token)

        imported = 0
        skipped = 0
        lookup_values_created = 0
        product_links = 0
        warnings: list[dict] = []
        autoincrement_reset_to: int | None = None
        total_rows = len(rows)

        with Session(engine) as import_db:
            imported_boxes: list[AmmoBox] = []

            for i, row in enumerate(rows, start=2):
                errs, row_warns = _validate_row(row, i)
                warnings.extend(row_warns)
                if errs:
                    skipped += 1
                    continue

                # Resolve required lookups (apply user remaps before resolution)
                caliber_raw = _apply_remap(_get(row, "caliber"), "caliber", remaps)
                caliber_id = _resolve_or_create(import_db, Caliber, caliber_raw)

                manufacturer_raw = _apply_remap(_get(row, "manufacturer"), "manufacturer", remaps)
                manufacturer_id = _resolve_or_create(import_db, Manufacturer, manufacturer_raw) if manufacturer_raw else None

                # Optional lookups
                type_raw = _apply_remap(_get(row, "type"), "type", remaps)
                type_id = _resolve_or_create(import_db, AmmoType, type_raw) if type_raw else None

                category_raw = _apply_remap(_get(row, "category"), "category", remaps)
                category_id = _resolve_or_create(import_db, Category, category_raw) if category_raw else None

                condition_raw = _apply_remap(_get(row, "ammo_condition"), "ammo_condition", remaps)
                condition_id = _resolve_or_create(import_db, AmmoCondition, condition_raw) if condition_raw else None

                dealer_raw = _apply_remap(_get(row, "dealer"), "dealer", remaps)
                dealer_id = _resolve_or_create(import_db, Dealer, dealer_raw) if dealer_raw else None

                location_raw = _apply_remap(_get(row, "location"), "location", remaps)
                location_id = _resolve_location(import_db, location_raw) if location_raw else None

                container_raw = _apply_remap(_get(row, "container"), "container", remaps)
                container_id = _resolve_container(import_db, container_raw, location_id) if container_raw else None

                # Field values
                qty_original = _parse_int(_get(row, "qty_original")) or 1
                qty_remaining = _parse_int(_get(row, "qty_remaining"))
                if qty_remaining is None:
                    qty_remaining = qty_original

                gr_oz_raw = _get(row, "gr_oz")
                gr_oz = _parse_float(gr_oz_raw) if gr_oz_raw else None

                weight_unit_raw = _get(row, "weight_unit").upper()
                weight_unit = weight_unit_raw if weight_unit_raw in ("GR", "OZ") else "GR"

                purchase_date_raw = _get(row, "purchase_date")
                purchase_date = _parse_date(purchase_date_raw)

                cost_raw = _get(row, "cost_per_round")
                cost_per_round = _parse_float(cost_raw) if cost_raw else None
                if cost_per_round is None and cost_raw:
                    cost_per_round = 0.0

                is_archived_raw = _get(row, "is_archived").lower()
                is_archived = is_archived_raw == "true"

                # Manufacturer is required in model but CSV may omit it — guard
                if manufacturer_id is None:
                    skipped += 1
                    continue

                # Determine explicit ID when in legacy mode
                legacy_id_val = _get(row, "legacy_id") or None
                explicit_id: int | None = None
                if use_legacy_ids and legacy_id_val:
                    parsed_lid = _parse_int(legacy_id_val)
                    if parsed_lid and parsed_lid > 0:
                        explicit_id = parsed_lid

                # Owner resolution
                owner_raw = _get(row, "owner")
                resolved_owner_id = user.id
                if owner_raw:
                    owner_user = import_db.exec(select(User).where(User.username == owner_raw)).first()
                    if owner_user:
                        resolved_owner_id = owner_user.id
                    else:
                        warnings.append({
                            "row": i,
                            "field": "owner",
                            "message": f"User '{owner_raw}' not found — assigned to current user",
                        })

                # Timestamp parsing
                created_at_raw = _get(row, "created_at")
                created_at = _parse_datetime(created_at_raw) if created_at_raw else None
                if created_at_raw and created_at is None:
                    warnings.append({
                        "row": i,
                        "field": "created_at",
                        "message": "created_at not a valid ISO datetime — will use current time",
                    })

                updated_at_raw = _get(row, "updated_at")
                updated_at = _parse_datetime(updated_at_raw) if updated_at_raw else None
                if updated_at_raw and updated_at is None:
                    warnings.append({
                        "row": i,
                        "field": "updated_at",
                        "message": "updated_at not a valid ISO datetime — will use current time",
                    })

                box = AmmoBox(
                    id=explicit_id,  # None → auto-increment; int → explicit primary key
                    owner_id=resolved_owner_id,
                    is_shared=is_shared,
                    caliber_id=caliber_id,
                    manufacturer_id=manufacturer_id,
                    product_name=_get(row, "product_name") or None,
                    gr_oz=gr_oz,
                    weight_unit=weight_unit,
                    type_id=type_id,
                    ammo_condition_id=condition_id,
                    category_id=category_id,
                    qty_original=qty_original,
                    qty_remaining=qty_remaining,
                    purchase_date=purchase_date,
                    cost_per_round=cost_per_round,
                    dealer_id=dealer_id,
                    location_id=location_id,
                    container_id=container_id,
                    legacy_id=legacy_id_val,
                    notes=_get(row, "notes") or None,
                    is_archived=is_archived,
                    archive_reason="manual" if is_archived else None,
                )
                if created_at is not None:
                    box.created_at = created_at
                if updated_at is not None:
                    box.updated_at = updated_at
                import_db.add(box)
                imported_boxes.append(box)
                imported += 1
                if imported % 100 == 0:
                    logger.debug("Inserting box %d of %d", imported, total_rows)

            import_db.commit()

            # Link imported boxes to matching products (caliber+manufacturer+product_name+gr_oz+type)
            all_products = import_db.exec(
                select(Product).where(
                    (Product.is_shared == True) | (Product.owner_id == user.id)  # noqa: E712
                )
            ).all()
            if all_products:
                product_map = {
                    _product_key(p.caliber_id, p.manufacturer_id, p.product_name, p.gr_oz, p.type_id): p.id
                    for p in all_products
                }
                for box in imported_boxes:
                    if box.product_id is not None:
                        continue
                    key = _product_key(box.caliber_id, box.manufacturer_id, box.product_name, box.gr_oz, box.type_id)
                    matched_id = product_map.get(key)
                    if matched_id is not None:
                        box.product_id = matched_id
                        import_db.add(box)
                        product_links += 1
                if product_links > 0:
                    import_db.commit()
                    logger.debug("Linked %d imported boxes to products", product_links)

            # After legacy ID mode inserts, reset autoincrement so future boxes
            # continue from MAX(id)+1 rather than the pre-import sequence value.
            if use_legacy_ids:
                seq_table = import_db.execute(
                    text(
                        "SELECT name FROM sqlite_master "
                        "WHERE type='table' AND name='sqlite_sequence'"
                    )
                ).fetchone()

                if seq_table:
                    import_db.execute(
                        text(
                            "UPDATE sqlite_sequence "
                            "SET seq = (SELECT MAX(id) FROM ammo_box) "
                            "WHERE name = 'ammo_box'"
                        )
                    )
                else:
                    logger.info(
                        "sqlite_sequence not found — SQLite will auto-assign next ID from MAX(rowid)+1"
                    )

                import_db.commit()
                result = import_db.execute(text("SELECT MAX(id) FROM ammo_box")).first()
                autoincrement_reset_to = result[0] if result and result[0] is not None else 0

            import_db.execute(text("ANALYZE"))
            import_db.commit()

            # Count newly created lookup entries
            lookup_values_created = sum(
                len(import_db.exec(select(Model).where(Model.source == "user")).all())
                for Model in [Caliber, Manufacturer, AmmoType, AmmoCondition, Category, Dealer]
            )
            logger.debug("Created %d new lookup values", lookup_values_created)

        logger.info("Import complete: %d imported, %d skipped", imported, skipped)

        response: dict = {
            "success": True,
            "imported": imported,
            "skipped": skipped,
            "new_lookup_values_created": lookup_values_created,
            "product_links": product_links,
            "pre_import_backup": backup_filename,
            "legacy_id_mode_used": use_legacy_ids,
            "warnings": warnings,
        }
        if use_legacy_ids:
            response["autoincrement_reset_to"] = autoincrement_reset_to
        return response
    except HTTPException:
        raise
    except Exception:
        logger.error("Import confirm failed for %s", file.filename or "unknown", exc_info=True)
        raise


@router.get("/template")
def get_template(user=Depends(require_auth)):
    columns = [
        "ammologger_version", "legacy_id", "caliber", "manufacturer", "product_name",
        "gr_oz", "weight_unit", "type", "ammo_condition", "category",
        "qty_original", "qty_remaining", "purchase_date", "cost_per_round",
        "dealer", "location", "container", "is_archived", "notes",
        "id", "owner", "created_at", "updated_at",
    ]

    example_rows = [
        {
            "ammologger_version": "1.1",
            "legacy_id": "B001",
            "caliber": "9mm Luger",
            "manufacturer": "Federal",
            "product_name": "HST 147gr",
            "gr_oz": "147",
            "weight_unit": "GR",
            "type": "JHP",
            "ammo_condition": "Factory New",
            "category": "Defense",
            "qty_original": "50",
            "qty_remaining": "47",
            "purchase_date": "2025-11-15",
            "cost_per_round": "0.89",
            "dealer": "Lucky Gunner",
            "location": "Gun Safe",
            "container": "Ammo Can #1",
            "is_archived": "false",
            "notes": "carry ammo",
            "id": "",
            "owner": "",
            "created_at": "",
            "updated_at": "",
        },
        {
            "ammologger_version": "1.1",
            "legacy_id": "",
            "caliber": ".223 Remington",
            "manufacturer": "Winchester",
            "product_name": "USA White Box",
            "gr_oz": "55",
            "weight_unit": "GR",
            "type": "FMJ",
            "ammo_condition": "Factory New",
            "category": "Target / Range",
            "qty_original": "1000",
            "qty_remaining": "820",
            "purchase_date": "2025-09-01",
            "cost_per_round": "0.42",
            "dealer": "Brownells",
            "location": "Garage Cabinet",
            "container": "",
            "is_archived": "false",
            "notes": "",
            "id": "",
            "owner": "",
            "created_at": "",
            "updated_at": "",
        },
    ]

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=columns, lineterminator="\n")
    writer.writeheader()
    writer.writerows(example_rows)

    csv_bytes = output.getvalue().encode("utf-8")

    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=ammoledger_import_template.csv"},
    )
