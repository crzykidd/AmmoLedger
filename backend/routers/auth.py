from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select
from starlette.requests import Request

from database import get_session
from models import User
from utils.security import hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class SetupRequest(BaseModel):
    email: str
    password: str
    first_name: str
    last_name: str


class LoginRequest(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    first_name: str
    last_name: str
    role: str
    is_active: bool


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email or user.username,  # fallback for rows created before email migration
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
        is_active=user.is_active,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/setup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def setup(body: SetupRequest, request: Request, db: Session = Depends(get_session)):
    """First-run only. Creates the initial admin account. Returns 409 if any users already exist."""
    if db.exec(select(User)).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Setup already complete")

    user = User(
        username=body.email,  # username = email to satisfy the legacy unique constraint
        email=body.email,
        first_name=body.first_name,
        last_name=body.last_name,
        password_hash=hash_password(body.password),
        role="admin",
        is_active=True,
        created_by=None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    request.session["user_id"] = user.id
    request.session["role"] = user.role

    return _user_response(user)


@router.post("/login", response_model=UserResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_session)):
    """Validate credentials and create a session cookie."""
    user = db.exec(select(User).where(User.email == body.email)).first()

    # Constant-time failure path — always verify even on miss to avoid timing attacks
    dummy_hash = "$2b$12$KIXBcOnfQjSal7uHuV5yj.LnBjZQkXZv5cFwX5bQ9vBzFJpQHBnHG"
    if not user:
        verify_password(body.password, dummy_hash)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")

    request.session["user_id"] = user.id
    request.session["role"] = user.role

    user.last_login_at = datetime.utcnow()
    db.add(user)
    db.commit()
    db.refresh(user)

    return _user_response(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request):
    """Clear the session cookie."""
    request.session.clear()


@router.get("/me")
def me(request: Request, db: Session = Depends(get_session)) -> Any:
    """Return current user info. Returns {first_run: true} if no users exist yet."""
    if not db.exec(select(User)).first():
        return {"first_run": True}

    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    return _user_response(user)
