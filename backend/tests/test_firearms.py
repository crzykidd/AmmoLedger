"""Integration tests for the firearms registry + firearm log API."""
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from models import (
    Caliber,
    Firearm,
    FirearmFinish,
    FirearmFrameSize,
    FirearmLog,
    FirearmComplianceTag,
    FirearmComplianceTagLink,
    FirearmModel,
    FirearmOpticCut,
    FirearmRailType,
    FirearmUserTag,
    FirearmUserTagLink,
    Manufacturer,
    User,
)
from utils.security import hash_password


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

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


@pytest.fixture
def firearm_mfr(db_session: Session) -> Manufacturer:
    """Manufacturer flagged for the firearm domain."""
    m = Manufacturer(name="Glock", types='["firearm"]')
    db_session.add(m)
    db_session.commit()
    db_session.refresh(m)
    return m


@pytest.fixture
def ammo_only_mfr(db_session: Session) -> Manufacturer:
    m = Manufacturer(name="Federal", types='["ammo"]')
    db_session.add(m)
    db_session.commit()
    db_session.refresh(m)
    return m


@pytest.fixture
def caliber(db_session: Session) -> Caliber:
    c = Caliber(name="9mm Luger")
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)
    return c


@pytest.fixture
def firearm_model(db_session: Session, firearm_mfr: Manufacturer) -> FirearmModel:
    fm = FirearmModel(manufacturer_id=firearm_mfr.id, name="19 Gen5")
    db_session.add(fm)
    db_session.commit()
    db_session.refresh(fm)
    return fm


