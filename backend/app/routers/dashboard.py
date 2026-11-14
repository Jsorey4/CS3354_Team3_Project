"""
@author: Myoram Langwang
@description: The personal dashboard. Returns the user's widget layout together with all the data those
    widgets display in one response (so the page loads in under 3 seconds), filtered by the user's role in
    each project - budget figures only appear for projects where they are an owner or manager. Widgets can
    be added, removed, hidden, moved on a 12-column grid and reset to the default layout. A move that
    would overlap another visible widget is refused with 409 so the browser snaps the widget back.
@traces: SE-FR-21, SE-FR-22, SE-FR-23, SE-FR-24, SE-FR-25, SE-NFR-07, SE-NFR-08, UC-16, UC-17
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db, utcnow
from app.core.permissions import MANAGERS
from app.core.security import get_current_user
from app.models.entities import (
    DashboardWidget,
    Expense,
    Notification,
    Project,
    ProjectFinancials,
    ProjectMember,
    StageCost,
    Task,
    TimeEntry,
    UserProfile,
)
from app.routers.collaboration import ensure_deadline_reminders, unread_count
from app.routers.costs import money_sum
from app.routers.projects import collect_events, percent, task_counts
from app.schemas.dto import DashboardOut, NotificationOut, WidgetCreate, WidgetOut, WidgetPosition, WidgetTypeOut

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

GRID_COLUMNS = 12
WIDGET_UNAVAILABLE = "Widget unavailable"
INVALID_ACTION = "Invalid action"
OVERLAP = "Widget overlaps with an existing widget"


@dataclass(frozen=True)
class WidgetType:
    title: str
    description: str
    width: int
    height: int


# Titles and the default arrangement follow dashboard.html.
WIDGET_TYPES: dict[str, WidgetType] = {
    "upcoming_deadlines": WidgetType("Upcoming deadlines", "Project, task and soft deadlines in the next 14 days", 8, 3),
    "task_progress": WidgetType("Task progress", "Share of tasks done across your projects", 4, 3),
    "project_progress": WidgetType("Projects", "Completion bar for each of your projects", 4, 3),
    "time_summary": WidgetType("Time tracked", "Hours you logged this week and your running timer", 4, 3),
    "budget_overview": WidgetType("Cost summary", "Spend against budget for projects you manage", 4, 3),
    "my_tasks": WidgetType("My tasks", "Open tasks assigned to you, soonest first", 4, 3),
    "notifications": WidgetType("Notifications", "Your latest unread notifications", 4, 3),
    "calendar_week": WidgetType("This week", "A seven-day strip of everything due this week", 8, 2),
}

# (type, x, y) - sizes come from WIDGET_TYPES. Non-overlapping by construction (checked in tests).
DEFAULT_LAYOUT: list[tuple[str, int, int]] = [
    ("upcoming_deadlines", 0, 0),
    ("task_progress", 8, 0),
    ("project_progress", 0, 3),
    ("time_summary", 4, 3),
    ("budget_overview", 8, 3),
]

Rect = tuple[int, int, int, int]


def overlaps(a: Rect, b: Rect) -> bool:
    """AABB: (xA < xB + wB) and (xA + wA > xB) and (yA < yB + hB) and (yA + hA > yB)."""
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return ax < bx + bw and ax + aw > bx and ay < by + bh and ay + ah > by


def collides(rect: Rect, others: list[DashboardWidget]) -> bool:
    """O(W) scan over the user's visible widgets."""
    return any(overlaps(rect, (o.grid_x, o.grid_y, o.width, o.height)) for o in others)


def first_free_slot(width: int, height: int, others: list[DashboardWidget]) -> tuple[int, int]:
    max_y = max((o.grid_y + o.height for o in others), default=0)
    for y in range(0, max_y + 1):
        for x in range(0, GRID_COLUMNS - width + 1):
            if not collides((x, y, width, height), others):
                return x, y
    return 0, max_y


