import os

from sqlalchemy import event
from sqlmodel import create_engine, Session
from alembic.config import Config
from alembic import command

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./ammoledger.db")

engine = create_engine(DATABASE_URL, echo=False)


def _set_sqlite_pragmas(dbapi_connection, connection_record):
    # WAL mode is persistent (stored in DB header); all others are per-connection.
    # Backups must use sqlite3.Connection.backup(), not shutil.copy* — WAL requires it.
    try:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.fetchone()  # journal_mode returns a result row; fetch it to avoid cursor oddities
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA cache_size=-64000")
        cursor.execute("PRAGMA temp_store=MEMORY")
        cursor.execute("PRAGMA mmap_size=268435456")
        cursor.close()
    except Exception as exc:
        from utils.logging import get_logger  # noqa: PLC0415
        get_logger(__name__).warning("Could not set SQLite PRAGMAs: %s", exc)


if DATABASE_URL.startswith("sqlite:"):
    event.listen(engine, "connect", _set_sqlite_pragmas)


def run_migrations() -> None:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    alembic_cfg = Config(os.path.join(base_dir, "alembic.ini"))
    alembic_cfg.set_main_option(
        "script_location", os.path.join(base_dir, "migrations")
    )
    alembic_cfg.set_main_option("sqlalchemy.url", DATABASE_URL)
    command.upgrade(alembic_cfg, "head")


def get_session():
    with Session(engine) as session:
        yield session
