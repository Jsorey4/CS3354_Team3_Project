"""
@author: eLeet Coderz (Team 3) - pre-release security review; each test names the requirement owner's ids
@description: Regression tests for the red-team audit. Each test attacks the running API the way an
    outsider, a member of a different project, or a removed member would, and checks the attack fails:
    using another project's ids, sending unexpected JSON into the preference columns, connecting to the
    live-update socket without signing in, forging or re-using tokens, injecting spreadsheet formulas or
    calendar properties through titles, racing the "last owner" / "one timer" / "five attempts" rules,
    and sending text built to make pattern matching take minutes. It also proves the dashboard, project
    list, board and report use the same number of database queries for 5 rows as for 60 (no N+1).
    Run with:  cd backend && python -m pytest -q
@traces: SE-FR-04, SE-FR-11, SE-FR-19, SE-FR-20, SE-FR-28, SE-FR-29, SE-FR-30, SE-NFR-01, SE-NFR-02,
    SE-NFR-06, SE-NFR-08, SE-NFR-09, SE-NFR-11, UC-01, UC-02, UC-04, UC-08, UC-09, UC-10, UC-11, UC-14,
    UC-15, UC-16, UC-18, UC-19, UC-20, UC-21
"""

from __future__ import annotations

import io
import json
import threading
import time
from decimal import Decimal

import jwt
import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from sqlalchemy import event, func, select
from sqlalchemy.exc import IntegrityError
from starlette.websockets import WebSocketDisconnect

from tests.test_all_requirements import (  # noqa: F401  (client and _reset_limits are pytest fixtures)
    DEMO_PASSWORD,
    H,
    _reset_limits,
    _tokens,
    client,
    future,
    iso,
    make_user,
    new_project,
    new_task,
    set_role,
    token,
    user_id,
)

import app.main as main_module
from app.core.config import get_settings
from app.core.database import SessionLocal, database_kind, engine, utcnow
from app.core.realtime import MAX_SOCKETS_PER_USER, hub
from app.core.sanitizer import clean_single_line, sanitize_markdown, sanitize_spreadsheet_cell
from app.core.security import (
    DEV_OUTBOX,
    JWT_ALGORITHM,
    TOKEN_ACCESS,
    TOKEN_RESET,
    SlidingWindowRateLimiter,
    auth_rate_limiter,
    create_token,
    credential_version,
    decode_token,
)
from app.main import MAX_REQUEST_BYTES, app
from app.models.entities import Comment, Expense, Notification, ProjectMember, SoftDeadline, StageCost, Task, TimeEntry, UserProfile
from app.routers.collaboration import MENTION_RE, extract_mentions, strip_mentions
from app.routers.exports import _ics_escape, build_ics, Deadline
from app.routers.projects import percent

POSTGRES = database_kind() == "postgresql"
SECRET = get_settings().jwt_secret


