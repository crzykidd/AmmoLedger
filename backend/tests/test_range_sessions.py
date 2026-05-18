"""Integration tests for the range sessions API (P3).

Covers:
- Atomic create with mixed firearm/box lines
- Reversal on session and line delete
- PATCH that swaps firearms or boxes (reverse-then-apply)
- RBAC: visibility, member/admin sharing rules
- Validation: empty session, empty line, overdraw transaction rollback
- /ammo/:id/expend semantic preserved (members can fire from shared boxes)
- List filter by firearm + per-session aggregates
- FK-ordering regression: ExpenditureLog deleted before RangeSessionLine
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text as sql_text
from sqlmodel import Session, select

from models import (
    AmmoBox,
    Caliber,
    ExpenditureLog,
    Firearm,
    Manufacturer,
    RangeSession,
    RangeSessionLine,
    User,
)
from utils.security import hash_password


# ---------------------------------------------------------------------------
# Helpers
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


def _make_firearm(
    db: Session, mfr_id: int, caliber_id: int, owner_id: int,
    name: str = "Test Firearm", is_shared: bool = False,
    rounds_lifetime: int = 0, rounds_since_clean: int = 0,
) -> Firearm:
    f = Firearm(
        owner_id=owner_id,
        is_shared=is_shared,
        manufacturer_id=mfr_id,
        custom_model_name=name,
        firearm_type="pistol",
        caliber_id=caliber_id,
        rounds_lifetime=rounds_lifetime,
        rounds_since_clean=rounds_since_clean,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def _make_box(
    db: Session, mfr_id: int, caliber_id: int, owner_id: int,
    qty: int = 200, is_shared: bool = False,
) -> AmmoBox:
    b = AmmoBox(
        owner_id=owner_id,
        is_shared=is_shared,
        caliber_id=caliber_id,
        manufacturer_id=mfr_id,
        product_name="Test Ammo",
        qty_original=qty,
        qty_remaining=qty,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


@pytest.fixture
def firearm_mfr(db_session: Session) -> Manufacturer:
    m = Manufacturer(name="Glock", types='["firearm"]')
    db_session.add(m)
    db_session.commit()
    db_session.refresh(m)
    return m


@pytest.fixture
def ammo_mfr(db_session: Session) -> Manufacturer:
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


# ---------------------------------------------------------------------------
# Create — single line, mixed shapes
# ---------------------------------------------------------------------------

def test_create_session_basic(
    client: TestClient, db_session: Session, admin_user: User,
    firearm_mfr, ammo_mfr, caliber,
):
    """Single line with both firearm and box: deductions + counters + audit link."""
    f = _make_firearm(db_session, firearm_mfr.id, caliber.id, admin_user.id)
    b = _make_box(db_session, ammo_mfr.id, caliber.id, admin_user.id, qty=200)

    _login(client, "admin@test.com", "AdminPass1!")
    r = client.post(
        "/range-sessions",
        json={
            "date": date.today().isoformat(),
            "location_name": "Local Range",
            "lines": [
                {"firearm_id": f.id, "ammo_box_id": b.id, "rounds_fired": 50},
            ],
        },
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["total_rounds"] == 50
    assert data["distinct_firearms"] == 1
    assert data["distinct_boxes"] == 1
    assert len(data["lines"]) == 1

    db_session.expire_all()
    db_session.refresh(f)
    db_session.refresh(b)
    assert f.rounds_lifetime == 50
    assert f.rounds_since_clean == 50
    assert b.qty_remaining == 150

    line_id = data["lines"][0]["id"]
    logs = db_session.exec(
        select(ExpenditureLog).where(ExpenditureLog.range_session_line_id == line_id)
    ).all()
    assert len(logs) == 1
    assert logs[0].rounds_used == 50
    assert logs[0].log_type == "expend"


def test_create_session_box_only(
    client: TestClient, db_session: Session, admin_user: User, ammo_mfr, caliber,
):
    """Box-only line: box decrements, no firearm changes, expend log written."""
    b = _make_box(db_session, ammo_mfr.id, caliber.id, admin_user.id, qty=100)

    _login(client, "admin@test.com", "AdminPass1!")
    r = client.post(
        "/range-sessions",
        json={
            "date": date.today().isoformat(),
            "lines": [{"ammo_box_id": b.id, "rounds_fired": 30}],
        },
    )
    assert r.status_code == 201, r.text

    db_session.expire_all()
    db_session.refresh(b)
    assert b.qty_remaining == 70

    logs = db_session.exec(
        select(ExpenditureLog).where(ExpenditureLog.ammo_box_id == b.id)
    ).all()
    assert len(logs) == 1


def test_create_session_firearm_only(
    client: TestClient, db_session: Session, admin_user: User,
    firearm_mfr, caliber,
):
    """Firearm-only line (dry fire): firearm counters update, no expend log."""
    f = _make_firearm(db_session, firearm_mfr.id, caliber.id, admin_user.id)

    _login(client, "admin@test.com", "AdminPass1!")
    r = client.post(
        "/range-sessions",
        json={
            "date": date.today().isoformat(),
            "lines": [{"firearm_id": f.id, "rounds_fired": 25}],
        },
    )
    assert r.status_code == 201, r.text

    db_session.refresh(f)
    assert f.rounds_lifetime == 25
    assert f.rounds_since_clean == 25

    logs = db_session.exec(select(ExpenditureLog)).all()
    assert logs == []


def test_create_session_zero_rounds_firearm_only(
    client: TestClient, db_session: Session, admin_user: User,
    firearm_mfr, caliber,
):
    """Zero rounds with firearm only: line stored, no counters touched, no log."""
    f = _make_firearm(db_session, firearm_mfr.id, caliber.id, admin_user.id)

    _login(client, "admin@test.com", "AdminPass1!")
    r = client.post(
        "/range-sessions",
        json={
            "date": date.today().isoformat(),
            "lines": [{"firearm_id": f.id, "rounds_fired": 0}],
        },
    )
    assert r.status_code == 201, r.text

    db_session.refresh(f)
    assert f.rounds_lifetime == 0
    assert db_session.exec(select(ExpenditureLog)).all() == []


# ---------------------------------------------------------------------------
# Validation + atomicity
# ---------------------------------------------------------------------------

def test_create_session_overdraw_rejected_atomically(
    client: TestClient, db_session: Session, admin_user: User,
    firearm_mfr, ammo_mfr, caliber,
):
    """Two-line POST where the second overdraws — first line must roll back fully."""
    f = _make_firearm(db_session, firearm_mfr.id, caliber.id, admin_user.id)
    b1 = _make_box(db_session, ammo_mfr.id, caliber.id, admin_user.id, qty=100)
    b2 = _make_box(db_session, ammo_mfr.id, caliber.id, admin_user.id, qty=10)

    _login(client, "admin@test.com", "AdminPass1!")
    r = client.post(
        "/range-sessions",
        json={
            "date": date.today().isoformat(),
            "lines": [
                {"firearm_id": f.id, "ammo_box_id": b1.id, "rounds_fired": 50},
                {"firearm_id": f.id, "ammo_box_id": b2.id, "rounds_fired": 999},
            ],
        },
    )
    assert r.status_code == 422

    db_session.expire_all()
    db_session.refresh(f)
    db_session.refresh(b1)
    db_session.refresh(b2)

    # First line's effects must be undone
    assert b1.qty_remaining == 100
    assert b2.qty_remaining == 10
    assert f.rounds_lifetime == 0
    assert f.rounds_since_clean == 0
    # No session was persisted
    assert db_session.exec(select(RangeSession)).all() == []
    # No log rows either
    assert db_session.exec(select(ExpenditureLog)).all() == []


def test_create_session_no_lines_rejected(
    client: TestClient, admin_user: User,
):
    _login(client, "admin@test.com", "AdminPass1!")
    r = client.post(
        "/range-sessions",
        json={"date": date.today().isoformat(), "lines": []},
    )
    assert r.status_code == 422


def test_create_session_line_no_firearm_no_box_rejected(
    client: TestClient, admin_user: User,
):
    _login(client, "admin@test.com", "AdminPass1!")
    r = client.post(
        "/range-sessions",
        json={
            "date": date.today().isoformat(),
            "lines": [{"rounds_fired": 10}],
        },
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# RBAC / visibility
# ---------------------------------------------------------------------------

def test_visibility_member_sees_shared_and_own(
    client: TestClient, db_session: Session, admin_user: User,
    firearm_mfr, ammo_mfr, caliber,
):
    alice = _make_user(db_session, "alice@test.com", role="member")
    f_admin = _make_firearm(
        db_session, firearm_mfr.id, caliber.id, admin_user.id,
        name="Admin Gun", is_shared=True,
    )
    b_admin = _make_box(
        db_session, ammo_mfr.id, caliber.id, admin_user.id,
        qty=500, is_shared=True,
    )
    f_alice = _make_firearm(
        db_session, firearm_mfr.id, caliber.id, alice.id, name="Alice Gun",
    )
    b_alice = _make_box(db_session, ammo_mfr.id, caliber.id, alice.id, qty=200)

    # Admin creates a shared session
    _login(client, "admin@test.com", "AdminPass1!")
    r = client.post(
        "/range-sessions",
        json={
            "is_shared": True,
            "date": date.today().isoformat(),
            "location_name": "Shared Range",
            "lines": [
                {"firearm_id": f_admin.id, "ammo_box_id": b_admin.id, "rounds_fired": 10},
            ],
        },
    )
    assert r.status_code == 201

    # Alice creates her own private session
    client.post("/auth/logout")
    _login(client, "alice@test.com", "MemberPass1!")
    r = client.post(
        "/range-sessions",
        json={
            "date": date.today().isoformat(),
            "location_name": "Alice Range",
            "lines": [
                {"firearm_id": f_alice.id, "ammo_box_id": b_alice.id, "rounds_fired": 20},
            ],
        },
    )
    assert r.status_code == 201

    r = client.get("/range-sessions")
    assert r.status_code == 200
    locations = sorted(s["location_name"] for s in r.json())
    assert locations == ["Alice Range", "Shared Range"]


def test_visibility_admin_sees_all(
    client: TestClient, db_session: Session, admin_user: User,
    firearm_mfr, ammo_mfr, caliber,
):
    alice = _make_user(db_session, "alice@test.com", role="member")
    f = _make_firearm(db_session, firearm_mfr.id, caliber.id, alice.id)
    b = _make_box(db_session, ammo_mfr.id, caliber.id, alice.id)

    _login(client, "alice@test.com", "MemberPass1!")
    r = client.post(
        "/range-sessions",
        json={
            "date": date.today().isoformat(),
            "location_name": "Alice Only",
            "lines": [{"firearm_id": f.id, "ammo_box_id": b.id, "rounds_fired": 5}],
        },
    )
    assert r.status_code == 201

    client.post("/auth/logout")
    _login(client, "admin@test.com", "AdminPass1!")
    r = client.get("/range-sessions")
    assert r.status_code == 200
    assert any(s["location_name"] == "Alice Only" for s in r.json())


def test_member_cannot_share_session(
    client: TestClient, db_session: Session,
    firearm_mfr, ammo_mfr, caliber,
):
    alice = _make_user(db_session, "alice@test.com", role="member")
    f = _make_firearm(db_session, firearm_mfr.id, caliber.id, alice.id)
    b = _make_box(db_session, ammo_mfr.id, caliber.id, alice.id)

    _login(client, "alice@test.com", "MemberPass1!")
    r = client.post(
        "/range-sessions",
        json={
            "is_shared": True,
            "date": date.today().isoformat(),
            "lines": [{"firearm_id": f.id, "ammo_box_id": b.id, "rounds_fired": 5}],
        },
    )
    assert r.status_code == 403


def test_visibility_into_shared_box_for_session(
    client: TestClient, db_session: Session, admin_user: User,
    firearm_mfr, ammo_mfr, caliber,
):
    """Member can fire from a shared box owned by admin (matches /expend semantics)."""
    alice = _make_user(db_session, "alice@test.com", role="member")
    shared_box = _make_box(
        db_session, ammo_mfr.id, caliber.id, admin_user.id,
        qty=100, is_shared=True,
    )
    alice_gun = _make_firearm(db_session, firearm_mfr.id, caliber.id, alice.id)

    _login(client, "alice@test.com", "MemberPass1!")
    r = client.post(
        "/range-sessions",
        json={
            "date": date.today().isoformat(),
            "lines": [
                {"firearm_id": alice_gun.id, "ammo_box_id": shared_box.id, "rounds_fired": 25},
            ],
        },
    )
    assert r.status_code == 201, r.text

    db_session.refresh(shared_box)
    assert shared_box.qty_remaining == 75


# ---------------------------------------------------------------------------
# Reversal — delete session
# ---------------------------------------------------------------------------

def test_delete_session_reverses_everything(
    client: TestClient, db_session: Session, admin_user: User,
    firearm_mfr, ammo_mfr, caliber,
):
    f = _make_firearm(db_session, firearm_mfr.id, caliber.id, admin_user.id)
    b = _make_box(db_session, ammo_mfr.id, caliber.id, admin_user.id, qty=200)

    _login(client, "admin@test.com", "AdminPass1!")
    r = client.post(
        "/range-sessions",
        json={
            "date": date.today().isoformat(),
            "lines": [{"firearm_id": f.id, "ammo_box_id": b.id, "rounds_fired": 80}],
        },
    )
    sid = r.json()["id"]

    db_session.expire_all()
    db_session.refresh(f)
    db_session.refresh(b)
    assert f.rounds_lifetime == 80
    assert b.qty_remaining == 120

    rd = client.delete(f"/range-sessions/{sid}")
    assert rd.status_code == 204

    db_session.expire_all()
    db_session.refresh(f)
    db_session.refresh(b)
    assert f.rounds_lifetime == 0
    assert f.rounds_since_clean == 0
    assert b.qty_remaining == 200

    assert db_session.exec(select(RangeSession)).all() == []
    assert db_session.exec(select(RangeSessionLine)).all() == []
    assert db_session.exec(select(ExpenditureLog)).all() == []


def test_delete_session_with_multiple_lines(
    client: TestClient, db_session: Session, admin_user: User,
    firearm_mfr, ammo_mfr, caliber,
):
    f1 = _make_firearm(db_session, firearm_mfr.id, caliber.id, admin_user.id, name="F1")
    f2 = _make_firearm(db_session, firearm_mfr.id, caliber.id, admin_user.id, name="F2")
    b1 = _make_box(db_session, ammo_mfr.id, caliber.id, admin_user.id, qty=300)
    b2 = _make_box(db_session, ammo_mfr.id, caliber.id, admin_user.id, qty=300)

    _login(client, "admin@test.com", "AdminPass1!")
    r = client.post(
        "/range-sessions",
        json={
            "date": date.today().isoformat(),
            "lines": [
                {"firearm_id": f1.id, "ammo_box_id": b1.id, "rounds_fired": 50},
                {"firearm_id": f2.id, "ammo_box_id": b2.id, "rounds_fired": 30},
            ],
        },
    )
    sid = r.json()["id"]

    rd = client.delete(f"/range-sessions/{sid}")
    assert rd.status_code == 204

    db_session.expire_all()
    db_session.refresh(f1)
    db_session.refresh(f2)
    db_session.refresh(b1)
    db_session.refresh(b2)
    assert f1.rounds_lifetime == 0
    assert f2.rounds_lifetime == 0
    assert b1.qty_remaining == 300
    assert b2.qty_remaining == 300


# ---------------------------------------------------------------------------
# Reversal — line PATCH
# ---------------------------------------------------------------------------

def test_update_line_reverse_then_apply(
    client: TestClient, db_session: Session, admin_user: User,
    firearm_mfr, ammo_mfr, caliber,
):
    """Bump rounds_fired from 50 to 100; net firearm/box state must be correct."""
    f = _make_firearm(db_session, firearm_mfr.id, caliber.id, admin_user.id)
    b = _make_box(db_session, ammo_mfr.id, caliber.id, admin_user.id, qty=200)

    _login(client, "admin@test.com", "AdminPass1!")
    r = client.post(
        "/range-sessions",
        json={
            "date": date.today().isoformat(),
            "lines": [{"firearm_id": f.id, "ammo_box_id": b.id, "rounds_fired": 50}],
        },
    )
    sid = r.json()["id"]
    line_id = r.json()["lines"][0]["id"]

    rp = client.patch(
        f"/range-sessions/{sid}/lines/{line_id}",
        json={"rounds_fired": 100},
    )
    assert rp.status_code == 200, rp.text

    db_session.expire_all()
    db_session.refresh(f)
    db_session.refresh(b)
    assert f.rounds_lifetime == 100
    assert f.rounds_since_clean == 100
    assert b.qty_remaining == 100

    logs = db_session.exec(
        select(ExpenditureLog).where(ExpenditureLog.range_session_line_id == line_id)
    ).all()
    assert len(logs) == 1
    assert logs[0].rounds_used == 100


def test_update_line_change_box(
    client: TestClient, db_session: Session, admin_user: User,
    firearm_mfr, ammo_mfr, caliber,
):
    f = _make_firearm(db_session, firearm_mfr.id, caliber.id, admin_user.id)
    bA = _make_box(db_session, ammo_mfr.id, caliber.id, admin_user.id, qty=200)
    bB = _make_box(db_session, ammo_mfr.id, caliber.id, admin_user.id, qty=200)

    _login(client, "admin@test.com", "AdminPass1!")
    r = client.post(
        "/range-sessions",
        json={
            "date": date.today().isoformat(),
            "lines": [{"firearm_id": f.id, "ammo_box_id": bA.id, "rounds_fired": 40}],
        },
    )
    sid = r.json()["id"]
    line_id = r.json()["lines"][0]["id"]

    rp = client.patch(
        f"/range-sessions/{sid}/lines/{line_id}",
        json={"ammo_box_id": bB.id},
    )
    assert rp.status_code == 200, rp.text

    db_session.expire_all()
    db_session.refresh(bA)
    db_session.refresh(bB)
    assert bA.qty_remaining == 200
    assert bB.qty_remaining == 160


def test_update_line_change_firearm(
    client: TestClient, db_session: Session, admin_user: User,
    firearm_mfr, ammo_mfr, caliber,
):
    f1 = _make_firearm(db_session, firearm_mfr.id, caliber.id, admin_user.id, name="F1")
    f2 = _make_firearm(db_session, firearm_mfr.id, caliber.id, admin_user.id, name="F2")
    b = _make_box(db_session, ammo_mfr.id, caliber.id, admin_user.id, qty=200)

    _login(client, "admin@test.com", "AdminPass1!")
    r = client.post(
        "/range-sessions",
        json={
            "date": date.today().isoformat(),
            "lines": [{"firearm_id": f1.id, "ammo_box_id": b.id, "rounds_fired": 60}],
        },
    )
    sid = r.json()["id"]
    line_id = r.json()["lines"][0]["id"]

    rp = client.patch(
        f"/range-sessions/{sid}/lines/{line_id}",
        json={"firearm_id": f2.id},
    )
    assert rp.status_code == 200, rp.text

    db_session.expire_all()
    db_session.refresh(f1)
    db_session.refresh(f2)
    assert f1.rounds_lifetime == 0
    assert f1.rounds_since_clean == 0
    assert f2.rounds_lifetime == 60
    assert f2.rounds_since_clean == 60


# ---------------------------------------------------------------------------
# Line delete edge cases
# ---------------------------------------------------------------------------

def test_delete_last_line_blocked(
    client: TestClient, db_session: Session, admin_user: User,
    firearm_mfr, ammo_mfr, caliber,
):
    f = _make_firearm(db_session, firearm_mfr.id, caliber.id, admin_user.id)
    b = _make_box(db_session, ammo_mfr.id, caliber.id, admin_user.id, qty=200)

    _login(client, "admin@test.com", "AdminPass1!")
    r = client.post(
        "/range-sessions",
        json={
            "date": date.today().isoformat(),
            "lines": [{"firearm_id": f.id, "ammo_box_id": b.id, "rounds_fired": 10}],
        },
    )
    sid = r.json()["id"]
    line_id = r.json()["lines"][0]["id"]

    rd = client.delete(f"/range-sessions/{sid}/lines/{line_id}")
    assert rd.status_code == 422


# ---------------------------------------------------------------------------
# List filter + aggregates
# ---------------------------------------------------------------------------

def test_list_filter_by_firearm(
    client: TestClient, db_session: Session, admin_user: User,
    firearm_mfr, ammo_mfr, caliber,
):
    fA = _make_firearm(db_session, firearm_mfr.id, caliber.id, admin_user.id, name="FA")
    fB = _make_firearm(db_session, firearm_mfr.id, caliber.id, admin_user.id, name="FB")
    b = _make_box(db_session, ammo_mfr.id, caliber.id, admin_user.id, qty=500)

    _login(client, "admin@test.com", "AdminPass1!")
    today = date.today().isoformat()
    client.post("/range-sessions", json={
        "date": today, "location_name": "WithA",
        "lines": [{"firearm_id": fA.id, "ammo_box_id": b.id, "rounds_fired": 5}],
    })
    client.post("/range-sessions", json={
        "date": today, "location_name": "WithB",
        "lines": [{"firearm_id": fB.id, "ammo_box_id": b.id, "rounds_fired": 5}],
    })
    client.post("/range-sessions", json={
        "date": today, "location_name": "WithBoth",
        "lines": [
            {"firearm_id": fA.id, "ammo_box_id": b.id, "rounds_fired": 5},
            {"firearm_id": fB.id, "ammo_box_id": b.id, "rounds_fired": 5},
        ],
    })

    r = client.get(f"/range-sessions?firearm_id={fA.id}")
    assert r.status_code == 200
    locations = sorted(s["location_name"] for s in r.json())
    assert locations == ["WithA", "WithBoth"]


def test_list_rounds_for_filter_firearm(
    client: TestClient, db_session: Session, admin_user: User,
    firearm_mfr, ammo_mfr, caliber,
):
    """When firearm_id is set, each session reports the rounds fired by THAT
    firearm — not the session total. Powers the firearm detail Sessions tab.
    """
    fA = _make_firearm(db_session, firearm_mfr.id, caliber.id, admin_user.id, name="FA")
    fB = _make_firearm(db_session, firearm_mfr.id, caliber.id, admin_user.id, name="FB")
    b = _make_box(db_session, ammo_mfr.id, caliber.id, admin_user.id, qty=500)

    _login(client, "admin@test.com", "AdminPass1!")
    today = date.today().isoformat()
    # Solo session for fA
    client.post("/range-sessions", json={
        "date": today, "location_name": "Solo",
        "lines": [{"firearm_id": fA.id, "ammo_box_id": b.id, "rounds_fired": 25}],
    })
    # Mixed session — fA fires 10, fB fires 40 — fA total should be 10
    client.post("/range-sessions", json={
        "date": today, "location_name": "Mixed",
        "lines": [
            {"firearm_id": fA.id, "ammo_box_id": b.id, "rounds_fired": 10},
            {"firearm_id": fB.id, "ammo_box_id": b.id, "rounds_fired": 40},
        ],
    })
    # Session that doesn't include fA at all — should not appear in the filtered list
    client.post("/range-sessions", json={
        "date": today, "location_name": "OtherOnly",
        "lines": [{"firearm_id": fB.id, "ammo_box_id": b.id, "rounds_fired": 5}],
    })

    # Without filter: rounds_for_filter_firearm should be null on every row
    r = client.get("/range-sessions")
    assert r.status_code == 200
    for item in r.json():
        assert item["rounds_for_filter_firearm"] is None

    # With filter: only sessions involving fA, with per-firearm rounds populated
    r = client.get(f"/range-sessions?firearm_id={fA.id}")
    assert r.status_code == 200
    items = r.json()
    by_loc = {item["location_name"]: item for item in items}
    assert set(by_loc.keys()) == {"Solo", "Mixed"}
    assert by_loc["Solo"]["rounds_for_filter_firearm"] == 25
    assert by_loc["Solo"]["total_rounds"] == 25
    assert by_loc["Mixed"]["rounds_for_filter_firearm"] == 10
    assert by_loc["Mixed"]["total_rounds"] == 50


def test_session_list_aggregates(
    client: TestClient, db_session: Session, admin_user: User,
    firearm_mfr, ammo_mfr, caliber,
):
    f1 = _make_firearm(db_session, firearm_mfr.id, caliber.id, admin_user.id, name="F1")
    f2 = _make_firearm(db_session, firearm_mfr.id, caliber.id, admin_user.id, name="F2")
    b1 = _make_box(db_session, ammo_mfr.id, caliber.id, admin_user.id, qty=500)
    b2 = _make_box(db_session, ammo_mfr.id, caliber.id, admin_user.id, qty=500)

    _login(client, "admin@test.com", "AdminPass1!")
    r = client.post(
        "/range-sessions",
        json={
            "date": date.today().isoformat(),
            "lines": [
                {"firearm_id": f1.id, "ammo_box_id": b1.id, "rounds_fired": 10},
                {"firearm_id": f2.id, "ammo_box_id": b2.id, "rounds_fired": 20},
                # Reuse firearm f1 with box b2 — distinct counts must stay correct
                {"firearm_id": f1.id, "ammo_box_id": b2.id, "rounds_fired": 30},
            ],
        },
    )
    assert r.status_code == 201, r.text

    r = client.get("/range-sessions")
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    item = items[0]
    assert item["total_rounds"] == 60
    assert item["distinct_firearms"] == 2
    assert item["distinct_boxes"] == 2
    assert item["line_count"] == 3


# ---------------------------------------------------------------------------
# FK-ordering regression — delete must emit ExpenditureLog DELETEs before
# RangeSessionLine DELETEs (expenditure_log.range_session_line_id FK).
# SQLite does not enforce FKs by default; enable here to catch the regression.
# ---------------------------------------------------------------------------

def test_delete_session_fk_ordering(
    client: TestClient, db_session: Session, admin_user: User,
    firearm_mfr, ammo_mfr, caliber,
):
    """DELETE /range-sessions/{id} must not raise FK IntegrityError.

    The FK expenditure_log.range_session_line_id → range_session_lines.id is
    enforced at the SQLite schema level but is not an ORM Relationship, so the
    unit-of-work sort cannot order the DELETEs automatically. SQLite FK
    enforcement is enabled for this test so the constraint is actually checked.
    """
    # StaticPool shares one connection for db_session and client requests.
    # Enable FK enforcement now; disable in the finally block.
    db_session.exec(sql_text("PRAGMA foreign_keys = ON"))
    db_session.commit()

    try:
        f = _make_firearm(db_session, firearm_mfr.id, caliber.id, admin_user.id)
        b = _make_box(db_session, ammo_mfr.id, caliber.id, admin_user.id, qty=100)

        _login(client, "admin@test.com", "AdminPass1!")
        r = client.post(
            "/range-sessions",
            json={
                "date": date.today().isoformat(),
                "lines": [{"firearm_id": f.id, "ammo_box_id": b.id, "rounds_fired": 20}],
            },
        )
        assert r.status_code == 201, r.text
        sid = r.json()["id"]
        line_id = r.json()["lines"][0]["id"]

        rd = client.delete(f"/range-sessions/{sid}")
        assert rd.status_code == 204

        db_session.expire_all()
        db_session.refresh(b)
        db_session.refresh(f)
        assert b.qty_remaining == 100
        assert f.rounds_lifetime == 0
        assert f.rounds_since_clean == 0
        assert db_session.exec(
            select(ExpenditureLog).where(ExpenditureLog.range_session_line_id == line_id)
        ).all() == []
        assert db_session.exec(
            select(RangeSession).where(RangeSession.id == sid)
        ).first() is None
        assert db_session.exec(
            select(RangeSessionLine).where(RangeSessionLine.id == line_id)
        ).first() is None
    finally:
        db_session.exec(sql_text("PRAGMA foreign_keys = OFF"))
        db_session.commit()
