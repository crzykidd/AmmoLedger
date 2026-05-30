"""Tests for the configurable app timezone (issue #43).

`app.timezone` (env `AL_TIMEZONE`) governs how daily scheduled-task and backup
times are interpreted and how times are labelled in the admin UI.
"""

from utils.config import _is_valid_timezone, get_app_timezone, validate_config


# ---------------------------------------------------------------------------
# Resolution
# ---------------------------------------------------------------------------

def test_default_is_utc_when_unset(monkeypatch):
    monkeypatch.delenv("TZ", raising=False)
    assert get_app_timezone({}) == "UTC"
    assert get_app_timezone({"app": {}}) == "UTC"


def test_configured_value_wins():
    assert get_app_timezone({"app": {"timezone": "America/Chicago"}}) == "America/Chicago"


def test_falls_back_to_tz_env(monkeypatch):
    monkeypatch.setenv("TZ", "Europe/London")
    assert get_app_timezone({}) == "Europe/London"
    # explicit config still wins over the TZ env var
    assert get_app_timezone({"app": {"timezone": "America/Denver"}}) == "America/Denver"


def test_invalid_value_falls_back_to_utc(monkeypatch):
    monkeypatch.delenv("TZ", raising=False)
    assert get_app_timezone({"app": {"timezone": "Not/ARealZone"}}) == "UTC"
    assert get_app_timezone({"app": {"timezone": ""}}) == "UTC"


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def test_validity_helper():
    assert _is_valid_timezone("UTC")
    assert _is_valid_timezone("America/Chicago")
    assert not _is_valid_timezone("Bogus/Zone")


def _base_cfg(tz: str) -> dict:
    return {
        "app": {"session_timeout_hours": 8, "timezone": tz},
        "security": {"session_secret": "x" * 32},
    }


def test_validate_config_rejects_bad_timezone():
    result = validate_config(_base_cfg("Not/AZone"))
    assert any("app.timezone" in e for e in result["errors"])


def test_validate_config_accepts_good_timezone():
    result = validate_config(_base_cfg("America/New_York"))
    assert not any("app.timezone" in e for e in result["errors"])
