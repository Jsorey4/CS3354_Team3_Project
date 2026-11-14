"""
@author: Jon Sorey
@description: Hours on tasks. Owners and managers set how long a task should take (estimated hours) and
    how much time is budgeted to the assignee (assigned hours); the person doing the work logs actual hours
    by typing them in or with a start / pause / resume / stop timer. A stopped timer's duration is
    (end - start - paused time) / 3600 rounded to 2 decimals. Members can only ever see their own entries.
@traces: SE-FR-04, SE-NFR-02, UC-03, UC-04
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db, utcnow
from app.core.permissions import ALL_ROLES, MANAGERS, get_membership, require_project_role, require_task_access
from app.core.realtime import hub
from app.core.security import get_current_user
from app.models.entities import Project, ProjectMember, Task, TimeEntry, UserProfile
from app.schemas.dto import HoursUpdate, TaskHoursOut, TimeEntryOut, TimerAction, TimerStart

router = APIRouter(tags=["time-tracking"])

CENT = Decimal("0.01")
HOURS_DENIED = "Only owners and managers can set estimated or assigned hours"
TRACK_DENIED = "You can only log time on tasks assigned to you"
ALREADY_RUNNING = "You already have a running timer. Stop it first."


def duration_hours(started_at: datetime, ended_at: datetime, paused_seconds: int) -> Decimal:
    """round(((ended_at - started_at) - paused_seconds) / 3600, 2), never negative."""
    seconds = max(Decimal("0"), Decimal(str((ended_at - started_at).total_seconds())) - Decimal(paused_seconds))
    return (seconds / Decimal(3600)).quantize(CENT, rounding=ROUND_HALF_UP)


def elapsed_seconds(entry: TimeEntry, now: datetime) -> int:
    end = entry.ended_at or now
    paused = entry.paused_seconds
    if entry.ended_at is None and entry.pause_started_at is not None:
        paused += int((now - entry.pause_started_at).total_seconds())
    return max(0, int((end - entry.started_at).total_seconds()) - paused)


def entry_out(entry: TimeEntry, task: Task, project_name: str, username: str) -> TimeEntryOut:
    now = utcnow()
    return TimeEntryOut(
        id=entry.id,
        project_id=entry.project_id,
        project_name=project_name,
        task_id=entry.task_id,
        task_title=task.title,
        user_id=entry.user_id,
        username=username,
        source=entry.source,
        started_at=entry.started_at,
        ended_at=entry.ended_at,
        paused_seconds=entry.paused_seconds,
        is_running=entry.ended_at is None,
        is_paused=entry.ended_at is None and entry.pause_started_at is not None,
        elapsed_seconds=elapsed_seconds(entry, now),
        duration_hours=entry.duration_hours,
        note=entry.note,
    )


def _entry_out_loaded(db: Session, entry: TimeEntry) -> TimeEntryOut:
    task = db.get(Task, entry.task_id)
    project = db.get(Project, entry.project_id)
    user = db.get(UserProfile, entry.user_id)
    return entry_out(entry, task, project.name if project else "", user.username if user else "")


def actual_hours(db: Session, task_id: str) -> Decimal:
    value = db.execute(
        select(func.coalesce(func.sum(TimeEntry.duration_hours), 0)).where(
            TimeEntry.task_id == task_id, TimeEntry.ended_at.is_not(None)
        )
    ).scalar_one()
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def finish_entry(entry: TimeEntry, now: datetime) -> None:
    """Stops a running entry: closes an open pause and stores end minus start minus paused time.

    Every time comes from the server clock (the client never sends a start or end), and the end can never
    be earlier than the start, so a stored duration is never negative.
    """
    if entry.pause_started_at is not None:
        entry.paused_seconds += max(0, int((now - entry.pause_started_at).total_seconds()))
        entry.pause_started_at = None
    entry.ended_at = max(now, entry.started_at)
    entry.duration_hours = duration_hours(entry.started_at, entry.ended_at, entry.paused_seconds)


def _may_track(role: str, task: Task, user_id: str) -> bool:
    return task.assignee_id == user_id or role in MANAGERS


def _publish_time(db: Session, entry: TimeEntry, action: str) -> None:
    hub.publish([entry.user_id], "timer", {"entry_id": entry.id, "task_id": entry.task_id, "action": action})


@router.post("/api/projects/{project_id}/tasks/{task_id}/hours", response_model=TaskHoursOut)
def set_task_hours(
    project_id: str,
    task_id: str,
    body: HoursUpdate,
    user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TaskHoursOut:
    """UC-03: managers set estimated / assigned hours; the assignee logs actual hours."""
    membership = require_project_role(db, user.id, project_id, ALL_ROLES)
    task = db.get(Task, task_id)
    if task is None or task.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    fields = body.model_fields_set
    if ("estimated_hours" in fields or "assigned_hours" in fields) and membership.role not in MANAGERS:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=HOURS_DENIED)
    if body.actual_hours is not None and not _may_track(membership.role, task, user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=TRACK_DENIED)
    if not fields - {"note", "work_date"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide estimated, assigned or actual hours")

    if "estimated_hours" in fields:
        task.estimated_hours = body.estimated_hours
    if "assigned_hours" in fields:
        task.assigned_hours = body.assigned_hours
    if body.actual_hours is not None:
        work_day = body.work_date or utcnow().date()
        if work_day > utcnow().date():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Hours cannot be logged for a future date")
        started = datetime.combine(work_day, time(9, 0))
        ended = started + timedelta(seconds=int(body.actual_hours * 3600))
        entry = TimeEntry(
            project_id=project_id,
            task_id=task.id,
            user_id=user.id,
            source="manual",
            started_at=started,
            ended_at=ended,
            paused_seconds=0,
            duration_hours=body.actual_hours,
            note=body.note,
        )
        db.add(entry)
    task.updated_at = utcnow()
    db.commit()
    return TaskHoursOut(
        task_id=task.id,
        estimated_hours=task.estimated_hours,
        assigned_hours=task.assigned_hours,
        actual_hours=actual_hours(db, task.id),
    )


def _running_entry(db: Session, user_id: str, entry_id: str | None) -> TimeEntry:
    stmt = select(TimeEntry).where(TimeEntry.user_id == user_id, TimeEntry.ended_at.is_(None))
    if entry_id:
        stmt = stmt.where(TimeEntry.id == entry_id)
    entry = db.execute(stmt.order_by(TimeEntry.started_at.desc())).scalars().first()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No running timer")
    return entry


@router.get("/api/time-entries/timer/active", response_model=TimeEntryOut | None)
def active_timer(user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)) -> TimeEntryOut | None:
    entry = db.execute(
        select(TimeEntry).where(TimeEntry.user_id == user.id, TimeEntry.ended_at.is_(None)).order_by(TimeEntry.started_at.desc())
    ).scalars().first()
    return _entry_out_loaded(db, entry) if entry else None


@router.post("/api/time-entries/timer/start", response_model=TimeEntryOut, status_code=status.HTTP_201_CREATED)
def start_timer(body: TimerStart, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)) -> TimeEntryOut:
    """UC-04: one running timer per person, only on tasks they may track.

    The check below gives the friendly message; the guarantee is the partial unique index
    uq_time_entries_one_running_per_user (user_id WHERE ended_at IS NULL). Two simultaneous "start"
    requests both pass the check, but the database accepts only one insert and the other gets the 409.
    """
    task, membership = require_task_access(db, user.id, body.task_id, ALL_ROLES)
    if not _may_track(membership.role, task, user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=TRACK_DENIED)
    running = db.execute(
        select(TimeEntry.id).where(TimeEntry.user_id == user.id, TimeEntry.ended_at.is_(None))
    ).first()
    if running:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ALREADY_RUNNING)
    now = utcnow()
    entry = TimeEntry(
        project_id=task.project_id,
        task_id=task.id,
        user_id=user.id,
        source="timer",
        started_at=now,
        paused_seconds=0,
        note=body.note,
        created_at=now,
    )
    db.add(entry)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ALREADY_RUNNING) from None
    _publish_time(db, entry, "started")
    return _entry_out_loaded(db, entry)


@router.post("/api/time-entries/timer/pause", response_model=TimeEntryOut)
def pause_timer(
    body: TimerAction | None = None, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
) -> TimeEntryOut:
    entry = _running_entry(db, user.id, body.entry_id if body else None)
    if entry.pause_started_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Timer is already paused")
    entry.pause_started_at = utcnow()
    db.commit()
    _publish_time(db, entry, "paused")
    return _entry_out_loaded(db, entry)


@router.post("/api/time-entries/timer/resume", response_model=TimeEntryOut)
def resume_timer(
    body: TimerAction | None = None, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
) -> TimeEntryOut:
    entry = _running_entry(db, user.id, body.entry_id if body else None)
    if entry.pause_started_at is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Timer is not paused")
    entry.paused_seconds += max(0, int((utcnow() - entry.pause_started_at).total_seconds()))
    entry.pause_started_at = None
    db.commit()
    _publish_time(db, entry, "resumed")
    return _entry_out_loaded(db, entry)


@router.post("/api/time-entries/timer/stop", response_model=TimeEntryOut)
def stop_timer(
    body: TimerAction | None = None, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
) -> TimeEntryOut:
    entry = _running_entry(db, user.id, body.entry_id if body else None)
    finish_entry(entry, utcnow())
    db.commit()
    _publish_time(db, entry, "stopped")
    return _entry_out_loaded(db, entry)


@router.get("/api/time-entries", response_model=list[TimeEntryOut])
def list_time_entries(
    project_id: str | None = Query(None),
    user_id: str | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TimeEntryOut]:
    """Members see only their own rows (SE-NFR-02); owners / managers may see the whole project."""
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Start date must be on or before end date")
    stmt = (
        select(TimeEntry, Task, Project.name, UserProfile.username)
        .join(Task, Task.id == TimeEntry.task_id)
        .join(Project, Project.id == TimeEntry.project_id)
        .join(UserProfile, UserProfile.id == TimeEntry.user_id)
    )
    if project_id:
        membership = require_project_role(db, user.id, project_id, ALL_ROLES)
        stmt = stmt.where(TimeEntry.project_id == project_id)
        if membership.role not in MANAGERS:
            if user_id and user_id != user.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
            stmt = stmt.where(TimeEntry.user_id == user.id)
        elif user_id:
            stmt = stmt.where(TimeEntry.user_id == user_id)
    else:
        if user_id and user_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        # Own rows, and only from projects the caller still belongs to (SE-NFR-11): the task and project
        # names of a project they have left are no longer returned.
        stmt = stmt.where(
            TimeEntry.user_id == user.id,
            TimeEntry.project_id.in_(select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)),
        )
    if start_date:
        stmt = stmt.where(TimeEntry.started_at >= datetime.combine(start_date, time.min))
    if end_date:
        stmt = stmt.where(TimeEntry.started_at < datetime.combine(end_date + timedelta(days=1), time.min))
    rows = db.execute(stmt.order_by(TimeEntry.started_at.desc()).limit(limit)).all()
    return [entry_out(e, t, pname, uname) for e, t, pname, uname in rows]


@router.delete("/api/time-entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_time_entry(entry_id: str, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    entry = db.get(TimeEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Time entry not found")
    membership = get_membership(db, user.id, entry.project_id)
    # Current membership is required even for the caller's own entry: someone removed from a project can
    # no longer alter that project's time records.
    if membership is None or (entry.user_id != user.id and membership.role not in MANAGERS):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    db.delete(entry)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
