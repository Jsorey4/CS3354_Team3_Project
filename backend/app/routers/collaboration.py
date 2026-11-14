"""
@author: Aashwat Singh
@description: Task comments and notifications. Comments may use Markdown; anything dangerous (scripts,
    iframes, event handlers, javascript: links) is removed before saving. @username mentions are matched
    against the project's members: members get a notification pushed live within two seconds, while an
    @name that is not on the project is turned into plain text and the author gets a warning - the comment
    is still posted. The notification list also produces automatic reminders for work due within 24 hours.
    Each user's notification preferences decide which kinds they receive, and a notification about a
    project is only ever created for people who are members of that project at that moment.
@traces: SE-FR-28, SE-FR-29, SE-NFR-11, SE-NFR-12, UC-21, UC-22
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db, utcnow
from app.core.permissions import ALL_ROLES, MANAGERS, get_membership, require_task_access
from app.core.realtime import hub
from app.core.sanitizer import sanitize_markdown
from app.core.security import get_current_user
from app.models.entities import (
    DEFAULT_NOTIFICATION_PREFS,
    NOTIFICATION_KIND_PREF,
    Comment,
    Notification,
    ProjectMember,
    SoftDeadline,
    Task,
    UserProfile,
)
from app.schemas.dto import (
    CommentCreate,
    CommentCreateResult,
    CommentOut,
    NotificationList,
    NotificationOut,
    UserBrief,
)

router = APIRouter(tags=["collaboration"])

# "@name" not preceded by a word character or another "@" (so emails like a@b.com are not mentions).
MENTION_RE = re.compile(r"(?<![A-Za-z0-9_@])@([A-Za-z0-9_]{3,30})(?![A-Za-z0-9_])")
EMPTY_COMMENT = "Comment can't be empty"
REMINDER_WINDOW = timedelta(hours=24)


# ---------------------------------------------------------------------------
# Notification helpers (shared with tasks.py and members.py)
# ---------------------------------------------------------------------------
def wants_notification(prefs: dict | None, kind: str) -> bool:
    """True when the user's notification preferences allow this kind (unlisted kinds always pass)."""
    key = NOTIFICATION_KIND_PREF.get(kind)
    if key is None:
        return True
    merged = {**DEFAULT_NOTIFICATION_PREFS, **(prefs or {})}
    return bool(merged.get(key, True))


def create_notifications(
    db: Session,
    user_ids: Iterable[str],
    *,
    kind: str,
    message: str,
    project_id: str | None = None,
    task_id: str | None = None,
    link: str = "",
    dedupe_key: str | None = None,
) -> list[Notification]:
    """Bulk-adds one notification per distinct user (skipping users who already have `dedupe_key`).

    SE-NFR-11: when `project_id` is given, recipients are narrowed to that project's current members, so
    a former member (for example the creator of a task who has since been removed) never receives a
    message that quotes project content. One query, whatever the number of recipients.
    """
    targets = list(dict.fromkeys(uid for uid in user_ids if uid))
    if not targets:
        return []
    if project_id is not None:
        current = set(
            db.execute(
                select(ProjectMember.user_id).where(ProjectMember.project_id == project_id, ProjectMember.user_id.in_(targets))
            ).scalars()
        )
        targets = [uid for uid in targets if uid in current]
        if not targets:
            return []
    if dedupe_key is not None:
        existing = set(
            db.execute(
                select(Notification.user_id).where(
                    Notification.user_id.in_(targets), Notification.dedupe_key == dedupe_key
                )
            ).scalars()
        )
        targets = [uid for uid in targets if uid not in existing]
    if targets and kind in NOTIFICATION_KIND_PREF:
        prefs = dict(db.execute(select(UserProfile.id, UserProfile.notification_prefs).where(UserProfile.id.in_(targets))).all())
        targets = [uid for uid in targets if wants_notification(prefs.get(uid), kind)]
    rows = [
        Notification(
            user_id=uid,
            project_id=project_id,
            task_id=task_id,
            kind=kind,
            message=message[:500],
            link=link[:300],
            dedupe_key=dedupe_key,
            created_at=utcnow(),
        )
        for uid in targets
    ]
    db.add_all(rows)
    return rows