def _create_defaults(db: Session, user_id: str) -> None:
    now = utcnow()
    for widget_type, x, y in DEFAULT_LAYOUT:
        spec = WIDGET_TYPES[widget_type]
        db.add(
            DashboardWidget(
                user_id=user_id,
                widget_type=widget_type,
                grid_x=x,
                grid_y=y,
                width=spec.width,
                height=spec.height,
                is_hidden=False,
                created_at=now,
                updated_at=now,
            )
        )
    db.flush()


def _widgets(db: Session, user_id: str) -> list[DashboardWidget]:
    return list(
        db.execute(
            select(DashboardWidget).where(DashboardWidget.user_id == user_id).order_by(DashboardWidget.grid_y, DashboardWidget.grid_x)
        ).scalars()
    )


def _widget_out(w: DashboardWidget) -> WidgetOut:
    spec = WIDGET_TYPES.get(w.widget_type)
    return WidgetOut(
        id=w.id,
        widget_type=w.widget_type,
        title=spec.title if spec else w.widget_type,
        grid_x=w.grid_x,
        grid_y=w.grid_y,
        width=w.width,
        height=w.height,
        is_hidden=w.is_hidden,
    )


def _own_widget(db: Session, user_id: str, widget_id: str) -> DashboardWidget:
    widget = db.get(DashboardWidget, widget_id)
    if widget is None or widget.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_ACTION)
    return widget


