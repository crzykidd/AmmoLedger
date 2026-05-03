from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from database import get_session
from models import TaskHistory, TaskRegistry
from schemas import TaskHistoryRead, TaskRegistryRead, TaskRegistryUpdate
from utils.rbac import require_role
from utils.task_definitions import TASK_FUNCTIONS
from utils.task_runner import run_task

router = APIRouter(tags=["tasks"])


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
    """Update task settings: enabled flag or interval_value."""
    task = db.exec(
        select(TaskRegistry).where(TaskRegistry.task_key == task_key)
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task '{task_key}' not found")

    if body.enabled is not None:
        task.enabled = body.enabled
    if body.interval_value is not None:
        task.interval_value = body.interval_value

    db.add(task)
    db.commit()
    db.refresh(task)
    return task
