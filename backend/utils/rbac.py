from fastapi import Depends, HTTPException, status
from starlette.requests import Request
from sqlmodel import Session

from database import get_session
from models import User


def require_auth(request: Request, db: Session = Depends(get_session)) -> User:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


def require_role(*roles: str):
    """Dependency factory — usage: Depends(require_role("admin", "member"))"""
    def dependency(user: User = Depends(require_auth)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user
    return dependency
