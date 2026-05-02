import logging
import os
import sys

_initialized = False


def setup_logging() -> None:
    global _initialized
    if _initialized:
        return

    is_production = os.getenv("APP_ENV", "development") == "production"
    level = logging.INFO if is_production else logging.DEBUG
    fmt = "%(asctime)s | %(levelname)-8s | %(module)s | %(message)s"
    datefmt = "%Y-%m-%d %H:%M:%S"

    logging.basicConfig(
        level=level,
        format=fmt,
        datefmt=datefmt,
        stream=sys.stdout,
        force=True,
    )

    # Silence noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("apscheduler").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    _initialized = True


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
