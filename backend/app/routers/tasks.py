"""
@author: Aashwat Singh
@description: Tasks and task lists (features). Only owners and managers may create tasks or choose who a
    task is assigned to (Membership.canAssignTasks); the assignee must be a current project member.
    Members may update or complete the tasks assigned to them. Board drag-and-drop calls Task.moveTo to
    change a task's column / list and position, and every change re-broadcasts project progress live.
    A task always has a due date (UC-18); a status change notifies the task's assignee and creator
    ("project updates", if they opted in).
@traces: SE-FR-26, SE-FR-27, SE-FR-18, SE-FR-29, SE-NFR-10, SE-NFR-11, UC-18
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import case, func, or_, select, update
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db, utcnow
from app.core.permissions import (
    ALL_ROLES,
    MANAGERS,
    can_assign_tasks,
    get_membership,
    require_project_role,
    require_task_access,
    require_task_editor,
)
from app.core.realtime import hub
from app.core.security import get_current_user
from app.models.entities import Comment, Project, ProjectMember, SoftDeadline, Task, TaskList, TimeEntry, UserProfile
from app.routers.collaboration import create_notifications, publish_notifications
from app.routers.projects import broadcast_progress, project_member_ids
from app.schemas.dto import (
    FieldValidationError,
    TaskCreate,
    TaskDetailOut,
    TaskListCreate,
    TaskListOut,
    TaskListUpdate,
    TaskMove,
    TaskOut,
    TaskUpdate,
    UserBrief,
)

router = APIRouter(tags=["tasks"])

ASSIGN_DENIED = "Only owners and managers can assign tasks"
HOURS_DENIED = "Only owners and managers can set estimated or assigned hours"


# ---------------------------------------------------------------------------
# Serialization (batched: O(T) with a constant number of queries)
# ---------------------------------------------------------------------------
def serialize_tasks(db: Session, tasks: list[Task]) -> list[TaskOut]:
    if not tasks:
        return []
    ids = [t.id for t in tasks]
    actual = dict(
        db.execute(
            select(TimeEntry.task_id, func.coalesce(func.sum(TimeEntry.duration_hours), 0))
            .where(TimeEntry.task_id.in_(ids), TimeEntry.ended_at.is_not(None))
            .group_by(TimeEntry.task_id)
        ).all()
    )
    soft_rows = db.execute(
        select(
            SoftDeadline.task_id,
            func.count(SoftDeadline.id),
            func.coalesce(func.sum(case((SoftDeadline.is_completed.is_(True), 1), else_=0)), 0),
            func.min(case((SoftDeadline.is_completed.is_(False), SoftDeadline.due_at), else_=None)),
        )
        .where(SoftDeadline.task_id.in_(ids))
        .group_by(SoftDeadline.task_id)
    ).all()
    soft = {tid: (int(total), int(done), nxt) for tid, total, done, nxt in soft_rows}
    comments = dict(
        db.execute(
            select(Comment.task_id, func.count(Comment.id)).where(Comment.task_id.in_(ids)).group_by(Comment.task_id)
        ).all()
    )
    out: list[TaskOut] = []
    for t in tasks:
        total, done, nxt = soft.get(t.id, (0, 0, None))
        if isinstance(nxt, str):  # SQLite returns MIN() over a CASE expression as text
            nxt = datetime.fromisoformat(nxt)
        out.append(
            TaskOut(
                id=t.id,
                project_id=t.project_id,
                list_id=t.list_id,
                title=t.title,
                description=t.description,
                status=t.status,
                priority=t.priority,
                assignee_id=t.assignee_id,
                assignee=UserBrief.model_validate(t.assignee) if t.assignee else None,
                due_date=t.due_date,
                position=t.position,
                tags=list(t.tags or []),
                estimated_hours=t.estimated_hours,
                assigned_hours=t.assigned_hours,
                actual_hours=Decimal(str(actual.get(t.id, 0) or 0)),
                completed_at=t.completed_at,
                created_at=t.created_at,
                updated_at=t.updated_at,
                soft_deadlines_total=total,
                soft_deadlines_done=done,
                next_soft_deadline_at=nxt,
                comment_count=int(comments.get(t.id, 0)),
            )
        )
    return out


def task_detail(db: Session, task: Task, user_id: str, role: str) -> TaskDetailOut:
    base = serialize_tasks(db, [task])[0]
    project = db.get(Project, task.project_id)
    return TaskDetailOut(
        **base.model_dump(),
        project_name=project.name if project else "",
        my_role=role,
        can_edit=role in MANAGERS or task.assignee_id == user_id,
        can_assign=can_assign_tasks(role),
    )


def _validate_assignee(db: Session, project_id: str, assignee_id: str | None) -> None:
    if assignee_id is None:
        return
    if get_membership(db, assignee_id, project_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assignee must be a member of this project")


def _validate_list(db: Session, project_id: str, list_id: str | None) -> None:
    if list_id is None:
        return
    lst = db.get(TaskList, list_id)
    if lst is None or lst.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That list does not belong to this project")


def _end_of_column(db: Session, project_id: str, status_value: str, exclude_id: str | None = None) -> int:
    stmt = select(func.coalesce(func.max(Task.position), -1)).where(Task.project_id == project_id, Task.status == status_value)
    if exclude_id:
        stmt = stmt.where(Task.id != exclude_id)
    return int(db.execute(stmt).scalar_one()) + 1


def _set_status(task: Task, new_status: str) -> None:
    if new_status == task.status:
        return
    task.status = new_status
    task.completed_at = utcnow() if new_status == "done" else None


def _notify_assignment(db: Session, task: Task, actor: UserProfile) -> list:
    if not task.assignee_id or task.assignee_id == actor.id:
        return []
    return create_notifications(
        db,
        [task.assignee_id],
        kind="assignment",
        message=f"{actor.display_name or actor.username} assigned you “{task.title}”",
        project_id=task.project_id,
        task_id=task.id,
        link=f"/tasks/{task.id}",
    )


STATUS_LABEL = {"todo": "To Do", "in_progress": "In Progress", "review": "Review", "done": "Done"}


def _notify_status_change(db: Session, task: Task, actor: UserProfile, old_status: str) -> list:
    """SE-FR-29 project update: tell the assignee and creator (not the actor) that a task moved."""
    if old_status == task.status:
        return []
    who = actor.display_name or actor.username
    message = (
        f"{who} completed \u201c{task.title}\u201d"
        if task.status == "done"
        else f"{who} moved \u201c{task.title}\u201d to {STATUS_LABEL[task.status]}"
    )
    return create_notifications(
        db,
        [uid for uid in (task.assignee_id, task.created_by) if uid and uid != actor.id],
        kind="project_update",
        message=message,
        project_id=task.project_id,
        task_id=task.id,
        link=f"/tasks/{task.id}",
    )


def _broadcast_task(db: Session, project_id: str, task_id: str, action: str) -> None:
    """Tells the project's *current* members (one membership query, reused for the progress event)."""
    recipients = project_member_ids(db, project_id)
    hub.publish(recipients, "task_changed", {"project_id": project_id, "task_id": task_id, "action": action})
    broadcast_progress(db, project_id, recipients)


