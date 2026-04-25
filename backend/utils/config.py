import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional

import yaml

CONFIG_PATH = os.getenv("CONFIG_PATH", "/data/config.yaml")
DEFAULTS_PATH = os.getenv("DEFAULTS_PATH", "/data/defaults.yaml")
BACKUP_PATH = os.getenv("BACKUP_PATH", "/data/backups")
UPLOADS_PATH = os.getenv("UPLOADS_PATH", "/data/uploads")

# Absolute path to the bundled defaults shipped inside the container image.
_BUNDLED_DEFAULTS = Path(__file__).parent.parent / "defaults.yaml"

_CONFIG_TEMPLATE = """\
# AmmoLedger Configuration
# WARNING: This file may contain secrets (reset_token).
# It is git-ignored — do not commit it to version control.
# Auto-generated on first startup. Edit freely.

app:
  # How long a login session stays active before the user must re-authenticate.
  session_timeout_hours: 8

security:
  # Set a token here to enable password reset at /reset?token=<your-token>.
  # Remove or clear this value immediately after use.
  reset_token: ""

defaults:
  # Always run the seed sync on startup, even if the version already matches.
  # Set to false to skip sync when the stored version equals the YAML version.
  sync_on_startup: true
  # When true, rename yaml-sourced entries if the YAML spelling changes.
  update_existing: false
  # When true, deactivate yaml-sourced entries that were removed from the YAML.
  allow_removal: false

backup:
  enabled: true
  # Time of day for the nightly backup (24-hour HH:MM, server local time).
  schedule: "03:00"
  # Number of days to retain backup files before pruning.
  retention_days: 30
  path: /data/backups

smtp:
  # Optional — enables scheduled report delivery (v2.0).
  # Leave host empty to disable all email features.
  host: ""
  port: 587
  username: ""
  password: ""
  from_address: ""
"""


def ensure_data_dirs() -> None:
    """Create /data/backups and /data/uploads if they do not already exist."""
    Path(BACKUP_PATH).mkdir(parents=True, exist_ok=True)
    Path(UPLOADS_PATH).mkdir(parents=True, exist_ok=True)


def _ensure_defaults_yaml() -> None:
    dest = Path(DEFAULTS_PATH)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        shutil.copy2(_BUNDLED_DEFAULTS, dest)


def _ensure_config_yaml() -> None:
    dest = Path(CONFIG_PATH)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        dest.write_text(_CONFIG_TEMPLATE)


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


def load_config() -> dict:
    """
    Ensure all data-directory scaffolding is in place, then load and return
    the parsed contents of config.yaml.  Safe to call on every startup —
    missing files are created from bundled templates; existing files are
    never overwritten.
    """
    ensure_data_dirs()
    _ensure_defaults_yaml()
    _ensure_config_yaml()

    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f) or {}
