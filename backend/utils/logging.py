import logging
import os
import re
import sys

_initialized = False


def setup_logging() -> None:
    global _initialized
    if _initialized:
        return

    is_production = os.getenv("APP_ENV", "development") == "production"
    level = logging.DEBUG if not is_production else logging.INFO

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)
    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.setLevel(level)
    root.addHandler(handler)

    # Silence noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("apscheduler").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    _initialized = True


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


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