def auth(tok: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {tok}"}


def ensure_user(username: str) -> str:
    with SessionLocal() as db:
        existing = db.execute(select(UserProfile.id).where(UserProfile.username == username)).scalar_one_or_none()
    return existing or make_user(username)


def ws_login(ws, tok: str) -> dict:
    ws.send_json({"type": "auth", "token": tok})
    return ws.receive_json()


# ---------------------------------------------------------------------------
# 1. Broken object level authorization (cross-project ids)
# ---------------------------------------------------------------------------
def test_se_nfr11_cross_project_ids_are_rejected_for_every_object_type_uc01_uc18(client):
    """A member (even the owner) of project A passes ids that belong to project B."""
    ensure_user("idor_victim")
    a = new_project(client, owner="jon", members=["staff"], name="IDOR A")
    b = new_project(client, owner="tyler", members=["idor_victim"], name="IDOR B")
    pa, pb = a["id"], b["id"]
    tyler = H(client, "tyler")
    task_a = new_task(client, pa, title="A task", assignee_id=user_id("staff"))
    task_b = new_task(client, pb, actor="tyler", title="B secret task", assignee_id=user_id("idor_victim"), due_date=iso(future(9)))
    soft_b = client.post(f"/api/tasks/{task_b['id']}/soft-deadlines", headers=tyler, json={"title": "B checkpoint", "due_at": iso(future(3))}).json()
    comment_b = client.post(f"/api/tasks/{task_b['id']}/comments", headers=tyler, json={"body": "B private note"}).json()["comment"]
    stage_b = client.post(f"/api/projects/{pb}/stage-costs", headers=tyler, json={"stage_name": "B stage", "amount": "500.00"}).json()
    expense_b = client.post(
        f"/api/projects/{pb}/expenses", headers=tyler,
        json={"category": "software", "description": "B licence", "amount": "99.99", "expense_date": "2026-11-01"},
    ).json()
    hours = client.post(f"/api/projects/{pb}/tasks/{task_b['id']}/hours", headers=tyler, json={"actual_hours": 2})
    assert hours.status_code == 200
    entry_b = client.get("/api/time-entries", headers=tyler, params={"project_id": pb}).json()[0]
    list_b = b["lists"][0]["id"]

    for attacker in ("jon", "staff"):  # owner of A and plain member of A: neither belongs to B
        h = H(client, attacker)
        tid, sid, cid = task_b["id"], soft_b["id"], comment_b["id"]
        denied = [
            client.get(f"/api/tasks/{tid}", headers=h),
            client.put(f"/api/tasks/{tid}", headers=h, json={"title": "pwned"}),
            client.patch(f"/api/tasks/{tid}/move", headers=h, json={"status": "done", "position": 0}),
            client.delete(f"/api/tasks/{tid}", headers=h),
            client.get(f"/api/tasks/{tid}/comments", headers=h),
            client.post(f"/api/tasks/{tid}/comments", headers=h, json={"body": "injected"}),
            client.delete(f"/api/comments/{cid}", headers=h),
            client.get(f"/api/tasks/{tid}/soft-deadlines", headers=h),
            client.post(f"/api/tasks/{tid}/soft-deadlines", headers=h, json={"title": "x", "due_at": iso(future(1))}),
            client.put(f"/api/soft-deadlines/{sid}", headers=h, json={"title": "pwned"}),
            client.patch(f"/api/soft-deadlines/{sid}/complete", headers=h, json={"is_completed": True}),
            client.delete(f"/api/soft-deadlines/{sid}", headers=h),
            client.post("/api/time-entries/timer/start", headers=h, json={"task_id": tid}),
            client.delete(f"/api/time-entries/{entry_b['id']}", headers=h),
            client.put(f"/api/lists/{list_b}", headers=h, json={"name": "pwned"}),
            client.delete(f"/api/lists/{list_b}", headers=h),
            client.get(f"/api/projects/{pb}", headers=h),
            client.get(f"/api/projects/{pb}/tasks", headers=h),
            client.get(f"/api/projects/{pb}/members", headers=h),
            client.get(f"/api/projects/{pb}/costs", headers=h),
            client.get(f"/api/projects/{pb}/soft-deadlines", headers=h),
            client.get(f"/api/projects/{pb}/reports/performance", headers=h),
            client.get("/api/time-entries", headers=h, params={"project_id": pb}),
            client.get("/api/calendar/events", headers=h, params={"project_id": pb}),
            client.post(f"/api/projects/{pb}/export/calendar", headers=h, json={"target": "ical"}),
            client.post(f"/api/projects/{pb}/export/spreadsheet", headers=h, json={"target": "excel"}),
            client.delete(f"/api/projects/{pb}", headers=h),
        ]
        assert [r.status_code for r in denied] == [403] * len(denied), [(r.request.method, r.request.url.path, r.status_code) for r in denied if r.status_code != 403]
        assert all("B " not in r.text for r in denied)  # no project B content in any refusal

    # B's ids smuggled through project A's own URLs, where jon IS the owner: the parent is re-checked.
    jon = H(client, "jon")
    mismatched = [
        (client.put(f"/api/projects/{pa}/expenses/{expense_b['id']}", headers=jon, json={"amount": "0.01"}), 404),
        (client.delete(f"/api/projects/{pa}/expenses/{expense_b['id']}", headers=jon), 404),
        (client.put(f"/api/projects/{pa}/stage-costs/{stage_b['id']}", headers=jon, json={"amount": "0.01"}), 404),
        (client.delete(f"/api/projects/{pa}/stage-costs/{stage_b['id']}", headers=jon), 404),
        (client.post(f"/api/projects/{pa}/tasks/{task_b['id']}/hours", headers=jon, json={"actual_hours": 1}), 404),
        (client.post(f"/api/projects/{pa}/expenses", headers=jon, json={"category": "other", "description": "x", "amount": "1", "expense_date": "2026-11-01", "stage_cost_id": stage_b["id"]}), 400),
        (client.post(f"/api/projects/{pa}/tasks", headers=jon, json={"title": "x", "due_date": iso(future(5)), "list_id": list_b}), 400),
        (client.post(f"/api/projects/{pa}/tasks", headers=jon, json={"title": "x", "due_date": iso(future(5)), "assignee_id": user_id("idor_victim")}), 400),
        (client.put(f"/api/tasks/{task_a['id']}", headers=jon, json={"list_id": list_b}), 400),
        (client.put(f"/api/tasks/{task_a['id']}", headers=jon, json={"assignee_id": user_id("idor_victim")}), 400),
        (client.patch(f"/api/tasks/{task_a['id']}/move", headers=jon, json={"position": 0, "list_id": list_b}), 400),
        (client.delete(f"/api/projects/{pa}/members/{user_id('idor_victim')}", headers=jon), 404),
        (client.patch(f"/api/projects/{pa}/members/{user_id('idor_victim')}/role", headers=jon, json={"role": "manager"}), 404),
    ]
    assert [(r.status_code, want) for r, want in mismatched if r.status_code != want] == []
    filtered = client.get(f"/api/projects/{pa}/soft-deadlines", headers=jon, params={"task_id": task_b["id"]})
    assert filtered.status_code == 200 and filtered.json() == []

    # Dashboard widgets are per user: another user's widget id is an "Invalid action", and nothing moves.
    widget = client.get("/api/dashboard/widgets", headers=tyler).json()["widgets"][0]
    for call in (
        client.put(f"/api/dashboard/widgets/{widget['id']}/position", headers=jon, json={"grid_x": 0, "grid_y": 50}),
        client.patch(f"/api/dashboard/widgets/{widget['id']}/hide", headers=jon),
        client.delete(f"/api/dashboard/widgets/{widget['id']}", headers=jon),
    ):
        assert call.status_code == 400 and call.json()["detail"] == "Invalid action"
    assert next(w for w in client.get("/api/dashboard/widgets", headers=tyler).json()["widgets"] if w["id"] == widget["id"]) == widget
    note = client.get("/api/notifications", headers=tyler).json()["items"]
    if note:
        assert client.patch(f"/api/notifications/{note[0]['id']}/read", headers=jon).status_code == 404

    # Nothing in project B changed.
    with SessionLocal() as db:
        assert db.get(Task, task_b["id"]).title == "B secret task" and db.get(Task, task_b["id"]).status == "todo"
        assert db.get(SoftDeadline, soft_b["id"]).title == "B checkpoint" and db.get(SoftDeadline, soft_b["id"]).is_completed is False
        assert db.get(Comment, comment_b["id"]) is not None
        assert db.get(Expense, expense_b["id"]).amount == Decimal("99.99") and db.get(StageCost, stage_b["id"]).amount == Decimal("500.00")
        assert db.get(TimeEntry, entry_b["id"]) is not None
        assert db.execute(select(func.count()).select_from(Comment).where(Comment.task_id == task_b["id"])).scalar_one() == 1
        assert db.execute(select(func.count()).select_from(ProjectMember).where(ProjectMember.project_id == pb)).scalar_one() == 2


def test_se_nfr11_a_removed_member_keeps_no_view_of_the_project_uc19(client):
    ensure_user("leaver")
    project = new_project(client, owner="jon", members=["leaver"], name="Leaver project")
    pid = project["id"]
    leaver_token = client.post("/api/auth/login", json={"email": "leaver", "password": DEMO_PASSWORD}).json()["access_token"]
    leaver, jon = auth(leaver_token), H(client, "jon")
    assert set_role(client, pid, "jon", "leaver", "manager").status_code == 200
    created_by_leaver = client.post(f"/api/projects/{pid}/tasks", headers=leaver, json={"title": "Leaver made this", "due_date": iso(future(4)), "assignee_id": user_id("jon")}).json()
    done = new_task(client, pid, title="Finished confidential work", assignee_id=user_id("leaver"), status="done")
    open_task = new_task(client, pid, title="Open confidential work", assignee_id=user_id("leaver"), due_date=iso(future(0.5)))
    assert client.post(f"/api/projects/{pid}/tasks/{done['id']}/hours", headers=leaver, json={"actual_hours": 3}).status_code == 200
    started = client.post("/api/time-entries/timer/start", headers=leaver, json={"task_id": open_task["id"]})
    assert started.status_code == 201
    entry_id = client.get("/api/time-entries", headers=leaver).json()[-1]["id"]
    assert any(t["id"] == done["id"] for t in client.get("/api/my/tasks", headers=leaver, params={"include_done": True}).json())
    client.put("/api/settings/profile", headers=leaver, json={"notification_prefs": {"project_updates": True}})
    leaver_id = user_id("leaver")

    def project_notifications() -> int:
        with SessionLocal() as db:
            return db.execute(select(func.count()).select_from(Notification).where(Notification.user_id == leaver_id, Notification.project_id == pid)).scalar_one()

    notifications_before_removal = project_notifications()

    with client.websocket_connect("/ws") as ws:
        assert ws_login(ws, leaver_token)["type"] == "connected"
        removed = client.delete(f"/api/projects/{pid}/members/{user_id('leaver')}", headers=jon)
        assert removed.status_code == 200
        # After the removal: a task they created changes status, another task is edited, a comment is added.
        assert client.put(f"/api/tasks/{created_by_leaver['id']}", headers=jon, json={"status": "done"}).status_code == 200
        assert client.put(f"/api/tasks/{done['id']}", headers=jon, json={"title": "Renamed after removal"}).status_code == 200
        assert client.post(f"/api/tasks/{done['id']}/comments", headers=jon, json={"body": "secret follow-up @leaver"}).status_code == 201
        hub.publish([user_id("leaver")], "sentinel", {})
        events = []
        while True:
            message = ws.receive_json()
            if message["type"] == "sentinel":
                break
            events.append(message)
    # They are told about their own removal (and their timer stopping) and nothing about the project afterwards.
    assert {e["type"] for e in events} <= {"membership_changed", "notification", "timer"}
    assert all(e["data"].get("kind") == "member_removed" for e in events if e["type"] == "notification")
    assert not any("Renamed" in json.dumps(e) or "secret" in json.dumps(e) for e in events)

    for path in (f"/api/tasks/{done['id']}", f"/api/projects/{pid}", f"/api/projects/{pid}/tasks", f"/api/tasks/{done['id']}/comments"):
        assert client.get(path, headers=leaver).status_code == 403
    assert client.get("/api/my/tasks", headers=leaver, params={"include_done": True}).json() == []
    assert client.get("/api/time-entries", headers=leaver).json() == []
    assert client.get("/api/time-entries/timer/active", headers=leaver).json() is None
    assert client.delete(f"/api/time-entries/{entry_id}", headers=leaver).status_code == 403  # cannot alter the record
    dashboard = client.get("/api/dashboard/widgets", headers=leaver).json()["data"]
    assert "confidential" not in json.dumps(dashboard) and "Leaver project" not in json.dumps(dashboard)
    kinds = [n["kind"] for n in client.get("/api/notifications", headers=leaver).json()["items"]]
    assert "project_update" not in kinds and "mention" not in kinds and "deadline_reminder" not in kinds
    with SessionLocal() as db:
        # UC-04: the running timer was stopped properly (hours kept), the finished task keeps its history.
        entries = db.execute(select(TimeEntry).where(TimeEntry.project_id == pid, TimeEntry.user_id == leaver_id)).scalars().all()
        assert len(entries) == 2 and all(e.ended_at is not None and e.duration_hours is not None and e.duration_hours >= 0 for e in entries)
        assert db.get(Task, done["id"]).assignee_id == leaver_id and db.get(Task, open_task["id"]).assignee_id is None
    assert project_notifications() == notifications_before_removal  # no project notification after the removal


# ---------------------------------------------------------------------------
# 2. Strict schema on the JSON preference columns
# ---------------------------------------------------------------------------
def test_se_fr29_json_preference_columns_reject_unknown_keys_and_non_booleans_uc22(client):
    ensure_user("prefs_user")
    tok = client.post("/api/auth/login", json={"email": "prefs_user", "password": DEMO_PASSWORD}).json()["access_token"]
    h = auth(tok)
    put = lambda body: client.put("/api/settings/profile", headers=h, json=body)  # noqa: E731
    before = client.get("/api/settings/profile", headers=h).json()
    hostile_prefs = [
        {"__proto__": {"polluted": True}},
        {"constructor": {"prototype": {"polluted": True}}},
        {"mentions": {"nested": {"deep": True}}},
        {"mentions": "true"},
        {"mentions": "yes"},
        {"mentions": 1},
        {"mentions": 0},
        {"mentions": [True]},
        {"sms": True},
        {"mentions": True, "blob": "A" * 100_000},
        ["mentions"],
        "mentions",
        True,
    ]
    for payload in hostile_prefs:
        r = put({"notification_prefs": payload})
        assert r.status_code == 422, payload
    hostile_accounts = [
        {"__proto__": True},
        {"dropbox": True},
        {"google_calendar": {"connected": True, "access_token": "steal-me"}},
        {"google_calendar": "true"},
        {"outlook": 1},
        {"google_sheets": {"connected": True}},
        {"outlook": True, "padding": "B" * 100_000},
        [],
    ]
    for payload in hostile_accounts:
        assert put({"connected_accounts": payload}).status_code == 422, payload
    # Unknown top-level fields are refused too, so privileged columns cannot be mass-assigned.
    for field, value in (("mfa_enabled", False), ("email", "new@example.com"), ("password_hash", "x"), ("failed_login_attempts", 0), ("locked_until", None), ("id", user_id("jon"))):
        assert put({field: value}).status_code == 422, field
    assert client.get("/api/settings/profile", headers=h).json() == before  # nothing was stored

    ok = put({"notification_prefs": {"mentions": False}, "connected_accounts": {"outlook": True}})
    assert ok.status_code == 200
    with SessionLocal() as db:
        row = db.get(UserProfile, user_id("prefs_user"))
        assert set(row.notification_prefs) == {"task_assignments", "mentions", "deadline_reminders", "project_updates"}
        assert all(isinstance(v, bool) for v in row.notification_prefs.values()) and row.notification_prefs["mentions"] is False
        assert set(row.connected_accounts) == {"outlook"} and set(row.connected_accounts["outlook"]) == {"connected", "connected_at"}
    # Junk written straight into the columns (older build, direct database edit). Where the schema comes
    # from supabase/migrations the database itself refuses it; otherwise reads stay safe and the next save
    # rewrites the column to the known shape.
    junk_stored = True
    with SessionLocal() as db:
        row = db.get(UserProfile, user_id("prefs_user"))
        row.notification_prefs = {"mentions": "nope", "__proto__": {"x": 1}, "junk": "Z" * 5000}
        row.connected_accounts = {"dropbox": {"connected": True}, "outlook": "yes", "google_sheets": {"connected": True, "connected_at": 12345, "token": "x"}}
        try:
            db.commit()
        except IntegrityError as refused:
            db.rollback()
            junk_stored = False
            assert "ck_user_profiles_" in str(refused.orig)
    safe = client.get("/api/settings/profile", headers=h)
    assert safe.status_code == 200
    if junk_stored:
        assert safe.json()["notification_prefs"] == {"task_assignments": True, "mentions": True, "deadline_reminders": True, "project_updates": False}
        assert safe.json()["connected_accounts"]["outlook"]["connected"] is False and safe.json()["connected_accounts"]["google_sheets"] == {"connected": True, "connected_at": None}
    else:
        assert safe.json()["notification_prefs"]["mentions"] is False and safe.json()["connected_accounts"]["outlook"]["connected"] is True
    assert put({"notification_prefs": {"project_updates": True}, "connected_accounts": {"google_calendar": False}}).status_code == 200
    with SessionLocal() as db:
        row = db.get(UserProfile, user_id("prefs_user"))
        # Either way the stored objects end up with only the known keys and real booleans.
        assert row.notification_prefs == {"task_assignments": True, "mentions": junk_stored, "deadline_reminders": True, "project_updates": True}
        assert set(row.connected_accounts) == ({"google_calendar", "google_sheets"} if junk_stored else {"google_calendar", "outlook"})
        assert all(set(entry) == {"connected", "connected_at"} and isinstance(entry["connected"], bool) for entry in row.connected_accounts.values())
        assert len(json.dumps(row.notification_prefs)) < 200 and len(json.dumps(row.connected_accounts)) < 300


# ---------------------------------------------------------------------------
# 3. WebSocket authentication and authorization
# ---------------------------------------------------------------------------
def test_se_nfr11_websocket_refuses_unauthenticated_and_expired_sockets_se_nfr06(client, monkeypatch):
    monkeypatch.setattr(main_module, "WS_AUTH_TIMEOUT_SECONDS", 0.3)
    good = token(client, "staff")
    staff_id = user_id("staff")
    expired, _ = create_token(staff_id, TOKEN_ACCESS, -1, {"cv": "x"})
    reset_kind, _ = create_token(staff_id, TOKEN_RESET, 5)

    def closed_with(first_frame, path: str = "/ws") -> int:
        with pytest.raises(WebSocketDisconnect) as raised:
            with client.websocket_connect(path) as ws:
                if first_frame is not None:
                    ws.send_text(first_frame)
                ws.receive_json()
        return raised.value.code

    before = hub.connection_count()
    assert closed_with(None) == 4401  # says nothing: closed after the sign-in window
    assert closed_with(None, f"/ws?token={good}") == 4401  # a token in the URL is ignored
    for frame in (
        "ping",
        "{not json",
        json.dumps({"type": "auth"}),
        json.dumps({"type": "auth", "token": 12345}),
        json.dumps({"type": "auth", "token": "not-a-jwt"}),
        json.dumps({"type": "auth", "token": expired}),
        json.dumps({"type": "auth", "token": reset_kind}),  # right signature, wrong kind of token
        json.dumps({"type": "subscribe", "project_id": "anything", "token": good}),
        json.dumps({"type": "auth", "token": good + "A" * 5000}),
    ):
        assert closed_with(frame) == 4401, frame
    assert hub.connection_count() == before  # none of them was ever registered

    with client.websocket_connect("/ws") as ws:
        assert ws_login(ws, good) == {"type": "connected", "data": {"user_id": staff_id}}
        assert hub.connection_count(staff_id) == 1
        # There are no client-chosen channels: asking for one changes nothing.
        ws.send_text(json.dumps({"type": "subscribe", "project_id": "00000000-0000-4000-8000-000000000000"}))
        ws.send_text("ping")
        assert ws.receive_json()["type"] == "pong"
    # One person cannot hold unlimited sockets: the oldest is closed beyond the cap.
    sockets = []
    try:
        for _ in range(MAX_SOCKETS_PER_USER + 2):
            cm = client.websocket_connect("/ws")
            ws = cm.__enter__()
            sockets.append((cm, ws))
            assert ws_login(ws, good)["type"] == "connected"
        assert hub.connection_count(staff_id) == MAX_SOCKETS_PER_USER
    finally:
        for cm, _ws in sockets:
            try:
                cm.__exit__(None, None, None)
            except Exception:
                pass


# ---------------------------------------------------------------------------
# 4. Race conditions: last owner, login attempts, timers
# ---------------------------------------------------------------------------
def _in_parallel(calls):
    """Runs the callables at the same instant (separate clients) and returns their results in order."""
    barrier = threading.Barrier(len(calls))
    results: list = [None] * len(calls)

    def run(index: int, fn) -> None:
        barrier.wait()
        results[index] = fn(TestClient(app))

    threads = [threading.Thread(target=run, args=(i, fn)) for i, fn in enumerate(calls)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    return results


def test_uc20_last_owner_protection_holds_sequentially_and_under_concurrency_se_fr30(client):
    project = new_project(client, owner="jon", members=["tyler", "staff"], name="Two owners")
    pid = project["id"]
    assert set_role(client, pid, "jon", "tyler", "owner").status_code == 200
    jon, tyler = H(client, "jon"), H(client, "tyler")
    role_url = f"/api/projects/{pid}/members/{{}}/role"

    def owners() -> int:
        with SessionLocal() as db:
            return db.execute(select(func.count()).select_from(ProjectMember).where(ProjectMember.project_id == pid, ProjectMember.role == "owner")).scalar_one()

    if POSTGRES:
        # Both owners demote each other at the same instant. Without the per-project lock both requests
        # read "2 owners" and both succeed, leaving none.
        for _ in range(3):
            results = _in_parallel([
                lambda c: c.patch(role_url.format(user_id("tyler")), headers=jon, json={"role": "manager"}).status_code,
                lambda c: c.patch(role_url.format(user_id("jon")), headers=tyler, json={"role": "manager"}).status_code,
            ])
            # Exactly one demotion wins; the loser is refused (400 last owner, or 403 because the winner
            # already took their owner rights away). Never two successes.
            assert results.count(200) == 1 and all(code in (200, 400, 403) for code in results), results
            assert owners() == 1
            with SessionLocal() as db:  # restore two owners for the next round
                for m in db.execute(select(ProjectMember).where(ProjectMember.project_id == pid, ProjectMember.user_id.in_([user_id("jon"), user_id("tyler")]))).scalars():
                    m.role = "owner"
                db.commit()
        # Same race through removal: each owner removes the other.
        results = _in_parallel([
            lambda c: c.delete(f"/api/projects/{pid}/members/{user_id('tyler')}", headers=jon).status_code,
            lambda c: c.delete(f"/api/projects/{pid}/members/{user_id('jon')}", headers=tyler).status_code,
        ])
        assert results.count(200) == 1 and owners() == 1, results
    else:
        assert client.patch(role_url.format(user_id("tyler")), headers=jon, json={"role": "manager"}).status_code == 200
        assert client.patch(role_url.format(user_id("jon")), headers=tyler, json={"role": "member"}).status_code in (400, 403)  # last owner / not an owner
        assert client.patch(role_url.format(user_id("jon")), headers=jon, json={"role": "manager"}).json()["detail"] == "Project must have at least one owner"
        assert client.delete(f"/api/projects/{pid}/members/{user_id('jon')}", headers=jon).json()["detail"] == "Project must have at least one owner"
        assert owners() == 1
    # Whatever happened above, the survivor can never leave the project ownerless.
    with SessionLocal() as db:
        last = db.execute(select(UserProfile.username).join(ProjectMember, ProjectMember.user_id == UserProfile.id).where(ProjectMember.project_id == pid, ProjectMember.role == "owner")).scalar_one()
    survivor = H(client, last)
    assert client.patch(role_url.format(user_id(last)), headers=survivor, json={"role": "member"}).status_code == 400
    assert client.delete(f"/api/projects/{pid}/members/{user_id(last)}", headers=survivor).status_code == 400
    assert owners() == 1


def test_uc09_failed_attempts_are_counted_atomically_and_lock_at_five_uc10(client, monkeypatch):
    ensure_user("race_login")
    monkeypatch.setattr(auth_rate_limiter, "limit", 1000)  # isolate the account lockout from the IP limiter
    wrong = {"email": "race_login", "password": "wrong-password"}
    if POSTGRES:
        codes = _in_parallel([(lambda c: c.post("/api/auth/login", json=wrong).status_code)] * 12)
    else:
        codes = [client.post("/api/auth/login", json=wrong).status_code for _ in range(12)]
    # Exactly five guesses reach the password check; every other one is refused by the lock.
    assert codes.count(401) == 5 and codes.count(423) == 7, codes
    with SessionLocal() as db:
        row = db.execute(select(UserProfile).where(UserProfile.username == "race_login")).scalar_one()
        assert row.failed_login_attempts == 5 and row.locked_until is not None and row.unlock_token_jti
    assert len([m for m in DEV_OUTBOX if m.to == "race_login@example.com" and "locked" in m.subject]) == 1  # one email, not one per racer
    assert client.post("/api/auth/login", json={"email": "race_login", "password": DEMO_PASSWORD}).status_code == 423


def test_uc04_only_one_running_timer_per_person_even_when_started_simultaneously_se_fr04(client):
    project = new_project(client, owner="jon", members=["staff"], name="Timer race")
    pid = project["id"]
    first = new_task(client, pid, title="T1", assignee_id=user_id("staff"))
    second = new_task(client, pid, title="T2", assignee_id=user_id("staff"))
    staff = H(client, "staff")
    client.post("/api/time-entries/timer/stop", headers=staff)  # make sure nothing is running

    def running() -> int:
        with SessionLocal() as db:
            return db.execute(select(func.count()).select_from(TimeEntry).where(TimeEntry.user_id == user_id("staff"), TimeEntry.ended_at.is_(None))).scalar_one()

    if POSTGRES:
        codes = _in_parallel([
            lambda c: c.post("/api/time-entries/timer/start", headers=staff, json={"task_id": first["id"]}).status_code,
            lambda c: c.post("/api/time-entries/timer/start", headers=staff, json={"task_id": second["id"]}).status_code,
            lambda c: c.post("/api/time-entries/timer/start", headers=staff, json={"task_id": first["id"]}).status_code,
        ])
        assert sorted(codes) == [201, 409, 409], codes
    else:
        assert client.post("/api/time-entries/timer/start", headers=staff, json={"task_id": first["id"]}).status_code == 201
        again = client.post("/api/time-entries/timer/start", headers=staff, json={"task_id": second["id"]})
        assert again.status_code == 409 and "already have a running timer" in again.json()["detail"]
    assert running() == 1
    # The database itself refuses a second running entry, whatever code path tries to write it.
    with SessionLocal() as db:
        db.add(TimeEntry(project_id=pid, task_id=second["id"], user_id=user_id("staff"), source="timer", started_at=utcnow()))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
        # ... and an entry that ends before it starts (a negative duration).
        db.add(TimeEntry(project_id=pid, task_id=second["id"], user_id=user_id("jon"), source="manual", started_at=utcnow(), ended_at=utcnow().replace(year=2020), duration_hours=Decimal("1")))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
    stopped = client.post("/api/time-entries/timer/stop", headers=staff)
    assert stopped.status_code == 200 and stopped.json()["duration_hours"] >= 0 and stopped.json()["ended_at"] >= stopped.json()["started_at"]
    assert running() == 0
    # Manual hours: zero, negative and more than a day are refused; start / end are never taken from the client.
    hours = f"/api/projects/{pid}/tasks/{first['id']}/hours"
    for bad in (0, -1, "-0.5", 24.01, 1e9, "NaN", "Infinity"):
        assert client.post(hours, headers=staff, json={"actual_hours": bad}).status_code == 422, bad
    forged = client.post("/api/time-entries/timer/start", headers=staff, json={"task_id": first["id"], "started_at": "2020-01-01T00:00:00Z", "ended_at": "2019-01-01T00:00:00Z", "duration_hours": -5})
    assert forged.status_code == 201 and forged.json()["ended_at"] is None and forged.json()["started_at"] > "2026"
    assert client.post("/api/time-entries/timer/stop", headers=staff).json()["duration_hours"] >= 0


# ---------------------------------------------------------------------------
# 5 & 6. XSS, protocol injection and ReDoS
# ---------------------------------------------------------------------------
XSS_PAYLOADS = [
    "<script>alert(1)</script>",
    "<ScRiPt src=//evil.example/x.js></sCrIpT>",
    "<img src=x onerror=alert(1)>",
    "<svg onload=alert(1)>",
    "<svg><script>alert(1)</script></svg>",
    "<iframe src=\"javascript:alert(1)\"></iframe>",
    "<style>*{background:url(javascript:alert(1))}</style>",
    "<body onload=alert(1)>",
    "<a href=\"javascript:alert(1)\">x</a>",
    "<<script>script>alert(1)<</script>/script>",
    "<math><mtext><script>alert(1)</script></mtext></math>",
    "<object data=\"data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==\"></object>",
    "<details open ontoggle=alert(1)>",
    "&lt;script&gt;alert(1)&lt;/script&gt;",
    "<scr\x00ipt>alert(1)</scr\x00ipt>",
]
LINK_PAYLOADS = [
    "[x](javascript:alert(1))",
    "[x](JaVaScRiPt:alert(1))",
    "[x](java\tscript:alert(1))",
    "[x](java\nscript:alert(1))",
    "[x](jav&#x09;ascript:alert(1))",
    "[x](jav&#x0A;ascript:alert(1))",
    "[x](&#106;&#97;&#118;&#97;script:alert(1))",
    "[x](&#x6A;avascript:alert(1))",
    "[x](&amp;#106;avascript:alert(1))",
    "[x](javascript&colon;alert(1))",
    "[x](java\u200bscript:alert(1))",
    "[x](\x01javascript:alert(1))",
    "[x](  javascript:alert(1))",
    "[x](vbscript:msgbox(1))",
    "[x](VBScript:msgbox(1))",
    "[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
    "[x](DATA:text/html,<script>alert(1)</script>)",
    "[x](file:///etc/passwd)",
    "[x](blob:https://example.com/abc)",
    "[ref]: javascript:alert(1)",
    "[ref]: data:text/html,hi",
]


def test_se_fr28_markdown_sanitizer_blocks_html_and_script_urls_uc21(client):
    forbidden = ("<script", "<img", "<svg", "<iframe", "<style", "<object", "<body", "<math", "<details", "<a ", "onerror=", "onload=", "ontoggle=")
    for payload in XSS_PAYLOADS:
        cleaned = sanitize_markdown(f"before {payload} after").lower()
        assert not any(marker in cleaned for marker in forbidden), (payload, cleaned)
        assert "<" not in cleaned or "‹" in cleaned  # no real angle-bracket tag survives
    for payload in LINK_PAYLOADS:
        cleaned = sanitize_markdown(payload).lower().replace(" ", "")
        for scheme in ("javascript:", "vbscript:", "data:", "file:", "blob:"):
            assert scheme not in cleaned, (payload, cleaned)
        assert "#" in cleaned, payload  # the link target was replaced
    for harmless in ("[docs](https://example.com/a_(b))", "[mail](mailto:team@example.com)", "[rel](/tasks/1)", "**bold** *it* `code` @staff", "Data: 5 rows, ratio 3:1"):
        assert sanitize_markdown(harmless) == harmless

    # Stored text is cleaned on the way in: comments AND task descriptions (both rendered as Markdown).
    project = new_project(client, owner="jon", members=["staff"], name="XSS project")
    hostile = "Notes <img src=x onerror=alert(1)> [run](javascript:alert(1)) <script>steal()</script>"
    task = client.post(f"/api/projects/{project['id']}/tasks", headers=H(client, "jon"), json={"title": "T", "due_date": iso(future(3)), "description": hostile}).json()
    for stored in (
        task["description"],
        client.put(f"/api/tasks/{task['id']}", headers=H(client, "jon"), json={"description": hostile + " again"}).json()["description"],
        client.post(f"/api/tasks/{task['id']}/comments", headers=H(client, "staff"), json={"body": hostile}).json()["comment"]["body"],
    ):
        assert "<" not in stored and "javascript:" not in stored and "onerror" not in stored and "steal()" not in stored
        assert stored.startswith("Notes") and "[run](#)" in stored
    # Titles and names are single-line and free of invisible characters.
    weird = client.post(f"/api/projects/{project['id']}/tasks", headers=H(client, "jon"), json={"title": "Line1\r\nLine2\x00\u202e\u200bEnd", "due_date": iso(future(3))}).json()
    assert weird["title"] == "Line1 Line2End"
    assert client.put("/api/settings/profile", headers=H(client, "staff"), json={"avatar_url": "http://example.com/a.png"}).status_code == 422  # https only
    assert client.put("/api/settings/profile", headers=H(client, "staff"), json={"avatar_url": "javascript:alert(1)"}).status_code == 422


def test_se_fr28_every_text_pattern_runs_in_linear_time_no_redos_uc21(client):
    """Inputs that made the earlier patterns quadratic (seconds of CPU per request) now take milliseconds."""
    n = 20000
    probes = {
        "tag-like '<' + spaces": "<" + " " * n + "1",
        "many '<' with spaces": ("<" + " " * 50) * 400,
        "unclosed link starts": "[a](" * 5000,
        "nested parens": "[a](" + "(" * (n - 4),
        "bracket run": "[" * n,
        "at signs": "@" * n,
        "mention prefix": "@" + "a" * n,
        "reference links": "[a]:" + "\n" * n,
        "entities": "&#106;" * 3000,
        "bare scheme": "javascript" + " " * n,
        "data scheme": "data:" + "a" * n,
        "unbalanced tags": "<b" * 5000,
    }
    for name, text in probes.items():
        started = time.perf_counter()
        sanitize_markdown(text)
        extract_mentions(text)
        strip_mentions(text, {"aaa", "bbb"})
        clean_single_line(text)
        sanitize_spreadsheet_cell(text)
        _ics_escape(text)
        elapsed = time.perf_counter() - started
        assert elapsed < 1.0, f"{name}: {elapsed:.2f}s"
    # Many distinct invalid mentions are removed in one pass (previously one full scan per name).
    crowd = " ".join(f"@ghost{i:04d}" for i in range(900))
    started = time.perf_counter()
    assert "@ghost" not in strip_mentions(crowd, {f"ghost{i:04d}" for i in range(900)})
    assert time.perf_counter() - started < 0.5
    assert MENTION_RE.pattern.count("{3,30}") == 1  # bounded quantifier, no nesting
    # End to end: the largest comment the API accepts, built from the worst pattern, is answered quickly.
    project = new_project(client, owner="jon", name="ReDoS project")
    task = new_task(client, project["id"], title="T")
    started = time.perf_counter()
    r = client.post(f"/api/tasks/{task['id']}/comments", headers=H(client, "jon"), json={"body": ("x <" + " " * 9990)[:10000]})
    assert r.status_code == 201 and time.perf_counter() - started < 2.0
    too_long = client.post(f"/api/tasks/{task['id']}/comments", headers=H(client, "jon"), json={"body": "a" * 10001})
    assert too_long.status_code == 422


# ---------------------------------------------------------------------------
# 7 & 8. Spreadsheet formula injection and iCal property injection
# ---------------------------------------------------------------------------
FORMULAS = ["=HYPERLINK(\"http://evil.example\",\"x\")", "+SUM(1,1)", "-2+3", "@SUM(A1)", "=cmd|' /C calc'!A0", "\t=1+1", "\r=1+1", "\n=1+1", "  =1+1", "\u200b=1+1", "\uff1d1+1"]


def test_uc15_every_string_cell_that_could_be_a_formula_is_prefixed_se_fr20(client):
    for value in FORMULAS:
        assert sanitize_spreadsheet_cell(value).startswith("'"), repr(value)
    for value in ("plain text", "0-5 items", "a=b", "", None, 5, -5, Decimal("-1.50"), 3.25):
        assert sanitize_spreadsheet_cell(value) == value

    project = new_project(client, owner="jon", members=["staff"], name="Formula project")
    pid = project["id"]
    jon = H(client, "jon")
    list_id = client.post(f"/api/projects/{pid}/lists", headers=jon, json={"name": "=LIST()"}).json()["id"]
    task = client.post(
        f"/api/projects/{pid}/tasks", headers=jon,
        json={"title": "=1+1", "due_date": iso(future(6)), "description": "+SUM(1,1)", "tags": ["-minus", "plain"], "list_id": list_id, "assignee_id": user_id("staff")},
    ).json()
    assert client.post(f"/api/tasks/{task['id']}/soft-deadlines", headers=jon, json={"title": "@SUM(A1)", "due_at": iso(future(2))}).status_code == 201
    assert client.post(f"/api/projects/{pid}/tasks/{task['id']}/hours", headers=jon, json={"actual_hours": 1.5, "note": "=HYPERLINK(\"http://evil.example\")"}).status_code == 200
    assert client.post(f"/api/projects/{pid}/stage-costs", headers=jon, json={"stage_name": "+stage", "amount": "10.10", "notes": "-notes\n=2+2"}).status_code == 201
    assert client.post(f"/api/projects/{pid}/expenses", headers=jon, json={"category": "other", "description": "=cmd|' /C calc'!A0", "amount": "0.10", "expense_date": "2026-11-02"}).status_code == 201
    # Values that the API would normalise are written straight to the database to test the exporter alone.
    jon_id = user_id("jon")
    with SessionLocal() as db:
        db.add(Task(project_id=pid, title="\t=TAB()", description="", status="todo", priority="medium", due_date=future(3), position=9, tags=["=tag"], created_by=jon_id))
        db.add(Task(project_id=pid, title="\r=CR()\x07bell", description="", status="todo", priority="medium", due_date=future(3), position=10, tags=[], created_by=jon_id))
        db.add(Expense(project_id=pid, category="other", description="\u200b=HIDDEN()", amount=Decimal("0.20"), expense_date=future(0).date(), created_by=jon_id))
        db.commit()

    xlsx = client.post(f"/api/projects/{pid}/export/spreadsheet", headers=jon, json={"target": "excel"})
    assert xlsx.status_code == 200
    workbook = load_workbook(io.BytesIO(xlsx.content))
    assert set(workbook.sheetnames) == {"Tasks", "Soft deadlines", "Time entries", "Bid & budget", "Stage costs", "Expenses"}
    string_cells = 0
    prefixed = 0
    for sheet in workbook.worksheets:
        for row in sheet.iter_rows():
            for cell in row:
                assert cell.data_type != "f", (sheet.title, cell.coordinate, cell.value)  # no formula cell anywhere
                if isinstance(cell.value, str):
                    string_cells += 1
                    visible = cell.value.lstrip(" \u200b")
                    assert visible[:1] not in ("=", "+", "-", "@", "\t", "\r", "\n", "\uff1d"), (sheet.title, cell.coordinate, cell.value)
                    prefixed += cell.value.startswith("'")
    assert string_cells > 30 and prefixed >= 10  # title, tags, soft deadline, note, stage, stage notes, expense ...
    amounts = [c.value for c in workbook["Stage costs"]["B"][1:]] + [c.value for c in workbook["Expenses"]["D"][1:]]
    assert sorted(Decimal(str(a)) for a in amounts) == [Decimal("0.1"), Decimal("0.2"), Decimal("10.1")]  # numbers stay numbers
    assert workbook["Stage costs"]["B2"].number_format == "0.00"

    sheets = client.post(f"/api/projects/{pid}/export/spreadsheet", headers=jon, json={"target": "sheets"}).json()["sheets"]
    for sheet in sheets:
        for row in sheet["values"]:
            for value in row:
                if isinstance(value, str):
                    assert value.lstrip(" \u200b")[:1] not in ("=", "+", "-", "@", "\t", "\r", "\n"), (sheet["title"], value)


def test_uc14_calendar_export_cannot_be_used_to_inject_ics_properties_se_fr19(client):
    assert _ics_escape("a\r\nATTACH:http://evil.example/x") == "a\\nATTACH:http://evil.example/x"
    assert _ics_escape("lone\rCR and lone\nLF") == "lone\\nCR and lone\\nLF"
    assert _ics_escape("semi;colon, comma\\slash") == "semi\\;colon\\, comma\\\\slash"
    assert _ics_escape("sep\u2028BEGIN:VALARM\u2029x\x85y\x0bz\x00") == "sep\\nBEGIN:VALARM\\nx\\ny\\nz"

    project = new_project(client, owner="jon", name="Calendar project")
    pid = project["id"]
    attacks = [
        "Kickoff\r\nATTACH:http://evil.example/malware.exe",
        "Review\rBEGIN:VALARM\rACTION:AUDIO\rATTACH:http://evil.example/a.wav\rTRIGGER:-PT0S\rEND:VALARM",
        "Demo\nEND:VEVENT\nBEGIN:VEVENT\nSUMMARY:Forged event\nDTSTART:20300101T000000Z",
        "Sync\u2028ORGANIZER:mailto:attacker@evil.example",
        "Plan; with, separators \\ and backslash",
    ]
    jon_id = user_id("jon")
    with SessionLocal() as db:
        # Written directly so the raw control characters really reach the exporter (the API strips them).
        for i, title in enumerate(attacks):
            task = Task(project_id=pid, title=title, description="", status="todo", priority="medium", due_date=future(2 + i), position=i, tags=[], created_by=jon_id)
            db.add(task)
            db.flush()
            db.add(SoftDeadline(task_id=task.id, project_id=pid, title=f"soft {title}", due_at=future(1 + i), priority="high", created_by=jon_id))
        project_row = db.get(Task, task.id).project
        project_row.name = "Calendar\r\nX-INJECTED:1"
        project_row.description = "Line one\r\nATTACH:http://evil.example/p\nLine three"
        db.commit()

    ics = client.post(f"/api/projects/{pid}/export/calendar", headers=H(client, "jon"), json={"target": "ical"})
    assert ics.status_code == 200
    text = ics.content.decode("utf-8")
    assert "\r\n" in text and text.endswith("END:VCALENDAR\r\n")
    assert "\n" not in text.replace("\r\n", "") and "\r" not in text.replace("\r\n", "")  # no bare CR or LF anywhere
    lines = text.replace("\r\n ", "").split("\r\n")  # unfold continuation lines
    events = int(ics.headers["x-export-count"])
    assert events == 11  # 1 project deadline + 5 task due dates + 5 soft deadlines: no forged event
    allowed = {"BEGIN", "END", "VERSION", "PRODID", "CALSCALE", "METHOD", "X-WR-CALNAME", "UID", "DTSTAMP", "DTSTART", "DTEND", "SUMMARY", "DESCRIPTION", "CATEGORIES", "TRANSP", "ACTION", "TRIGGER"}
    names = [line.split(":", 1)[0] for line in lines if line]
    assert set(names) <= allowed, set(names) - allowed
    assert names.count("ATTACH") == 0 and names.count("ORGANIZER") == 0 and names.count("X-INJECTED") == 0
    assert lines.count("BEGIN:VEVENT") == lines.count("END:VEVENT") == events
    assert lines.count("BEGIN:VALARM") == lines.count("END:VALARM") == events  # only the exporter's own reminder
    assert lines.count("ACTION:DISPLAY") == events and not any(line.startswith("ACTION:AUDIO") for line in lines)
    summaries = [line for line in lines if line.startswith("SUMMARY:")]
    assert any("\\nATTACH:http://evil.example/malware.exe" in s for s in summaries)  # kept as text inside the value
    assert any("Plan\\; with\\, separators \\\\ and backslash" in s for s in summaries)
    assert all(len(line.encode("utf-8")) <= 75 for line in text.split("\r\n"))
    # The pure builder gives the same guarantee for any input.
    forged = build_ics(project_row, [Deadline(uid="u@projectforge", title="t\r\nATTACH:x", starts_at=future(1), description="d\rORGANIZER:x", category="c\nX:1")])
    assert "\r\nATTACH" not in forged and "\r\nORGANIZER" not in forged and "\r\nX:1" not in forged
    # The provider links carry the same titles URL-encoded, never as raw control characters.
    google = client.post(f"/api/projects/{pid}/export/calendar", headers=H(client, "jon"), json={"target": "google", "oauth_consent": True}).json()
    assert all("\r" not in link["url"] and "\n" not in link["url"] and link["url"].startswith("https://calendar.google.com/") for link in google["provider_links"])


# ---------------------------------------------------------------------------
# 9. JWT, reset / unlock tokens
# ---------------------------------------------------------------------------
def test_se_nfr06_jwt_accepts_only_hs256_tokens_of_the_right_kind_se_fr11(client):
    staff_id = user_id("staff")
    now = int(time.time())
    with SessionLocal() as db:
        cv = credential_version(db.get(UserProfile, staff_id).password_hash)
    claims = {"sub": staff_id, "typ": "access", "jti": "x" * 43, "iat": now, "exp": now + 600, "cv": cv}
    me = lambda tok: client.get("/api/auth/me", headers=auth(tok)).status_code  # noqa: E731

    assert JWT_ALGORITHM == "HS256"
    assert me(jwt.encode(claims, SECRET, algorithm="HS256")) == 200  # the control: a well-formed token works
    unsigned = jwt.encode(claims, key=None, algorithm="none")
    assert unsigned.split(".")[2] == "" and me(unsigned) == 401  # alg: none
    header_none = jwt.utils.base64url_encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).decode()
    body = jwt.encode(claims, SECRET, algorithm="HS256").split(".")[1]
    assert me(f"{header_none}.{body}.") == 401 and me(f"{header_none}.{body}.AAAA") == 401
    for other in ("HS384", "HS512"):  # right secret, wrong algorithm
        assert me(jwt.encode(claims, SECRET, algorithm=other)) == 401
    assert me(jwt.encode(claims, "another-secret-" + "y" * 40, algorithm="HS256")) == 401
    good = jwt.encode(claims, SECRET, algorithm="HS256")
    head, payload, signature = good.split(".")
    admin_payload = jwt.utils.base64url_encode(json.dumps({**claims, "sub": user_id("jon")}).encode()).decode()
    assert me(f"{head}.{admin_payload}.{signature}") == 401  # payload swapped, signature kept
    assert me(jwt.encode({**claims, "exp": now - 1}, SECRET, algorithm="HS256")) == 401
    for missing in ("exp", "iat", "sub", "typ", "jti"):
        assert me(jwt.encode({k: v for k, v in claims.items() if k != missing}, SECRET, algorithm="HS256")) == 401, missing
    for kind in ("mfa", "reset", "unlock", "refresh", ""):  # a signed token of another kind is not a session
        assert me(jwt.encode({**claims, "typ": kind}, SECRET, algorithm="HS256")) == 401, kind
    assert me(jwt.encode({**claims, "cv": "0" * 16}, SECRET, algorithm="HS256")) == 401  # issued for an older password
    assert me(jwt.encode({**claims, "sub": "not-a-uuid"}, SECRET, algorithm="HS256")) == 401
    assert me(jwt.encode({**claims, "sub": "00000000-0000-4000-8000-00000000dead"}, SECRET, algorithm="HS256")) == 401
    assert me(good + "A" * 3000) == 401 and me("") in (401, 403) and me("null") == 401
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": f"Basic {good}"}).status_code == 401
    assert client.get("/api/auth/me", params={"token": good}).status_code == 401 and client.get("/api/auth/me", cookies={"access_token": good}).status_code == 401
    reset_token, _ = create_token(staff_id, TOKEN_RESET, 5)
    assert decode_token(reset_token, TOKEN_ACCESS) is None and decode_token(reset_token, TOKEN_RESET)["sub"] == staff_id
    _, jti_a = create_token(staff_id, TOKEN_RESET, 5)
    _, jti_b = create_token(staff_id, TOKEN_RESET, 5)
    assert jti_a != jti_b and len(jti_a) == 43  # secrets.token_urlsafe(32): 256 random bits


def test_uc10_uc11_reset_and_unlock_links_are_single_use_and_strictly_separate_se_fr11(client, monkeypatch):
    monkeypatch.setattr(auth_rate_limiter, "limit", 1000)
    ensure_user("sep_user")
    email = "sep_user@example.com"
    login = lambda password: client.post("/api/auth/login", json={"email": email, "password": password})  # noqa: E731
    session = login(DEMO_PASSWORD).json()["access_token"]
    assert client.get("/api/auth/me", headers=auth(session)).status_code == 200

    def latest(kind: str) -> str:
        message = next(m for m in DEV_OUTBOX if m.to == email and kind in m.subject)
        return message.link.split("token=")[1]

    for _ in range(5):
        assert login("wrong-password").status_code == 401
    assert login(DEMO_PASSWORD).status_code == 423
    unlock_token = latest("locked")
    assert client.post("/api/auth/reset-password/request", json={"email": email}).status_code == 200
    reset_token = latest("Reset")

    # The two links are not interchangeable.
    assert client.post("/api/auth/unlock", json={"unlock_token": reset_token}).status_code == 400
    assert client.post("/api/auth/reset-password/confirm", json={"token": unlock_token, "new_password": "N3w!Password"}).status_code == 400
    assert client.get("/api/auth/me", headers=auth(reset_token)).status_code == 401 and client.get("/api/auth/me", headers=auth(unlock_token)).status_code == 401

    # UC-11: resetting the password does NOT unlock the account ...
    with client.websocket_connect("/ws") as ws:
        assert ws_login(ws, session)["type"] == "connected"
        assert client.post("/api/auth/reset-password/confirm", json={"token": reset_token, "new_password": "N3w!Password"}).status_code == 200
        with pytest.raises(WebSocketDisconnect) as closed:  # ... and it ends every session opened with the old password
            ws.receive_json()
        assert closed.value.code == 4401
    assert client.get("/api/auth/me", headers=auth(session)).status_code == 401
    with SessionLocal() as db:
        row = db.execute(select(UserProfile).where(UserProfile.email == email)).scalar_one()
        assert row.locked_until is not None and row.failed_login_attempts == 5 and row.unlock_token_jti and row.reset_token_jti is None
    assert login("N3w!Password").status_code == 423 and login(DEMO_PASSWORD).status_code == 423
    assert client.post("/api/auth/reset-password/confirm", json={"token": reset_token, "new_password": "An0ther!Pass"}).status_code == 400  # single use

    # UC-10: ... and unlocking does NOT change the password.
    with SessionLocal() as db:
        hash_before = db.execute(select(UserProfile.password_hash).where(UserProfile.email == email)).scalar_one()
    assert client.post("/api/auth/unlock", json={"unlock_token": unlock_token}).status_code == 200
    assert client.post("/api/auth/unlock", json={"unlock_token": unlock_token}).status_code == 400  # single use
    with SessionLocal() as db:
        row = db.execute(select(UserProfile).where(UserProfile.email == email)).scalar_one()
        assert row.password_hash == hash_before and row.locked_until is None and row.failed_login_attempts == 0 and row.unlock_token_jti is None
    assert login(DEMO_PASSWORD).status_code == 401  # the old password is gone
    assert login("N3w!Password").status_code == 200
    # A newer reset link replaces an older one; neither is accepted after use.
    client.post("/api/auth/reset-password/request", json={"email": email})
    first = latest("Reset")
    client.post("/api/auth/reset-password/request", json={"email": email})
    second = latest("Reset")
    assert first != second
    assert client.post("/api/auth/reset-password/confirm", json={"token": first, "new_password": "Sup3r!Secret"}).status_code == 400
    assert client.post("/api/auth/reset-password/confirm", json={"token": second, "new_password": DEMO_PASSWORD}).status_code == 200
    _tokens.pop("sep_user", None)


# ---------------------------------------------------------------------------
# 10. Rate limiter memory, request size, idempotency, malformed ids
# ---------------------------------------------------------------------------
def test_uc08_rate_limiter_memory_stays_bounded_under_spoofed_addresses_uc09(client):
    limiter = SlidingWindowRateLimiter(limit=5, window_seconds=60, max_keys=1000)
    for i in range(50_000):  # 50,000 distinct "addresses" inside one window
        assert limiter.hit(f"10.{i >> 16}.{(i >> 8) & 255}.{i & 255}|/api/auth/login", now=1000.0 + i * 0.0001)
    assert limiter.key_count() <= 1000  # hard cap, least-recently-seen evicted first
    assert limiter.hit("fresh|/api/auth/login", now=2000.0)  # a single hit after the window ...
    assert limiter.key_count() == 1  # ... sweeps every expired entry: memory returns to baseline
    started = time.perf_counter()
    for i in range(20_000):
        limiter.hit(f"k{i % 2000}", now=3000.0 + i * 0.01)
    assert time.perf_counter() - started < 2.0 and limiter.key_count() <= 1000
    # Behaviour is unchanged: 5 per window per key, then refusal until the window slides.
    strict = SlidingWindowRateLimiter(limit=5, window_seconds=60)
    assert [strict.hit("ip", now=float(t)) for t in range(7)] == [True] * 5 + [False] * 2
    assert strict.hit("ip", now=61.0) is True and strict.retry_after("ip", now=61.0) >= 1
    # The limiter in front of the API also covers the 2FA and password-reset endpoints.
    assert {"/api/auth/signup", "/api/auth/login", "/api/auth/verify-mfa", "/api/auth/reset-password/request"} <= set(get_settings().rate_limited_paths)
    codes = [client.post("/api/auth/reset-password/request", json={"email": "nobody@example.com"}).status_code for _ in range(6)]
    assert codes == [200] * 5 + [429]


def test_hardening_oversized_bodies_malformed_ids_and_replayed_keys_se_nfr04(client):
    jon = H(client, "jon")
    project = new_project(client, owner="jon", name="Hardening project")
    pid = project["id"]
    # 1 MB request cap, declared or not.
    big = client.post(f"/api/projects/{pid}/tasks", headers=jon, content=b'{"title": "' + b"A" * (MAX_REQUEST_BYTES + 10) + b'"}')
    assert big.status_code == 413 and big.json() == {"detail": "Request body is too large"}
    lying = client.post(f"/api/projects/{pid}/tasks", headers={**jon, "Content-Length": "abc"}, content=b"{}")
    assert lying.status_code in (400, 413)

    def chunks():
        yield b'{"title": "'
        for _ in range(MAX_REQUEST_BYTES // 65536 + 2):
            yield b"B" * 65536
        yield b'"}'

    streamed = client.post(f"/api/projects/{pid}/tasks", headers={**jon, "Content-Type": "application/json"}, content=chunks())
    assert streamed.status_code == 413
    assert client.get(f"/api/projects/{pid}/tasks", headers=jon).json() == []

    # Ids that are not UUIDs: a clean 404 / 422, never a server error or a database message.
    for bad in ("not-a-uuid", "1", "' OR '1'='1", "..%2F..%2Fetc%2Fpasswd", "00000000-0000-0000-0000-00000000000g", "%00"):
        for path in (f"/api/tasks/{bad}", f"/api/projects/{bad}", f"/api/projects/{bad}/tasks", f"/api/tasks/{bad}/comments", f"/api/projects/{bad}/costs"):
            r = client.get(path, headers=jon)
            assert r.status_code in (403, 404), (path, r.status_code)
            assert "sql" not in r.text.lower() and "traceback" not in r.text.lower() and "uuid" not in r.text.lower()
    for body in ({"title": "x", "due_date": iso(future(2)), "assignee_id": "nope"}, {"title": "x", "due_date": iso(future(2)), "list_id": "1; drop table tasks"}):
        r = client.post(f"/api/projects/{pid}/tasks", headers=jon, json=body)
        assert r.status_code == 422 and "Not a valid id" in json.dumps(r.json()["errors"])
    assert client.post("/api/time-entries/timer/start", headers=jon, json={"task_id": "x"}).status_code == 422
    assert client.delete(f"/api/projects/{pid}/members/{user_id('staff')}", headers=jon, params={"reassign_to_user_id": "nope"}).status_code == 404
    # Numbers a database column cannot hold are refused by validation.
    assert client.post(f"/api/projects/{pid}/lists", headers=jon, json={"name": "L", "position": 2**40}).status_code == 422
    assert client.post(f"/api/projects/{pid}/stage-costs", headers=jon, json={"stage_name": "S", "amount": "1", "position": 2**40}).status_code == 422

    # Idempotency keys: a retry of the same request is replayed; the same key with a different body or a
    # different caller is a new request; sign-in answers are never served from the cache.
    body = {"title": "Once", "due_date": iso(future(2))}
    key = {"Idempotency-Key": "audit-key-1"}
    first = client.post(f"/api/projects/{pid}/tasks", headers={**jon, **key}, json=body)
    replay = client.post(f"/api/projects/{pid}/tasks", headers={**jon, **key}, json=body)
    assert first.status_code == 201 and replay.headers.get("Idempotent-Replayed") == "true" and replay.json()["id"] == first.json()["id"]
    other_body = client.post(f"/api/projects/{pid}/tasks", headers={**jon, **key}, json={**body, "title": "Different"})
    assert other_body.status_code == 201 and other_body.headers.get("Idempotent-Replayed") is None and other_body.json()["id"] != first.json()["id"]
    other_user = client.post(f"/api/projects/{pid}/tasks", headers={**H(client, "staff"), **key}, json=body)
    assert other_user.status_code == 403
    auth_rate_limiter.reset()
    one = client.post("/api/auth/login", headers={"Idempotency-Key": "login-key"}, json={"email": "jon@example.com", "password": DEMO_PASSWORD})
    two = client.post("/api/auth/login", headers={"Idempotency-Key": "login-key"}, json={"email": "jon@example.com", "password": "wrong-password"})
    assert one.status_code == 200 and two.status_code == 401 and two.headers.get("Idempotent-Replayed") is None
    with SessionLocal() as db:  # undo the one counted failure for the shared demo account
        row = db.execute(select(UserProfile).where(UserProfile.username == "jon")).scalar_one()
        row.failed_login_attempts = 0
        db.commit()
    # Large responses (file exports) are not kept in memory by the retry cache.
    store = main_module.idempotency_store
    before_bytes = store.total_bytes
    store.put("huge", 200, [], b"x" * (store.max_body_bytes + 1))
    assert store.get("huge") is None and store.total_bytes == before_bytes


# ---------------------------------------------------------------------------
# 11. Money is exact decimal arithmetic end to end
# ---------------------------------------------------------------------------
def test_se_nfr01_money_is_exact_decimal_with_half_up_rounding_uc01(client):
    project = new_project(client, owner="jon", name="Precision project")
    pid = project["id"]
    jon = H(client, "jon")
    stage = lambda name, amount: client.post(f"/api/projects/{pid}/stage-costs", headers=jon, json={"stage_name": name, "amount": amount})  # noqa: E731
    expense = lambda amount: client.post(f"/api/projects/{pid}/expenses", headers=jon, json={"category": "other", "description": "e", "amount": amount, "expense_date": "2026-11-03"})  # noqa: E731

    # 0.1 + 0.2 is 0.30000000000000004 in binary floating point; here it is exactly 0.30.
    assert stage("a", 0.1).json()["amount"] == "0.10" and stage("b", 0.2).json()["amount"] == "0.20"
    costs = client.get(f"/api/projects/{pid}/costs", headers=jon).json()
    assert costs["stage_cost_sum"] == "0.30" and costs["sum_label"] == "Total"
    # One cent, a thousand times: exactly 10.00 (a float sum drifts to 9.999999999999831).
    for _ in range(100):
        assert expense("0.01").status_code == 201
    assert client.get(f"/api/projects/{pid}/costs", headers=jon).json()["expense_total"] == "1.00"
    # ROUND_HALF_UP to the cent on input: 2.675 -> 2.68 (binary floats and banker's rounding give 2.67), 1.005 -> 1.01.
    assert stage("c", "2.675").json()["amount"] == "2.68" and stage("d", "1.005").json()["amount"] == "1.01" and stage("e", "0.125").json()["amount"] == "0.13"
    assert stage("f", "9999999999.99").json()["amount"] == "9999999999.99"
    costs = client.get(f"/api/projects/{pid}/costs", headers=jon).json()
    assert costs["stage_cost_sum"] == "10000000004.11"  # 0.10 + 0.20 + 2.68 + 1.01 + 0.13 + 9999999999.99, to the cent
    # Bid, budget and expenses are reported separately and never added to the stage-cost total.
    fin = client.put(f"/api/projects/{pid}/financials", headers=jon, json={"bid_amount": "1000.005", "budget_amount": "0.004"}).json()
    assert fin["bid_amount"] == "1000.01" and fin["budget_amount"] == "0.00" and fin["stage_cost_sum"] == "10000000004.11" and fin["expense_total"] == "1.00"
    assert all(isinstance(fin[k], str) for k in ("bid_amount", "budget_amount", "stage_cost_sum", "expense_total"))  # strings, not JSON floats
    partial = client.get(f"/api/projects/{pid}/costs", headers=jon, params={"stage_ids": ",".join(s["id"] for s in costs["stage_costs"][:2])}).json()
    assert partial["stage_cost_sum"] == "0.30" and partial["sum_label"] == "Subtotal"
    # Values that are not finite money are refused.
    for bad in ("NaN", "Infinity", "-Infinity", "-0.01", "1e400", "10000000000.00", "abc", "", None, [], {"amount": 1}):
        assert stage("bad", bad).status_code == 422, bad
    # The database column is NUMERIC / Decimal and the ORM returns Decimal, never float.
    with SessionLocal() as db:
        amounts = list(db.execute(select(StageCost.amount).where(StageCost.project_id == pid)).scalars())
        assert amounts and all(isinstance(a, Decimal) for a in amounts)
        assert sum(amounts, Decimal("0")) == Decimal("10000000004.11")
    # Percentages: two decimals, half up.
    assert percent(1, 3) == 33.33 and percent(2, 3) == 66.67 and percent(1, 8) == 12.5 and percent(1, 200) == 0.5 and percent(0, 0) == 0.0
    dashboard = client.get("/api/dashboard/widgets", headers=jon).json()["data"]["budget_overview"]["projects"]
    mine = next(p for p in dashboard if p["project_id"] == pid)
    assert mine["stage_cost_total"] == "10000000004.11" and mine["expense_total"] == "1.00" and mine["bid_amount"] == "1000.01"


# ---------------------------------------------------------------------------
# Phase 2: no N+1 queries (the query count does not grow with the data)
# ---------------------------------------------------------------------------
def _count_queries(fn) -> int:
    statements: list[str] = []

    def record(_conn, _cursor, statement, _params, _context, _many):
        if not statement.lstrip().upper().startswith(("PRAGMA", "SAVEPOINT", "RELEASE", "BEGIN", "COMMIT", "ROLLBACK")):
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        fn()
    finally:
        event.remove(engine, "before_cursor_execute", record)
    return len(statements)


def _populate(client, name: str, members: int, tasks: int) -> str:
    names = [f"n1_{name}_{i:02d}" for i in range(members)]
    for n in names:
        ensure_user(n)
    owner_name = f"n1_{name}_owner"
    ensure_user(owner_name)
    project = new_project(client, owner=owner_name, members=names, name=f"N+1 {name}")
    pid = project["id"]
    ids = [user_id(n) for n in names]
    with SessionLocal() as db:
        for i in range(tasks):
            task = Task(project_id=pid, list_id=project["lists"][i % 3]["id"], title=f"Task {i}", description="", status=["todo", "in_progress", "review", "done"][i % 4],
                        priority="medium", assignee_id=ids[i % len(ids)], due_date=future(-3 + i % 6), position=i, tags=["t"], estimated_hours=Decimal("2"), created_by=ids[0])
            db.add(task)
            db.flush()
            db.add(SoftDeadline(task_id=task.id, project_id=pid, title="sd", due_at=future(-5), priority="low", created_by=ids[0]))
            db.add(Comment(task_id=task.id, project_id=pid, author_id=ids[i % len(ids)], body="c"))
            db.add(TimeEntry(project_id=pid, task_id=task.id, user_id=ids[i % len(ids)], source="manual", started_at=future(-1), ended_at=future(-1), duration_hours=Decimal("1.5")))
            db.add(Expense(project_id=pid, category="other", description=f"e{i}", amount=Decimal("1.25"), expense_date=future(-1).date(), created_by=ids[0]))
        db.commit()
    return pid


def test_se_nfr08_se_nfr09_query_count_is_constant_from_5_to_60_rows_uc02_uc12_uc16_uc18(client):
    small = _populate(client, "small", members=5, tasks=5)
    large = _populate(client, "large", members=60, tasks=60)
    counts: dict[str, tuple[int, int]] = {}
    for label, path, params in (
        ("project list (UC-12)", "/api/projects", None),
        ("project detail + members (UC-12)", "/api/projects/{pid}", None),
        ("members (UC-19)", "/api/projects/{pid}/members", None),
        ("board tasks (UC-18)", "/api/projects/{pid}/tasks", None),
        ("progress (SE-FR-18)", "/api/projects/{pid}/progress", None),
        ("performance report (UC-02)", "/api/projects/{pid}/reports/performance", None),
        ("costs (UC-01)", "/api/projects/{pid}/costs", None),
        ("soft deadlines (UC-07)", "/api/projects/{pid}/soft-deadlines", None),
        ("time entries", "/api/time-entries", {"project_id": "{pid}"}),
        ("calendar events", "/api/calendar/events", None),
        ("dashboard (UC-16)", "/api/dashboard/widgets", None),
    ):
        pair = []
        for pid, owner in ((small, "n1_small_owner"), (large, "n1_large_owner")):
            headers = H(client, owner)
            url = path.format(pid=pid)
            query = {k: v.format(pid=pid) for k, v in (params or {}).items()}
            assert client.get(url, headers=headers, params=query).status_code == 200  # warm-up (creates default widgets etc.)
            pair.append(_count_queries(lambda: client.get(url, headers=headers, params=query)))
        counts[label] = (pair[0], pair[1])
    grew = {label: pair for label, pair in counts.items() if pair[1] != pair[0]}
    assert not grew, f"query count grows with the data (N+1): {grew}"
    assert all(pair[1] <= 16 for pair in counts.values()), counts
    # 60 members, 60 tasks: the answers are still complete and the avatar preview is capped in SQL.
    detail = client.get(f"/api/projects/{large}", headers=H(client, "n1_large_owner")).json()
    assert detail["member_count"] == 61 and len(detail["members"]) == 61 and len(detail["members_preview"]) == 5
    assert detail["members_preview"][0]["username"] == "n1_large_owner"  # owners first
    assert set(detail["members_preview"][0]) == {"id", "username", "display_name", "avatar_url"}
    assert len(client.get(f"/api/projects/{large}/tasks", headers=H(client, "n1_large_owner")).json()) == 60
    report = client.get(f"/api/projects/{large}/reports/performance", headers=H(client, "n1_large_owner")).json()
    assert len(report["members"]) == 61 and report["totals"]["actual_hours"] == 90.0 and report["completion"] == {"done": 15, "total": 60, "progress_pct": 25.0}
    # Deleting the 60-task project is one cascading DELETE, not one statement per row.
    deletes = _count_queries(lambda: client.delete(f"/api/projects/{large}", headers=H(client, "n1_large_owner")))
    assert deletes <= 8
    with SessionLocal() as db:
        for model in (Task, ProjectMember, SoftDeadline, Comment, TimeEntry, Expense):
            assert db.execute(select(func.count()).select_from(model).where(model.project_id == large)).scalar_one() == 0