def publish_notifications(rows: Iterable[Notification]) -> None:
    """Pushes freshly committed notifications to their recipients over WebSockets (<= 2 s, SE-NFR-12)."""
    for row in rows:
        hub.publish([row.user_id], "notification", NotificationOut.model_validate(row).model_dump(mode="json"))


def extract_mentions(text: str) -> list[str]:
    """O(L) scan returning distinct @usernames in order of appearance."""
    return list(dict.fromkeys(m.group(1) for m in MENTION_RE.finditer(text)))


def strip_mentions(text: str, usernames: set[str]) -> str:
    """Removes the "@" from every mention of the given (lower-case) names in one O(L) pass."""
    if not usernames:
        return text
    return MENTION_RE.sub(lambda m: m.group(1) if m.group(1).lower() in usernames else m.group(0), text)


def _comment_out(comment: Comment, viewer_id: str, viewer_role: str) -> CommentOut:
    return CommentOut(
        id=comment.id,
        task_id=comment.task_id,
        author=UserBrief.model_validate(comment.author) if comment.author else None,
        body=comment.body,
        created_at=comment.created_at,
        can_delete=comment.author_id == viewer_id or viewer_role in MANAGERS,
    )


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------
@router.get("/api/tasks/{task_id}/comments", response_model=list[CommentOut])
def list_comments(
    task_id: str, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[CommentOut]:
    task, membership = require_task_access(db, user.id, task_id, ALL_ROLES)
    comments = (
        db.execute(
            select(Comment)
            .options(joinedload(Comment.author))
            .where(Comment.task_id == task.id)
            .order_by(Comment.created_at.asc(), Comment.id.asc())
        )
        .scalars()
        .all()
    )
    return [_comment_out(c, user.id, membership.role) for c in comments]


@router.post("/api/tasks/{task_id}/comments", response_model=CommentCreateResult, status_code=status.HTTP_201_CREATED)
def create_comment(
    task_id: str,
    body: CommentCreate,
    user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommentCreateResult:
    """UC-21: sanitize, resolve @mentions in O(L) with O(1) member lookups, notify, broadcast."""
    task, membership = require_task_access(db, user.id, task_id, ALL_ROLES)
    if not body.body or not body.body.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=EMPTY_COMMENT)
    text = sanitize_markdown(body.body)
    if not text.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=EMPTY_COMMENT)

    # Hash map of the project's members: lowercase username -> (user_id, canonical username).
    member_rows = db.execute(
        select(UserProfile.id, UserProfile.username)
        .join(ProjectMember, ProjectMember.user_id == UserProfile.id)
        .where(ProjectMember.project_id == task.project_id)
    ).all()
    members = {username.lower(): (uid, username) for uid, username in member_rows}

    warnings: list[str] = []
    names: dict[str, str] = {}  # user id -> canonical username, in order of first mention
    invalid: set[str] = set()
    for name in extract_mentions(text):
        match = members.get(name.lower())  # O(1) hash lookup per mention
        if match is None:
            if name.lower() not in invalid:
                invalid.add(name.lower())
                warnings.append(f"@{name} is not a project member and was not notified")
            continue
        uid, canonical = match
        if uid != user.id:
            names.setdefault(uid, canonical)
    text = strip_mentions(text, invalid)
    notify_ids = list(names)

    now = utcnow()
    comment = Comment(task_id=task.id, project_id=task.project_id, author_id=user.id, body=text, created_at=now)
    db.add(comment)
    db.flush()
    rows = create_notifications(
        db,
        notify_ids,
        kind="mention",
        message=f"{user.display_name or user.username} mentioned you on “{task.title}”",
        project_id=task.project_id,
        task_id=task.id,
        link=f"/tasks/{task.id}",
    )
    db.commit()
    db.refresh(comment)
    publish_notifications(rows)
    notified = [names[r.user_id] for r in rows]  # members who muted mentions are not listed

    out = _comment_out(comment, user.id, membership.role)
    project_member_ids = [uid for uid, _ in members.values()]
    hub.publish(project_member_ids, "comment_added", {"task_id": task.id, "project_id": task.project_id, "comment_id": comment.id})
    return CommentCreateResult(comment=out, warnings=warnings, notified=notified)


