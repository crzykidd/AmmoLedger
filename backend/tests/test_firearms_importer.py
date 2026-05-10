"""Integration tests for the firearms CSV importer."""
import io
import json
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from models import (
    Caliber,
    Firearm,
    FirearmActionType,
    FirearmComplianceTag,
    FirearmComplianceTagLink,
    FirearmLog,
    FirearmModel,
    FirearmUserTag,
    FirearmUserTagLink,
    Manufacturer,
    User,
)
from utils.security import hash_password


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def patch_importer(monkeypatch, db_session):
    """Point the importer at the test engine and stub the pre-import backup.

    The confirm endpoint opens a fresh `Session(engine)` for the import
    transaction; in tests we redirect that to the in-memory TEST_ENGINE so
    rows are visible to db_session assertions.
    """
    from tests.conftest import TEST_ENGINE
    from routers import firearms_importer

    monkeypatch.setattr(firearms_importer, "engine", TEST_ENGINE)
    monkeypatch.setattr(
        firearms_importer,
        "trigger_pre_import_backup",
        lambda: "ammoledger_pre-import_test.db",
    )


def _login(c: TestClient, email: str, password: str) -> None:
    r = c.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text


def _make_user(db: Session, email: str, role: str = "member") -> User:
    user = User(
        username=email,
        email=email,
        first_name=email.split("@")[0].title(),
        last_name="User",
        password_hash=hash_password("MemberPass1!"),
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _csv(rows: list[dict[str, str]], columns: list[str] | None = None) -> bytes:
    """Build a CSV body from a list of row dicts. Default column order
    matches the v0.3.0 export."""
    import csv

    if columns is None:
        columns = [
            "id", "owner_username", "is_shared", "manufacturer", "model",
            "custom_model_name", "display_model", "firearm_type", "action_type",
            "caliber", "caliber_notes", "serial", "barrel_length_in",
            "frame_size", "optic_cut", "rail_type", "finish", "standard_capacity",
            "purchase_date", "purchase_price", "dealer", "notes",
            "rounds_lifetime", "rounds_since_clean", "last_cleaned_at",
            "service_interval_rounds", "service_interval_days",
            "cleaning_status", "compliance_tags", "user_tags",
            "created_at", "updated_at",
        ]
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=columns, lineterminator="\n")
    w.writeheader()
    for row in rows:
        w.writerow({c: row.get(c, "") for c in columns})
    return out.getvalue().encode("utf-8")


def _upload(content: bytes) -> dict:
    return {"file": ("firearms.csv", content, "text/csv")}


def _row(**overrides) -> dict[str, str]:
    """Minimal-valid row builder."""
    base = {
        "manufacturer": "Glock",
        "firearm_type": "pistol",
        "caliber": "9mm Luger",
        "custom_model_name": "Custom Build",
    }
    base.update({k: str(v) for k, v in overrides.items()})
    return base


def _validate(client: TestClient, content: bytes) -> dict:
    r = client.post("/import/firearms/validate", files=_upload(content))
    assert r.status_code == 200, r.text
    return r.json()


def _confirm(
    client: TestClient,
    content: bytes,
    token: str,
    is_shared: bool = False,
    value_remaps: dict | None = None,
) -> tuple[int, dict]:
    r = client.post(
        "/import/firearms/confirm",
        files=_upload(content),
        data={
            "validation_token": token,
            "is_shared": str(is_shared).lower(),
            "value_remaps": json.dumps(value_remaps or {}),
        },
    )
    return r.status_code, (r.json() if r.headers.get("content-type", "").startswith("application/json") else {})


@pytest.fixture
def admin_session(client: TestClient, db_session: Session):
    _make_user(db_session, "admin@test.com", role="admin")
    _login(client, "admin@test.com", "MemberPass1!")
    return client


@pytest.fixture
def member_session(client: TestClient, db_session: Session):
    _make_user(db_session, "alice@test.com", role="member")
    _login(client, "alice@test.com", "MemberPass1!")
    return client


@pytest.fixture
def readonly_session(client: TestClient, db_session: Session):
    _make_user(db_session, "ro@test.com", role="read_only")
    _login(client, "ro@test.com", "MemberPass1!")
    return client


