import json
from datetime import datetime, timedelta

from sqlmodel import Session, select

from database import engine
from utils.logging import get_logger

logger = get_logger(__name__)


def calculate_next_run(registry) -> datetime:
    """Calculate the next scheduled run time based on interval settings."""
    now = datetime.utcnow()
    if registry.interval_type == "hours":
        try:
            hours = int(registry.interval_value)
        except (ValueError, TypeError):
            hours = 24
        return now + timedelta(hours=hours)
    elif registry.interval_type == "daily":
        try:
            hour, minute = map(int, registry.interval_value.split(":"))
        except (ValueError, AttributeError):
            hour, minute = 3, 0
        next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        return next_run
    return now + timedelta(hours=24)


def run_task(
    task_key: str,
    task_fn,
    triggered_by: str = "scheduler",
    task_kwargs: dict | None = None,
) -> int:
    """Execute a task, record history, and update registry. Returns history ID."""
    from models import TaskHistory, TaskRegistry

    if task_kwargs is None:
        task_kwargs = {}

    started_at = datetime.utcnow()

    # Create 'running' history record first so it's visible immediately
    with Session(engine) as session:
        history = TaskHistory(
            task_name=task_key,
            started_at=started_at,
            status="running",
            triggered_by=triggered_by,
        )
        session.add(history)
        session.commit()
        session.refresh(history)
        history_id = history.id

    # Run the task outside the session to avoid holding a connection
    result = None
    error_msg = None
    status = "ok"

    try:
        result = task_fn(**task_kwargs)
    except Exception as e:
        status = "failed"
        error_msg = str(e)
        logger.error("Task %s failed: %s", task_key, e, exc_info=True)

    ended_at = datetime.utcnow()
    duration_ms = int((ended_at - started_at).total_seconds() * 1000)

    # Persist final status and update registry
    with Session(engine) as session:
        history = session.get(TaskHistory, history_id)
        if history:
            history.status = status
            history.ended_at = ended_at
            history.duration_ms = duration_ms
            if result is not None:
                try:
                    history.details = json.dumps(result)
                except Exception:
                    history.details = str(result)
            if error_msg:
                history.error_message = error_msg
            session.add(history)

        registry = session.exec(
            select(TaskRegistry).where(TaskRegistry.task_key == task_key)
        ).first()
        if registry:
            registry.last_run_at = started_at
            registry.last_status = status
            registry.last_duration_ms = duration_ms
            registry.next_run_at = calculate_next_run(registry)
            session.add(registry)

        session.commit()

    logger.info(
        "Task %s %s in %dms (triggered_by=%s)",
        task_key, status, duration_ms, triggered_by,
    )
    return history_id
