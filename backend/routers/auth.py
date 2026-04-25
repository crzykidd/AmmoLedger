from datetime import datetime
from typing import Any, Optional

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
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/setup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def setup(body: SetupRequest, request: Request, db: Session = Depends(get_session)):
    """First-run only. Creates the initial admin account. Returns 409 if any users already exist."""
    if db.exec(select(User)).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Setup already complete")

    user = User(
        username=body.username,
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

    return UserResponse(id=user.id, username=user.username, role=user.role, is_active=user.is_active)


@router.post("/login", response_model=UserResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_session)):
    """Validate credentials and create a session cookie."""
    user = db.exec(select(User).where(User.username == body.username)).first()

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

    return UserResponse(id=user.id, username=user.username, role=user.role, is_active=user.is_active)


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

    return UserResponse(id=user.id, username=user.username, role=user.role, is_active=user.is_active)