# ---------------------------------------------------------------------------
# Consolidated, role-filtered widget data (SE-NFR-08)
# ---------------------------------------------------------------------------
def build_widget_data(db: Session, user: UserProfile, visible_types: set[str]) -> dict[str, Any]:
    now = utcnow()
    data: dict[str, Any] = {}
    memberships = db.execute(
        select(ProjectMember, Project)
        .join(Project, Project.id == ProjectMember.project_id)
        .where(ProjectMember.user_id == user.id)
        .order_by(ProjectMember.card_order)
    ).all()
    project_ids = [p.id for _, p in memberships]
    # One grouped COUNT for both progress widgets instead of one query each.
    counts = task_counts(db, project_ids) if visible_types & {"project_progress", "task_progress"} else {}

    if "project_progress" in visible_types:
        data["project_progress"] = [
            {
                "project_id": p.id,
                "name": p.name,
                "status": p.status,
                "role": m.role,
                "color": m.card_color,
                "deadline": p.deadline.isoformat(timespec="seconds") + "Z",
                "total": counts.get(p.id, (0, 0))[0],
                "done": counts.get(p.id, (0, 0))[1],
                "progress_pct": percent(counts.get(p.id, (0, 0))[1], counts.get(p.id, (0, 0))[0]),
            }
            for m, p in memberships
        ]

    if "task_progress" in visible_types:
        total = sum(t for t, _ in counts.values())
        done = sum(d for _, d in counts.values())
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        due_today = db.execute(
            select(func.count(Task.id)).where(
                Task.assignee_id == user.id,
                Task.project_id.in_(project_ids),  # current memberships only (SE-NFR-11)
                Task.status != "done",
                Task.due_date >= day_start,
                Task.due_date < day_start + timedelta(days=1),
            )
        ).scalar_one()
        data["task_progress"] = {"total": total, "done": done, "progress_pct": percent(done, total), "due_today": int(due_today)}

    if "my_tasks" in visible_types:
        names = {p.id: p.name for _, p in memberships}
        tasks = db.execute(
            select(Task)
            .where(Task.assignee_id == user.id, Task.project_id.in_(project_ids), Task.status != "done")
            .order_by(Task.due_date, Task.created_at)
            .limit(8)
        ).scalars().all()
        data["my_tasks"] = [
            {
                "task_id": t.id,
                "title": t.title,
                "status": t.status,
                "priority": t.priority,
                "project_id": t.project_id,
                "project_name": names.get(t.project_id, ""),
                "due_date": t.due_date.isoformat(timespec="seconds") + "Z" if t.due_date else None,
                "overdue": bool(t.due_date and t.due_date < now),
            }
            for t in tasks
        ]

    if "upcoming_deadlines" in visible_types or "calendar_week" in visible_types:
        events = collect_events(db, user.id, now - timedelta(hours=12), now + timedelta(days=14))
        serialized = [e.model_dump(mode="json") for e in events if not e.is_completed]
        if "upcoming_deadlines" in visible_types:
            data["upcoming_deadlines"] = serialized[:10]
        if "calendar_week" in visible_types:
            week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
            week_end = week_start + timedelta(days=7)
            week_events = collect_events(db, user.id, week_start, week_end)
            data["calendar_week"] = {
                "week_start": week_start.date().isoformat(),
                "events": [e.model_dump(mode="json") for e in week_events],
            }

    if "notifications" in visible_types:
        ensure_deadline_reminders(db, user)
        latest = db.execute(
            select(Notification)
            .where(Notification.user_id == user.id, Notification.is_read.is_(False))
            .order_by(Notification.created_at.desc())
            .limit(5)
        ).scalars().all()
        data["notifications"] = {
            "unread_count": unread_count(db, user.id),
            "items": [NotificationOut.model_validate(n).model_dump(mode="json") for n in latest],
        }

    if "time_summary" in visible_types:
        week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        entries = db.execute(
            select(TimeEntry.started_at, TimeEntry.duration_hours).where(
                TimeEntry.user_id == user.id,
                TimeEntry.project_id.in_(project_ids),
                TimeEntry.ended_at.is_not(None),
                TimeEntry.started_at >= week_start,
            )
        ).all()
        per_day = [Decimal("0")] * 7
        for started_at, hours in entries:
            per_day[(started_at.date() - week_start.date()).days % 7] += Decimal(str(hours or 0))
        running = db.execute(
            select(TimeEntry)
            .options(joinedload(TimeEntry.task))
            .where(TimeEntry.user_id == user.id, TimeEntry.project_id.in_(project_ids), TimeEntry.ended_at.is_(None))
        ).scalars().first()
        data["time_summary"] = {
            "week_start": week_start.date().isoformat(),
            "total_hours": float(money_sum(per_day)),
            "per_day": [float(money_sum([d])) for d in per_day],
            "running_timer": (
                {
                    "entry_id": running.id,
                    "task_id": running.task_id,
                    "task_title": running.task.title if running.task else "",
                    "started_at": running.started_at.isoformat(timespec="seconds") + "Z",
                    "is_paused": running.pause_started_at is not None,
                }
                if running
                else None
            ),
        }

    if "budget_overview" in visible_types:
        managed = [p for m, p in memberships if m.role in MANAGERS]
        managed_ids = [p.id for p in managed]
        rows: list[dict[str, Any]] = []
        if managed_ids:
            fins = {
                f.project_id: f
                for f in db.execute(select(ProjectFinancials).where(ProjectFinancials.project_id.in_(managed_ids))).scalars()
            }
            stage_sums = dict(
                db.execute(
                    select(StageCost.project_id, func.coalesce(func.sum(StageCost.amount), 0))
                    .where(StageCost.project_id.in_(managed_ids))
                    .group_by(StageCost.project_id)
                ).all()
            )
            spend = dict(
                db.execute(
                    select(Expense.project_id, func.coalesce(func.sum(Expense.amount), 0))
                    .where(Expense.project_id.in_(managed_ids))
                    .group_by(Expense.project_id)
                ).all()
            )
            for p in managed:
                fin = fins.get(p.id)
                rows.append(
                    {
                        "project_id": p.id,
                        "name": p.name,
                        "currency": fin.currency if fin else "USD",
                        "bid_amount": f"{money_sum([fin.bid_amount if fin else 0]):.2f}",
                        "budget_amount": f"{money_sum([fin.budget_amount if fin else 0]):.2f}",
                        "stage_cost_total": f"{money_sum([stage_sums.get(p.id, 0)]):.2f}",
                        "expense_total": f"{money_sum([spend.get(p.id, 0)]):.2f}",
                    }
                )
        data["budget_overview"] = {
            "restricted": not managed_ids,
            "projects": rows,
        }
    return data


