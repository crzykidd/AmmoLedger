"""Test configuration — in-memory SQLite, no startup events."""
import os
import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, Session, create_engine
from sqlmodel.pool import StaticPool

os.environ.setdefault("SESSION_SECRET", "test-secret")
os.environ.setdefault("DATABASE_URL", "sqlite://")

from database import get_session
from models import User
from utils.security import hash_password

TEST_ENGINE = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


def _get_test_session():
    with Session(TEST_ENGINE) as session:
        yield session


@pytest.fixture(scope="function", autouse=True)
def reset_db():
    SQLModel.metadata.create_all(TEST_ENGINE)
    yield
    SQLModel.metadata.drop_all(TEST_ENGINE)


@pytest.fixture
def client():
    from main import app
    app.dependency_overrides[get_session] = _get_test_session
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def db_session():
    with Session(TEST_ENGINE) as session:
        yield session


@pytest.fixture
def admin_user(db_session: Session) -> User:
    user = User(
        username="admin@test.com",
        email="admin@test.com",
        first_name="Admin",
        last_name="User",
        password_hash=hash_password("AdminPass1!"),
        role="admin",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def authed_client(client: TestClient, admin_user: User):
    """Client with an active admin session cookie."""
    r = client.post("/auth/login", json={"email": "admin@test.com", "password": "AdminPass1!"})
    assert r.status_code == 200
    return client
