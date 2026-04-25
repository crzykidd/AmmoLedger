import os
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional

import yaml

CONFIG_PATH = os.getenv("CONFIG_PATH", "/data/config.yaml")
DEFAULTS_PATH = os.getenv("DEFAULTS_PATH", "/data/defaults.yaml")
BACKUP_PATH = os.getenv("BACKUP_PATH", "/data/backups")
UPLOADS_PATH = os.getenv("UPLOADS_PATH", "/data/uploads")

_BUNDLED_DEFAULTS = Path(__file__).parent.parent / "defaults.yaml"
_BUNDLED_TEMPLATE = Path(__file__).parent.parent / "config.template.yaml"

_DEFAULT_SECRET = "change-this-to-a-random-string"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def ensure_data_dirs() -> None:
    Path(BACKUP_PATH).mkdir(parents=True, exist_ok=True)
    Path(UPLOADS_PATH).mkdir(parents=True, exist_ok=True)


def _ensure_defaults_yaml() -> None:
    dest = Path(DEFAULTS_PATH)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        shutil.copy2(_BUNDLED_DEFAULTS, dest)


def get_setting(session, key: str) -> Optional[str]:
    from sqlmodel import select
    from models import AppSettings
    row = session.exec(select(AppSettings).where(AppSettings.key == key)).first()
    return row.value if row else None


def set_setting(session, key: str, value: str) -> None:
    from sqlmodel import select
    from models import AppSettings
    row = session.exec(select(AppSettings).where(AppSettings.key == key)).first()
    now = datetime.utcnow()
    if row:
        row.value = value
        row.updated_at = now
        session.add(row)
    else:
        session.add(AppSettings(key=key, value=value, updated_at=now))


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_config(config: dict) -> dict:
    """
    Validate the parsed config dict.  All checks run before returning so the
    operator sees every problem at once rather than fixing one error at a time.

    Returns {"valid": bool, "errors": [...], "warnings": [...]}.
    """
    errors: list[str] = []
    warnings: list[str] = []

    def _get(*keys):
        val = config
        for key in keys:
            if not isinstance(val, dict):
                return None
            val = val.get(key)
        return val

    def _is_int(val) -> bool:
        return isinstance(val, int) and not isinstance(val, bool)

    # --- Presence checks ---
    for keys in [
        ("security", "session_secret"),
        ("app", "session_timeout_hours"),
        ("backup", "enabled"),
        ("backup", "schedule"),
        ("backup", "retention_days"),
    ]:
        if _get(*keys) is None:
            errors.append(f"[{'.'.join(keys)}] required field is missing")

    # --- Type checks ---
    def _check_type(keys, predicate, type_name, condition=True):
        if not condition:
            return
        val = _get(*keys)
        if val is not None and not predicate(val):
            errors.append(
                f"[{'.'.join(keys)}] must be {type_name} (got {type(val).__name__})"
            )

    smtp_enabled = _get("smtp", "enabled") is True

    _check_type(("backup", "retention_days"), _is_int, "integer")
    _check_type(("app", "session_timeout_hours"), _is_int, "integer")
    _check_type(("backup", "enabled"), lambda v: isinstance(v, bool), "boolean")
    _check_type(("import", "require_backup"), lambda v: isinstance(v, bool), "boolean")
    _check_type(("import", "backup_warning_hours"), _is_int, "integer")
    _check_type(("import", "backup_block_hours"), _is_int, "integer")
    _check_type(("smtp", "port"), _is_int, "integer", condition=smtp_enabled)

    # --- Value checks ---
    secret = _get("security", "session_secret")
    if secret is not None and len(str(secret)) < 32:
        errors.append(
            "[security.session_secret] must be at least 32 characters — "
            "generate one with: openssl rand -hex 32"
        )

    schedule = _get("backup", "schedule")
    if schedule is not None and not re.match(r"^\d{2}:\d{2}$", str(schedule)):
        errors.append("[backup.schedule] must be HH:MM 24-hour format (e.g. '03:00')")

    retention = _get("backup", "retention_days")
    if _is_int(retention) and not (1 <= retention <= 365):
        errors.append("[backup.retention_days] must be between 1 and 365")

    timeout = _get("app", "session_timeout_hours")
    if _is_int(timeout) and not (1 <= timeout <= 720):
        errors.append("[app.session_timeout_hours] must be between 1 and 720")

    warn_hours = _get("import", "backup_warning_hours")
    block_hours = _get("import", "backup_block_hours")
    if _is_int(warn_hours) and _is_int(block_hours) and block_hours < warn_hours:
        errors.append(
            "[import.backup_block_hours] must be >= import.backup_warning_hours"
        )

    smtp_port = _get("smtp", "port")
    if smtp_enabled and _is_int(smtp_port) and not (1 <= smtp_port <= 65535):
        errors.append("[smtp.port] must be between 1 and 65535")

    # --- Warning checks ---
    env = str(_get("app", "env") or "development")

    if secret is not None and str(secret) == _DEFAULT_SECRET:
        if env == "production":
            errors.append(
                "[security.session_secret] must not be the default value in production — "
                "generate a random secret: openssl rand -hex 32"
            )
        else:
            warnings.append(
                "[security.session_secret] is the default value — "
                "change it before deploying to production"
            )

    if smtp_enabled and not _get("smtp", "host"):
        warnings.append(
            "[smtp] enabled is true but smtp.host is empty — "
            "email features will not work until a host is configured"
        )

    if _get("backup", "enabled") is False:
        warnings.append("[backup.enabled] is false — nightly backups are disabled")

    base_url = _get("app", "base_url")
    if base_url and "localhost" in str(base_url):
        warnings.append(
            "[app.base_url] contains 'localhost' — "
            "QR codes on printed labels will not resolve from external devices"
        )

    return {"valid": len(errors) == 0, "errors": errors, "warnings": warnings}


