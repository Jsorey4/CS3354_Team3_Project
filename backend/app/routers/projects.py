"""
@author: Saaqib Shaik
@description: Creating, listing, editing and deleting projects; per-user project card color and order;
    project progress (overall and per feature list, to 0.01%) pushed live to every member whenever a task
    changes; and the combined calendar feed of project deadlines, task due dates and soft deadlines.
    New projects check all requested member usernames with ONE database query, so a 50+ person team is
    validated as fast as a 2 person team, and unknown usernames are reported back so the creator can fix
    or invite them.
@traces: SE-FR-16, SE-FR-17, SE-FR-18, SE-NFR-09, SE-NFR-10, UC-12, UC-13
"""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import case, delete, func, select
from sqlalchemy.orm import Session

from app.core.database import get_db, utcnow
from app.core.permissions import ALL_ROLES, MANAGERS, OWNERS, require_project_role
from app.core.realtime import hub
from app.core.security import get_current_user
from app.models.entities import Project, ProjectMember, SoftDeadline, Task, TaskList, UserProfile
from app.routers.collaboration import create_notifications, publish_notifications
from app.schemas.dto import (
    CalendarEventOut,
    CardCustomization,
    FeatureProgress,
    FieldValidationError,
    MemberOut,
    ProgressOut,
    ProjectCreate,
    ProjectDetailOut,
    ProjectOut,
    ProjectUpdate,
    TaskListOut,
    UserBrief,
)

router = APIRouter(tags=["projects"])

