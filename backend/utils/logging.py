import logging
import os
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
