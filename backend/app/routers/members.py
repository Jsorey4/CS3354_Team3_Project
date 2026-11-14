"""
@author: Aashwat Singh
@description: Project people management. Owners and managers can invite existing ProjectForge users,
    remove members (optionally handing all of that person's unfinished tasks to someone else in the same
    database transaction) and change roles. A project can never be left without an owner: demoting or
    removing the last owner is refused with "Project must have at least one owner". Only an owner may grant
    or take away the owner role. Every change notifies the affected person, and the new role applies on
    their very next request because permissions are re-checked server-side each time.
@traces: SE-FR-30, SE-NFR-11, UC-19, UC-20
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.core.database import get_db, utcnow
from app.core.permissions import ALL_ROLES, MANAGERS, OWNER, get_membership, require_project_role
from app.core.realtime import hub
from app.core.security import get_current_user
from app.models.entities import Project, ProjectMember, Task, TimeEntry, UserProfile
from app.routers.collaboration import create_notifications, publish_notifications
from app.routers.projects import CARD_PALETTE, list_members, project_member_ids
from app.routers.time_tracking import finish_entry
from app.schemas.dto import InviteRequest, MemberOut, RemoveMemberResult, RoleChangeRequest

router = APIRouter(prefix="/api/projects/{project_id}/members", tags=["members"])

LAST_OWNER = "Project must have at least one owner"
OWNER_ONLY = "Only an owner can grant or remove the owner role"


def _owner_count(db: Session, project_id: str) -> int:
    return int(
        db.execute(
            select(func.count()).select_from(ProjectMember).where(
                ProjectMember.project_id == project_id, ProjectMember.role == OWNER
            )
        ).scalar_one()
    )


def _project(db: Session, project_id: str) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def _lock_project(db: Session, project_id: str) -> Project:
    """Serialises membership changes per project (UC-19, UC-20).

    SELECT ... FOR UPDATE on the project row is the first statement of every role change and removal, so
    two such requests for one project run one after the other. Whatever is read after this call - who the
    caller is, the target's role, how many owners remain - is still true when the change is committed.
    Without it two owners could demote each other at the same instant and leave the project with none.
    """
    project = db.execute(select(Project).where(Project.id == project_id).with_for_update()).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def _fresh_membership(db: Session, user_id: str, project_id: str) -> ProjectMember | None:
    """Re-reads a membership from the database (not the session cache) after the project lock is held."""
    return db.execute(
        select(ProjectMember)
        .where(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .execution_options(populate_existing=True)
    ).scalar_one_or_none()


def _require_fresh_role(db: Session, user_id: str, project_id: str, allowed: frozenset[str] | set[str]) -> ProjectMember:
    membership = _fresh_membership(db, user_id, project_id)
    if membership is None or membership.role not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return membership


def _member_out(db: Session, project_id: str, user_id: str) -> MemberOut:
    members = list_members(db, project_id, only_user_id=user_id)  # one member, not the whole project
    if not members:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    return members[0]


@router.get("", response_model=list[MemberOut])
def get_members(project_id: str, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)) -> list[MemberOut]:
    require_project_role(db, user.id, project_id, ALL_ROLES)
    return list_members(db, project_id)


@router.post("/invite", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
def invite_member(
    project_id: str, body: InviteRequest, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
) -> MemberOut:
    """UC-19: owners / managers add an existing user by username or email."""
    require_project_role(db, user.id, project_id, MANAGERS)
    project = _lock_project(db, project_id)
    caller = _require_fresh_role(db, user.id, project_id, MANAGERS)
    if body.role == OWNER and caller.role != OWNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=OWNER_ONLY)
    ident = body.identifier.strip().lstrip("@").lower()
    invitee = db.execute(
        select(UserProfile).where(or_(func.lower(UserProfile.username) == ident, func.lower(UserProfile.email) == ident))
    ).scalar_one_or_none()
    if invitee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No ProjectForge user has that username or email")
    if get_membership(db, invitee.id, project_id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That person is already a member of this project")
    next_order = int(
        db.execute(
            select(func.coalesce(func.max(ProjectMember.card_order), -1)).where(ProjectMember.user_id == invitee.id)
        ).scalar_one()
    ) + 1
    db.add(
        ProjectMember(
            project_id=project_id,
            user_id=invitee.id,
            role=body.role,
            card_color=CARD_PALETTE[next_order % len(CARD_PALETTE)],
            card_order=next_order,
            joined_at=utcnow(),
        )
    )
    notes = create_notifications(
        db,
        [invitee.id],
        kind="member_added",
        message=f"{user.display_name or user.username} added you to “{project.name}” as {body.role}",
        project_id=project_id,
        link=f"/projects/{project_id}",
    )
    db.commit()
    publish_notifications(notes)
    hub.publish(project_member_ids(db, project_id), "membership_changed", {"project_id": project_id, "user_id": invitee.id})
    return _member_out(db, project_id, invitee.id)


@router.delete("/{user_id}", response_model=RemoveMemberResult)
def remove_member(
    project_id: str,
    user_id: str,
    reassign_to_user_id: str | None = Query(None),
    user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RemoveMemberResult:
    """UC-19: remove a member and atomically reassign (or unassign) their open tasks."""
    leaving_self = user_id == user.id
    allowed = ALL_ROLES if leaving_self else MANAGERS
    require_project_role(db, user.id, project_id, allowed)  # cheap refusal before taking the lock
    project = _lock_project(db, project_id)
    caller = _require_fresh_role(db, user.id, project_id, allowed)
    target = caller if leaving_self else _fresh_membership(db, user_id, project_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if target.role == OWNER:
        if caller.role != OWNER:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=OWNER_ONLY)
        if _owner_count(db, project_id) <= 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=LAST_OWNER)
    if reassign_to_user_id is not None:
        if reassign_to_user_id == user_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a different person to take over the tasks")
        if _fresh_membership(db, reassign_to_user_id, project_id) is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tasks can only be reassigned to a current project member")

    now = utcnow()
    open_task_ids = list(
        db.execute(
            select(Task.id).where(Task.project_id == project_id, Task.assignee_id == user_id, Task.status != "done")
        ).scalars()
    )
    # One UPDATE inside the same transaction as the membership delete: all-or-nothing.
    if open_task_ids:
        db.execute(
            update(Task).where(Task.id.in_(open_task_ids)).values(assignee_id=reassign_to_user_id, updated_at=now)
        )
    # Stop the leaving member's running timer properly, so the hours worked so far are kept (UC-04).
    for entry in db.execute(
        select(TimeEntry).where(TimeEntry.project_id == project_id, TimeEntry.user_id == user_id, TimeEntry.ended_at.is_(None))
    ).scalars():
        finish_entry(entry, now)
    db.delete(target)

    notes = []
    if not leaving_self:
        notes += create_notifications(
            db,
            [user_id],
            kind="member_removed",
            message=f"You were removed from “{project.name}”",
            link="/projects",
        )
    if reassign_to_user_id and open_task_ids and reassign_to_user_id != user.id:
        notes += create_notifications(
            db,
            [reassign_to_user_id],
            kind="task_reassigned",
            message=f"{len(open_task_ids)} task(s) in “{project.name}” were reassigned to you",
            project_id=project_id,
            link=f"/board?project={project_id}",
        )
    db.commit()
    publish_notifications(notes)
    recipients = project_member_ids(db, project_id) + [user_id]
    hub.publish(recipients, "membership_changed", {"project_id": project_id, "user_id": user_id})
    if open_task_ids:
        hub.publish(project_member_ids(db, project_id), "task_changed", {"project_id": project_id, "task_id": None, "action": "reassigned"})
    return RemoveMemberResult(
        removed_user_id=user_id,
        reassigned_task_count=len(open_task_ids) if reassign_to_user_id else 0,
        reassigned_to=reassign_to_user_id,
    )


@router.patch("/{user_id}/role", response_model=MemberOut)
def change_role(
    project_id: str,
    user_id: str,
    body: RoleChangeRequest,
    user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MemberOut:
    """UC-20: change a member's role; the last owner can never be demoted (SE-NFR-11).

    The owner count is read after _lock_project(), inside the same transaction that writes the new role,
    so concurrent requests cannot both pass the "is another owner left?" check.
    """
    require_project_role(db, user.id, project_id, MANAGERS)  # cheap refusal before taking the lock
    project = _lock_project(db, project_id)
    caller = _require_fresh_role(db, user.id, project_id, MANAGERS)
    target = caller if user_id == user.id else _fresh_membership(db, user_id, project_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if body.role == target.role:
        return _member_out(db, project_id, user_id)
    if target.role == OWNER and body.role != OWNER and _owner_count(db, project_id) <= 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=LAST_OWNER)
    if (target.role == OWNER or body.role == OWNER) and caller.role != OWNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=OWNER_ONLY)
    previous = target.role
    target.role = body.role
    notes = []
    if user_id != user.id:
        notes = create_notifications(
            db,
            [user_id],
            kind="role_change",
            message=f"Your role in “{project.name}” changed from {previous} to {body.role}",
            project_id=project_id,
            link=f"/projects/{project_id}",
        )
    db.commit()
    publish_notifications(notes)
    hub.publish(project_member_ids(db, project_id), "membership_changed", {"project_id": project_id, "user_id": user_id, "role": body.role})
    return _member_out(db, project_id, user_id)
