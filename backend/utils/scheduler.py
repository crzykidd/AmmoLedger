from apscheduler.schedulers.background import BackgroundScheduler

from utils.logging import get_logger
from utils.task_definitions import TASK_FUNCTIONS
from utils.task_runner import run_task

logger = get_logger(__name__)

_scheduler: BackgroundScheduler | None = None


def _make_job(task_key: str, task_fn):
    """Return a zero-arg callable that runs the task through the task_runner."""
    def _job():
        run_task(task_key, task_fn, triggered_by="scheduler")
    _job.__name__ = f"job_{task_key}"
    return _job


def _add_job(
    scheduler: BackgroundScheduler,
    task_key: str,
    task_fn,
    interval_type: str,
    interval_value: str,
) -> None:
    job_fn = _make_job(task_key, task_fn)
    try:
        if interval_type == "hours":
            hours = int(interval_value)
            scheduler.add_job(
                job_fn,
                trigger="interval",
                hours=hours,
                id=task_key,
                replace_existing=True,
            )
            logger.info("Scheduled %s every %d hours", task_key, hours)
        elif interval_type == "daily":
            hour, minute = map(int, interval_value.split(":"))
            scheduler.add_job(
                job_fn,
                trigger="cron",
                hour=hour,
                minute=minute,
                id=task_key,
                replace_existing=True,
            )
            logger.info("Scheduled %s daily at %02d:%02d", task_key, hour, minute)
        else:
            logger.warning("Unknown interval_type '%s' for task %s", interval_type, task_key)
    except Exception as e:
        logger.error("Failed to schedule task %s: %s", task_key, e)


def start_scheduler(config: dict) -> None:
    global _scheduler

    from database import engine  # noqa: PLC0415
    from models import TaskRegistry  # noqa: PLC0415
    from sqlmodel import Session, select  # noqa: PLC0415

    _scheduler = BackgroundScheduler()
    scheduled_count = 0

    with Session(engine) as db:
        all_tasks = db.exec(select(TaskRegistry)).all()
        task_map = {t.task_key: t for t in all_tasks}

    for task_key, task_fn in TASK_FUNCTIONS.items():
        task = task_map.get(task_key)
        if task is None or not task.enabled:
            continue

        interval_value = task.interval_value

        # scheduled_backup: honour config schedule if set
        if task_key == "scheduled_backup":
            backup_cfg = config.get("backup") or {}
            if backup_cfg.get("enabled") is False:
                logger.info("Scheduled backup disabled via config")
                continue
            cfg_schedule = str(backup_cfg.get("schedule", "")).strip()
            if cfg_schedule:
                interval_value = cfg_schedule

        _add_job(_scheduler, task_key, task_fn, task.interval_type, interval_value)
        scheduled_count += 1

    _scheduler.start()
    logger.info("Scheduler started with %d task(s)", scheduled_count)


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        _scheduler = None


def reschedule(config: dict) -> None:
    """Restart scheduler with updated config — called after POST /system/config."""
    stop_scheduler()
    start_scheduler(config)