# ---------------------------------------------------------------------------
# Validate — required fields + warnings
# ---------------------------------------------------------------------------

def test_validate_minimal_csv(admin_session: TestClient):
    body = _csv([_row()])
    data = _validate(admin_session, body)
    assert data["valid"] is True
    assert data["importable_rows"] == 1
    assert data["error_rows"] == 0
    assert "validation_token" in data


def test_validate_missing_manufacturer(admin_session: TestClient):
    body = _csv([_row(manufacturer="")])
    r = admin_session.post("/import/firearms/validate", files=_upload(body))
    # No importable rows → 422
    assert r.status_code == 422


def test_validate_missing_caliber(admin_session: TestClient):
    body = _csv([_row(caliber="")])
    r = admin_session.post("/import/firearms/validate", files=_upload(body))
    assert r.status_code == 422


def test_validate_missing_firearm_type(admin_session: TestClient):
    body = _csv([_row(firearm_type="")])
    r = admin_session.post("/import/firearms/validate", files=_upload(body))
    assert r.status_code == 422


def test_validate_invalid_firearm_type(admin_session: TestClient):
    body = _csv([_row(firearm_type="revolver")])
    r = admin_session.post("/import/firearms/validate", files=_upload(body))
    assert r.status_code == 422


def test_validate_no_model_no_custom(admin_session: TestClient):
    body = _csv([_row(custom_model_name="", model="")])
    r = admin_session.post("/import/firearms/validate", files=_upload(body))
    assert r.status_code == 422


def test_validate_negative_purchase_price_is_warning(admin_session: TestClient):
    body = _csv([_row(purchase_price="-50")])
    data = _validate(admin_session, body)
    assert data["valid"] is True
    assert any(w["field"] == "purchase_price" and "negative" in w["message"].lower()
               for w in data["warnings"])


def test_validate_rounds_since_clean_exceeds_lifetime(admin_session: TestClient):
    body = _csv([_row(rounds_lifetime="100", rounds_since_clean="500")])
    data = _validate(admin_session, body)
    assert any(w["field"] == "rounds_since_clean" for w in data["warnings"])


def test_validate_unparseable_dates(admin_session: TestClient):
    body = _csv([_row(purchase_date="not-a-date", last_cleaned_at="bogus")])
    data = _validate(admin_session, body)
    fields = {w["field"] for w in data["warnings"]}
    assert "purchase_date" in fields
    assert "last_cleaned_at" in fields


def test_validate_id_column_warning_token_still_issued(admin_session: TestClient):
    body = _csv([_row(id="42")])
    data = _validate(admin_session, body)
    assert data["validation_token"]
    assert any(w.get("row") is None and w["field"] == "id" for w in data["warnings"])


def test_validate_cleaning_status_silently_ignored(admin_session: TestClient):
    body = _csv([_row(cleaning_status="overdue")])
    data = _validate(admin_session, body)
    # Header-level warning is surfaced, but row counts as importable.
    assert data["importable_rows"] == 1
    assert any(w.get("row") is None and w["field"] == "cleaning_status"
               for w in data["warnings"])


# ---------------------------------------------------------------------------
# Validate — new values + similarity
# ---------------------------------------------------------------------------

def test_new_values_surface_unmatched_manufacturer(admin_session: TestClient):
    body = _csv([_row(manufacturer="ObscureBrand")])
    data = _validate(admin_session, body)
    assert "manufacturers" in data["new_values"]
    assert "ObscureBrand" in data["new_values"]["manufacturers"]


def test_new_values_surface_unmatched_caliber(admin_session: TestClient):
    body = _csv([_row(caliber="9.99mm Niche")])
    data = _validate(admin_session, body)
    assert "calibers" in data["new_values"]


def test_new_values_cascading_model_under_manufacturer(
    admin_session: TestClient, db_session: Session
):
    # Pre-seed two manufacturers; same model name on both should be surfaced
    # as new under each of them independently.
    sig = Manufacturer(name="Sig Sauer", types='["firearm"]')
    sw = Manufacturer(name="Smith & Wesson", types='["firearm"]')
    db_session.add_all([sig, sw])
    db_session.commit()

    body = _csv([
        _row(manufacturer="Sig Sauer", model="P226", custom_model_name=""),
        _row(manufacturer="Smith & Wesson", model="P226", custom_model_name=""),
    ])
    data = _validate(admin_session, body)
    grouped = data["new_values"].get("firearm_models_by_manufacturer", {})
    assert "Sig Sauer" in grouped and "P226" in grouped["Sig Sauer"]
    assert "Smith & Wesson" in grouped and "P226" in grouped["Smith & Wesson"]


