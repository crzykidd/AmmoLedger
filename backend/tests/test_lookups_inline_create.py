"""Tests for the v0.3.0 inline-create permission relaxation.

POST endpoints on 13 lookup tables now accept members (admin+member). PATCH
and DELETE remain admin-only. Member-created entries land with
`source='user'` so they're distinguishable from community / admin rows in
the admin Lookups page.
"""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from models import (
    AmmoCondition,
    AmmoType,
    Caliber,
    Category,
    Dealer,
    FirearmActionType,
    FirearmComplianceTag,
    FirearmFinish,
    FirearmFrameSize,
    FirearmModel,
    FirearmOpticCut,
    FirearmRailType,
    Manufacturer,
    User,
)
from utils.security import hash_password


# ---------------------------------------------------------------------------
# Helpers — match the firearms test fixtures so this file is self-contained.
# ---------------------------------------------------------------------------

def _login(c: TestClient, email: str, password: str) -> None:
    r = c.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text


def _make_user(db: Session, email: str, role: str) -> User:
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
def member(db_session: Session) -> User:
    return _make_user(db_session, "member@test.com", role="member")


@pytest.fixture
def readonly(db_session: Session) -> User:
    return _make_user(db_session, "ro@test.com", role="read_only")


# ---------------------------------------------------------------------------
# Member POST permission — all 13 relaxed tables
# ---------------------------------------------------------------------------