# ---------------------------------------------------------------------------
# Startup entry point
# ---------------------------------------------------------------------------

def load_and_validate_config() -> dict:
    """
    Load, validate, and return config.yaml.

    - Missing config: copies the bundled template, prints setup instructions,
      and exits with code 1 so the operator edits it before restarting.
    - YAML syntax error: prints the line number and exits with code 1.
    - Validation errors in production (app.env='production'): exits with code 1.
    - Validation errors in development: logs them as warnings and continues.
    - Validation warnings: always logged; never block startup.

    Also ensures defaults.yaml is in place for the seeds step that follows.
    """
    config_path = Path(CONFIG_PATH)

    # Step 1 — Config file must exist
    if not config_path.exists():
        config_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(_BUNDLED_TEMPLATE, config_path)
        print("\n" + "=" * 64)
        print("  AmmoLedger — first-time setup required")
        print("=" * 64)
        print(f"\n  A default config has been written to:\n    {config_path}\n")
        print("  Before restarting you MUST set a secret session key:")
        print()
        print("    Linux / macOS:")
        print("      openssl rand -hex 32")
        print()
        print("    Windows PowerShell:")
        print('      python -c "import secrets; print(secrets.token_hex(32))"')
        print()
        print("  Paste the output as the value of security.session_secret")
        print("  in config.yaml, then restart the container.")
        print("=" * 64 + "\n")
        raise SystemExit(1)

    # Step 2 — Parse YAML
    try:
        with open(config_path) as f:
            config = yaml.safe_load(f) or {}
    except yaml.YAMLError as exc:
        mark = getattr(exc, "problem_mark", None)
        location = f" (line {mark.line + 1})" if mark else ""
        problem = getattr(exc, "problem", str(exc))
        print(f"\nERROR: config.yaml has a YAML syntax error{location}: {problem}")
        print("Fix the syntax and restart.\n")
        raise SystemExit(1)

    # Ensure defaults.yaml is available for the seeds step
    _ensure_defaults_yaml()

    # Step 3 — Validate
    result = validate_config(config)
    env = str((config.get("app") or {}).get("env", "development"))

    for w in result["warnings"]:
        print(f"WARNING: {w}")

    if result["errors"]:
        for e in result["errors"]:
            print(f"ERROR:   {e}")

        if env == "production":
            print("\nconfig.yaml has errors. Fix them and restart the container.\n")
            raise SystemExit(1)

        print(
            f"\nconfig.yaml has {len(result['errors'])} error(s) — "
            "running in development mode, continuing with caution.\n"
        )

    return config


# ---------------------------------------------------------------------------
# Legacy helper (kept for any direct call sites during transition)
# ---------------------------------------------------------------------------

def load_config() -> dict:
    ensure_data_dirs()
    _ensure_defaults_yaml()
    config_path = Path(CONFIG_PATH)
    if not config_path.exists():
        config_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(_BUNDLED_TEMPLATE, config_path)
    with open(config_path) as f:
        return yaml.safe_load(f) or {}