def test_similarity_match_manufacturer(admin_session: TestClient, db_session: Session):
    db_session.add(Manufacturer(name="Glock", types='["firearm"]'))
    db_session.commit()
    body = _csv([_row(manufacturer="Glok")])
    data = _validate(admin_session, body)
    matches = data["similarity_matches"]
    assert any(m["field"] == "manufacturer" and m["csv_value"] == "Glok"
               and m["existing_value"] == "Glock" and m["default_action"] == "use_existing"
               for m in matches)


def test_similarity_match_user_tag_defaults_import_new(
    admin_session: TestClient, db_session: Session
):
    user = db_session.exec(select(User).where(User.email == "admin@test.com")).first()
    db_session.add(FirearmUserTag(owner_id=user.id, name="Carry"))
    db_session.commit()
    body = _csv([_row(user_tags="Carrx")])
    data = _validate(admin_session, body)
    user_matches = [m for m in data["similarity_matches"] if m["field"] == "user_tags"]
    assert user_matches, "expected a user_tags similarity match"
    assert all(m["default_action"] == "import_new" for m in user_matches)


def test_similarity_match_model_scoped_by_manufacturer(
    admin_session: TestClient, db_session: Session
):
    sig = Manufacturer(name="Sig Sauer", types='["firearm"]')
    sw = Manufacturer(name="Smith & Wesson", types='["firearm"]')
    db_session.add_all([sig, sw])
    db_session.commit()
    db_session.add(FirearmModel(manufacturer_id=sig.id, name="P226"))
    db_session.commit()

    # "P226X" under S&W must NOT match Sig's P226 — only models scoped under
    # the same manufacturer are eligible for similarity.
    body = _csv([_row(manufacturer="Smith & Wesson", model="P226X", custom_model_name="")])
    data = _validate(admin_session, body)
    model_matches = [m for m in data["similarity_matches"] if m["field"] == "model"]
    assert model_matches == [], f"unexpected cross-manufacturer match: {model_matches}"


def test_user_tags_filtered_to_owner(
    admin_session: TestClient, db_session: Session
):
    """Another user's tags don't leak as 'existing' for the current user."""
    other = _make_user(db_session, "bob@test.com", role="member")
    db_session.add(FirearmUserTag(owner_id=other.id, name="Carry"))
    db_session.commit()
    body = _csv([_row(user_tags="Carry")])
    data = _validate(admin_session, body)
    # Current user (admin) doesn't own a "Carry" tag, so it must surface.
    assert "firearm_user_tags" in data["new_values"]
    assert "Carry" in data["new_values"]["firearm_user_tags"]


# ---------------------------------------------------------------------------
# Token lifecycle
# ---------------------------------------------------------------------------

def test_token_lifecycle(admin_session: TestClient):
    body = _csv([_row()])
    token = _validate(admin_session, body)["validation_token"]
    code, data = _confirm(admin_session, body, token)
    assert code == 200, data
    # Second confirm with the same (now-consumed) token must fail.
    code2, _ = _confirm(admin_session, body, token)
    assert code2 == 400


def test_token_expiry(admin_session: TestClient, db_session: Session):
    from models import AppSettings

    body = _csv([_row()])
    token = _validate(admin_session, body)["validation_token"]
    # Backdate the stored token's expires_at by 16 minutes.
    row = db_session.exec(
        select(AppSettings).where(AppSettings.key == f"import_token_{token}")
    ).first()
    raw = json.loads(row.value)
    raw["expires_at"] = (datetime.utcnow() - timedelta(minutes=1)).isoformat()
    row.value = json.dumps(raw)
    db_session.add(row)
    db_session.commit()

    code, data = _confirm(admin_session, body, token)
    assert code == 400
    assert "expired" in (data.get("detail") or "").lower()


