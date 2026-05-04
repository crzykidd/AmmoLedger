import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from database import get_session
from models import TaskHistory, TaskRegistry
from schemas import TaskHistoryRead, TaskRegistryRead, TaskRegistryUpdate
from utils.rbac import require_role
from utils.task_definitions import TASK_DEFINITIONS, TASK_FUNCTIONS
from utils.task_runner import run_task

router = APIRouter(tags=["tasks"])

_TASK_DEF_MAP: dict = {td["task_key"]: td for td in TASK_DEFINITIONS}
_HH_MM_RE = re.compile(r'^([01]\d|2[0-3]):([0-5]\d)$')


@router.get("", response_model=List[TaskRegistryRead])
def list_tasks(_=Depends(require_role("admin")), db: Session = Depends(get_session)):
    """Return all registered tasks ordered by next_run_at (nulls last)."""
    tasks = db.exec(select(TaskRegistry)).all()
    return sorted(tasks, key=lambda t: t.next_run_at or datetime.max)


@router.get("/history", response_model=List[TaskHistoryRead])
def list_all_history(
    task_key: Optional[str] = None,
    limit: int = 50,
    _=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    """Return recent task history across all tasks (optionally filtered by task_key)."""
    if task_key:
        results = db.exec(
            select(TaskHistory)
            .where(TaskHistory.task_name == task_key)
            .order_by(TaskHistory.started_at.desc())
            .limit(limit)
        ).all()
    else:
        results = db.exec(
            select(TaskHistory)
            .order_by(TaskHistory.started_at.desc())
            .limit(limit)
        ).all()
    return results


@router.get("/constraints")
def get_task_constraints(_=Depends(require_role("admin"))) -> Dict[str, Any]:
    """Return per-task scheduling constraints derived from TASK_DEFINITIONS."""
    result: Dict[str, Any] = {}
    for td in TASK_DEFINITIONS:
        key = td["task_key"]
        c: Dict[str, Any] = {}
        if "allowed_modes" in td:
            c["allowed_modes"] = td["allowed_modes"]
        if "min_hours" in td:
            c["min_hours"] = td["min_hours"]
        if "max_hours" in td:
            c["max_hours"] = td["max_hours"]
        if "requires_exclusive" in td:
            c["requires_exclusive"] = td["requires_exclusive"]
        result[key] = c
    return result


@router.get("/{task_key}/history", response_model=List[TaskHistoryRead])
def get_task_history(
    task_key: str,
    _=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    """Return last 50 history entries for a specific task."""
    return db.exec(
        select(TaskHistory)
        .where(TaskHistory.task_name == task_key)
        .order_by(TaskHistory.started_at.desc())
        .limit(50)
    ).all()


@router.post("/{task_key}/run", response_model=TaskHistoryRead)
def run_task_now(
    task_key: str,
    _=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    """Manually trigger a task immediately and return the resulting history entry."""
    registry_entry = db.exec(
        select(TaskRegistry).where(TaskRegistry.task_key == task_key)
    ).first()
    if not registry_entry:
        raise HTTPException(status_code=404, detail=f"Task '{task_key}' not found")

    task_fn = TASK_FUNCTIONS.get(task_key)
    if task_fn is None:
        raise HTTPException(status_code=400, detail=f"No function registered for task '{task_key}'")

    running = db.exec(
        select(TaskHistory)
        .where(TaskHistory.task_name == task_key)
        .where(TaskHistory.status == "running")
    ).first()
    if running:
        raise HTTPException(status_code=409, detail="Task is already running")

    history_id = run_task(task_key, task_fn, triggered_by="manual")

    # Re-open session to read the completed record
    history = db.get(TaskHistory, history_id)
    if not history:
        raise HTTPException(status_code=500, detail="Task completed but history record not found")
    return history


@router.patch("/{task_key}", response_model=TaskRegistryRead)
def update_task(
    task_key: str,
    body: TaskRegistryUpdate,
    _=Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    """Update task settings: enabled flag, interval_type, or interval_value."""
    task = db.exec(
        select(TaskRegistry).where(TaskRegistry.task_key == task_key)
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task '{task_key}' not found")

    if body.enabled is not None:
        task.enabled = body.enabled

    if body.interval_type is not None or body.interval_value is not None:
        new_type = body.interval_type if body.interval_type is not None else task.interval_type
        new_value = body.interval_value if body.interval_value is not None else task.interval_value

        task_def = _TASK_DEF_MAP.get(task_key, {})
        allowed_modes = task_def.get("allowed_modes", [])

        if allowed_modes and new_type not in allowed_modes:
            raise HTTPException(
                status_code=422,
                detail=f"interval_type '{new_type}' not allowed for this task; allowed: {allowed_modes}",
            )

        if new_type == "hours":
            try:
                h = int(new_value)
            except (ValueError, TypeError):
                raise HTTPException(status_code=422, detail="interval_value must be a valid integer for hours mode")
            min_h = task_def.get("min_hours")
            max_h = task_def.get("max_hours")
            if min_h is not None and h < min_h:
                raise HTTPException(status_code=422, detail=f"Interval must be at least {min_h} hours")
            if max_h is not None and h > max_h:
                raise HTTPException(status_code=422, detail=f"Interval must be at most {max_h} hours")

        elif new_type == "daily":
            if not _HH_MM_RE.match(new_value):
                raise HTTPException(status_code=422, detail="interval_value must be in HH:MM format (00:00–23:59)")

        task.interval_type = new_type
        task.interval_value = new_value

    db.add(task)
    db.commit()
    db.refresh(task)

    # Update the single job in the live scheduler (writes next_run_at to DB)
    from utils.scheduler import reschedule_task  # noqa: PLC0415
    reschedule_task(task)
    db.refresh(task)  # pick up next_run_at written by reschedule_task

    # Conflict detection: warn if this daily task lands within 5 min of another
    warnings: List[str] = []
    if task.interval_type == "daily" and task.enabled:
        try:
            h0, m0 = map(int, task.interval_value.split(":"))
            t0 = h0 * 60 + m0
            all_tasks = db.exec(
                select(TaskRegistry).where(TaskRegistry.enabled == True)  # noqa: E712
            ).all()
            for other in all_tasks:
                if other.task_key == task_key or other.interval_type != "daily":
                    continue
                try:
                    h1, m1 = map(int, other.interval_value.split(":"))
                    diff = abs(t0 - (h1 * 60 + m1))
                    if diff <= 5:
                        warnings.append(
                            f"Schedule is within 5 minutes of {other.name} ({other.interval_value})"
                        )
                except (ValueError, AttributeError):
                    pass
        except (ValueError, AttributeError):
            pass

    result = TaskRegistryRead.model_validate(task)
    result.warnings = warnings if warnings else None
    return result