def _base_payload(mfr_id: int, caliber_id: int, **overrides) -> dict:
    payload = {
        "manufacturer_id": mfr_id,
        "caliber_id": caliber_id,
        "firearm_type": "pistol",
        "custom_model_name": "Custom Build",
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

def test_create_firearm_member_default_owner(
    client: TestClient, db_session: Session, firearm_mfr, caliber
):
    member = _make_user(db_session, "alice@test.com", role="member")
    _login(client, "alice@test.com", "MemberPass1!")

    r = client.post("/firearms", json=_base_payload(firearm_mfr.id, caliber.id))
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["owner_id"] == member.id
    assert data["is_shared"] is False
    assert data["display_model"] == "Custom Build"


def test_create_firearm_member_cannot_share(
    client: TestClient, db_session: Session, firearm_mfr, caliber
):
    _make_user(db_session, "alice@test.com", role="member")
    _login(client, "alice@test.com", "MemberPass1!")

    payload = _base_payload(firearm_mfr.id, caliber.id, is_shared=True)
    r = client.post("/firearms", json=payload)
    assert r.status_code == 403


def test_create_firearm_admin_can_share(
    client: TestClient, admin_user: User, firearm_mfr, caliber
):
    _login(client, "admin@test.com", "AdminPass1!")
    payload = _base_payload(firearm_mfr.id, caliber.id, is_shared=True)
    r = client.post("/firearms", json=payload)
    assert r.status_code == 201, r.text
    assert r.json()["is_shared"] is True


def test_create_firearm_requires_model_or_custom_name(
    client: TestClient, admin_user: User, firearm_mfr, caliber
):
    _login(client, "admin@test.com", "AdminPass1!")
    payload = {
        "manufacturer_id": firearm_mfr.id,
        "caliber_id": caliber.id,
        "firearm_type": "pistol",
        # neither firearm_model_id nor custom_model_name
    }
    r = client.post("/firearms", json=payload)
    assert r.status_code == 422


def test_create_firearm_validates_manufacturer_type(
    client: TestClient, admin_user: User, ammo_only_mfr, caliber
):
    """A manufacturer flagged only as ['ammo'] cannot be used for a firearm."""
    _login(client, "admin@test.com", "AdminPass1!")
    payload = _base_payload(ammo_only_mfr.id, caliber.id)
    r = client.post("/firearms", json=payload)
    assert r.status_code == 422


def test_create_firearm_with_catalog_model(
    client: TestClient, admin_user: User, firearm_mfr, caliber, firearm_model
):
    _login(client, "admin@test.com", "AdminPass1!")
    payload = _base_payload(
        firearm_mfr.id,
        caliber.id,
        custom_model_name=None,
        firearm_model_id=firearm_model.id,
    )
    r = client.post("/firearms", json=payload)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["firearm_model_id"] == firearm_model.id
    assert data["display_model"] == "19 Gen5"


def test_create_firearm_invalid_firearm_type(
    client: TestClient, admin_user: User, firearm_mfr, caliber
):
    _login(client, "admin@test.com", "AdminPass1!")
    payload = _base_payload(firearm_mfr.id, caliber.id, firearm_type="grenade")
    r = client.post("/firearms", json=payload)
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Visibility
# ---------------------------------------------------------------------------

def test_visibility_member_sees_shared_and_own(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    # Admin creates a shared firearm
    _login(client, "admin@test.com", "AdminPass1!")
    r = client.post(
        "/firearms",
        json=_base_payload(firearm_mfr.id, caliber.id, is_shared=True, custom_model_name="Shared Pistol"),
    )
    assert r.status_code == 201

    # Member creates their own private firearm
    _make_user(db_session, "alice@test.com", role="member")
    client.post("/auth/logout")
    _login(client, "alice@test.com", "MemberPass1!")
    r = client.post(
        "/firearms",
        json=_base_payload(firearm_mfr.id, caliber.id, custom_model_name="Alice Pistol"),
    )
    assert r.status_code == 201

    r = client.get("/firearms")
    assert r.status_code == 200
    names = sorted(f["display_model"] for f in r.json())
    assert names == ["Alice Pistol", "Shared Pistol"]


def test_visibility_readonly_sees_shared_only(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    _login(client, "admin@test.com", "AdminPass1!")
    client.post(
        "/firearms",
        json=_base_payload(firearm_mfr.id, caliber.id, is_shared=True, custom_model_name="Shared"),
    )
    client.post(
        "/firearms",
        json=_base_payload(firearm_mfr.id, caliber.id, custom_model_name="Admin Private"),
    )

    _make_user(db_session, "ro@test.com", role="read_only")
    client.post("/auth/logout")
    _login(client, "ro@test.com", "MemberPass1!")
    r = client.get("/firearms")
    assert r.status_code == 200
    names = [f["display_model"] for f in r.json()]
    assert names == ["Shared"]


def test_visibility_admin_sees_all(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    member = _make_user(db_session, "alice@test.com", role="member")
    fm = Firearm(
        owner_id=member.id,
        is_shared=False,
        manufacturer_id=firearm_mfr.id,
        custom_model_name="Member Private",
        firearm_type="pistol",
        caliber_id=caliber.id,
    )
    db_session.add(fm)
    db_session.commit()

    _login(client, "admin@test.com", "AdminPass1!")
    r = client.get("/firearms")
    assert r.status_code == 200
    assert any(f["display_model"] == "Member Private" for f in r.json())


def test_update_other_member_firearm_forbidden(
    client: TestClient, db_session: Session, firearm_mfr, caliber
):
    alice = _make_user(db_session, "alice@test.com", role="member")
    _make_user(db_session, "bob@test.com", role="member")

    f = Firearm(
        owner_id=alice.id,
        is_shared=False,
        manufacturer_id=firearm_mfr.id,
        custom_model_name="Alice's",
        firearm_type="pistol",
        caliber_id=caliber.id,
    )
    db_session.add(f)
    db_session.commit()
    db_session.refresh(f)

    _login(client, "bob@test.com", "MemberPass1!")
    # Bob can't even see it — should be 404
    r = client.patch(f"/firearms/{f.id}", json={"notes": "hijack"})
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Firearm log + recalculation
# ---------------------------------------------------------------------------

def _create_firearm_direct(
    db: Session, mfr_id: int, caliber_id: int, owner_id: int, **kwargs
) -> Firearm:
    f = Firearm(
        owner_id=owner_id,
        is_shared=False,
        manufacturer_id=mfr_id,
        custom_model_name="Test Firearm",
        firearm_type="pistol",
        caliber_id=caliber_id,
        **kwargs,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def test_log_cleaning_resets_since_clean(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _create_firearm_direct(
        db_session, firearm_mfr.id, caliber.id, admin_user.id,
        rounds_lifetime=1500, rounds_since_clean=1500,
    )
    _login(client, "admin@test.com", "AdminPass1!")
    today = date.today().isoformat()
    r = client.post(
        f"/firearms/{f.id}/log",
        json={"event_type": "cleaning", "event_date": today},
    )
    assert r.status_code == 201, r.text

    db_session.refresh(f)
    assert f.last_cleaned_at == date.today()
    assert f.rounds_since_clean == 0


def test_log_cleaning_recalc_on_delete(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    """Two cleanings, delete most recent — denormalized fields fall back to older."""
    f = _create_firearm_direct(
        db_session, firearm_mfr.id, caliber.id, admin_user.id,
        rounds_lifetime=2000,
    )
    _login(client, "admin@test.com", "AdminPass1!")

    # First cleaning at rounds=500 on day -10
    older = (date.today() - timedelta(days=10)).isoformat()
    r1 = client.post(
        f"/firearms/{f.id}/log",
        json={
            "event_type": "cleaning",
            "event_date": older,
            "rounds_at_event": 500,
        },
    )
    assert r1.status_code == 201

    # Second cleaning at rounds=1500 today (rounds_at_event override)
    newer = date.today().isoformat()
    r2 = client.post(
        f"/firearms/{f.id}/log",
        json={
            "event_type": "cleaning",
            "event_date": newer,
            "rounds_at_event": 1500,
        },
    )
    assert r2.status_code == 201, r2.text
    log_id_newer = r2.json()["id"]

    db_session.refresh(f)
    # rounds_lifetime (2000) - rounds_at_event (1500) = 500
    assert f.rounds_since_clean == 500
    assert f.last_cleaned_at == date.today()

    # Delete the newer entry — should fall back to the older one
    rd = client.delete(f"/firearms/{f.id}/log/{log_id_newer}")
    assert rd.status_code == 204

    db_session.refresh(f)
    assert f.last_cleaned_at == date.today() - timedelta(days=10)
    # rounds_lifetime (2000) - rounds_at_event of older (500) = 1500
    assert f.rounds_since_clean == 1500


def test_log_cleaning_recalc_on_delete_only_one(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _create_firearm_direct(
        db_session, firearm_mfr.id, caliber.id, admin_user.id,
        rounds_lifetime=750,
    )
    _login(client, "admin@test.com", "AdminPass1!")

    r = client.post(
        f"/firearms/{f.id}/log",
        json={"event_type": "cleaning", "event_date": date.today().isoformat()},
    )
    log_id = r.json()["id"]

    rd = client.delete(f"/firearms/{f.id}/log/{log_id}")
    assert rd.status_code == 204

    db_session.refresh(f)
    assert f.last_cleaned_at is None
    assert f.rounds_since_clean == f.rounds_lifetime == 750


def test_log_rounds_at_event_default_snapshot(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _create_firearm_direct(
        db_session, firearm_mfr.id, caliber.id, admin_user.id,
        rounds_lifetime=1234,
    )
    _login(client, "admin@test.com", "AdminPass1!")
    r = client.post(
        f"/firearms/{f.id}/log",
        json={"event_type": "note", "event_date": date.today().isoformat()},
    )
    assert r.status_code == 201
    assert r.json()["rounds_at_event"] == 1234


def test_log_rounds_at_event_user_override(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _create_firearm_direct(
        db_session, firearm_mfr.id, caliber.id, admin_user.id,
        rounds_lifetime=1234,
    )
    _login(client, "admin@test.com", "AdminPass1!")
    r = client.post(
        f"/firearms/{f.id}/log",
        json={
            "event_type": "note",
            "event_date": date.today().isoformat(),
            "rounds_at_event": 42,
        },
    )
    assert r.status_code == 201
    assert r.json()["rounds_at_event"] == 42


# ---------------------------------------------------------------------------
# Cleaning status (computed on FirearmRead)
# ---------------------------------------------------------------------------

def test_cleaning_status_overdue_rounds(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _create_firearm_direct(
        db_session, firearm_mfr.id, caliber.id, admin_user.id,
        rounds_lifetime=1500, rounds_since_clean=1500,
        service_interval_rounds=1000,
    )
    _login(client, "admin@test.com", "AdminPass1!")
    r = client.get(f"/firearms/{f.id}")
    assert r.status_code == 200
    assert r.json()["cleaning_status"] == "overdue"


def test_cleaning_status_due_soon_time(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _create_firearm_direct(
        db_session, firearm_mfr.id, caliber.id, admin_user.id,
        last_cleaned_at=date.today() - timedelta(days=25),
        service_interval_days=30,
    )
    _login(client, "admin@test.com", "AdminPass1!")
    r = client.get(f"/firearms/{f.id}")
    assert r.json()["cleaning_status"] == "due_soon"


def test_cleaning_status_ok(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _create_firearm_direct(
        db_session, firearm_mfr.id, caliber.id, admin_user.id,
        rounds_lifetime=100, rounds_since_clean=100,
        last_cleaned_at=date.today() - timedelta(days=5),
        service_interval_rounds=1000,
        service_interval_days=90,
    )
    _login(client, "admin@test.com", "AdminPass1!")
    r = client.get(f"/firearms/{f.id}")
    assert r.json()["cleaning_status"] == "ok"


def test_cleaning_status_no_intervals_set(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _create_firearm_direct(
        db_session, firearm_mfr.id, caliber.id, admin_user.id,
        rounds_lifetime=99999, rounds_since_clean=99999,
    )
    _login(client, "admin@test.com", "AdminPass1!")
    r = client.get(f"/firearms/{f.id}")
    assert r.json()["cleaning_status"] == "ok"


def test_cleaning_status_filter_multi_value(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    """The cleaning_status filter accepts comma-separated values so the dashboard
    Cleaning Due widget can fetch overdue + due_soon in a single request.
    """
    f_overdue = _create_firearm_direct(
        db_session, firearm_mfr.id, caliber.id, admin_user.id,
        rounds_lifetime=1500, rounds_since_clean=1500,
        service_interval_rounds=1000,
    )
    f_due_soon = _create_firearm_direct(
        db_session, firearm_mfr.id, caliber.id, admin_user.id,
        last_cleaned_at=date.today() - timedelta(days=25),
        service_interval_days=30,
    )
    f_ok = _create_firearm_direct(
        db_session, firearm_mfr.id, caliber.id, admin_user.id,
        rounds_lifetime=100, rounds_since_clean=100,
        last_cleaned_at=date.today() - timedelta(days=5),
        service_interval_rounds=1000,
        service_interval_days=90,
    )
    _login(client, "admin@test.com", "AdminPass1!")

    # Single value still works
    r = client.get("/firearms?cleaning_status=overdue")
    assert r.status_code == 200
    assert {f["id"] for f in r.json()} == {f_overdue.id}

    # Comma-separated values returns the union
    r = client.get("/firearms?cleaning_status=due_soon,overdue")
    assert r.status_code == 200
    assert {f["id"] for f in r.json()} == {f_overdue.id, f_due_soon.id}

    # Whitespace tolerated around values
    r = client.get("/firearms?cleaning_status=ok, due_soon")
    assert r.status_code == 200
    assert {f["id"] for f in r.json()} == {f_ok.id, f_due_soon.id}

    # Invalid value yields 422
    r = client.get("/firearms?cleaning_status=overdue,bogus")
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Delete cascade
# ---------------------------------------------------------------------------

def test_delete_firearm_cascades_log_and_links(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _create_firearm_direct(
        db_session, firearm_mfr.id, caliber.id, admin_user.id,
    )

    # A compliance tag and a user tag, both linked to the firearm
    ct = FirearmComplianceTag(name="CA Featureless", source="community")
    ut = FirearmUserTag(owner_id=admin_user.id, name="Carry")
    db_session.add(ct)
    db_session.add(ut)
    db_session.commit()
    db_session.refresh(ct)
    db_session.refresh(ut)

    db_session.add(FirearmComplianceTagLink(firearm_id=f.id, tag_id=ct.id))
    db_session.add(FirearmUserTagLink(firearm_id=f.id, tag_id=ut.id))
    db_session.add(FirearmLog(
        firearm_id=f.id,
        event_type="note",
        event_date=date.today(),
        rounds_at_event=0,
        logged_by=admin_user.id,
    ))
    db_session.commit()

    _login(client, "admin@test.com", "AdminPass1!")
    r = client.delete(f"/firearms/{f.id}")
    assert r.status_code == 204

    # All children should be gone
    from sqlmodel import select
    assert db_session.exec(select(Firearm).where(Firearm.id == f.id)).first() is None
    assert db_session.exec(select(FirearmLog).where(FirearmLog.firearm_id == f.id)).first() is None
    assert db_session.exec(
        select(FirearmComplianceTagLink).where(FirearmComplianceTagLink.firearm_id == f.id)
    ).first() is None
    assert db_session.exec(
        select(FirearmUserTagLink).where(FirearmUserTagLink.firearm_id == f.id)
    ).first() is None


# ---------------------------------------------------------------------------
# Physical attribute FKs (v0.3.0)
#
# Frame size, optic cut, rail type, finish — replaces the prior free-text
# `finish` column with FK lookups, plus standard_capacity. Tests verify the
# full round-trip (create → enrich → name fields populated) and the FK
# validation error paths.
# ---------------------------------------------------------------------------

def _seed_attr_lookups(db: Session) -> dict:
    """Seed one active row per physical-attribute lookup. Returns id map."""
    fs = FirearmFrameSize(name="Compact", source="community", community_key="frame-size-compact")
    oc = FirearmOpticCut(name="RMR", source="community", community_key="optic-cut-rmr")
    rt = FirearmRailType(name="Picatinny", source="community", community_key="rail-type-picatinny")
    fn = FirearmFinish(name="Cerakote", source="community", community_key="finish-cerakote")
    db.add_all([fs, oc, rt, fn])
    db.commit()
    for row in (fs, oc, rt, fn):
        db.refresh(row)
    return {"frame_size": fs.id, "optic_cut": oc.id, "rail_type": rt.id, "finish": fn.id}


def test_firearm_create_with_physical_attributes(
    client: TestClient,
    db_session: Session,
    firearm_mfr: Manufacturer,
    caliber: Caliber,
):
    _make_user(db_session, "member@test.com")
    _login(client, "member@test.com", "MemberPass1!")
    ids = _seed_attr_lookups(db_session)

    payload = _base_payload(
        firearm_mfr.id, caliber.id,
        frame_size_id=ids["frame_size"],
        optic_cut_id=ids["optic_cut"],
        rail_type_id=ids["rail_type"],
        finish_id=ids["finish"],
        standard_capacity=15,
    )
    r = client.post("/firearms", json=payload)
    assert r.status_code == 201, r.text
    body = r.json()

    # Echo + resolved names
    assert body["frame_size_id"] == ids["frame_size"]
    assert body["frame_size_name"] == "Compact"
    assert body["optic_cut_id"] == ids["optic_cut"]
    assert body["optic_cut_name"] == "RMR"
    assert body["rail_type_id"] == ids["rail_type"]
    assert body["rail_type_name"] == "Picatinny"
    assert body["finish_id"] == ids["finish"]
    assert body["finish_name"] == "Cerakote"
    assert body["standard_capacity"] == 15


def test_firearm_create_with_invalid_lookup_fk_returns_422(
    client: TestClient,
    db_session: Session,
    firearm_mfr: Manufacturer,
    caliber: Caliber,
):
    _make_user(db_session, "member@test.com")
    _login(client, "member@test.com", "MemberPass1!")

    payload = _base_payload(firearm_mfr.id, caliber.id, frame_size_id=9999)
    r = client.post("/firearms", json=payload)
    assert r.status_code == 422
    assert "frame_size_id" in r.json()["detail"]


def test_firearm_patch_clears_physical_attribute_fks(
    client: TestClient,
    db_session: Session,
    firearm_mfr: Manufacturer,
    caliber: Caliber,
):
    """Setting an attribute FK back to null in a PATCH must persist as NULL."""
    user = _make_user(db_session, "member@test.com")
    _login(client, "member@test.com", "MemberPass1!")
    ids = _seed_attr_lookups(db_session)

    f = Firearm(
        owner_id=user.id,
        manufacturer_id=firearm_mfr.id,
        custom_model_name="X",
        firearm_type="pistol",
        caliber_id=caliber.id,
        frame_size_id=ids["frame_size"],
        finish_id=ids["finish"],
    )
    db_session.add(f)
    db_session.commit()
    db_session.refresh(f)

    r = client.patch(f"/firearms/{f.id}", json={"frame_size_id": None})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["frame_size_id"] is None
    assert body["frame_size_name"] is None
    # Untouched FK persists.
    assert body["finish_id"] == ids["finish"]


def test_firearm_model_default_barrel_length_in_returned(
    client: TestClient,
    db_session: Session,
    firearm_mfr: Manufacturer,
    caliber: Caliber,
):
    """Catalog models with seeded barrel length surface it on the lookup endpoint."""
    _make_user(db_session, "member@test.com")
    _login(client, "member@test.com", "MemberPass1!")

    fm = FirearmModel(
        manufacturer_id=firearm_mfr.id,
        name="19 Gen5",
        default_caliber_id=caliber.id,
        default_barrel_length_in=4.02,
    )
    db_session.add(fm)
    db_session.commit()

    r = client.get(f"/firearm-models?manufacturer_id={firearm_mfr.id}")
    assert r.status_code == 200, r.text
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["default_barrel_length_in"] == 4.02


def test_firearm_attribute_lookups_endpoints_smoke(
    client: TestClient,
    db_session: Session,
):
    """All four new lookup endpoints round-trip a freshly created entry."""
    _make_user(db_session, "admin@test.com", role="admin")
    _login(client, "admin@test.com", "MemberPass1!")

    for table, name in [
        ("firearm-frame-sizes", "Subcompact"),
        ("firearm-optic-cuts", "DeltaPoint Pro"),
        ("firearm-rail-types", "M-LOK"),
        ("firearm-finishes", "Blued"),
    ]:
        r = client.post(f"/{table}", json={"name": name})
        assert r.status_code == 201, f"{table}: {r.text}"
        assert r.json()["name"] == name

        r = client.get(f"/{table}")
        assert r.status_code == 200, r.text
        assert any(row["name"] == name for row in r.json())
