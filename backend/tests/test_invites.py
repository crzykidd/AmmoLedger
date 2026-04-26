"""Integration tests for invitation creation and validation."""
from fastapi.testclient import TestClient


def test_create_invite_requires_admin(client: TestClient, admin_user):
    r = client.post("/auth/invite", json={"role": "member", "expires_hours": 48})
    assert r.status_code == 401  # no session


def test_create_invite_as_admin(authed_client: TestClient):
    r = authed_client.post("/auth/invite", json={"role": "member", "expires_hours": 24})
    assert r.status_code == 201
    data = r.json()
    assert data["role"] == "member"
    assert data["status"] == "valid"
    assert data["invite_url"] is not None
    assert data["token"] in data["invite_url"]


def test_create_invite_invalid_role(authed_client: TestClient):
    r = authed_client.post("/auth/invite", json={"role": "superuser", "expires_hours": 24})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "INVALID_ROLE"


def test_list_invites(authed_client: TestClient):
    authed_client.post("/auth/invite", json={"role": "member"})
    authed_client.post("/auth/invite", json={"role": "read_only"})
    r = authed_client.get("/auth/invites")
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_get_invite_valid(authed_client: TestClient):
    create = authed_client.post("/auth/invite", json={"role": "member", "email_hint": "bob@example.com"})
    token = create.json()["token"]
    r = authed_client.get(f"/auth/invite/{token}")
    assert r.status_code == 200
    assert r.json()["role"] == "member"
    assert r.json()["email_hint"] == "bob@example.com"


def test_get_invite_not_found(authed_client: TestClient):
    r = authed_client.get("/auth/invite/nonexistent-token")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "INVITE_INVALID"


def test_revoke_invite(authed_client: TestClient):
    create = authed_client.post("/auth/invite", json={"role": "member"})
    token = create.json()["token"]
    r = authed_client.delete(f"/auth/invite/{token}")
    assert r.status_code == 200
    r2 = authed_client.get(f"/auth/invite/{token}")
    assert r2.status_code == 410
    assert r2.json()["detail"]["code"] == "INVITE_REVOKED"


def test_register_with_valid_invite(authed_client: TestClient, client: TestClient):
    create = authed_client.post("/auth/invite", json={"role": "member"})
    token = create.json()["token"]
    r = client.post("/auth/register", json={
        "token": token,
        "first_name": "Bob",
        "last_name": "Smith",
        "email": "bob@example.com",
        "password": "SecurePass1!",
        "confirm_password": "SecurePass1!",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["email"] == "bob@example.com"
    assert data["role"] == "member"


def test_register_used_invite_rejected(authed_client: TestClient, client: TestClient):
    create = authed_client.post("/auth/invite", json={"role": "member"})
    token = create.json()["token"]
    client.post("/auth/register", json={
        "token": token,
        "first_name": "Bob",
        "last_name": "Smith",
        "email": "bob@example.com",
        "password": "SecurePass1!",
        "confirm_password": "SecurePass1!",
    })
    r = client.post("/auth/register", json={
        "token": token,
        "first_name": "Eve",
        "last_name": "Hacker",
        "email": "eve@example.com",
        "password": "SecurePass1!",
        "confirm_password": "SecurePass1!",
    })
    assert r.status_code == 410
    assert r.json()["detail"]["code"] == "INVITE_USED"


def test_register_password_mismatch(authed_client: TestClient, client: TestClient):
    create = authed_client.post("/auth/invite", json={"role": "member"})
    token = create.json()["token"]
    r = client.post("/auth/register", json={
        "token": token,
        "first_name": "Bob",
        "last_name": "Smith",
        "email": "bob@example.com",
        "password": "SecurePass1!",
        "confirm_password": "Different1!",
    })
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "PASSWORD_MISMATCH"
