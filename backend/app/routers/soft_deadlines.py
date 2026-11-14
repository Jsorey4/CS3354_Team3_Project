"""
@author: Preethi Seereddy
@description: Soft deadlines are personal checkpoints placed before a task's real (final) due date, like
    "first draft by Tuesday", each with a high / medium / low priority. They can be listed, added, edited,
    re-prioritised, marked complete and deleted, and every rejection carries a plain-English message the
    inline task-level controls show next to the field (SE-NFR-03). The rule
    "a soft deadline must be earlier than the task's final due date" is checked in constant time on every
    create and edit; a rejected edit leaves the saved value untouched and sends the original record back
    so the screen can restore it. Owners / managers manage any soft deadline; members manage only those on
    tasks assigned to them, but every member can view them.
@traces: SE-FR-06, SE-FR-07, SE-FR-08, SE-FR-09, SE-FR-10, SE-NFR-03, SE-NFR-04, UC-05, UC-06, UC-07
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db, utcnow
from app.core.permissions import ALL_ROLES, MANAGERS, require_project_role, require_task_access
from app.core.realtime import hub
from app.core.security import get_current_user
from app.models.entities import ProjectMember, SoftDeadline, Task, UserProfile
from app.routers.projects import project_member_ids
from app.schemas.dto import SoftDeadlineComplete, SoftDeadlineCreate, SoftDeadlineOut, SoftDeadlineUpdate

router = APIRouter(tags=["soft-deadlines"])

MUST_BE_EARLIER = "Soft deadline must be earlier than the task's final due date."
NEEDS_DUE_DATE = "Add a final due date to this task before setting soft deadlines."
DUE_SOON_WINDOW = timedelta(hours=48)


def is_valid_soft_deadline(due_at, task_due_date) -> bool:
    """O(1): a soft deadline is valid iff it is strictly before the task's final due date."""
    return task_due_date is not None and due_at < task_due_date


def _state(sd: SoftDeadline) -> str:
    if sd.is_completed:
        return "completed"
    now = utcnow()
    if sd.due_at < now:
        return "overdue"
    if sd.due_at - now <= DUE_SOON_WINDOW:
        return "due_soon"
    return "upcoming"


def _can_manage(membership: ProjectMember, task: Task, user_id: str) -> bool:
    return membership.role in MANAGERS or task.assignee_id == user_id


def soft_deadline_out(sd: SoftDeadline, task: Task, can_edit: bool) -> SoftDeadlineOut:
    return SoftDeadlineOut(
        id=sd.id,
        task_id=sd.task_id,
        project_id=sd.project_id,
        task_title=task.title,
        task_due_date=task.due_date,
        title=sd.title,
        due_at=sd.due_at,
        priority=sd.priority,
        is_completed=sd.is_completed,
        completed_at=sd.completed_at,
        state=_state(sd),
        can_edit=can_edit,
    )