# ---------------------------------------------------------------------------
# Task lists
# ---------------------------------------------------------------------------
@router.get("/api/projects/{project_id}/lists", response_model=list[TaskListOut])
def list_task_lists(project_id: str, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)) -> list[TaskListOut]:
    require_project_role(db, user.id, project_id, ALL_ROLES)
    rows = db.execute(
        select(TaskList).where(TaskList.project_id == project_id).order_by(TaskList.position, TaskList.created_at)
    ).scalars().all()
    return [TaskListOut.model_validate(r) for r in rows]


@router.post("/api/projects/{project_id}/lists", response_model=TaskListOut, status_code=status.HTTP_201_CREATED)
def create_task_list(
    project_id: str, body: TaskListCreate, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
) -> TaskListOut:
    require_project_role(db, user.id, project_id, MANAGERS)
    position = body.position
    if position is None:
        position = int(
            db.execute(select(func.coalesce(func.max(TaskList.position), -1)).where(TaskList.project_id == project_id)).scalar_one()
        ) + 1
    lst = TaskList(project_id=project_id, name=body.name, position=position)
    db.add(lst)
    db.commit()
    broadcast_progress(db, project_id)
    return TaskListOut.model_validate(lst)


@router.put("/api/lists/{list_id}", response_model=TaskListOut)
def update_task_list(
    list_id: str, body: TaskListUpdate, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
) -> TaskListOut:
    lst = db.get(TaskList, list_id)
    if lst is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")
    require_project_role(db, user.id, lst.project_id, MANAGERS)
    if body.name is not None:
        lst.name = body.name
    if body.position is not None:
        lst.position = body.position
    db.commit()
    broadcast_progress(db, lst.project_id)
    return TaskListOut.model_validate(lst)