def _dashboard(db: Session, user: UserProfile) -> DashboardOut:
    widgets = _widgets(db, user.id)
    if not widgets:
        _create_defaults(db, user.id)
        db.commit()
        widgets = _widgets(db, user.id)
    visible = {w.widget_type for w in widgets if not w.is_hidden}
    return DashboardOut(
        widgets=[_widget_out(w) for w in widgets],
        available_types=[
            WidgetTypeOut(widget_type=k, title=v.title, description=v.description, width=v.width, height=v.height)
            for k, v in WIDGET_TYPES.items()
        ],
        data=build_widget_data(db, user, visible),
        grid_columns=GRID_COLUMNS,
        generated_at=utcnow(),
    )


@router.get("/widgets", response_model=DashboardOut)
def get_widgets(user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)) -> DashboardOut:
    return _dashboard(db, user)


@router.post("/widgets", response_model=DashboardOut, status_code=status.HTTP_201_CREATED)
def add_widget(body: WidgetCreate, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)) -> DashboardOut:
    """UC-16: add a widget at the requested (or first free) spot."""
    spec = WIDGET_TYPES.get(body.widget_type)
    if spec is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=WIDGET_UNAVAILABLE)
    widgets = _widgets(db, user.id)
    existing = next((w for w in widgets if w.widget_type == body.widget_type), None)
    if existing is not None and not existing.is_hidden:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_ACTION)
    visible = [w for w in widgets if not w.is_hidden and w is not existing]
    width = existing.width if existing else spec.width
    height = existing.height if existing else spec.height
    if body.grid_x is not None and body.grid_y is not None and body.grid_x + width <= GRID_COLUMNS and not collides(
        (body.grid_x, body.grid_y, width, height), visible
    ):
        x, y = body.grid_x, body.grid_y
    else:
        x, y = first_free_slot(width, height, visible)
    if existing is not None:
        existing.is_hidden = False
        existing.grid_x, existing.grid_y = x, y
        existing.updated_at = utcnow()
    else:
        db.add(DashboardWidget(user_id=user.id, widget_type=body.widget_type, grid_x=x, grid_y=y, width=width, height=height))
    db.commit()
    return _dashboard(db, user)


@router.delete("/widgets/{widget_id}", response_model=DashboardOut)
def remove_widget(widget_id: str, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)) -> DashboardOut:
    widget = _own_widget(db, user.id, widget_id)
    db.delete(widget)
    db.commit()
    return _dashboard(db, user)


@router.patch("/widgets/{widget_id}/hide", response_model=DashboardOut)
def hide_widget(widget_id: str, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)) -> DashboardOut:
    """Widget.hide()."""
    widget = _own_widget(db, user.id, widget_id)
    if widget.is_hidden:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_ACTION)
    widget.is_hidden = True
    widget.updated_at = utcnow()
    db.commit()
    return _dashboard(db, user)


@router.post("/widgets/restore-default", response_model=DashboardOut)
def restore_default(user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)) -> DashboardOut:
    """Dashboard.restoreDefault() (SE-FR-25)."""
    for widget in _widgets(db, user.id):
        db.delete(widget)
    db.flush()
    _create_defaults(db, user.id)
    db.commit()
    return _dashboard(db, user)


@router.put("/widgets/{widget_id}/position", response_model=WidgetOut)
def move_widget(
    widget_id: str, body: WidgetPosition, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
) -> WidgetOut:
    """UC-17: O(W) AABB check against the user's other visible widgets; 409 on overlap."""
    widget = _own_widget(db, user.id, widget_id)
    if widget.is_hidden:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_ACTION)
    width = body.width or widget.width
    height = body.height or widget.height
    if body.grid_x + width > GRID_COLUMNS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Widget must stay inside the dashboard grid")
    others = [w for w in _widgets(db, user.id) if w.id != widget.id and not w.is_hidden]
    if collides((body.grid_x, body.grid_y, width, height), others):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=OVERLAP)
    widget.grid_x, widget.grid_y, widget.width, widget.height = body.grid_x, body.grid_y, width, height
    widget.updated_at = utcnow()
    db.commit()
    return _widget_out(widget)
