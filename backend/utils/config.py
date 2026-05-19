import os
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import yaml

CONFIG_PATH = os.getenv("CONFIG_PATH", "/data/config.yaml")
DEFAULTS_PATH = os.getenv("DEFAULTS_PATH", "/data/defaults.yaml")
BACKUP_PATH = os.getenv("BACKUP_PATH", "/data/backups")
UPLOADS_PATH = os.getenv("UPLOADS_PATH", "/data/uploads")

_BUNDLED_DEFAULTS = Path(__file__).parent.parent / "defaults.yaml"
_BUNDLED_TEMPLATE = Path(__file__).parent.parent / "config.template.yaml"

_DEFAULT_SECRET = "change-this-to-a-random-string"
_VALID_REGISTRATION_MODES = {"invite_only", "open", "disabled"}

# ---------------------------------------------------------------------------
# Environment variable → config key mapping
# ---------------------------------------------------------------------------
# Each entry: (ENV_VAR_NAME, config_key_path, python_type)
# ENV values always take priority over config.yaml when both are present.
# ---------------------------------------------------------------------------

_ENV_MAP: tuple[tuple[str, list[str], type], ...] = (
    ("AL_SESSION_SECRET",        ["security",     "session_secret"],    str),
    ("AL_RESET_TOKEN",           ["security",     "reset_token"],       str),
    ("AL_APP_NAME",              ["app",          "name"],              str),
    ("AL_BASE_URL",              ["app",          "base_url"],          str),
    ("AL_BACKUP_ENABLED",        ["backup",       "enabled"],           bool),
    ("AL_BACKUP_SCHEDULE",       ["backup",       "schedule"],          str),
    ("AL_BACKUP_RETENTION_DAYS", ["backup",       "retention_days"],    int),
    ("AL_BACKUP_PATH",           ["backup",       "path"],              str),
    ("AL_BACKUP_INCLUDE_PHOTOS", ["backup",       "include_photos"],    bool),
    ("AL_IMAGE_SEARCH_ENABLED",  ["image_search", "enabled"],           bool),
    ("AL_IMAGE_SEARCH_PROVIDER", ["image_search", "provider"],          str),
    ("AL_IMAGE_SEARCH_API_KEY",  ["image_search", "api_key"],           str),
)


def _coerce_env(raw: str, typ: type):
    """Convert a raw env-var string to the target Python type."""
    if typ is bool:
        return raw.lower() in ("1", "true", "yes", "on")
    if typ is int:
        return int(raw)
    return raw


def _apply_env_overrides(config: dict) -> list[str]:
    """
    Apply AL_* env vars onto config dict in-place.
    Returns a list of short descriptions for each override that was applied.
    """
    applied: list[str] = []
    for env_key, path, typ in _ENV_MAP:
        raw = os.environ.get(env_key)
        if raw is None:
            continue
        node = config
        for segment in path[:-1]:
            if not isinstance(node.get(segment), dict):
                node[segment] = {}
            node = node[segment]
        try:
            node[path[-1]] = _coerce_env(raw, typ)
            applied.append(f"{env_key} → {'.'.join(path)}")
        except (ValueError, TypeError) as exc:
            print(f"WARNING: ENV override {env_key} ignored — {exc}", flush=True)
    return applied


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def ensure_data_dirs() -> None:
    dirs = [
        (BACKUP_PATH, "backups"),
        (UPLOADS_PATH, "uploads"),
        (str(Path(UPLOADS_PATH) / "products"), "uploads/products"),
    ]
    for path_str, label in dirs:
        try:
            Path(path_str).mkdir(parents=True, exist_ok=True)
        except PermissionError:
            print(
                f"WARNING: Cannot create {label} directory {path_str} — permission denied. "
                "Backup and upload operations will fail until directory permissions are fixed.",
                flush=True,
            )


def _ensure_defaults_yaml() -> None:
    dest = Path(DEFAULTS_PATH)
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
    except PermissionError:
        print(
            f"WARNING: Cannot create data directory {dest.parent} — permission denied. "
            f"Using bundled defaults from {_BUNDLED_DEFAULTS}.",
            flush=True,
        )
        return
    if not dest.exists():
        try:
            shutil.copy2(_BUNDLED_DEFAULTS, dest)
        except PermissionError:
            print(
                f"WARNING: Cannot write defaults.yaml to {dest} — permission denied. "
                f"Using bundled defaults from {_BUNDLED_DEFAULTS}.",
                flush=True,
            )


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
# Validation helpers
# ---------------------------------------------------------------------------