def _load(db: Session, user_id: str, soft_deadline_id: str) -> tuple[SoftDeadline, Task, ProjectMember]:
    sd = db.get(SoftDeadline, soft_deadline_id)
    if sd is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Soft deadline not found")
    task, membership = require_task_access(db, user_id, sd.task_id, ALL_ROLES)
    if not _can_manage(membership, task, user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return sd, task, membership


def _broadcast(db: Session, sd: SoftDeadline, action: str) -> None:
    hub.publish(
        project_member_ids(db, sd.project_id),
        "soft_deadline_changed",
        {"project_id": sd.project_id, "task_id": sd.task_id, "soft_deadline_id": sd.id, "action": action},
    )


@router.get("/api/projects/{project_id}/soft-deadlines", response_model=list[SoftDeadlineOut])
def list_soft_deadlines(
    project_id: str,
    task_id: str | None = Query(None),
    include_completed: bool = Query(True),
    user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SoftDeadlineOut]:
    """UC-07: every soft deadline in the project (or one task), ordered by due_at ascending."""
    membership = require_project_role(db, user.id, project_id, ALL_ROLES)
    stmt = (
        select(SoftDeadline, Task)
        .join(Task, Task.id == SoftDeadline.task_id)
        .where(SoftDeadline.project_id == project_id)
    )
    if task_id:
        stmt = stmt.where(SoftDeadline.task_id == task_id)
    if not include_completed:
        stmt = stmt.where(SoftDeadline.is_completed.is_(False))
    rows = db.execute(stmt.order_by(SoftDeadline.due_at.asc(), SoftDeadline.id)).all()
    return [soft_deadline_out(sd, task, _can_manage(membership, task, user.id)) for sd, task in rows]


@router.get("/api/tasks/{task_id}/soft-deadlines", response_model=list[SoftDeadlineOut])
def list_task_soft_deadlines(
    task_id: str, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[SoftDeadlineOut]:
    task, membership = require_task_access(db, user.id, task_id, ALL_ROLES)
    rows = db.execute(
        select(SoftDeadline).where(SoftDeadline.task_id == task.id).order_by(SoftDeadline.due_at.asc(), SoftDeadline.id)
    ).scalars().all()
    can_edit = _can_manage(membership, task, user.id)
    return [soft_deadline_out(sd, task, can_edit) for sd in rows]


@router.post("/api/tasks/{task_id}/soft-deadlines", response_model=SoftDeadlineOut, status_code=status.HTTP_201_CREATED)
def create_soft_deadline(
    task_id: str, body: SoftDeadlineCreate, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
) -> SoftDeadlineOut:
    """UC-05: add a checkpoint strictly before the final due date."""
    task, membership = require_task_access(db, user.id, task_id, ALL_ROLES)
    if not _can_manage(membership, task, user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if task.due_date is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=NEEDS_DUE_DATE)
    if not is_valid_soft_deadline(body.due_at, task.due_date):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=MUST_BE_EARLIER)
    now = utcnow()
    sd = SoftDeadline(
        task_id=task.id,
        project_id=task.project_id,
        title=body.title,
        due_at=body.due_at,
        priority=body.priority,
        created_by=user.id,
        created_at=now,
        updated_at=now,
    )
    db.add(sd)
    db.commit()
    db.refresh(sd)
    _broadcast(db, sd, "created")
    return soft_deadline_out(sd, task, True)


@router.put("/api/soft-deadlines/{soft_deadline_id}", response_model=SoftDeadlineOut)
def update_soft_deadline(
    soft_deadline_id: str,
    body: SoftDeadlineUpdate,
    user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """UC-06: on an invalid date nothing is saved and the original record is returned with the error."""
    sd, task, _ = _load(db, user.id, soft_deadline_id)
    if body.due_at is not None and not is_valid_soft_deadline(body.due_at, task.due_date):
        original = soft_deadline_out(sd, task, True).model_dump(mode="json")
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": MUST_BE_EARLIER if task.due_date else NEEDS_DUE_DATE, "original": original},
        )
    if body.title is not None:
        sd.title = body.title
    if body.due_at is not None:
        sd.due_at = body.due_at
    if body.priority is not None:
        sd.priority = body.priority
    sd.updated_at = utcnow()
    db.commit()
    db.refresh(sd)
    _broadcast(db, sd, "updated")
    return soft_deadline_out(sd, task, True)


@router.patch("/api/soft-deadlines/{soft_deadline_id}/complete", response_model=SoftDeadlineOut)
def complete_soft_deadline(
    soft_deadline_id: str,
    body: SoftDeadlineComplete | None = None,
    user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SoftDeadlineOut:
    sd, task, _ = _load(db, user.id, soft_deadline_id)
    done = True if body is None else body.is_completed
    sd.is_completed = done
    sd.completed_at = utcnow() if done else None
    sd.updated_at = utcnow()
    db.commit()
    db.refresh(sd)
    _broadcast(db, sd, "completed" if done else "reopened")
    return soft_deadline_out(sd, task, True)


@router.delete("/api/soft-deadlines/{soft_deadline_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_soft_deadline(
    soft_deadline_id: str, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
) -> Response:
    sd, _, _ = _load(db, user.id, soft_deadline_id)
    db.delete(sd)
    db.commit()
    _broadcast(db, sd, "deleted")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