CARD_PALETTE = ["#6366F1", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6"]
DEFAULT_LISTS = ["Planning", "Development", "Testing"]
PCT = Decimal("0.01")


def percent(done: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return float((Decimal(done) * 100 / Decimal(total)).quantize(PCT, rounding=ROUND_HALF_UP))


def task_counts(db: Session, project_ids: list[str]) -> dict[str, tuple[int, int]]:
    """One grouped query: project_id -> (total tasks, done tasks)."""
    if not project_ids:
        return {}
    rows = db.execute(
        select(
            Task.project_id,
            func.count(Task.id),
            func.coalesce(func.sum(case((Task.status == "done", 1), else_=0)), 0),
        )
        .where(Task.project_id.in_(project_ids))
        .group_by(Task.project_id)
    ).all()
    return {pid: (int(total), int(done)) for pid, total, done in rows}


def member_counts(db: Session, project_ids: list[str]) -> dict[str, int]:
    if not project_ids:
        return {}
    rows = db.execute(
        select(ProjectMember.project_id, func.count(ProjectMember.id))
        .where(ProjectMember.project_id.in_(project_ids))
        .group_by(ProjectMember.project_id)
    ).all()
    return {pid: int(n) for pid, n in rows}


def member_previews(db: Session, project_ids: list[str], limit: int = 5) -> dict[str, list[UserBrief]]:
    """One query for the avatar stacks on project cards (SE-NFR-09).

    A ROW_NUMBER() window keeps only the first `limit` members of each project inside the database, so the
    result is O(P * limit) rows and four small columns per row - not every member (and every column,
    password hash included) of every project, which is what the 50+ member case would otherwise load.
    """
    if not project_ids:
        return {}
    rank = case((ProjectMember.role == "owner", 0), (ProjectMember.role == "manager", 1), else_=2)
    ranked = (
        select(
            ProjectMember.project_id.label("project_id"),
            UserProfile.id.label("id"),
            UserProfile.username.label("username"),
            UserProfile.display_name.label("display_name"),
            UserProfile.avatar_url.label("avatar_url"),
            func.row_number()
            .over(partition_by=ProjectMember.project_id, order_by=(rank, ProjectMember.joined_at, ProjectMember.id))
            .label("rn"),
        )
        .join(UserProfile, UserProfile.id == ProjectMember.user_id)
        .where(ProjectMember.project_id.in_(project_ids))
        .subquery()
    )
    rows = db.execute(select(ranked).where(ranked.c.rn <= limit).order_by(ranked.c.project_id, ranked.c.rn)).all()
    out: dict[str, list[UserBrief]] = {}
    for row in rows:
        out.setdefault(row.project_id, []).append(
            UserBrief(id=row.id, username=row.username, display_name=row.display_name, avatar_url=row.avatar_url)
        )
    return out


def project_member_ids(db: Session, project_id: str) -> list[str]:
    return list(db.execute(select(ProjectMember.user_id).where(ProjectMember.project_id == project_id)).scalars())


def compute_progress(db: Session, project_id: str) -> ProgressOut:
    lists = db.execute(
        select(TaskList).where(TaskList.project_id == project_id).order_by(TaskList.position, TaskList.created_at)
    ).scalars().all()
    rows = db.execute(
        select(
            Task.list_id,
            func.count(Task.id),
            func.coalesce(func.sum(case((Task.status == "done", 1), else_=0)), 0),
        )
        .where(Task.project_id == project_id)
        .group_by(Task.list_id)
    ).all()
    by_list = {lid: (int(total), int(done)) for lid, total, done in rows}
    total = sum(t for t, _ in by_list.values())
    done = sum(d for _, d in by_list.values())
    features = [
        FeatureProgress(
            list_id=lst.id,
            name=lst.name,
            total=by_list.get(lst.id, (0, 0))[0],
            done=by_list.get(lst.id, (0, 0))[1],
            progress_pct=percent(by_list.get(lst.id, (0, 0))[1], by_list.get(lst.id, (0, 0))[0]),
        )
        for lst in lists
    ]
    if None in by_list:
        t, d = by_list[None]
        features.append(FeatureProgress(list_id=None, name="No list", total=t, done=d, progress_pct=percent(d, t)))
    return ProgressOut(
        project_id=project_id,
        overall_progress_pct=percent(done, total),
        total_tasks=total,
        done_tasks=done,
        feature_progress=features,
    )


def broadcast_progress(db: Session, project_id: str, recipients: list[str] | None = None) -> ProgressOut:
    """SE-NFR-10: push the recomputed progress to every current member (delivered well under 2 seconds)."""
    progress = compute_progress(db, project_id)
    if recipients is None:
        recipients = project_member_ids(db, project_id)
    hub.publish(recipients, "progress", progress.model_dump(mode="json"))
    return progress


def _project_out(project: Project, membership: ProjectMember, counts: dict, members: dict, previews: dict | None = None) -> ProjectOut:
    total, done = counts.get(project.id, (0, 0))
    return ProjectOut(
        id=project.id,
        name=project.name,
        description=project.description,
        status=project.status,
        project_type=project.project_type,
        deadline=project.deadline,
        created_at=project.created_at,
        my_role=membership.role,
        card_color=membership.card_color,
        card_order=membership.card_order,
        progress_pct=percent(done, total),
        task_count=total,
        done_count=done,
        member_count=members.get(project.id, 0),
        members_preview=(previews or {}).get(project.id, []),
    )


def list_members(db: Session, project_id: str, only_user_id: str | None = None) -> list[MemberOut]:
    """Members with their task counts: two queries for any number of members (no per-member lookups).

    Only the columns shown on the People page are selected; credential columns never leave the database.
    """
    member_stmt = (
        select(
            ProjectMember.role,
            ProjectMember.joined_at,
            UserProfile.id,
            UserProfile.username,
            UserProfile.display_name,
            UserProfile.email,
            UserProfile.avatar_url,
        )
        .join(UserProfile, UserProfile.id == ProjectMember.user_id)
        .where(ProjectMember.project_id == project_id)
        .order_by(case((ProjectMember.role == "owner", 0), (ProjectMember.role == "manager", 1), else_=2), UserProfile.username)
    )
    task_stmt = (
        select(
            Task.assignee_id,
            func.count(Task.id),
            func.coalesce(func.sum(case((Task.status == "done", 1), else_=0)), 0),
        )
        .where(Task.project_id == project_id, Task.assignee_id.is_not(None))
        .group_by(Task.assignee_id)
    )
    if only_user_id is not None:
        member_stmt = member_stmt.where(ProjectMember.user_id == only_user_id)
        task_stmt = task_stmt.where(Task.assignee_id == only_user_id)
    totals = {uid: (int(total), int(done)) for uid, total, done in db.execute(task_stmt).all()}
    return [
        MemberOut(
            user_id=row.id,
            username=row.username,
            display_name=row.display_name,
            email=row.email,
            avatar_url=row.avatar_url,
            role=row.role,
            joined_at=row.joined_at,
            open_task_count=totals.get(row.id, (0, 0))[0] - totals.get(row.id, (0, 0))[1],
            task_count=totals.get(row.id, (0, 0))[0],
            done_task_count=totals.get(row.id, (0, 0))[1],
        )
        for row in db.execute(member_stmt).all()
    ]


def project_detail(db: Session, project: Project, membership: ProjectMember) -> ProjectDetailOut:
    base = _project_out(project, membership, task_counts(db, [project.id]), member_counts(db, [project.id]), member_previews(db, [project.id]))
    lists = db.execute(
        select(TaskList).where(TaskList.project_id == project.id).order_by(TaskList.position, TaskList.created_at)
    ).scalars().all()
    return ProjectDetailOut(
        **base.model_dump(),
        members=list_members(db, project.id),
        lists=[TaskListOut.model_validate(lst) for lst in lists],
    )


def _load_project(db: Session, project_id: str) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.get("/api/projects", response_model=list[ProjectOut])
def list_projects(user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)) -> list[ProjectOut]:
    rows = db.execute(
        select(Project, ProjectMember)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == user.id)
        .order_by(ProjectMember.card_order, Project.created_at)
    ).all()
    ids = [p.id for p, _ in rows]
    counts = task_counts(db, ids)
    members = member_counts(db, ids)
    previews = member_previews(db, ids)
    return [_project_out(p, m, counts, members, previews) for p, m in rows]