# ---------------------------------------------------------------------------
# Confirm — synthetic firearm_log entries
# ---------------------------------------------------------------------------

def test_confirm_creates_firearm_with_synthetic_note_entry(
    admin_session: TestClient, db_session: Session
):
    body = _csv([_row(rounds_lifetime="500", purchase_date="2024-01-15")])
    token = _validate(admin_session, body)["validation_token"]
    code, _ = _confirm(admin_session, body, token)
    assert code == 200

    firearm = db_session.exec(select(Firearm)).first()
    assert firearm is not None
    assert firearm.rounds_lifetime == 500
    note = db_session.exec(
        select(FirearmLog).where(FirearmLog.firearm_id == firearm.id)
    ).first()
    assert note is not None
    assert note.event_type == "note"
    assert note.rounds_at_event == 0


def test_confirm_creates_synthetic_cleaning_entry(
    admin_session: TestClient, db_session: Session
):
    body = _csv([_row(
        rounds_lifetime="1250",
        rounds_since_clean="180",
        last_cleaned_at="2025-04-22",
    )])
    token = _validate(admin_session, body)["validation_token"]
    code, _ = _confirm(admin_session, body, token)
    assert code == 200

    firearm = db_session.exec(select(Firearm)).first()
    assert firearm.rounds_lifetime == 1250
    assert firearm.rounds_since_clean == 180
    assert firearm.last_cleaned_at.isoformat() == "2025-04-22"

    logs = db_session.exec(
        select(FirearmLog).where(FirearmLog.firearm_id == firearm.id)
    ).all()
    cleanings = [l for l in logs if l.event_type == "cleaning"]
    assert len(cleanings) == 1
    # rounds_at_event must equal lifetime - rounds_since_clean so the recalc
    # round-trips (1250 - 180 = 1070).
    assert cleanings[0].rounds_at_event == 1070


def test_confirm_clean_state_recalculates_correctly_after_log_delete(
    admin_session: TestClient, db_session: Session
):
    """Deleting the synthetic cleaning entry triggers recalc → rsc=lifetime."""
    body = _csv([_row(
        rounds_lifetime="1250",
        rounds_since_clean="180",
        last_cleaned_at="2025-04-22",
    )])
    token = _validate(admin_session, body)["validation_token"]
    code, _ = _confirm(admin_session, body, token)
    assert code == 200

    firearm = db_session.exec(select(Firearm)).first()
    db_session.refresh(firearm)
    cleaning = db_session.exec(
        select(FirearmLog)
        .where(FirearmLog.firearm_id == firearm.id)
        .where(FirearmLog.event_type == "cleaning")
    ).first()
    # Hit the API so the recalc runs through the documented code path.
    r = admin_session.delete(f"/firearms/{firearm.id}/log/{cleaning.id}")
    assert r.status_code == 204

    db_session.expire_all()
    firearm = db_session.get(Firearm, firearm.id)
    assert firearm.last_cleaned_at is None
    assert firearm.rounds_since_clean == 1250


# ---------------------------------------------------------------------------
# Confirm — manufacturer types
# ---------------------------------------------------------------------------

def test_confirm_creates_new_manufacturer_with_firearm_types(
    admin_session: TestClient, db_session: Session
):
    body = _csv([_row(manufacturer="BrandNew Arms")])
    token = _validate(admin_session, body)["validation_token"]
    code, _ = _confirm(admin_session, body, token)
    assert code == 200
    mfr = db_session.exec(
        select(Manufacturer).where(Manufacturer.name == "BrandNew Arms")
    ).first()
    assert mfr is not None
    assert json.loads(mfr.types) == ["firearm"]


def test_confirm_unions_firearm_into_existing_ammo_only_manufacturer(
    admin_session: TestClient, db_session: Session
):
    db_session.add(Manufacturer(name="Federal", types='["ammo"]'))
    db_session.commit()
    body = _csv([_row(manufacturer="Federal")])
    token = _validate(admin_session, body)["validation_token"]
    code, _ = _confirm(admin_session, body, token)
    assert code == 200

    db_session.expire_all()
    mfr = db_session.exec(
        select(Manufacturer).where(Manufacturer.name == "Federal")
    ).first()
    assert set(json.loads(mfr.types)) == {"ammo", "firearm"}