def _is_int(val) -> bool:
    return isinstance(val, int) and not isinstance(val, bool)


def _is_valid_url(val) -> bool:
    try:
        parsed = urlparse(str(val))
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


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

    # --- Type check helper ---
    def _check_type(keys, predicate, type_name, condition=True):
        if not condition:
            return
        val = _get(*keys)
        if val is not None and not predicate(val):
            errors.append(
                f"[{'.'.join(keys)}] must be {type_name} (got {type(val).__name__})"
            )

    smtp_enabled = _get("smtp", "enabled") is True
    discord_enabled = _get("notifications", "discord", "enabled") is True

    # Existing type checks
    _check_type(("backup", "retention_days"), _is_int, "integer")
    _check_type(("app", "session_timeout_hours"), _is_int, "integer")
    _check_type(("backup", "enabled"), lambda v: isinstance(v, bool), "boolean")
    _check_type(("backup", "include_photos"), lambda v: isinstance(v, bool), "boolean")
    _check_type(("import", "require_backup"), lambda v: isinstance(v, bool), "boolean")
    _check_type(("import", "backup_warning_hours"), _is_int, "integer")
    _check_type(("import", "backup_block_hours"), _is_int, "integer")
    _check_type(("smtp", "port"), _is_int, "integer", condition=smtp_enabled)

    # New type checks
    _check_type(("app", "check_for_updates"), lambda v: isinstance(v, bool), "boolean")
    _check_type(("security", "invite_expiry_hours"), _is_int, "integer")
    _check_type(("security", "password_min_length"), _is_int, "integer")
    _check_type(("security", "password_history_count"), _is_int, "integer")
    _check_type(("security", "password_require_uppercase"), lambda v: isinstance(v, bool), "boolean")
    _check_type(("security", "password_require_number"), lambda v: isinstance(v, bool), "boolean")
    _check_type(("security", "password_require_special"), lambda v: isinstance(v, bool), "boolean")
    _check_type(("security", "invalidate_sessions_on_pw_change"), lambda v: isinstance(v, bool), "boolean")
    _check_type(("notifications", "discord", "enabled"), lambda v: isinstance(v, bool), "boolean")
    _check_type(
        ("notifications", "low_stock", "default_threshold"), _is_int, "integer",
    )

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

    base_url = _get("app", "base_url")
    if base_url is not None and not _is_valid_url(base_url):
        errors.append(
            "[app.base_url] must be a valid URL with http or https scheme "
            "(e.g. 'http://localhost:5173' or 'https://ammo.example.com')"
        )

    invite_expiry = _get("security", "invite_expiry_hours")
    if _is_int(invite_expiry) and invite_expiry <= 0:
        errors.append("[security.invite_expiry_hours] must be greater than 0")

    pw_min = _get("security", "password_min_length")
    if _is_int(pw_min) and pw_min < 8:
        errors.append("[security.password_min_length] must be at least 8")

    pw_history = _get("security", "password_history_count")
    if _is_int(pw_history) and pw_history < 0:
        errors.append("[security.password_history_count] must be 0 or greater")

    registration = _get("security", "registration")
    if registration is not None and str(registration) not in _VALID_REGISTRATION_MODES:
        errors.append(
            f"[security.registration] must be one of: "
            f"{', '.join(sorted(_VALID_REGISTRATION_MODES))}"
        )

    low_stock_threshold = _get("notifications", "low_stock", "default_threshold")
    if _is_int(low_stock_threshold) and low_stock_threshold <= 0:
        errors.append("[notifications.low_stock.default_threshold] must be greater than 0")

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

    if discord_enabled and not _get("notifications", "discord", "webhook_url"):
        warnings.append(
            "[notifications.discord] enabled is true but webhook_url is empty — "
            "Discord notifications will not work until a webhook URL is configured"
        )

    img_search_enabled = _get("image_search", "enabled")
    img_search_key = _get("image_search", "api_key") or ""
    img_search_provider = _get("image_search", "provider")
    if img_search_enabled is True and not img_search_key:
        warnings.append(
            "[image_search] enabled is true but api_key is empty — "
            "image search will be disabled at runtime until an API key is configured"
        )
        config.setdefault("image_search", {})["enabled"] = False
    if img_search_provider is not None and img_search_provider != "brave":
        warnings.append(
            f"[image_search.provider] unknown provider '{img_search_provider}' — "
            "image search will be disabled"
        )
        config.setdefault("image_search", {})["enabled"] = False

    if _get("backup", "enabled") is False:
        warnings.append("[backup.enabled] is false — nightly backups are disabled")

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
    Load, validate, and return the merged configuration.

    Priority (highest wins):
      1. AL_* environment variables
      2. /data/config.yaml
      3. Built-in defaults (bundled config.template.yaml)

    - No config.yaml + AL_SESSION_SECRET set: starts from bundled defaults,
      applies ENV overrides, skips the setup-required exit.
    - No config.yaml + no AL_SESSION_SECRET: copies the template, prints
      setup instructions, and exits with code 1.
    - YAML syntax error: prints the line number and exits with code 1.
    - Validation errors in production (app.env='production'): exits with code 1.
    - Validation errors in development: logs them as warnings and continues.
    - Validation warnings: always logged; never block startup.

    Also ensures defaults.yaml is in place for the seeds step that follows.
    """
    config_path = Path(CONFIG_PATH)

    # Step 1 — Determine config source
    if not config_path.exists():
        if os.environ.get("AL_SESSION_SECRET"):
            # ENV-only mode — load bundled template as base, overrides applied below
            with open(_BUNDLED_TEMPLATE) as f:
                config = yaml.safe_load(f) or {}
            print("  Config: no config.yaml — using AL_* environment variables", flush=True)
        else:
            try:
                config_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(_BUNDLED_TEMPLATE, config_path)
                config_written = True
            except PermissionError:
                config_written = False

            print("\n" + "=" * 64)
            print("  AmmoLedger — first-time setup")
            print("=" * 64)
            if config_written:
                print(f"\n  A default config has been written to:\n    {config_path}")
                print("  Starting with default settings.")
                print("  Set a custom session secret before deploying to production:\n")
                print("    Edit config.yaml → security.session_secret")
                print("    Or set AL_SESSION_SECRET in your docker-compose.yml")
            else:
                print(f"\n  NOTE: Could not write config to {config_path} (permission denied).")
                print("  Use Option B below — no config file needed.\n")
                print("  Option A — edit config.yaml:")
                print("    Set security.session_secret to a random value:")
                print()
                print("      Linux / macOS:  openssl rand -hex 32")
                print('      Windows:        python -c "import secrets; print(secrets.token_hex(32))"')
                print()
                print("    Paste the output into config.yaml, then restart the container.")
                print()
                print("  Option B — use an environment variable (no config.yaml needed):")
                print("    Add to your docker-compose.yml environment section:")
                print("      AL_SESSION_SECRET=<your-random-secret>")
                print("    then restart the container.")
            print("=" * 64 + "\n")
            if not config_written:
                raise SystemExit(1)
            with open(config_path) as f:
                config = yaml.safe_load(f) or {}
    else:
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

    # Step 3 — Apply ENV overrides
    overrides = _apply_env_overrides(config)
    for desc in overrides:
        print(f"  ENV override: {desc}", flush=True)

    # Step 4 — Validate
    result = validate_config(config)
    env = str((config.get("app") or {}).get("env", "development"))

    for w in result["warnings"]:
        print(f"WARNING: {w}")

    if result["errors"]:
        for e in result["errors"]:
            print(f"ERROR:   {e}")

        if env == "production":
            print("\nConfig has errors. Fix them and restart the container.\n")
            raise SystemExit(1)

        print(
            f"\nConfig has {len(result['errors'])} error(s) — "
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


def get_config() -> dict:
    """Return the runtime config with ENV overrides applied. Does not validate."""
    config_path = Path(CONFIG_PATH)
    if not config_path.exists():
        try:
            with open(_BUNDLED_TEMPLATE) as f:
                config = yaml.safe_load(f) or {}
        except OSError:
            config = {}
    else:
        try:
            with open(config_path) as f:
                config = yaml.safe_load(f) or {}
        except (OSError, yaml.YAMLError):
            config = {}
    _apply_env_overrides(config)
    return config
