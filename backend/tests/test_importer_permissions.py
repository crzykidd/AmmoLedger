"""Role-gate tests for the ammo CSV importer (issue #12).

`POST /import/validate` and `POST /import/confirm` must require admin or
member. Read-Only users are view-only and must be rejected with 403 before
any CSV is parsed or any data is written.
"""

import io

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from models import User
from utils.security import hash_password


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


_MINIMAL_CSV = (
    b"caliber,manufacturer,qty_original,qty_remaining\n"
    b"9mm Luger,Federal,50,50\n"
)


def _upload() -> dict:
    return {"file": ("import.csv", io.BytesIO(_MINIMAL_CSV), "text/csv")}


# ---------------------------------------------------------------------------
# Read-Only users are rejected
# ---------------------------------------------------------------------------

def test_readonly_cannot_validate_import(client: TestClient, readonly: User):
    _login(client, readonly.email, "MemberPass1!")
    r = client.post("/import/validate", files=_upload())
    assert r.status_code == 403, r.text


def test_readonly_cannot_confirm_import(client: TestClient, readonly: User):
    _login(client, readonly.email, "MemberPass1!")
    r = client.post(
        "/import/confirm",
        files=_upload(),
        data={"validation_token": "irrelevant", "is_shared": "true"},
    )
    assert r.status_code == 403, r.text


# ---------------------------------------------------------------------------
# Members are still allowed past the role gate (validate succeeds)
# ---------------------------------------------------------------------------

def test_member_can_validate_import(client: TestClient, member: User):
    _login(client, member.email, "MemberPass1!")
    r = client.post("/import/validate", files=_upload())
    assert r.status_code == 200, r.text
    assert r.json()["importable_rows"] == 1