# ---------------------------------------------------------------------------
# Confirm — remap behavior
# ---------------------------------------------------------------------------

def test_confirm_remap_consolidates_into_existing(
    admin_session: TestClient, db_session: Session
):
    db_session.add(Manufacturer(name="Glock", types='["firearm"]'))
    db_session.commit()
    body = _csv([
        _row(manufacturer="Glock"),
        _row(manufacturer="Glok"),
    ])
    token = _validate(admin_session, body)["validation_token"]
    code, _ = _confirm(admin_session, body, token,
                       value_remaps={"manufacturer": {"Glok": "Glock"}})
    assert code == 200
    glocks = db_session.exec(
        select(Manufacturer).where(Manufacturer.name == "Glock")
    ).all()
    assert len(glocks) == 1
    firearms = db_session.exec(select(Firearm)).all()
    assert len(firearms) == 2
    assert all(f.manufacturer_id == glocks[0].id for f in firearms)


def test_confirm_compliance_tag_remap_skips_duplicate_link(
    admin_session: TestClient, db_session: Session
):
    db_session.add(FirearmComplianceTag(
        name="CA Featureless", source="community", is_active=True))
    db_session.commit()
    body = _csv([_row(compliance_tags="CA Featureless | CAFeatureless")])
    token = _validate(admin_session, body)["validation_token"]
    code, _ = _confirm(
        admin_session, body, token,
        value_remaps={"compliance_tags": {"CAFeatureless": "CA Featureless"}},
    )
    assert code == 200

    firearm = db_session.exec(select(Firearm)).first()
    links = db_session.exec(
        select(FirearmComplianceTagLink)
        .where(FirearmComplianceTagLink.firearm_id == firearm.id)
    ).all()
    assert len(links) == 1


def test_confirm_pipe_separated_tags(
    admin_session: TestClient, db_session: Session
):
    body = _csv([_row(user_tags="Carry | EDC | Heirloom")])
    token = _validate(admin_session, body)["validation_token"]
    code, _ = _confirm(admin_session, body, token)
    assert code == 200
    firearm = db_session.exec(select(Firearm)).first()
    links = db_session.exec(
        select(FirearmUserTagLink)
        .where(FirearmUserTagLink.firearm_id == firearm.id)
    ).all()
    assert len(links) == 3


def test_confirm_blank_pipe_values_skipped(
    admin_session: TestClient, db_session: Session
):
    body = _csv([_row(user_tags="Carry |  | EDC")])
    token = _validate(admin_session, body)["validation_token"]
    code, _ = _confirm(admin_session, body, token)
    assert code == 200
    firearm = db_session.exec(select(Firearm)).first()
    links = db_session.exec(
        select(FirearmUserTagLink)
        .where(FirearmUserTagLink.firearm_id == firearm.id)
    ).all()
    assert len(links) == 2


# ---------------------------------------------------------------------------
# Confirm — owner / RBAC
# ---------------------------------------------------------------------------

def test_confirm_admin_owner_resolution(
    admin_session: TestClient, db_session: Session
):
    other = _make_user(db_session, "bob@test.com", role="member")
    body = _csv([_row(owner_username="bob@test.com")])
    token = _validate(admin_session, body)["validation_token"]
    code, _ = _confirm(admin_session, body, token)
    assert code == 200
    firearm = db_session.exec(select(Firearm)).first()
    assert firearm.owner_id == other.id


def test_confirm_admin_owner_not_found_warning(
    admin_session: TestClient, db_session: Session
):
    body = _csv([_row(owner_username="ghost@test.com")])
    token = _validate(admin_session, body)["validation_token"]
    code, data = _confirm(admin_session, body, token)
    assert code == 200
    admin = db_session.exec(select(User).where(User.email == "admin@test.com")).first()
    firearm = db_session.exec(select(Firearm)).first()
    assert firearm.owner_id == admin.id
    assert any(w.get("field") == "owner_username" for w in data["warnings"])


def test_confirm_member_force_owner_self(
    member_session: TestClient, db_session: Session
):
    """A member submitting an owner_username for someone else is silently forced to themselves."""
    _make_user(db_session, "bob@test.com", role="member")
    alice = db_session.exec(select(User).where(User.email == "alice@test.com")).first()
    body = _csv([_row(owner_username="bob@test.com")])
    token = _validate(member_session, body)["validation_token"]
    code, _ = _confirm(member_session, body, token)
    assert code == 200
    firearm = db_session.exec(select(Firearm)).first()
    assert firearm.owner_id == alice.id


