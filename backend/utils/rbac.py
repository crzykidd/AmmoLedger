from fastapi import Depends, HTTPException, status
from starlette.requests import Request
from sqlmodel import Session

from database import get_session
from models import User

# Endpoints that must remain accessible while must_change_password is True so the
# user can complete the forced-reset flow without being locked out entirely.
_MUST_CHANGE_PASSWORD_WHITELIST = frozenset(
    [
        "/users/me/change-password",  # POST — the actual password-change action
        "/auth/me",                   # GET  — AuthContext polls this to refresh the flag
        "/auth/logout",               # POST — always allow the user to log out
    ]
)


def require_auth(request: Request, db: Session = Depends(get_session)) -> User:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    # Enforce server-side that users with a forced-reset flag can only reach the
    # minimal set of endpoints needed to complete the password change.
    if getattr(user, "must_change_password", False):
        if request.url.path not in _MUST_CHANGE_PASSWORD_WHITELIST:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": True,
                    "code": "MUST_CHANGE_PASSWORD",
                    "message": "You must change your password before continuing.",
                },
            )
    return user


def require_role(*roles: str):
    """Dependency factory — usage: Depends(require_role("admin", "member"))"""
    def dependency(user: User = Depends(require_auth)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user
    return dependency