@router.delete("/api/lists/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task_list(list_id: str, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    lst = db.get(TaskList, list_id)
    if lst is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")
    require_project_role(db, user.id, lst.project_id, MANAGERS)
    project_id = lst.project_id
    db.execute(update(Task).where(Task.list_id == list_id).values(list_id=None))
    db.delete(lst)
    db.commit()
    broadcast_progress(db, project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------
@router.get("/api/projects/{project_id}/tasks", response_model=list[TaskOut])
def list_tasks(
    project_id: str,
    status_filter: str | None = Query(None, alias="status"),
    list_id: str | None = Query(None),
    assignee_id: str | None = Query(None),
    tag: str | None = Query(None, max_length=30),
    search: str | None = Query(None, max_length=100),
    user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TaskOut]:
    require_project_role(db, user.id, project_id, ALL_ROLES)
    stmt = select(Task).options(joinedload(Task.assignee)).where(Task.project_id == project_id)
    if status_filter:
        stmt = stmt.where(Task.status == status_filter)
    if list_id:
        stmt = stmt.where(Task.list_id == list_id)
    if assignee_id == "me":
        stmt = stmt.where(Task.assignee_id == user.id)
    elif assignee_id == "none":
        stmt = stmt.where(Task.assignee_id.is_(None))
    elif assignee_id:
        stmt = stmt.where(Task.assignee_id == assignee_id)
    if search:
        term = "%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        stmt = stmt.where(or_(Task.title.ilike(term, escape="\\"), Task.description.ilike(term, escape="\\")))
    tasks = db.execute(stmt.order_by(Task.status, Task.position, Task.created_at)).scalars().all()
    if tag:
        wanted = tag.strip().lower()
        tasks = [t for t in tasks if wanted in (t.tags or [])]
    return serialize_tasks(db, list(tasks))


@router.get("/api/my/tasks", response_model=list[TaskOut])
def my_tasks(
    include_done: bool = Query(False), user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[TaskOut]:
    # Only tasks in projects the caller still belongs to (SE-NFR-11). A task that was finished before its
    # assignee was removed stays assigned to them for the record, but they can no longer read it here.
    stmt = (
        select(Task)
        .options(joinedload(Task.assignee))
        .where(
            Task.assignee_id == user.id,
            Task.project_id.in_(select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)),
        )
    )
    if not include_done:
        stmt = stmt.where(Task.status != "done")
    tasks = db.execute(stmt.order_by(Task.due_date, Task.created_at).limit(500)).scalars().all()
    return serialize_tasks(db, list(tasks))


@router.post("/api/projects/{project_id}/tasks", response_model=TaskDetailOut, status_code=status.HTTP_201_CREATED)
def create_task(
    project_id: str, body: TaskCreate, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
) -> TaskDetailOut:
    """UC-18: only owners / managers create tasks (canAssignTasks)."""
    membership = get_membership(db, user.id, project_id)
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if not can_assign_tasks(membership.role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owners and managers can create tasks")
    _validate_assignee(db, project_id, body.assignee_id)
    _validate_list(db, project_id, body.list_id)
    now = utcnow()
    task = Task(
        project_id=project_id,
        list_id=body.list_id,
        title=body.title,
        description=body.description,
        status=body.status,
        priority=body.priority,
        assignee_id=body.assignee_id,
        due_date=body.due_date,
        position=_end_of_column(db, project_id, body.status),
        tags=body.tags,
        estimated_hours=body.estimated_hours,
        assigned_hours=body.assigned_hours,
        completed_at=now if body.status == "done" else None,
        created_by=user.id,
        created_at=now,
        updated_at=now,
    )
    db.add(task)
    db.flush()
    notes = _notify_assignment(db, task, user)
    db.commit()
    db.refresh(task)
    publish_notifications(notes)
    _broadcast_task(db, project_id, task.id, "created")
    return task_detail(db, task, user.id, membership.role)


@router.get("/api/tasks/{task_id}", response_model=TaskDetailOut)
def get_task(task_id: str, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)) -> TaskDetailOut:
    task, membership = require_task_access(db, user.id, task_id, ALL_ROLES)
    return task_detail(db, task, user.id, membership.role)


@router.put("/api/tasks/{task_id}", response_model=TaskDetailOut)
def update_task(
    task_id: str, body: TaskUpdate, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
) -> TaskDetailOut:
    """Owners / managers edit anything; members edit only their own tasks and never re-assign."""
    task, _ = require_task_access(db, user.id, task_id, ALL_ROLES)
    membership = require_task_editor(db, user.id, task)
    fields = body.model_fields_set
    notes: list = []

    if "assignee_id" in fields and body.assignee_id != task.assignee_id:
        if not can_assign_tasks(membership.role):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ASSIGN_DENIED)
        _validate_assignee(db, task.project_id, body.assignee_id)
    for hours_field in ("estimated_hours", "assigned_hours"):
        if hours_field in fields and getattr(body, hours_field) != getattr(task, hours_field):
            if membership.role not in MANAGERS:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=HOURS_DENIED)
    if "list_id" in fields:
        _validate_list(db, task.project_id, body.list_id)
    if "due_date" in fields and body.due_date is None:
        raise FieldValidationError({"due_date": "Due date is required"})  # UC-18
    if "due_date" in fields and body.due_date != task.due_date:
        latest_soft = db.execute(select(func.max(SoftDeadline.due_at)).where(SoftDeadline.task_id == task.id)).scalar_one()
        if latest_soft is not None:
            if isinstance(latest_soft, str):
                latest_soft = datetime.fromisoformat(latest_soft)
            if body.due_date <= latest_soft:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The final due date must be later than all of this task's soft deadlines")

    if "assignee_id" in fields and body.assignee_id != task.assignee_id:
        task.assignee_id = body.assignee_id
        db.flush()
        db.refresh(task)
        notes = _notify_assignment(db, task, user)
    if body.title is not None:
        task.title = body.title
    if body.description is not None:
        task.description = body.description
    if body.priority is not None:
        task.priority = body.priority
    if body.tags is not None:
        task.tags = body.tags
    if "list_id" in fields:
        task.list_id = body.list_id
    if "due_date" in fields:
        task.due_date = body.due_date
    if "estimated_hours" in fields:
        task.estimated_hours = body.estimated_hours
    if "assigned_hours" in fields:
        task.assigned_hours = body.assigned_hours
    if body.status is not None and body.status != task.status:
        old_status = task.status
        task.position = _end_of_column(db, task.project_id, body.status, exclude_id=task.id)
        _set_status(task, body.status)
        notes = notes + _notify_status_change(db, task, user, old_status)
    task.updated_at = utcnow()
    db.commit()
    db.refresh(task)
    publish_notifications(notes)
    _broadcast_task(db, task.project_id, task.id, "updated")
    return task_detail(db, task, user.id, membership.role)