def test_confirm_member_cannot_import_shared(
    member_session: TestClient,
):
    body = _csv([_row()])
    token = _validate(member_session, body)["validation_token"]
    code, data = _confirm(member_session, body, token, is_shared=True)
    assert code == 403


def test_confirm_admin_can_import_shared(
    admin_session: TestClient, db_session: Session
):
    body = _csv([_row(), _row(custom_model_name="Custom 2")])
    token = _validate(admin_session, body)["validation_token"]
    code, _ = _confirm(admin_session, body, token, is_shared=True)
    assert code == 200
    for f in db_session.exec(select(Firearm)).all():
        assert f.is_shared is True


def test_confirm_readonly_blocked(readonly_session: TestClient):
    body = _csv([_row()])
    # Validate is allowed for read_only (uses require_auth)…
    token = _validate(readonly_session, body)["validation_token"]
    # …but confirm requires admin or member.
    code, _ = _confirm(readonly_session, body, token)
    assert code == 403


# ---------------------------------------------------------------------------
# Confirm — pre-import backup
# ---------------------------------------------------------------------------

def test_confirm_pre_import_backup_runs(admin_session: TestClient):
    body = _csv([_row()])
    token = _validate(admin_session, body)["validation_token"]
    code, data = _confirm(admin_session, body, token)
    assert code == 200
    assert data["pre_import_backup"]


def test_confirm_pre_import_backup_failure_blocks(
    admin_session: TestClient, db_session: Session, monkeypatch
):
    from routers import firearms_importer

    def boom():
        raise RuntimeError("disk full")

    monkeypatch.setattr(firearms_importer, "trigger_pre_import_backup", boom)

    body = _csv([_row()])
    token = _validate(admin_session, body)["validation_token"]
    code, data = _confirm(admin_session, body, token)
    assert code == 500
    # No firearms were created.
    assert db_session.exec(select(Firearm)).all() == []


# ---------------------------------------------------------------------------
# Confirm — round trip
# ---------------------------------------------------------------------------

def test_confirm_round_trip_export_then_import(
    admin_session: TestClient, db_session: Session, caliber_9mm
):
    """Create → export → wipe → import. End state semantically equivalent."""
    mfr = Manufacturer(name="Glock", types='["firearm"]')
    db_session.add(mfr)
    db_session.commit()
    db_session.refresh(mfr)

    payload = {
        "manufacturer_id": mfr.id,
        "caliber_id": caliber_9mm.id,
        "firearm_type": "pistol",
        "custom_model_name": "Round Trip Sample",
        "rounds_lifetime": 0,
    }
    r = admin_session.post("/firearms", json=payload)
    assert r.status_code == 201, r.text

    # Pull the generated CSV through the export endpoint.
    r = admin_session.get("/firearms/export/csv")
    assert r.status_code == 200
    csv_bytes = r.content

    # Wipe firearm rows (and their log/links) so we can re-import cleanly.
    for tbl in (FirearmComplianceTagLink, FirearmUserTagLink, FirearmLog, Firearm):
        for row in db_session.exec(select(tbl)).all():
            db_session.delete(row)
    db_session.commit()
    assert db_session.exec(select(Firearm)).all() == []

    token = _validate(admin_session, csv_bytes)["validation_token"]
    code, data = _confirm(admin_session, csv_bytes, token)
    assert code == 200
    assert data["imported"] == 1

    after = db_session.exec(select(Firearm)).all()
    assert len(after) == 1
    assert after[0].custom_model_name == "Round Trip Sample"


@pytest.fixture
def caliber_9mm(db_session: Session) -> Caliber:
    c = Caliber(name="9mm Luger")
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)
    return c


# ---------------------------------------------------------------------------
# Template
# ---------------------------------------------------------------------------

def test_template_download(admin_session: TestClient):
    r = admin_session.get("/import/firearms/template")
    assert r.status_code == 200
    assert "manufacturer" in r.text.splitlines()[0]
