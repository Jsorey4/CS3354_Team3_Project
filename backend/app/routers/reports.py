"""
@author: Jon Sorey
@description: Performance and efficiency charts for a date range. Owners and managers get team-wide and
    per-person estimated, assigned and actual hours plus completion progress over time; a member's report is
    built ONLY from their own rows (every query is filtered by their user id), so no one else's hours or
    tasks can leak into a total or a chart.
    Efficiency = estimated / actual x 100, rounded to 2 decimals, or "N/A" when there are no actual hours
    or no estimate to compare against.
@traces: SE-FR-05, SE-NFR-02, UC-02
"""

from __future__ import annotations

from bisect import bisect_left
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db, utcnow
from app.core.permissions import ALL_ROLES, MANAGERS, require_project_role
from app.core.security import get_current_user
from app.models.entities import ProjectMember, Task, TimeEntry, UserProfile
from app.schemas.dto import (
    CompletionSummary,
    PerformanceReport,
    PerformanceRow,
    PerformanceTotals,
    TaskEfficiency,
    WeeklyHours,
    WeeklyProgress,
)
from app.routers.projects import percent

router = APIRouter(tags=["reports"])
CENT = Decimal("0.01")


def efficiency_pct(estimated: Decimal | None, actual: Decimal | None) -> float | str:
    """round(estimated / actual * 100, 2); "N/A" when actual is 0 or a metric is missing."""
    if estimated is None or actual is None or actual == 0:
        return "N/A"
    return float((Decimal(estimated) / Decimal(actual) * 100).quantize(CENT, rounding=ROUND_HALF_UP))


def _h(value: Decimal) -> float:
    return float(Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP))


