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


def heal_dangling_stats(db_url: str = DATABASE_URL) -> bool:
    """Detect and repair a dangling sqlite_stat1/stat4 rootpage.

    Symptom: 'malformed database schema (sqlite_stat1) - invalid rootpage',
    caused by a pre-fix restore that lost WAL pages. Repair: drop the stat
    table's schema entry via writable_schema, then VACUUM to rebuild a clean
    file. Returns True if a repair was performed. Safe no-op on healthy DBs.
    """
    import sqlite3  # noqa: PLC0415
    if not db_url.startswith("sqlite:"):
        return False
    # Resolve the on-disk path from the URL (sqlite:////data/... -> /data/...)
    path = db_url.split("sqlite:///", 1)[-1]
    if not path or not os.path.exists(path):
        return False

    # Probe: does a simple schema-touching read fail with the rootpage error?
    try:
        con = sqlite3.connect(path)
        con.execute("SELECT name FROM sqlite_master LIMIT 1").fetchone()
        con.close()
        return False  # healthy
    except sqlite3.DatabaseError as exc:
        if "rootpage" not in str(exc):
            con.close()
            raise  # different corruption — don't mask it

    from utils.logging import get_logger  # noqa: PLC0415
    log = get_logger(__name__)
    log.warning("Detected dangling stat rootpage; attempting auto-repair")
    con = sqlite3.connect(path)
    try:
        con.execute("PRAGMA writable_schema=ON")
        con.execute(
            "DELETE FROM sqlite_master "
            "WHERE name IN ('sqlite_stat1','sqlite_stat4')"
        )
        con.execute("PRAGMA writable_schema=OFF")
        con.commit()
        con.execute("VACUUM")          # rebuild file, discard dangling refs
        con.commit()
        con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        con.close()
    except Exception as exc:
        con.close()
        log.error("Auto-repair of dangling stats failed: %s", exc)
        return False
    log.warning("Auto-repair complete: dropped corrupt stat tables")
    return True


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
