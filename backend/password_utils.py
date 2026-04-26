"""Password strength validation and history helpers."""

import re
from typing import Optional

from sqlmodel import Session, select


# Characters that satisfy the "special character" requirement
_SPECIAL_RE = re.compile(r"""[!@#$%^&*()\-_=+\[\]{}|;:'",.<>?/~]""")


def validate_password_strength(password: str, identifier: str = "") -> list[str]:
    """
    Validate password against the PRD §4.5 rules.

    Returns a list of human-readable error strings. Empty list = password is valid.
    The caller should also check identifier against email, first name, etc.
    """
    errors: list[str] = []

    if len(password) < 12:
        errors.append("Password must be at least 12 characters")
    if not re.search(r"[A-Z]", password):
        errors.append("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", password):
        errors.append("Password must contain at least one lowercase letter")
    if not re.search(r"\d", password):
        errors.append("Password must contain at least one digit")
    if not _SPECIAL_RE.search(password):
        errors.append("Password must contain at least one special character (!@#$%^&*…)")
    if identifier and identifier.lower() in password.lower():
        errors.append("Password must not contain your username or email")

    return errors


def check_password_history(
    user_id: int,
    new_password: str,
    db: Session,
    history_count: int = 5,
) -> bool:
    """
    Return True if new_password is safe (not found in recent history).
    Returns True unconditionally when history_count == 0 (feature disabled).
    """
    if history_count == 0:
        return True

    from models import PasswordHistory
    from utils.security import verify_password

    stmt = (
        select(PasswordHistory)
        .where(PasswordHistory.user_id == user_id)
        .order_by(PasswordHistory.created_at.desc())
        .limit(history_count)
    )
    recent = db.exec(stmt).all()

    for entry in recent:
        if verify_password(new_password, entry.password_hash):
            return False

    return True


def save_password_history(
    user_id: int,
    password_hash: str,
    db: Session,
    history_count: int = 5,
) -> None:
    """
    Persist password_hash to history, pruning entries older than history_count.
    Does NOT commit — caller is responsible.
    """
    from models import PasswordHistory

    if history_count > 0:
        # Prune oldest entries to keep room for the new one
        stmt = (
            select(PasswordHistory)
            .where(PasswordHistory.user_id == user_id)
            .order_by(PasswordHistory.created_at.desc())
        )
        existing = db.exec(stmt).all()
        for old in existing[history_count - 1:]:
            db.delete(old)

    db.add(PasswordHistory(user_id=user_id, password_hash=password_hash))
