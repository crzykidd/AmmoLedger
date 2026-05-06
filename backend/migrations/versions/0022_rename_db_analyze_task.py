"""rename db_analyze task to db_optimize

Revision ID: 0022
Revises: 0021
Create Date: 2026-05-05

Renames the db_analyze task to db_optimize in task_registry and task_history.
Preserves the user's enabled flag, schedule, and run history — only the key
and display strings are updated. The task now runs PRAGMA optimize instead of
bare ANALYZE, which only re-analyzes tables with stale statistics.
"""
from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Guard: if db_optimize was already created by the seed function (dev auto-reload
    # before this migration existed), remove the orphaned row so the rename below
    # doesn't hit a UNIQUE constraint. Only delete if db_analyze still exists (so
    # we don't lose a legitimately-configured db_optimize row on a clean upgrade).
    op.execute(
        "DELETE FROM task_registry WHERE task_key = 'db_optimize' "
        "AND EXISTS (SELECT 1 FROM task_registry WHERE task_key = 'db_analyze')"
    )
    # Rename the registry entry; preserves user's enabled flag and schedule.
    op.execute(
        "UPDATE task_registry SET task_key = 'db_optimize', "
        "name = 'Database Optimize (PRAGMA optimize)', "
        "description = 'Run SQLite PRAGMA optimize to refresh query planner statistics for tables with stale stats.' "
        "WHERE task_key = 'db_analyze'"
    )
    # Rename history rows so the Tasks UI history view is contiguous.
    op.execute(
        "UPDATE task_history SET task_name = 'db_optimize' WHERE task_name = 'db_analyze'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE task_registry SET task_key = 'db_analyze', name = 'Database Optimize', "
        "description = 'Run SQLite ANALYZE to update query planner statistics' "
        "WHERE task_key = 'db_optimize'"
    )
    op.execute(
        "UPDATE task_history SET task_name = 'db_analyze' WHERE task_name = 'db_optimize'"
    )