@router.post("/api/projects", response_model=ProjectDetailOut, status_code=status.HTTP_201_CREATED)
def create_project(
    body: ProjectCreate, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
):
    """UC-12: validate fields, bulk-check members in one query, save creator as owner, broadcast."""
    if body.deadline <= utcnow():
        raise FieldValidationError({"deadline": "Deadline must be in the future"})

    requested = [name for name in body.members if name.lower() != user.username.lower()]
    found: dict[str, UserProfile] = {}
    if requested:
        # Single O(M) set query - no N+1 lookups even for 50+ members (SE-NFR-09).
        lowered = [name.lower() for name in requested]
        users = db.execute(select(UserProfile).where(func.lower(UserProfile.username).in_(lowered))).scalars().all()
        found = {u.username.lower(): u for u in users}
    unknown = [name for name in requested if name.lower() not in found]
    if unknown:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "detail": "Some usernames do not match a ProjectForge account. Remove them or invite them to sign up.",
                "unknown_members": unknown,
            },
        )

    now = utcnow()
    project = Project(
        name=body.name,
        description=body.description.strip(),
        status=body.status,
        project_type=body.project_type,
        deadline=body.deadline,
        created_by=user.id,
        created_at=now,
        updated_at=now,
    )
    db.add(project)
    db.flush()

    next_order = db.execute(
        select(func.coalesce(func.max(ProjectMember.card_order), -1)).where(ProjectMember.user_id == user.id)
    ).scalar_one()
    db.add(
        ProjectMember(
            project_id=project.id,
            user_id=user.id,
            role="owner",
            card_color=body.card_color or CARD_PALETTE[(int(next_order) + 1) % len(CARD_PALETTE)],
            card_order=int(next_order) + 1,
            joined_at=now,
        )
    )
    member_users = list({u.id: u for u in found.values()}.values())
    if member_users:
        orders = dict(
            db.execute(
                select(ProjectMember.user_id, func.max(ProjectMember.card_order))
                .where(ProjectMember.user_id.in_([u.id for u in member_users]))
                .group_by(ProjectMember.user_id)
            ).all()
        )
        db.add_all(
            ProjectMember(
                project_id=project.id,
                user_id=u.id,
                role="member",
                card_color=CARD_PALETTE[(int(orders.get(u.id, -1)) + 1) % len(CARD_PALETTE)],
                card_order=int(orders.get(u.id, -1)) + 1,
                joined_at=now,
            )
            for u in member_users
        )
    db.add_all(TaskList(project_id=project.id, name=name, position=i, created_at=now) for i, name in enumerate(DEFAULT_LISTS))
    notes = create_notifications(
        db,
        [u.id for u in member_users],
        kind="member_added",
        message=f"{user.display_name or user.username} added you to “{project.name}”",
        project_id=project.id,
        link=f"/projects/{project.id}",
    )
    db.commit()
    publish_notifications(notes)

    membership = require_project_role(db, user.id, project.id, OWNERS)
    detail = project_detail(db, project, membership)
    hub.publish([user.id, *[u.id for u in member_users]], "project_created", {"project_id": project.id, "name": project.name})
    return detail