@router.patch("/api/tasks/{task_id}/move", response_model=list[TaskOut])
def move_task(
    task_id: str, body: TaskMove, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[TaskOut]:
    """Task.moveTo(list_id, position): drag-and-drop between board columns / lists. Returns the column."""
    task, _ = require_task_access(db, user.id, task_id, ALL_ROLES)
    require_task_editor(db, user.id, task)
    fields = body.model_fields_set
    if "list_id" in fields:
        _validate_list(db, task.project_id, body.list_id)
        task.list_id = body.list_id
    target_status = body.status or task.status
    old_status = task.status
    _set_status(task, target_status)
    notes = _notify_status_change(db, task, user, old_status)

    column = db.execute(
        select(Task)
        .where(Task.project_id == task.project_id, Task.status == target_status, Task.id != task.id)
        .order_by(Task.position, Task.created_at)
    ).scalars().all()
    index = min(body.position, len(column))
    ordered = list(column[:index]) + [task] + list(column[index:])
    for pos, row in enumerate(ordered):
        row.position = pos
    task.updated_at = utcnow()
    db.commit()
    publish_notifications(notes)
    _broadcast_task(db, task.project_id, task.id, "moved")
    refreshed = db.execute(
        select(Task)
        .options(joinedload(Task.assignee))
        .where(Task.project_id == task.project_id, Task.status == target_status)
        .order_by(Task.position)
    ).scalars().all()
    return serialize_tasks(db, list(refreshed))


@router.delete("/api/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: str, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    task, _ = require_task_access(db, user.id, task_id, MANAGERS)
    project_id = task.project_id
    db.delete(task)
    db.commit()
    _broadcast_task(db, project_id, task_id, "deleted")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/api/projects/{project_id}/tags", response_model=list[str])
def project_tags(project_id: str, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)) -> list[str]:
    require_project_role(db, user.id, project_id, ALL_ROLES)
    counts: dict[str, int] = defaultdict(int)
    for tags in db.execute(select(Task.tags).where(Task.project_id == project_id)).scalars():
        for tag in tags or []:
            counts[tag] += 1
    return sorted(counts, key=lambda t: (-counts[t], t))
