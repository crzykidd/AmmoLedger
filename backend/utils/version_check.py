from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlmodel import Session

from utils.config import get_setting, set_setting
from utils.logging import get_logger
from version import __version__, get_build_info

logger = get_logger(__name__)

GITHUB_API_URL = "https://api.github.com/repos/crzykidd/AmmoLedger"
DEV_BRANCH = "dev"
CHECK_TTL_HOURS = 24


def version_gt(a: str, b: str) -> bool:
    """Return True if version a is strictly greater than version b."""
    try:
        def parse(v: str):
            return tuple(int(x) for x in v.lstrip("v").split(".")[:3])
        return parse(a) > parse(b)
    except Exception:
        return False


def _within_ttl(last_checked_str: Optional[str]) -> bool:
    if not last_checked_str:
        return False
    try:
        last_checked = datetime.fromisoformat(last_checked_str)
        if last_checked.tzinfo is None:
            last_checked = last_checked.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - last_checked) < timedelta(hours=CHECK_TTL_HOURS)
    except ValueError:
        return False


def check_release_version(db: Session, force: bool = False) -> dict:
    """Compare __version__ against /releases/latest. Updates app_settings."""
    if not force and _within_ttl(get_setting(db, "version_last_checked")):
        return {"skipped": True, "reason": "within_ttl"}

    latest = None
    update_available = False
    try:
        resp = httpx.get(
            f"{GITHUB_API_URL}/releases/latest",
            timeout=5.0,
            headers={"Accept": "application/vnd.github+json", "User-Agent": "AmmoLedger"},
        )
        if resp.status_code == 200:
            data = resp.json()
            latest = (data.get("tag_name") or "").lstrip("v") or None
            if latest:
                update_available = version_gt(latest, __version__)
    except Exception as exc:
        logger.warning("GitHub release check failed: %s", exc)

    if latest:
        set_setting(db, "latest_version", latest)
        set_setting(db, "update_available", "true" if update_available else "false")
    set_setting(db, "version_last_checked", datetime.now(timezone.utc).isoformat())
    db.commit()
    return {"latest": latest, "update_available": update_available}


def check_dev_branch(db: Session, force: bool = False) -> dict:
    """Compare GIT_SHA against tip of dev branch. Updates app_settings."""
    build = get_build_info()
    if not build["is_dev"]:
        return {"skipped": True, "reason": "not_dev_build"}

    git_sha = build["full_sha"]
    if not git_sha or git_sha == "unknown":
        return {"skipped": True, "reason": "no_git_sha"}

    if not force and _within_ttl(get_setting(db, "dev_check_last_at")):
        return {"skipped": True, "reason": "within_ttl"}

    behind_by = None
    latest_sha = None
    latest_message = None
    try:
        resp = httpx.get(
            f"{GITHUB_API_URL}/compare/{git_sha}...{DEV_BRANCH}",
            timeout=5.0,
            headers={"Accept": "application/vnd.github+json", "User-Agent": "AmmoLedger"},
        )
        if resp.status_code == 200:
            data = resp.json()
            behind_by = int(data.get("behind_by") or 0)
            commits = data.get("commits") or []
            if commits:
                tip = commits[-1]
                latest_sha = tip.get("sha") or None
                msg = ((tip.get("commit") or {}).get("message") or "").splitlines()[0]
                latest_message = msg[:120] if msg else None
            elif behind_by == 0:
                latest_sha = git_sha
                latest_message = None
        else:
            logger.warning(
                "GitHub compare returned %s for %s...%s",
                resp.status_code, git_sha[:7], DEV_BRANCH,
            )
    except Exception as exc:
        logger.warning("GitHub dev compare failed: %s", exc)

    if behind_by is not None:
        set_setting(db, "dev_behind_by", str(behind_by))
        set_setting(db, "dev_latest_sha", latest_sha or "")
        set_setting(db, "dev_latest_message", latest_message or "")
    set_setting(db, "dev_check_last_at", datetime.now(timezone.utc).isoformat())
    db.commit()
    return {
        "behind_by": behind_by,
        "latest_sha": latest_sha,
        "latest_message": latest_message,
    }


def run_full_check(db: Session, force: bool = False) -> dict:
    """Run both release and dev checks. Returns a combined stats dict for task history."""
    release_result = check_release_version(db, force=force)
    dev_result = check_dev_branch(db, force=force)
    return {"release": release_result, "dev": dev_result}