@router.get("/api/projects/{project_id}", response_model=ProjectDetailOut)
def get_project(project_id: str, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)) -> ProjectDetailOut:
    membership = require_project_role(db, user.id, project_id, ALL_ROLES)
    return project_detail(db, _load_project(db, project_id), membership)


@router.put("/api/projects/{project_id}", response_model=ProjectDetailOut)
def update_project(
    project_id: str, body: ProjectUpdate, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
) -> ProjectDetailOut:
    membership = require_project_role(db, user.id, project_id, MANAGERS)
    project = _load_project(db, project_id)
    if body.deadline is not None and body.deadline != project.deadline:
        if body.deadline <= utcnow():
            raise FieldValidationError({"deadline": "Deadline must be in the future"})
        project.deadline = body.deadline
    if body.name is not None:
        project.name = body.name
    if body.description is not None:
        project.description = body.description.strip()
    if body.status is not None:
        project.status = body.status
    if body.project_type is not None:
        project.project_type = body.project_type
    db.commit()
    hub.publish(project_member_ids(db, project_id), "project_updated", {"project_id": project_id})
    return project_detail(db, project, membership)


@router.delete("/api/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    """Owner only (RBAC matrix)."""
    require_project_role(db, user.id, project_id, OWNERS)
    _load_project(db, project_id)
    recipients = project_member_ids(db, project_id)
    # One DELETE; the database removes members, lists, tasks, comments, costs and time entries through
    # ON DELETE CASCADE. (Deleting the rows one by one from Python would be O(rows) statements, and would
    # try to remove the last owner's membership while the project still exists, which the database's
    # "at least one owner" rule rightly refuses.)
    db.execute(delete(Project).where(Project.id == project_id))
    db.commit()
    db.expire_all()
    hub.publish(recipients, "project_deleted", {"project_id": project_id})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/api/projects/{project_id}/card-customization", response_model=ProjectOut)
def customize_card(
    project_id: str, body: CardCustomization, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
) -> ProjectOut:
    """UC-13: each member personalises their own card color and order."""
    membership = require_project_role(db, user.id, project_id, ALL_ROLES)
    if body.card_color is None and body.card_order is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")
    if body.card_color is not None:
        membership.card_color = body.card_color
    if body.card_order is not None and body.card_order != membership.card_order:
        # Re-number this user's cards so the moved card lands exactly at card_order.
        others = db.execute(
            select(ProjectMember)
            .where(ProjectMember.user_id == user.id, ProjectMember.id != membership.id)
            .order_by(ProjectMember.card_order, ProjectMember.joined_at)
        ).scalars().all()
        target = min(body.card_order, len(others))
        ordered = others[:target] + [membership] + others[target:]
        for index, row in enumerate(ordered):
            row.card_order = index
    db.commit()
    project = _load_project(db, project_id)
    return _project_out(project, membership, task_counts(db, [project_id]), member_counts(db, [project_id]))


@router.get("/api/projects/{project_id}/progress", response_model=ProgressOut)
def get_progress(project_id: str, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)) -> ProgressOut:
    require_project_role(db, user.id, project_id, ALL_ROLES)
    _load_project(db, project_id)
    return compute_progress(db, project_id)


# ---------------------------------------------------------------------------
# Calendar feed (calendar.html / calendar-week.html)
# ---------------------------------------------------------------------------
def collect_events(
    db: Session, user_id: str, start: datetime, end: datetime, project_id: str | None = None
) -> list[CalendarEventOut]:
    """All deadlines in [start, end) for projects the user belongs to, sorted by time."""
    membership_stmt = (
        select(Project, ProjectMember.card_color)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == user_id)
    )
    if project_id:
        membership_stmt = membership_stmt.where(Project.id == project_id)
    projects = {p.id: (p, color) for p, color in db.execute(membership_stmt).all()}
    if not projects:
        return []
    ids = list(projects)
    events: list[CalendarEventOut] = []
    for pid, (project, color) in projects.items():
        if start <= project.deadline < end:
            events.append(
                CalendarEventOut(
                    id=f"project-{pid}",
                    kind="project_deadline",
                    title=f"{project.name} deadline",
                    starts_at=project.deadline,
                    project_id=pid,
                    project_name=project.name,
                    color=color,
                    is_completed=project.status == "completed",
                )
            )
    tasks = db.execute(
        select(Task).where(Task.project_id.in_(ids), Task.due_date.is_not(None), Task.due_date >= start, Task.due_date < end)
    ).scalars().all()
    for task in tasks:
        project, color = projects[task.project_id]
        events.append(
            CalendarEventOut(
                id=f"task-{task.id}",
                kind="task_due",
                title=task.title,
                starts_at=task.due_date,
                project_id=task.project_id,
                project_name=project.name,
                task_id=task.id,
                color=color,
                is_completed=task.status == "done",
            )
        )
    soft = db.execute(
        select(SoftDeadline, Task.title)
        .join(Task, Task.id == SoftDeadline.task_id)
        .where(SoftDeadline.project_id.in_(ids), SoftDeadline.due_at >= start, SoftDeadline.due_at < end)
    ).all()
    for sd, task_title in soft:
        project, color = projects[sd.project_id]
        events.append(
            CalendarEventOut(
                id=f"soft-{sd.id}",
                kind="soft_deadline",
                title=f"{sd.title} · {task_title}",
                starts_at=sd.due_at,
                project_id=sd.project_id,
                project_name=project.name,
                task_id=sd.task_id,
                color=color,
                is_completed=sd.is_completed,
            )
        )
    events.sort(key=lambda e: (e.starts_at, e.kind, e.title))
    return events


@router.get("/api/calendar/events", response_model=list[CalendarEventOut])
def calendar_events(
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    project_id: str | None = Query(None),
    user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CalendarEventOut]:
    from app.core.database import to_naive_utc

    now = utcnow()
    start_n = to_naive_utc(start) if start else now - timedelta(days=31)
    end_n = to_naive_utc(end) if end else now + timedelta(days=62)
    if end_n <= start_n:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="End must be after start")
    if end_n - start_n > timedelta(days=400):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Calendar range is limited to 400 days")
    if project_id:
        require_project_role(db, user.id, project_id, ALL_ROLES)
    return collect_events(db, user.id, start_n, end_n, project_id)