def test_member_can_create_caliber(client: TestClient, member: User):
    _login(client, member.email, "MemberPass1!")
    r = client.post("/calibers", json={"name": "7.62x39mm"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "7.62x39mm"
    assert body["source"] == "user"


def test_member_can_create_manufacturer_with_types(client: TestClient, member: User):
    _login(client, member.email, "MemberPass1!")
    r = client.post(
        "/manufacturers",
        json={"name": "Bubba's Custom 1911s", "types": '["firearm"]'},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "Bubba's Custom 1911s"
    assert body["source"] == "user"
    assert body["types"] == '["firearm"]'


def test_member_can_create_ammo_type(client: TestClient, member: User):
    _login(client, member.email, "MemberPass1!")
    r = client.post("/ammo-types", json={"name": "FrangibleX"})
    assert r.status_code == 201, r.text
    assert r.json()["source"] == "user"


def test_member_can_create_ammo_condition(client: TestClient, member: User):
    _login(client, member.email, "MemberPass1!")
    r = client.post("/ammo-conditions", json={"name": "Pulled-Down"})
    assert r.status_code == 201, r.text
    assert r.json()["source"] == "user"


def test_member_can_create_category(client: TestClient, member: User):
    _login(client, member.email, "MemberPass1!")
    r = client.post("/categories", json={"name": "Pin Shooting"})
    assert r.status_code == 201, r.text
    assert r.json()["source"] == "user"


def test_member_can_create_dealer(client: TestClient, member: User):
    _login(client, member.email, "MemberPass1!")
    r = client.post("/dealers", json={"name": "Bubba's Gun Emporium"})
    assert r.status_code == 201, r.text
    assert r.json()["source"] == "user"


def test_member_can_create_firearm_action_type(client: TestClient, member: User):
    _login(client, member.email, "MemberPass1!")
    r = client.post("/firearm-action-types", json={"name": "Lever-Bolt"})
    assert r.status_code == 201, r.text
    assert r.json()["source"] == "user"


def test_member_can_create_firearm_model_under_manufacturer(
    client: TestClient, db_session: Session, member: User
):
    # Existing manufacturer (community-seeded for this test)
    m = Manufacturer(name="Glock", types='["firearm"]', source="community")
    db_session.add(m)
    db_session.commit()
    db_session.refresh(m)

    _login(client, member.email, "MemberPass1!")
    r = client.post(
        "/firearm-models",
        json={"manufacturer_id": m.id, "name": "47 Frankengun"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["manufacturer_id"] == m.id
    assert body["source"] == "user"


def test_member_can_create_firearm_compliance_tag(client: TestClient, member: User):
    _login(client, member.email, "MemberPass1!")
    r = client.post(
        "/firearm-compliance-tags",
        json={"name": "WA Misc Compliance"},
    )
    assert r.status_code == 201, r.text
    # FirearmComplianceTag's *default* source is "community"; member create
    # overrides to "user" so admin governance sees the distinction.
    assert r.json()["source"] == "user"


def test_member_can_create_firearm_frame_size(client: TestClient, member: User):
    _login(client, member.email, "MemberPass1!")
    r = client.post("/firearm-frame-sizes", json={"name": "Sub-Subcompact"})
    assert r.status_code == 201, r.text
    assert r.json()["source"] == "user"


def test_member_can_create_firearm_optic_cut(client: TestClient, member: User):
    _login(client, member.email, "MemberPass1!")
    r = client.post("/firearm-optic-cuts", json={"name": "Mystery Pattern"})
    assert r.status_code == 201, r.text
    assert r.json()["source"] == "user"


def test_member_can_create_firearm_rail_type(client: TestClient, member: User):
    _login(client, member.email, "MemberPass1!")
    r = client.post("/firearm-rail-types", json={"name": "Generic Dovetail"})
    assert r.status_code == 201, r.text
    assert r.json()["source"] == "user"


def test_member_can_create_firearm_finish(client: TestClient, member: User):
    _login(client, member.email, "MemberPass1!")
    r = client.post("/firearm-finishes", json={"name": "FDE Cerakote"})
    assert r.status_code == 201, r.text
    assert r.json()["source"] == "user"


# ---------------------------------------------------------------------------
# Read-only POST — all 13 tables stay 403
# ---------------------------------------------------------------------------

# (manufacturer body needs types; the rest are plain {name}.)
_READONLY_POST_CASES = [
    ("/calibers", {"name": "ReadOnly Caliber"}),
    ("/manufacturers", {"name": "ReadOnly Mfr", "types": '["ammo"]'}),
    ("/ammo-types", {"name": "ReadOnly Type"}),
    ("/ammo-conditions", {"name": "ReadOnly Cond"}),
    ("/categories", {"name": "ReadOnly Cat"}),
    ("/dealers", {"name": "ReadOnly Dealer"}),
    ("/firearm-action-types", {"name": "ReadOnly Action"}),
    ("/firearm-compliance-tags", {"name": "ReadOnly Tag"}),
    ("/firearm-frame-sizes", {"name": "ReadOnly Frame"}),
    ("/firearm-optic-cuts", {"name": "ReadOnly Optic"}),
    ("/firearm-rail-types", {"name": "ReadOnly Rail"}),
    ("/firearm-finishes", {"name": "ReadOnly Finish"}),
]


@pytest.mark.parametrize("path,body", _READONLY_POST_CASES)
def test_readonly_cannot_create_any_lookup(
    client: TestClient, readonly: User, path: str, body: dict
):
    _login(client, readonly.email, "MemberPass1!")
    r = client.post(path, json=body)
    assert r.status_code == 403, f"{path} should be forbidden for read-only"


def test_readonly_cannot_create_firearm_model(
    client: TestClient, db_session: Session, readonly: User
):
    m = Manufacturer(name="Glock", types='["firearm"]', source="community")
    db_session.add(m)
    db_session.commit()
    db_session.refresh(m)
    _login(client, readonly.email, "MemberPass1!")
    r = client.post(
        "/firearm-models",
        json={"manufacturer_id": m.id, "name": "RO Forbidden"},
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Admin POST — regression guard, plus source-field semantics
# ---------------------------------------------------------------------------

def test_admin_can_still_create_caliber(client: TestClient, admin_user: User):
    _login(client, admin_user.email, "AdminPass1!")
    r = client.post("/calibers", json={"name": ".300 Whisper"})
    assert r.status_code == 201, r.text


def test_admin_create_keeps_default_source_for_caliber(
    client: TestClient, admin_user: User
):
    """Caliber's model default is 'user'. Admin POST should NOT special-case
    to a different value — we only override the default for member POSTs."""
    _login(client, admin_user.email, "AdminPass1!")
    r = client.post("/calibers", json={"name": ".22 Hornet"})
    assert r.status_code == 201, r.text
    assert r.json()["source"] == "user"  # model default applies


def test_admin_create_keeps_default_source_for_compliance_tag(
    client: TestClient, admin_user: User, db_session: Session
):
    """FirearmComplianceTag's model default is 'community'. Admin POST keeps
    that default — only member POST overrides to 'user'."""
    _login(client, admin_user.email, "AdminPass1!")
    r = client.post(
        "/firearm-compliance-tags",
        json={"name": "Federal-2026 Restricted"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["source"] == "community"


# ---------------------------------------------------------------------------
# PATCH / DELETE stay admin-only — verify member is still blocked
# ---------------------------------------------------------------------------

def test_member_cannot_patch_lookup_via_generic_endpoint(
    client: TestClient, db_session: Session, member: User
):
    c = Caliber(name="9mm Luger")
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)

    _login(client, member.email, "MemberPass1!")
    r = client.patch(f"/lookups/calibers/{c.id}", json={"name": "9 Luger"})
    assert r.status_code == 403


def test_member_cannot_delete_dealer(
    client: TestClient, db_session: Session, member: User
):
    d = Dealer(name="DoomedDealer", source="user")
    db_session.add(d)
    db_session.commit()
    db_session.refresh(d)

    _login(client, member.email, "MemberPass1!")
    r = client.delete(f"/lookups/dealers/{d.id}")
    assert r.status_code == 403


def test_member_cannot_patch_firearm_action_type(
    client: TestClient, db_session: Session, member: User
):
    a = FirearmActionType(name="bolt-action")
    db_session.add(a)
    db_session.commit()
    db_session.refresh(a)
    _login(client, member.email, "MemberPass1!")
    r = client.patch(f"/firearm-action-types/{a.id}", json={"name": "BoltAction"})
    assert r.status_code == 403


def test_member_cannot_patch_manufacturer_types(
    client: TestClient, db_session: Session, member: User
):
    m = Manufacturer(name="Sig Sauer", types='["ammo"]')
    db_session.add(m)
    db_session.commit()
    db_session.refresh(m)
    _login(client, member.email, "MemberPass1!")
    r = client.patch(
        f"/manufacturers/{m.id}/types",
        json={"types": '["ammo","firearm"]'},
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Manufacturer types PATCH (admin) — regression guard for the union flow
# ---------------------------------------------------------------------------

def test_admin_can_union_manufacturer_types(
    client: TestClient, db_session: Session, admin_user: User
):
    import json as _json

    m = Manufacturer(name="Federal", types='["ammo"]')
    db_session.add(m)
    db_session.commit()
    db_session.refresh(m)

    _login(client, admin_user.email, "AdminPass1!")
    r = client.patch(
        f"/manufacturers/{m.id}/types",
        json={"types": '["ammo","firearm"]'},
    )
    assert r.status_code == 200, r.text
    parsed = _json.loads(r.json()["types"])
    assert sorted(parsed) == ["ammo", "firearm"]


# ---------------------------------------------------------------------------
# Duplicate names — even members hit the same 409 path
# ---------------------------------------------------------------------------

def test_member_create_duplicate_caliber_returns_409(
    client: TestClient, db_session: Session, member: User
):
    db_session.add(Caliber(name="9mm Luger"))
    db_session.commit()

    _login(client, member.email, "MemberPass1!")
    r = client.post("/calibers", json={"name": "9mm Luger"})
    assert r.status_code == 409


# Touch other lookup classes so the imports are exercised — silences the
# linter and keeps the test file scope-honest.
_ = (
    AmmoCondition,
    AmmoType,
    Category,
    FirearmComplianceTag,
    FirearmFinish,
    FirearmFrameSize,
    FirearmModel,
    FirearmOpticCut,
    FirearmRailType,
)
