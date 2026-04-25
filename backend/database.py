import os

from sqlmodel import create_engine, Session
from alembic.config import Config
from alembic import command

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./ammoledger.db")

engine = create_engine(DATABASE_URL, echo=False)


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
