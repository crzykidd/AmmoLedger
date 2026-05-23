import logging
import os
import re
import sys

_FORMAT = "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
_DATEFMT = "%Y-%m-%d %H:%M:%S"
_HANDLER_NAME = "ammoledger_stdout"


def _level() -> int:
    if os.getenv("LOG_LEVEL"):
        return logging.getLevelName(os.getenv("LOG_LEVEL").upper())
    return logging.INFO if os.getenv("APP_ENV") == "production" else logging.DEBUG


def _ensure_root_handler() -> None:
    """Guarantee root has ONLY our formatted stdout handler, at the right level.
    Removes foreign handlers (e.g. uvicorn's default stderr handler) so log
    lines are not duplicated. Safe to call repeatedly."""
    root = logging.getLogger()
    # Drop any handler that isn't ours (uvicorn installs a default StreamHandler).
    for h in list(root.handlers):
        if getattr(h, "name", None) != _HANDLER_NAME:
            root.removeHandler(h)
    # Ensure ours is present exactly once.
    if not any(getattr(h, "name", None) == _HANDLER_NAME for h in root.handlers):
        h = logging.StreamHandler(sys.stdout)
        h.setFormatter(logging.Formatter(_FORMAT, datefmt=_DATEFMT))
        h.set_name(_HANDLER_NAME)
        h.setLevel(_level())
        root.addHandler(h)
    if root.level == logging.NOTSET or root.level > _level():
        root.setLevel(_level())


def configure_logging() -> None:
    """Full (re)configure. Call at import and from the startup event. Also
    quiets noisy libraries. Idempotent."""
    _ensure_root_handler()
    # Re-enable every logger uvicorn may have disabled.
    for _obj in list(logging.Logger.manager.loggerDict.values()):
        if isinstance(_obj, logging.Logger):
            _obj.disabled = False
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("apscheduler").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


def setup_logging() -> None:
    """Back-compat shim — kept so existing import-time call site in main.py
    keeps working. Delegates to configure_logging()."""
    configure_logging()


def reapply_logging() -> None:
    """Back-compat shim — called from the FastAPI startup event. Delegates to
    configure_logging()."""
    configure_logging()


def get_logger(name: str) -> logging.Logger:
    """Return a logger that is guaranteed enabled and reaches our stdout handler.

    Self-healing: uvicorn's reload worker disables existing loggers and strips
    our root handler AFTER startup. Repairing here — at every fetch — ensures
    any module that does `logger = get_logger(__name__)` (and any later call)
    gets a working logger regardless of uvicorn's meddling.
    """
    _ensure_root_handler()
    lg = logging.getLogger(name)
    lg.disabled = False
    lg.propagate = True
    if lg.level == logging.NOTSET:
        lg.setLevel(_level())
    return lg


_LOG_INJECTION_PATTERN = re.compile(r"[\x00-\x1f\x7f]")


def log_safe(value) -> str:
    """Sanitize an arbitrary value for safe inclusion in a log entry.

    Strips control characters (LF, CR, TAB, C0 range, DEL) so the value
    cannot forge fake log lines when interpolated via a logger format string.
    None inputs return the literal string "None". Use %s in the format string.
    """
    if value is None:
        return "None"
    s = str(value)
    if not _LOG_INJECTION_PATTERN.search(s):
        return s
    return s.encode("unicode_escape").decode("ascii")
