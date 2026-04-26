import os
import uuid
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select
from starlette.requests import Request

from database import get_session
from models import Invitation, User
from password_utils import (
    save_password_history,
    validate_password_strength,
)
from schemas import InvitationCreate, InviteRead, RegisterRequest
from utils.rbac import require_role
from utils.security import hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:5173")


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
    must_change_password: bool = False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email or user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
        is_active=user.is_active,
        must_change_password=getattr(user, "must_change_password", False),
    )


def _api_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"error": True, "code": code, "message": message},
    )


def _invite_status(invite: Invitation) -> str:
    if invite.is_revoked:
        return "revoked"
    if invite.used_at is not None:
        return "used"
    if invite.expires_at < datetime.utcnow():
        return "expired"
    return "valid"


def _make_invite_read(invite: Invitation, include_url: bool = False) -> InviteRead:
    st = _invite_status(invite)
    return InviteRead(
        id=invite.id,
        token=invite.token,
        created_by=invite.created_by,
        created_at=invite.created_at,
        expires_at=invite.expires_at,
        used_at=invite.used_at,
        used_by=invite.used_by,
        role=invite.role,
        email_hint=invite.email_hint,
        is_revoked=invite.is_revoked,
        status=st,
        invite_url=f"{BASE_URL}/register?token={invite.token}" if include_url and st == "valid" else None,
    )


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

@router.post("/setup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def setup(body: SetupRequest, request: Request, db: Session = Depends(get_session)):
    """First-run only. Creates the initial admin account. Returns 409 if any users already exist."""
    if db.exec(select(User)).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Setup already complete")

    password_errors = validate_password_strength(body.password, identifier=body.email)
    if password_errors:
        raise _api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "PASSWORD_TOO_WEAK",
            "; ".join(password_errors),
        )

    user = User(
        username=body.email,
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


# ---------------------------------------------------------------------------
# Invitation routes
# ---------------------------------------------------------------------------

@router.post("/invite", response_model=InviteRead, status_code=status.HTTP_201_CREATED)
def create_invite(
    body: InvitationCreate,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    """Admin only — generate an invitation token."""
    if body.role not in ("admin", "member", "read_only"):
        raise _api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "INVALID_ROLE",
            f"Invalid role '{body.role}'. Must be admin, member, or read_only",
        )

    now = datetime.utcnow()
    invite = Invitation(
        token=str(uuid.uuid4()),
        created_by=current_user.id,
        created_at=now,
        expires_at=now + timedelta(hours=body.expires_hours),
        role=body.role,
        email_hint=body.email_hint,
        is_revoked=False,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return _make_invite_read(invite, include_url=True)


@router.get("/invites", response_model=list[InviteRead])
def list_invites(
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    """Admin only — list all invitations sorted by created_at desc."""
    invites = db.exec(select(Invitation).order_by(Invitation.created_at.desc())).all()
    return [_make_invite_read(i) for i in invites]


@router.get("/invite/{token}")
def get_invite(token: str, db: Session = Depends(get_session)):
    """Public — validate a token and return role/email_hint if valid."""
    invite = db.exec(select(Invitation).where(Invitation.token == token)).first()

    if not invite:
        raise _api_error(status.HTTP_404_NOT_FOUND, "INVITE_INVALID", "Invitation not found")
    if invite.is_revoked:
        raise _api_error(status.HTTP_410_GONE, "INVITE_REVOKED", "Invitation has been revoked")
    if invite.used_at is not None:
        raise _api_error(status.HTTP_410_GONE, "INVITE_USED", "Invitation has already been used")
    if invite.expires_at < datetime.utcnow():
        raise _api_error(status.HTTP_410_GONE, "INVITE_EXPIRED", "Invitation has expired")

    return {"role": invite.role, "email_hint": invite.email_hint}


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, request: Request, db: Session = Depends(get_session)):
    """Public — create an account from a valid invitation token."""
    invite = db.exec(select(Invitation).where(Invitation.token == body.token)).first()

    if not invite:
        raise _api_error(status.HTTP_404_NOT_FOUND, "INVITE_INVALID", "Invitation not found")
    if invite.is_revoked:
        raise _api_error(status.HTTP_410_GONE, "INVITE_REVOKED", "Invitation has been revoked")
    if invite.used_at is not None:
        raise _api_error(status.HTTP_410_GONE, "INVITE_USED", "Invitation has already been used")
    if invite.expires_at < datetime.utcnow():
        raise _api_error(status.HTTP_410_GONE, "INVITE_EXPIRED", "Invitation has expired")

    if body.password != body.confirm_password:
        raise _api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "PASSWORD_MISMATCH",
            "Passwords do not match",
        )

    password_errors = validate_password_strength(body.password, identifier=body.email)
    if password_errors:
        raise _api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "PASSWORD_TOO_WEAK",
            "; ".join(password_errors),
        )

    existing = db.exec(select(User).where(User.email == body.email)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    password_hash = hash_password(body.password)

    user = User(
        username=body.email,
        email=body.email,
        first_name=body.first_name,
        last_name=body.last_name,
        password_hash=password_hash,
        role=invite.role,
        is_active=True,
        created_by=invite.created_by,
    )
    db.add(user)
    db.flush()  # get user.id before referencing it below

    save_password_history(user.id, password_hash, db)

    now = datetime.utcnow()
    invite.used_at = now
    invite.used_by = user.id
    db.add(invite)

    db.commit()
    db.refresh(user)

    request.session["user_id"] = user.id
    request.session["role"] = user.role

    return _user_response(user)


@router.delete("/invite/{token}", status_code=status.HTTP_200_OK)
def revoke_invite(
    token: str,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    """Admin only — revoke an invitation."""
    invite = db.exec(select(Invitation).where(Invitation.token == token)).first()

    if not invite:
        raise _api_error(status.HTTP_404_NOT_FOUND, "INVITE_INVALID", "Invitation not found")

    invite.is_revoked = True
    db.add(invite)
    db.commit()

    return {"message": "Invitation revoked"}
