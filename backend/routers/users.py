from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from database import get_session
from models import User
from password_utils import (
    check_password_history,
    save_password_history,
    validate_password_strength,
)
from schemas import ChangePasswordRequest, PasswordResetRequest, UserRead, UserUpdate
from utils.rbac import require_auth, require_role
from utils.security import hash_password, verify_password

router = APIRouter(prefix="/users", tags=["users"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _api_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"error": True, "code": code, "message": message},
    )


def _user_read(user: User) -> UserRead:
    return UserRead(
        id=user.id,
        email=user.email or user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
        is_active=user.is_active,
        must_change_password=getattr(user, "must_change_password", False),
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", response_model=list[UserRead])
def list_users(
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    """Admin only — list all users."""
    users = db.exec(select(User).order_by(User.created_at)).all()
    return [_user_read(u) for u in users]


@router.post("/me/change-password")
def change_own_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    """Any authenticated user — change their own password."""
    if payload.new_password != payload.confirm_password:
        raise _api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "PASSWORD_MISMATCH",
            "New passwords do not match",
        )

    if not verify_password(payload.current_password, current_user.password_hash):
        raise _api_error(
            status.HTTP_401_UNAUTHORIZED,
            "INVALID_PASSWORD",
            "Current password is incorrect",
        )

    errors = validate_password_strength(
        payload.new_password,
        identifier=current_user.email or current_user.username,
    )
    if errors:
        raise _api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "PASSWORD_TOO_WEAK",
            "; ".join(errors),
        )

    if not check_password_history(current_user.id, payload.new_password, db):
        raise _api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "PASSWORD_HISTORY",
            "Password was used recently — choose a different one",
        )

    new_hash = hash_password(payload.new_password)
    save_password_history(current_user.id, new_hash, db)
    current_user.password_hash = new_hash
    current_user.must_change_password = False
    db.add(current_user)
    db.commit()

    return {"message": "Password changed successfully"}


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    payload: UserUpdate,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    """Admin only — update a user's role or active status."""
    if user_id == current_user.id:
        raise _api_error(
            status.HTTP_403_FORBIDDEN,
            "CANNOT_MODIFY_SELF",
            "You cannot change your own role or active status",
        )

    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if payload.role is not None:
        if payload.role not in ("admin", "member", "read_only"):
            raise _api_error(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "INVALID_ROLE",
                f"Invalid role '{payload.role}'. Must be admin, member, or read_only",
            )
        target.role = payload.role
    if payload.is_active is not None:
        target.is_active = payload.is_active

    db.add(target)
    db.commit()
    db.refresh(target)
    return _user_read(target)


@router.post("/{user_id}/reset-password")
def admin_reset_password(
    user_id: int,
    payload: PasswordResetRequest,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    """Admin only — force-reset any user's password and flag must_change_password."""
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    errors = validate_password_strength(
        payload.new_password,
        identifier=target.email or target.username,
    )
    if errors:
        raise _api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "PASSWORD_TOO_WEAK",
            "; ".join(errors),
        )

    if not check_password_history(target.id, payload.new_password, db):
        raise _api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "PASSWORD_HISTORY",
            "Password was used recently — choose a different one",
        )

    new_hash = hash_password(payload.new_password)
    save_password_history(target.id, new_hash, db)
    target.password_hash = new_hash
    target.must_change_password = True
    db.add(target)
    db.commit()

    return {"message": "Password reset successfully"}