@router.delete("/api/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: str, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
) -> Response:
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    membership = get_membership(db, user.id, comment.project_id)
    if membership is None or (comment.author_id != user.id and membership.role not in MANAGERS):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    db.delete(comment)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Notifications & deadline reminders
# ---------------------------------------------------------------------------
def ensure_deadline_reminders(db: Session, user: UserProfile) -> list[Notification]:
    """Creates (once) reminders for the user's open tasks / soft deadlines due within 24 hours."""
    now = utcnow()
    horizon = now + REMINDER_WINDOW
    created: list[Notification] = []
    if not wants_notification(user.notification_prefs, "deadline_reminder"):
        return created

    # Joined to the user's current memberships: reminders are never built from a project they have left.
    member_of = select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
    due_tasks = db.execute(
        select(Task).where(
            Task.assignee_id == user.id,
            Task.project_id.in_(member_of),
            Task.status != "done",
            Task.due_date > now,
            Task.due_date <= horizon,
        )
    ).scalars().all()
    soft = db.execute(
        select(SoftDeadline, Task.title)
        .join(Task, Task.id == SoftDeadline.task_id)
        .where(
            Task.assignee_id == user.id,
            Task.project_id.in_(member_of),
            SoftDeadline.is_completed.is_(False),
            SoftDeadline.due_at > now,
            SoftDeadline.due_at <= horizon,
        )
    ).all()
    if not due_tasks and not soft:
        return created

    candidates: dict[str, dict] = {}
    for task in due_tasks:
        key = f"task-due:{task.id}:{task.due_date.isoformat()}"
        candidates[key] = {
            "kind": "deadline_reminder",
            "message": f"“{task.title}” is due within 24 hours",
            "project_id": task.project_id,
            "task_id": task.id,
            "link": f"/tasks/{task.id}",
        }
    for sd, title in soft:
        key = f"soft-due:{sd.id}:{sd.due_at.isoformat()}"
        candidates[key] = {
            "kind": "soft_deadline_reminder",
            "message": f"Soft deadline “{sd.title}” for “{title}” is coming up",
            "project_id": sd.project_id,
            "task_id": sd.task_id,
            "link": f"/tasks/{sd.task_id}",
        }
    existing = set(
        db.execute(
            select(Notification.dedupe_key).where(
                Notification.user_id == user.id, Notification.dedupe_key.in_(list(candidates))
            )
        ).scalars()
    )
    for key, fields in candidates.items():
        if key in existing:
            continue
        row = Notification(user_id=user.id, dedupe_key=key, created_at=now, **fields)
        db.add(row)
        created.append(row)
    if created:
        db.commit()
    return created


def unread_count(db: Session, user_id: str) -> int:
    return int(
        db.execute(
            select(func.count()).select_from(Notification).where(
                Notification.user_id == user_id, Notification.is_read.is_(False)
            )
        ).scalar_one()
    )


@router.get("/api/notifications", response_model=NotificationList)
def list_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NotificationList:
    """UC-22: the user's notifications (mentions, assignments, role changes) plus deadline reminders."""
    ensure_deadline_reminders(db, user)
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    rows = db.execute(stmt.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit)).scalars().all()
    return NotificationList(
        items=[NotificationOut.model_validate(r) for r in rows],
        unread_count=unread_count(db, user.id),
    )


@router.patch("/api/notifications/read-all", response_model=NotificationList)
def mark_all_read(user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)) -> NotificationList:
    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    db.commit()
    return list_notifications(unread_only=False, limit=50, user=user, db=db)


@router.patch("/api/notifications/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: str, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
) -> NotificationOut:
    row = db.get(Notification, notification_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    row.is_read = True
    db.commit()
    return NotificationOut.model_validate(row)
