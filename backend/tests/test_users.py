"""Integration tests for user management endpoints."""
from fastapi.testclient import TestClient
from sqlmodel import Session

from models import User
from utils.security import hash_password


def _make_user(db: Session, email: str, role: str = "member") -> User:
    user = User(
        username=email,
        email=email,
        first_name="Test",
        last_name="User",
        password_hash=hash_password("MemberPass1!"),
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_list_users_admin_only(client: TestClient, admin_user: User):
    r = client.get("/users")
    assert r.status_code == 401


def test_list_users(authed_client: TestClient):
    r = authed_client.get("/users")
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_update_user_role(authed_client: TestClient, db_session: Session):
    target = _make_user(db_session, "target@test.com", role="member")
    r = authed_client.patch(f"/users/{target.id}", json={"role": "read_only"})
    assert r.status_code == 200
    assert r.json()["role"] == "read_only"


def test_update_user_invalid_role(authed_client: TestClient, db_session: Session):
    target = _make_user(db_session, "target2@test.com")
    r = authed_client.patch(f"/users/{target.id}", json={"role": "superuser"})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "INVALID_ROLE"


def test_cannot_modify_self(authed_client: TestClient, admin_user: User):
    r = authed_client.patch(f"/users/{admin_user.id}", json={"role": "member"})
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "CANNOT_MODIFY_SELF"


def test_deactivate_user(authed_client: TestClient, db_session: Session):
    target = _make_user(db_session, "active@test.com")
    r = authed_client.patch(f"/users/{target.id}", json={"is_active": False})
    assert r.status_code == 200
    assert r.json()["is_active"] is False


def test_admin_reset_password(authed_client: TestClient, db_session: Session):
    target = _make_user(db_session, "reset@test.com")
    r = authed_client.post(f"/users/{target.id}/reset-password", json={"new_password": "NewSecurePass1!"})
    assert r.status_code == 200
    db_session.refresh(target)
    assert target.must_change_password is True


def test_admin_reset_weak_password(authed_client: TestClient, db_session: Session):
    target = _make_user(db_session, "weak@test.com")
    r = authed_client.post(f"/users/{target.id}/reset-password", json={"new_password": "weak"})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "PASSWORD_TOO_WEAK"


def test_change_own_password(authed_client: TestClient):
    r = authed_client.post("/users/me/change-password", json={
        "current_password": "AdminPass1!",
        "new_password": "NewAdminPass2@",
        "confirm_password": "NewAdminPass2@",
    })
    assert r.status_code == 200


def test_change_own_password_wrong_current(authed_client: TestClient):
    r = authed_client.post("/users/me/change-password", json={
        "current_password": "WrongPassword1!",
        "new_password": "NewAdminPass2@",
        "confirm_password": "NewAdminPass2@",
    })
    assert r.status_code == 401
    assert r.json()["detail"]["code"] == "INVALID_PASSWORD"


def test_change_own_password_mismatch(authed_client: TestClient):
    r = authed_client.post("/users/me/change-password", json={
        "current_password": "AdminPass1!",
        "new_password": "NewAdminPass2@",
        "confirm_password": "DifferentPass2@",
    })
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "PASSWORD_MISMATCH"
