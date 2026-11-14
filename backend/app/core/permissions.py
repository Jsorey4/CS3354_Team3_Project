"""
@author: Aashwat Singh (roles & membership) - shared by every router owner
@description: The single place where the backend decides "is this person allowed to do this in this
    project?". Every endpoint calls require_project_role() before reading or changing project data, so
    hiding a button in the browser is never the only protection. It looks the membership up through the
    (project_id, user_id) composite index in O(log M) time and answers 403 "Access denied" otherwise.
@traces: SE-FR-26, SE-FR-30, SE-NFR-02, SE-NFR-11, UC-01, UC-02, UC-18, UC-19, UC-20

RBAC matrix enforced across all routers
    owner   - everything, including DELETE /api/projects/{id} and granting / revoking the owner role
    manager - edit project, invite / remove members, change roles (never leaving zero owners), create /
              edit / assign tasks, manage all soft deadlines, view & edit bids, budgets, stage costs,
              expenses, set estimated / assigned hours, view team-wide performance reports
    member  - view project / tasks / comments / soft deadlines, update or complete tasks assigned to
              themselves, manage soft deadlines on their own tasks, log their own hours / timer, view only
              their own hours & performance; denied (403) all financial data and other members' hours
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import ProjectMember, Task

OWNER = "owner"
MANAGER = "manager"
MEMBER = "member"
ALL_ROLES: frozenset[str] = frozenset({OWNER, MANAGER, MEMBER})
MANAGERS: frozenset[str] = frozenset({OWNER, MANAGER})
OWNERS: frozenset[str] = frozenset({OWNER})

ACCESS_DENIED = "Access denied"


def get_membership(db: Session, user_id: str, project_id: str) -> ProjectMember | None:
    """O(log M) point lookup on the uq_project_members_project_user composite index."""
    return db.execute(
        select(ProjectMember).where(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
    ).scalar_one_or_none()


def require_project_role(db: Session, user_id: str, project_id: str, allowed_roles: set[str] | frozenset[str]) -> ProjectMember:
    """Returns the caller's membership or raises 403 when they are not a member / lack an allowed role."""
    membership = get_membership(db, user_id, project_id)
    if membership is None or membership.role not in allowed_roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCESS_DENIED)
    return membership


def can_assign_tasks(role: str | None) -> bool:
    """Membership.canAssignTasks(): only owners and managers create tasks or change assignees."""
    return role in MANAGERS


def is_manager(role: str | None) -> bool:
    return role in MANAGERS


def load_task(db: Session, task_id: str) -> Task:
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


def require_task_access(
    db: Session, user_id: str, task_id: str, allowed_roles: set[str] | frozenset[str] = ALL_ROLES
) -> tuple[Task, ProjectMember]:
    task = load_task(db, task_id)
    membership = require_project_role(db, user_id, task.project_id, allowed_roles)
    return task, membership


def require_task_editor(db: Session, user_id: str, task: Task) -> ProjectMember:
    """Owners / managers may edit any task; members only tasks assigned to themselves."""
    membership = require_project_role(db, user_id, task.project_id, ALL_ROLES)
    if membership.role in MANAGERS or task.assignee_id == user_id:
        return membership
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCESS_DENIED)