@router.get("/api/projects/{project_id}/reports/performance", response_model=PerformanceReport)
def performance_report(
    project_id: str,
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PerformanceReport:
    membership = require_project_role(db, user.id, project_id, ALL_ROLES)
    today = utcnow().date()
    end = end_date or today
    start = start_date or (end - timedelta(days=29))
    if start > end:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Start date must be on or before end date")
    if (end - start).days > 366:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reports are limited to a one-year range")

    team = membership.role in MANAGERS
    scope_user = None if team else user.id  # SE-NFR-02: members are filtered to their own id everywhere.
    range_start = datetime.combine(start, time.min)
    range_end = datetime.combine(end + timedelta(days=1), time.min)

    people_stmt = (
        select(UserProfile.id, UserProfile.username, UserProfile.display_name)
        .join(ProjectMember, ProjectMember.user_id == UserProfile.id)
        .where(ProjectMember.project_id == project_id)
        .order_by(UserProfile.username)
    )
    if scope_user:
        people_stmt = people_stmt.where(UserProfile.id == scope_user)
    people = db.execute(people_stmt).all()
    people_ids = {p.id for p in people}

    entry_stmt = select(TimeEntry.user_id, TimeEntry.task_id, TimeEntry.started_at, TimeEntry.duration_hours).where(
        TimeEntry.project_id == project_id,
        TimeEntry.ended_at.is_not(None),
        TimeEntry.started_at >= range_start,
        TimeEntry.started_at < range_end,
    )
    if scope_user:
        entry_stmt = entry_stmt.where(TimeEntry.user_id == scope_user)
    entries = db.execute(entry_stmt).all()

    actual_by_user: dict[str, Decimal] = defaultdict(Decimal)
    actual_by_task: dict[str, Decimal] = defaultdict(Decimal)
    weekly: dict[date, Decimal] = defaultdict(Decimal)
    for uid, tid, started_at, hours in entries:
        amount = Decimal(str(hours or 0))
        actual_by_user[uid] += amount
        actual_by_task[tid] += amount
        week_start = started_at.date() - timedelta(days=started_at.weekday())
        weekly[week_start] += amount

    task_stmt = select(Task).where(
        Task.project_id == project_id,
        Task.assignee_id.is_not(None),
        or_(
            and_(Task.due_date >= range_start, Task.due_date < range_end),
            Task.id.in_(list(actual_by_task) or [""]),
        ),
    )
    if scope_user:
        task_stmt = task_stmt.where(Task.assignee_id == scope_user)
    tasks = [t for t in db.execute(task_stmt).scalars().all() if t.assignee_id in people_ids]

    est_by_user: dict[str, Decimal] = defaultdict(Decimal)
    has_est: dict[str, bool] = defaultdict(bool)
    assigned_by_user: dict[str, Decimal] = defaultdict(Decimal)
    total_by_user: dict[str, int] = defaultdict(int)
    done_by_user: dict[str, int] = defaultdict(int)
    for t in tasks:
        uid = t.assignee_id
        total_by_user[uid] += 1
        if t.status == "done":
            done_by_user[uid] += 1
        if t.estimated_hours is not None:
            est_by_user[uid] += Decimal(t.estimated_hours)
            has_est[uid] = True
        if t.assigned_hours is not None:
            assigned_by_user[uid] += Decimal(t.assigned_hours)

    rows = [
        PerformanceRow(
            user_id=p.id,
            username=p.username,
            display_name=p.display_name,
            estimated_hours=_h(est_by_user[p.id]),
            assigned_hours=_h(assigned_by_user[p.id]),
            actual_hours=_h(actual_by_user[p.id]),
            efficiency_pct=efficiency_pct(est_by_user[p.id] if has_est[p.id] else None, actual_by_user[p.id]),
            tasks_total=total_by_user[p.id],
            tasks_done=done_by_user[p.id],
        )
        for p in people
    ]
    total_est = sum((est_by_user[p.id] for p in people), Decimal("0"))
    total_actual = sum((actual_by_user[p.id] for p in people), Decimal("0"))
    any_est = any(has_est[p.id] for p in people)
    totals = PerformanceTotals(
        estimated_hours=_h(total_est),
        assigned_hours=_h(sum((assigned_by_user[p.id] for p in people), Decimal("0"))),
        actual_hours=_h(total_actual),
        efficiency_pct=efficiency_pct(total_est if any_est else None, total_actual),
        tasks_total=sum(total_by_user[p.id] for p in people),
        tasks_done=sum(done_by_user[p.id] for p in people),
    )

    weeks: list[WeeklyHours] = []
    cursor = start - timedelta(days=start.weekday())
    while cursor <= end:
        weeks.append(WeeklyHours(week_start=cursor, actual_hours=_h(weekly.get(cursor, Decimal("0")))))
        cursor += timedelta(days=7)

    # Completion over time (SE-FR-05): share of in-scope tasks completed by the end of each week.
    scope_stmt = select(Task.status, Task.completed_at).where(Task.project_id == project_id)
    if scope_user:
        scope_stmt = scope_stmt.where(Task.assignee_id == scope_user)
    scope_tasks = db.execute(scope_stmt).all()
    total_scope = len(scope_tasks)
    done_scope = sum(1 for status_value, _ in scope_tasks if status_value == "done")
    # Sort the completion times once, then binary-search each week: O(T log T + W log T) instead of
    # re-scanning every task for every week (O(W * T)).
    completed_times = sorted(completed for status_value, completed in scope_tasks if status_value == "done" and completed is not None)
    progress_points = []
    for wk in weeks:
        week_end = datetime.combine(min(wk.week_start + timedelta(days=7), end + timedelta(days=1)), time.min)
        finished = bisect_left(completed_times, week_end)  # completions strictly before the week's end
        progress_points.append(WeeklyProgress(week_start=wk.week_start, completion_pct=percent(finished, total_scope)))

    usernames = {p.id: p.username for p in people}
    task_rows = [
        TaskEfficiency(
            task_id=t.id,
            title=t.title,
            assignee_username=usernames.get(t.assignee_id),
            estimated_hours=_h(t.estimated_hours) if t.estimated_hours is not None else None,
            actual_hours=_h(actual_by_task.get(t.id, Decimal("0"))),
            efficiency_pct=efficiency_pct(t.estimated_hours, actual_by_task.get(t.id, Decimal("0"))),
        )
        for t in sorted(tasks, key=lambda t: (t.due_date is None, t.due_date or datetime.max, t.title))
        if t.estimated_hours is not None or actual_by_task.get(t.id)
    ]
    return PerformanceReport(
        project_id=project_id,
        scope="team" if team else "self",
        start_date=start,
        end_date=end,
        totals=totals,
        members=rows,
        weekly=weeks,
        completion=CompletionSummary(done=done_scope, total=total_scope, progress_pct=percent(done_scope, total_scope)),
        progress_over_time=progress_points,
        tasks=task_rows,
    )
