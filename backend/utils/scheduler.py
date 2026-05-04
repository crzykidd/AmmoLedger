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

    # Persist initial next_run_at from APScheduler; clear it for disabled tasks
    job_map = {job.id: job for job in _scheduler.get_jobs()}
    with Session(engine) as db:
        for t in db.exec(select(TaskRegistry)).all():
            job = job_map.get(t.task_key)
            if job and job.next_run_time:
                t.next_run_at = job.next_run_time.replace(tzinfo=None)
            elif not t.enabled:
                t.next_run_at = None
            db.add(t)
        db.commit()


def reschedule_task(task) -> None:
    """Update a single task's APScheduler job and persist next_run_at."""
    global _scheduler
    if _scheduler is None or not _scheduler.running:
        return

    from database import engine  # noqa: PLC0415
    from models import TaskRegistry  # noqa: PLC0415
    from sqlmodel import Session, select  # noqa: PLC0415

    task_fn = TASK_FUNCTIONS.get(task.task_key)

    try:
        _scheduler.remove_job(task.task_key)
    except Exception:
        pass

    next_run_at = None

    if task.enabled and task_fn:
        _add_job(_scheduler, task.task_key, task_fn, task.interval_type, task.interval_value)
        job = _scheduler.get_job(task.task_key)
        if job and job.next_run_time:
            next_run_at = job.next_run_time.replace(tzinfo=None)
            logger.info("Rescheduled %s, next run: %s", task.task_key, job.next_run_time)
    else:
        logger.info("Disabled task %s, cleared next_run_at", task.task_key)

    with Session(engine) as db:
        registry = db.exec(
            select(TaskRegistry).where(TaskRegistry.task_key == task.task_key)
        ).first()
        if registry:
            registry.next_run_at = next_run_at
            db.add(registry)
            db.commit()


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        _scheduler = None


def reschedule(config: dict) -> None:
    """Restart scheduler with updated config — called after POST /system/config."""
    stop_scheduler()
    start_scheduler(config)
