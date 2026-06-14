from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from ._base import _OrmBase

__all__ = [
    "UserRead",
    "UserUpdate",
    "RegisterRequest",
    "PasswordResetRequest",
    "ChangePasswordRequest",
    "InvitationCreate",
    "InvitationRead",
    "InviteRead",
]


class UserRead(_OrmBase):
    id: int
    email: str
    first_name: str
    last_name: str
    role: str
    is_active: bool
    must_change_password: bool
    created_at: datetime
    last_login_at: Optional[datetime]


class UserUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None


class RegisterRequest(BaseModel):
    token: str
    first_name: str
    last_name: str
    email: str
    password: str
    confirm_password: str


class PasswordResetRequest(BaseModel):
    new_password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str


class InvitationCreate(BaseModel):
    role: str  # admin | member | readonly
    email_hint: Optional[str] = None
    expires_hours: int = 72


class InvitationRead(_OrmBase):
    id: int
    token: str
    created_by: int
    created_at: datetime
    expires_at: datetime
    used_at: Optional[datetime]
    used_by: Optional[int]
    role: str
    email_hint: Optional[str]
    is_revoked: bool


class InviteRead(BaseModel):
    """InvitationRead with computed status and invite_url."""
    id: int
    token: str
    created_by: int
    created_at: datetime
    expires_at: datetime
    used_at: Optional[datetime]
    used_by: Optional[int]
    role: str
    email_hint: Optional[str]
    is_revoked: bool
    status: str          # valid | expired | used | revoked
    invite_url: Optional[str] = None
