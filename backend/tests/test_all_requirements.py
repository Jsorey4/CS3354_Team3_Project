"""
@author: eLeet Coderz (Team 3) - each test is owned by the teammate who owns the requirement it verifies
@description: Automated proof that ProjectForge meets its requirements. Every test name carries the use
    case (UC-xx) and requirement (SE-FR-xx / SE-NFR-xx) ids it checks. The suite runs against a fresh
    in-memory SQLite database seeded with the demo team, exercising the real HTTP API (and WebSocket)
    exactly as the React app does. Run with:  cd backend && python -m pytest -q
@traces: UC-01..UC-22, SE-FR-01..SE-FR-30, SE-NFR-01..SE-NFR-12
"""

from __future__ import annotations

import io
import os
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal

# Set TEST_DATABASE_URL=postgresql://... to run the same suite against PostgreSQL / Supabase.
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "sqlite:///:memory:")
os.environ["DB_FALLBACK_TO_SQLITE"] = "false"
os.environ["BCRYPT_ROUNDS"] = "4"
os.environ["JWT_SECRET"] = "test-secret-" + "x" * 40
os.environ["DEMO_MODE"] = "true"
os.environ["SEED_DEMO_DATA"] = "true"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from openpyxl import load_workbook  # noqa: E402
from sqlalchemy import event  # noqa: E402

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.permissions import require_project_role  # noqa: E402
from app.core.sanitizer import sanitize_markdown, sanitize_spreadsheet_cell  # noqa: E402
from app.core.security import DEV_OUTBOX, HSTS_VALUE, auth_rate_limiter, hash_password, transport_security_headers  # noqa: E402
from app.main import app, idempotency_store  # noqa: E402
from app.models.entities import Expense, Task, UserProfile  # noqa: E402
from app.routers.dashboard import DEFAULT_LAYOUT, WIDGET_TYPES, overlaps  # noqa: E402
from app.routers.reports import efficiency_pct  # noqa: E402
from app.routers.time_tracking import duration_hours  # noqa: E402

DEMO_PASSWORD = "ProjectForge!1"


# ---------------------------------------------------------------------------
# Fixtures & helpers
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _reset_limits():
    auth_rate_limiter.reset()
    yield
    auth_rate_limiter.reset()


_tokens: dict[str, str] = {}


def token(client: TestClient, username: str) -> str:
    if username not in _tokens:
        r = client.post("/api/auth/demo-switch", json={"username": username})
        if r.status_code == 200:
            _tokens[username] = r.json()["access_token"]
        else:  # non-demo users created by tests sign in normally
            auth_rate_limiter.reset()
            r = client.post("/api/auth/login", json={"email": username, "password": DEMO_PASSWORD})
            assert r.status_code == 200, r.text
            _tokens[username] = r.json()["access_token"]
    return _tokens[username]


def H(client: TestClient, username: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token(client, username)}"}


def iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat() + "Z"


def future(days: float = 10) -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=days)


def make_user(username: str) -> str:
    with SessionLocal() as db:
        user = UserProfile(
            username=username,
            email=f"{username}@example.com",
            display_name=username.title(),
            password_hash=hash_password(DEMO_PASSWORD),
        )
        db.add(user)
        db.commit()
        return user.id


def user_id(username: str) -> str:
    with SessionLocal() as db:
        return db.query(UserProfile).filter(UserProfile.username == username).one().id


def new_project(client: TestClient, owner: str = "jon", members: list[str] | None = None, name: str = "Test project") -> dict:
    r = client.post(
        "/api/projects",
        headers=H(client, owner),
        json={
            "name": name,
            "status": "active",
            "project_type": "work",
            "deadline": iso(future(30)),
            "members": members or [],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def set_role(client: TestClient, project_id: str, actor: str, target: str, role: str):
    return client.patch(
        f"/api/projects/{project_id}/members/{user_id(target)}/role", headers=H(client, actor), json={"role": role}
    )


def new_task(client: TestClient, project_id: str, actor: str = "jon", **fields) -> dict:
    # UC-18: title and due date are both required, so the fixture always supplies a due date.
    body = {"title": fields.pop("title", "A task"), "due_date": fields.pop("due_date", iso(future(14))), **fields}
    r = client.post(f"/api/projects/{project_id}/tasks", headers=H(client, actor), json=body)
    assert r.status_code == 201, r.text
    return r.json()


def seeded_project(client: TestClient, name: str = "ProjectForge Platform") -> dict:
    return next(p for p in client.get("/api/projects", headers=H(client, "jon")).json() if p["name"] == name)


# ---------------------------------------------------------------------------
# 1. UC-01 costs (Jon Sorey)
# ---------------------------------------------------------------------------
def test_uc01_cost_access_and_subtotal_math_se_fr01_se_fr02_se_fr03_se_nfr01_se_nfr02(client):
    platform = seeded_project(client)
    # Member (staff) is refused with zero financial data.
    r = client.get(f"/api/projects/{platform['id']}/costs", headers=H(client, "staff"))
    assert r.status_code == 403
    assert r.json() == {"detail": "Access denied"}
    for path, body in (
        ("financials", {"bid_amount": "1"}),
        ("stage-costs", {"stage_name": "x", "amount": "1"}),
        ("expenses", {"category": "other", "description": "x", "amount": "1", "expense_date": "2026-01-01"}),
    ):
        method = client.put if path == "financials" else client.post
        assert method(f"/api/projects/{platform['id']}/{path}", headers=H(client, "staff"), json=body).status_code == 403

    # Manager may view; owner sees four separate buckets.
    assert client.get(f"/api/projects/{platform['id']}/costs", headers=H(client, "tyler")).status_code == 200
    seeded = client.get(f"/api/projects/{platform['id']}/costs", headers=H(client, "jon")).json()
    assert seeded["bid_amount"] == "48500.00" and seeded["budget_amount"] == "42000.00"
    assert seeded["stage_cost_sum"] == "36870.85" and seeded["sum_label"] == "Total"
    assert isinstance(seeded["stage_costs"], list) and isinstance(seeded["expenses"], list)

    # Exact Decimal math on a fresh project: 0.10 + 0.20 must be exactly 0.30 (float gives 0.30000000000000004).
    project = new_project(client, name="Cost math")
    pid = project["id"]
    ids = []
    for name, amount in (("A", "0.10"), ("B", "0.20"), ("C", "10.005")):
        r = client.post(f"/api/projects/{pid}/stage-costs", headers=H(client, "jon"), json={"stage_name": name, "amount": amount})
        assert r.status_code == 201
        ids.append(r.json()["id"])
    assert r.json()["amount"] == "10.01"  # ROUND_HALF_UP to $0.01

    full = client.get(f"/api/projects/{pid}/costs", headers=H(client, "jon")).json()
    assert full["stage_cost_sum"] == "10.31" and full["sum_label"] == "Total"
    partial = client.get(f"/api/projects/{pid}/costs", headers=H(client, "jon"), params={"stage_ids": f"{ids[0]},{ids[1]}"}).json()
    assert partial["stage_cost_sum"] == "0.30" and partial["sum_label"] == "Subtotal"
    assert sorted(partial["included_stage_ids"]) == sorted(ids[:2])

    # Bids / budgets / expenses are never mixed into the stage-cost sum.
    r = client.put(f"/api/projects/{pid}/financials", headers=H(client, "jon"), json={"bid_amount": "1000.005", "budget_amount": 900})
    assert r.status_code == 200
    body = r.json()
    assert body["bid_amount"] == "1000.01" and body["budget_amount"] == "900.00" and body["stage_cost_sum"] == "10.31"

    # Expense validation + filtering / sorting.
    bad = client.post(
        f"/api/projects/{pid}/expenses", headers=H(client, "jon"),
        json={"category": "other", "description": "x", "amount": "-1", "expense_date": "2026-01-01"},
    )
    assert bad.status_code == 422 and "amount" in bad.json()["errors"]
    bad_cat = client.post(
        f"/api/projects/{pid}/expenses", headers=H(client, "jon"),
        json={"category": "snacks", "description": "x", "amount": "1", "expense_date": "2026-01-01"},
    )
    assert bad_cat.status_code == 422 and "category" in bad_cat.json()["errors"]
    for cat, desc, amount, day in (("software", "IDE license", "99.99", "2026-03-02"), ("travel", "Taxi", "15.50", "2026-03-01"), ("software", "CI minutes", "5.00", "2026-03-03")):
        assert client.post(
            f"/api/projects/{pid}/expenses", headers=H(client, "jon"),
            json={"category": cat, "description": desc, "amount": amount, "expense_date": day},
        ).status_code == 201
    filtered = client.get(
        f"/api/projects/{pid}/costs", headers=H(client, "jon"),
        params={"category": "software", "sort_by": "amount", "sort_dir": "asc"},
    ).json()
    assert [e["amount"] for e in filtered["expenses"]] == ["5.00", "99.99"]
    assert filtered["expense_total"] == "104.99"
    searched = client.get(f"/api/projects/{pid}/costs", headers=H(client, "jon"), params={"search": "taxi"}).json()
    assert [e["description"] for e in searched["expenses"]] == ["Taxi"]
    by_date = client.get(f"/api/projects/{pid}/costs", headers=H(client, "jon"), params={"sort_by": "expense_date", "sort_dir": "asc"}).json()
    assert [e["expense_date"] for e in by_date["expenses"]] == ["2026-03-01", "2026-03-02", "2026-03-03"]


# ---------------------------------------------------------------------------
# 2. UC-02 performance reports (Jon Sorey)
# ---------------------------------------------------------------------------
def test_uc02_performance_report_role_scoping_se_fr05_se_nfr02(client):
    project = new_project(client, members=["tyler", "staff"], name="Perf")
    pid = project["id"]
    assert set_role(client, pid, "jon", "tyler", "manager").status_code == 200
    # Due dates inside the default 30-day report period (UC-18 makes every task carry one).
    in_period = iso(future(-2))
    staff_task = new_task(client, pid, title="Staff work", assignee_id=user_id("staff"), estimated_hours=4, assigned_hours=5, due_date=in_period)
    tyler_task = new_task(client, pid, title="Tyler work", assignee_id=user_id("tyler"), estimated_hours=10, due_date=in_period)
    idle_task = new_task(client, pid, title="Not started", assignee_id=user_id("staff"), estimated_hours=3, due_date=in_period)
    hours = f"/api/projects/{pid}/tasks/{{}}/hours"
    assert client.post(hours.format(staff_task["id"]), headers=H(client, "staff"), json={"actual_hours": 5}).status_code == 200
    assert client.post(hours.format(tyler_task["id"]), headers=H(client, "tyler"), json={"actual_hours": 8}).status_code == 200

    assert client.put(f"/api/tasks/{staff_task['id']}", headers=H(client, "staff"), json={"status": "done"}).status_code == 200
    member_view = client.get(f"/api/projects/{pid}/reports/performance", headers=H(client, "staff")).json()
    assert member_view["scope"] == "self"
    assert member_view["completion"] == {"done": 1, "total": 2, "progress_pct": 50.0}  # only the member's own 2 tasks
    assert member_view["progress_over_time"][-1]["completion_pct"] == 50.0
    assert [m["username"] for m in member_view["members"]] == ["staff"]
    assert member_view["totals"]["actual_hours"] == 5.0  # Tyler's 8 hours never leak into the member's totals
    assert member_view["totals"]["estimated_hours"] == 7.0
    assert all(t["assignee_username"] == "staff" for t in member_view["tasks"])
    idle_row = next(t for t in member_view["tasks"] if t["task_id"] == idle_task["id"])
    assert idle_row["efficiency_pct"] == "N/A"  # zero actual hours -> N/A, never a division error
    assert next(t for t in member_view["tasks"] if t["task_id"] == staff_task["id"])["efficiency_pct"] == 80.0

    team_view = client.get(f"/api/projects/{pid}/reports/performance", headers=H(client, "tyler")).json()
    assert team_view["scope"] == "team"
    assert {m["username"] for m in team_view["members"]} == {"jon", "tyler", "staff"}
    assert team_view["totals"]["actual_hours"] == 13.0
    assert team_view["completion"] == {"done": 1, "total": 3, "progress_pct": 33.33}  # SE-NFR-01: 0.01 % precision
    assert next(m for m in team_view["members"] if m["username"] == "jon")["efficiency_pct"] == "N/A"
    assert next(m for m in team_view["members"] if m["username"] == "tyler")["efficiency_pct"] == 125.0

    bad = client.get(
        f"/api/projects/{pid}/reports/performance", headers=H(client, "jon"),
        params={"start_date": "2026-05-02", "end_date": "2026-05-01"},
    )
    assert bad.status_code == 400
    # Members also cannot list other members' raw time entries.
    assert client.get("/api/time-entries", headers=H(client, "staff"), params={"project_id": pid, "user_id": user_id("tyler")}).status_code == 403
    assert efficiency_pct(Decimal("3"), Decimal("0")) == "N/A" and efficiency_pct(None, Decimal("2")) == "N/A"
    assert efficiency_pct(Decimal("2"), Decimal("3")) == 66.67


# ---------------------------------------------------------------------------
# 3. UC-05 / UC-06 / UC-07 soft deadlines (Preethi Seereddy)
# ---------------------------------------------------------------------------
def test_uc05_uc06_soft_deadline_validation_se_fr06_se_fr07_se_fr08_se_fr09_se_fr10_se_nfr03(client):
    project = new_project(client, members=["staff", "aashwat"], name="Soft deadlines")
    pid = project["id"]
    due = future(10)
    task = new_task(client, pid, title="Report", due_date=iso(due), assignee_id=user_id("staff"))
    url = f"/api/tasks/{task['id']}/soft-deadlines"

    late = client.post(url, headers=H(client, "jon"), json={"title": "Too late", "due_at": iso(due + timedelta(hours=1))})
    assert late.status_code == 400
    assert late.json() == {"detail": "Soft deadline must be earlier than the task's final due date."}
    equal = client.post(url, headers=H(client, "jon"), json={"title": "Same time", "due_at": iso(due)})
    assert equal.status_code == 400

    second = client.post(url, headers=H(client, "staff"), json={"title": "Second draft", "due_at": iso(due - timedelta(days=2)), "priority": "high"})
    assert second.status_code == 201  # assignee (member) may manage their own task's soft deadlines
    assert second.json()["priority"] == "high"  # SE-FR-09: priority is saved and displayed
    bad_priority = client.post(url, headers=H(client, "staff"), json={"title": "x", "due_at": iso(due - timedelta(days=3)), "priority": "urgent"})
    assert bad_priority.status_code == 422 and "priority" in bad_priority.json()["errors"]  # SE-NFR-03: field-level feedback
    first = client.post(url, headers=H(client, "jon"), json={"title": "First draft", "due_at": iso(due - timedelta(days=5))})
    assert first.status_code == 201 and first.json()["priority"] == "medium"  # default priority
    # A member who is NOT the assignee may view but not change.
    assert client.post(url, headers=H(client, "aashwat"), json={"title": "x", "due_at": iso(due - timedelta(days=1))}).status_code == 403

    listed = client.get(f"/api/projects/{pid}/soft-deadlines", headers=H(client, "aashwat")).json()
    assert [s["title"] for s in listed] == ["First draft", "Second draft"]  # UC-07: ordered by due_at ASC

    original_due = first.json()["due_at"]
    failed_edit = client.put(
        f"/api/soft-deadlines/{first.json()['id']}", headers=H(client, "jon"),
        json={"title": "Renamed", "due_at": iso(due + timedelta(days=1))},
    )
    assert failed_edit.status_code == 400
    assert failed_edit.json()["detail"] == "Soft deadline must be earlier than the task's final due date."
    assert failed_edit.json()["original"]["due_at"] == original_due  # UI restores this value
    after = client.get(f"/api/tasks/{task['id']}/soft-deadlines", headers=H(client, "jon")).json()
    unchanged = next(s for s in after if s["id"] == first.json()["id"])
    assert unchanged["due_at"] == original_due and unchanged["title"] == "First draft"

    ok_edit = client.put(f"/api/soft-deadlines/{first.json()['id']}", headers=H(client, "jon"), json={"due_at": iso(due - timedelta(days=4)), "priority": "low"})
    assert ok_edit.status_code == 200 and ok_edit.json()["priority"] == "low"
    done = client.patch(f"/api/soft-deadlines/{second.json()['id']}/complete", headers=H(client, "staff"), json={"is_completed": True})
    assert done.status_code == 200 and done.json()["state"] == "completed"
    assert client.delete(f"/api/soft-deadlines/{second.json()['id']}", headers=H(client, "staff")).status_code == 204

    # UC-18 makes the final due date mandatory, so a soft deadline always has a date to be earlier than:
    # a task cannot be created without one and an existing one cannot be cleared.
    no_due = client.post(f"/api/projects/{pid}/tasks", headers=H(client, "jon"), json={"title": "No due date"})
    assert no_due.status_code == 422 and no_due.json()["errors"]["due_date"] == "Due date is required"
    cleared = client.put(f"/api/tasks/{task['id']}", headers=H(client, "jon"), json={"due_date": None})
    assert cleared.status_code == 422 and cleared.json()["errors"]["due_date"] == "Due date is required"
    # Moving the final due date before an existing soft deadline is refused (keeps SE-FR-06 true forever).
    r = client.put(f"/api/tasks/{task['id']}", headers=H(client, "jon"), json={"due_date": iso(due - timedelta(days=6))})
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# 4. UC-08..UC-11 auth (Tyler Gaines)
# ---------------------------------------------------------------------------
def test_uc08_uc09_auth_lockout_and_rate_limit_uc10_uc11_se_fr11(client):
    bad = client.post("/api/auth/signup", json={"username": "ab", "email": "nope", "password": "short"})
    assert bad.status_code == 422
    assert {"username", "email", "password"} <= set(bad.json()["errors"])
    assert "uppercase" in bad.json()["errors"]["password"]

    ok = client.post("/api/auth/signup", json={"username": "lockme", "email": "lockme@example.com", "password": "Str0ng!Pass"})
    assert ok.status_code == 201 and ok.json()["access_token"]
    dup = client.post("/api/auth/signup", json={"username": "LOCKME", "email": "LockMe@example.com", "password": "Str0ng!Pass"})
    assert dup.status_code == 422 and {"username", "email"} <= set(dup.json()["errors"])

    with SessionLocal() as db:
        stored = db.query(UserProfile).filter(UserProfile.username == "lockme").one()
        assert stored.password_hash.startswith("$2") and "Str0ng!Pass" not in stored.password_hash

    auth_rate_limiter.reset()
    for attempt in range(5):
        r = client.post("/api/auth/login", json={"email": "lockme@example.com", "password": "wrong-password"})
        assert r.status_code == 401 and r.json()["detail"] == "Invalid email or password", attempt
    auth_rate_limiter.reset()
    locked = client.post("/api/auth/login", json={"email": "lockme@example.com", "password": "Str0ng!Pass"})
    assert locked.status_code == 423  # lock is checked BEFORE the (correct) password
    assert "locked" in locked.json()["detail"]

    unlock_mail = next(m for m in DEV_OUTBOX if m.to == "lockme@example.com" and "locked" in m.subject)
    unlock_token = unlock_mail.link.split("unlock_token=")[1]
    assert client.post("/api/auth/unlock", json={"unlock_token": unlock_token}).status_code == 200
    assert client.post("/api/auth/unlock", json={"unlock_token": unlock_token}).status_code == 400  # single use
    auth_rate_limiter.reset()
    assert client.post("/api/auth/login", json={"email": "lockme", "password": "Str0ng!Pass"}).status_code == 200

    # Unknown email gets the same generic 401 (no user enumeration).
    assert client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "x"}).json()["detail"] == "Invalid email or password"

    # Rate limit: 5 requests / 60 s / IP on /login, then 429.
    auth_rate_limiter.reset()
    codes = [client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "x"}).status_code for _ in range(5)]
    assert codes == [401] * 5
    limited = client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "x"})
    assert limited.status_code == 429 and limited.json() == {"detail": "Try again later"}
    auth_rate_limiter.reset()
    for i in range(5):
        client.post("/api/auth/signup", json={"username": f"rl_{i}", "email": "bad", "password": "x"})
    assert client.post("/api/auth/signup", json={"username": "rl_x", "email": "bad", "password": "x"}).status_code == 429

    # SE-FR-11: MFA step for Tyler (demo code 123456).
    auth_rate_limiter.reset()
    step1 = client.post("/api/auth/login", json={"email": "tyler@example.com", "password": DEMO_PASSWORD}).json()
    assert step1["mfa_required"] is True and step1["access_token"] is None and step1["temp_token"]
    wrong = client.post("/api/auth/verify-mfa", json={"temp_token": step1["temp_token"], "code": "000000"})
    assert wrong.status_code == 401
    good = client.post("/api/auth/verify-mfa", json={"temp_token": step1["temp_token"], "code": "123456"})
    assert good.status_code == 200 and good.json()["access_token"]
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {step1['temp_token']}"}).status_code == 401

    # UC-11: identical answer for known and unknown emails; single-use token; strength re-checked.
    expected = {"message": "If an account with that email exists, check your inbox for a reset link."}
    assert client.post("/api/auth/reset-password/request", json={"email": "nobody@example.com"}).json() == expected
    assert client.post("/api/auth/reset-password/request", json={"email": "lockme@example.com"}).json() == expected
    reset_token = next(m for m in DEV_OUTBOX if m.to == "lockme@example.com" and "Reset" in m.subject).link.split("token=")[1]
    weak = client.post("/api/auth/reset-password/confirm", json={"token": reset_token, "new_password": "weak"})
    assert weak.status_code == 422
    assert client.post("/api/auth/reset-password/confirm", json={"token": reset_token, "new_password": "N3w!Password"}).status_code == 200
    assert client.post("/api/auth/reset-password/confirm", json={"token": reset_token, "new_password": "N3w!Password2"}).status_code == 400
    auth_rate_limiter.reset()
    assert client.post("/api/auth/login", json={"email": "lockme@example.com", "password": "N3w!Password"}).status_code == 200


# ---------------------------------------------------------------------------
# 5. UC-12 / UC-13 / UC-14 / UC-15 projects & exports (Saaqib Shaik)
# ---------------------------------------------------------------------------
def test_uc12_uc14_uc15_project_and_exports_uc13_se_fr16_to_se_fr20_se_nfr09_se_nfr10(client):
    names = [f"bulk_user_{i:02d}" for i in range(55)]
    with SessionLocal() as db:
        pw = hash_password(DEMO_PASSWORD)
        db.add_all(UserProfile(username=n, email=f"{n}@example.com", display_name=n, password_hash=pw) for n in names)
        db.commit()

    bulk_queries: list[str] = []

    def count(_conn, _cursor, statement, *_args):
        if "FROM user_profiles" in statement and " IN (" in statement:
            bulk_queries.append(statement)

    event.listen(engine, "before_cursor_execute", count)
    try:
        r = client.post(
            "/api/projects", headers=H(client, "jon"),
            json={"name": "Big team", "status": "active", "project_type": "work", "deadline": iso(future(20)),
                  "members": names + ["nobody_1", "nobody_2"]},
        )
    finally:
        event.remove(engine, "before_cursor_execute", count)
    assert r.status_code == 400
    assert r.json()["unknown_members"] == ["nobody_1", "nobody_2"]
    assert len(bulk_queries) == 1  # SE-NFR-09: one set query for 57 usernames, no N+1

    created = client.post(
        "/api/projects", headers=H(client, "jon"),
        json={"name": "Big team", "status": "active", "project_type": "work", "deadline": iso(future(20)), "members": names},
    )
    assert created.status_code == 201
    project = created.json()
    assert project["member_count"] == 56 and project["my_role"] == "owner"
    assert [l["name"] for l in project["lists"]] == ["Planning", "Development", "Testing"]

    past = client.post(
        "/api/projects", headers=H(client, "jon"),
        json={"name": "Past", "status": "active", "project_type": "work", "deadline": iso(future(-1))},
    )
    assert past.status_code == 422 and "deadline" in past.json()["errors"]
    missing = client.post("/api/projects", headers=H(client, "jon"), json={"name": "", "status": "active"})
    assert missing.status_code == 422 and {"name", "project_type", "deadline"} <= set(missing.json()["errors"])

    # UC-13 card customization.
    pid = project["id"]
    card = client.patch(f"/api/projects/{pid}/card-customization", headers=H(client, "jon"), json={"card_color": "#ff0000", "card_order": 0})
    assert card.status_code == 200 and card.json()["card_color"] == "#FF0000" and card.json()["card_order"] == 0
    assert client.get("/api/projects", headers=H(client, "jon")).json()[0]["id"] == pid
    assert client.patch(f"/api/projects/{pid}/card-customization", headers=H(client, "jon"), json={"card_color": "red"}).status_code == 422

    # SE-FR-18 progress per feature list, 0.01 % precision.
    lists = {l["name"]: l["id"] for l in project["lists"]}
    for i in range(3):
        new_task(client, pid, title=f"Dev {i}", list_id=lists["Development"], status="done" if i == 0 else "todo")
    progress = client.get(f"/api/projects/{pid}/progress", headers=H(client, "jon")).json()
    assert progress["overall_progress_pct"] == 33.33
    dev = next(f for f in progress["feature_progress"] if f["name"] == "Development")
    assert dev["total"] == 3 and dev["done"] == 1 and dev["progress_pct"] == 33.33

    # UC-14 calendar export.
    hostile = new_task(client, pid, title='=HYPERLINK("http://evil.example","click"), with; commas', due_date=iso(future(5)))
    new_task(client, pid, title="+cmd|' /C calc'!A0", due_date=iso(future(6)))
    new_task(client, pid, title="@SUM(1+1)", due_date=iso(future(7)))
    ics = client.post(f"/api/projects/{pid}/export/calendar", headers=H(client, "jon"), json={"target": "ical"})
    assert ics.status_code == 200 and ics.headers["content-type"].startswith("text/calendar")
    text = ics.text
    assert text.startswith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n") and text.endswith("END:VCALENDAR\r\n")
    assert text.count("BEGIN:VEVENT") == int(ics.headers["x-export-count"]) == 7  # project deadline + 6 task due dates (UC-18: every task has one)
    assert all(len(line.encode("utf-8")) <= 75 for line in text.split("\r\n"))
    assert "with\\; commas" in text.replace("\r\n ", "")

    declined = client.post(f"/api/projects/{pid}/export/calendar", headers=H(client, "jon"), json={"target": "google", "oauth_consent": False})
    assert declined.status_code == 400 and "provider_links" not in declined.json()
    google = client.post(f"/api/projects/{pid}/export/calendar", headers=H(client, "jon"), json={"target": "google", "oauth_consent": True}).json()
    assert google["message"] == "7 deadlines added" and google["count"] == 7
    assert all(link["url"].startswith("https://calendar.google.com/") for link in google["provider_links"])
    outlook = client.post(f"/api/projects/{pid}/export/calendar", headers=H(client, "jon"), json={"target": "outlook", "oauth_consent": True}).json()
    assert outlook["provider_links"][0]["url"].startswith("https://outlook.live.com/")
    nothing = client.post(
        f"/api/projects/{pid}/export/calendar", headers=H(client, "jon"),
        json={"target": "ical", "include_project_deadline": False, "include_task_due_dates": False, "include_soft_deadlines": False},
    )
    assert nothing.status_code == 400 and nothing.json()["detail"] == "Nothing to export"

    # UC-15 spreadsheet export with formula-injection sanitization and role filtering.
    client.put(f"/api/projects/{pid}/financials", headers=H(client, "jon"), json={"bid_amount": "10"})
    xlsx = client.post(f"/api/projects/{pid}/export/spreadsheet", headers=H(client, "jon"), json={"target": "excel"})
    assert xlsx.status_code == 200
    wb = load_workbook(io.BytesIO(xlsx.content))
    assert {"Tasks", "Bid & budget", "Stage costs", "Expenses"} <= set(wb.sheetnames)
    titles = [row[0].value for row in wb["Tasks"].iter_rows(min_row=2)]
    assert "'" + hostile["title"] in titles
    assert "'+cmd|' /C calc'!A0" in titles and "'@SUM(1+1)" in titles
    for row in wb["Tasks"].iter_rows(min_row=2):
        assert row[0].data_type == "s"  # stored as text, never as a formula

    member_sheets = client.post(f"/api/projects/{pid}/export/spreadsheet", headers=H(client, "bulk_user_00"),
                                json={"target": "sheets", "sections": ["tasks", "expenses", "financials"]})
    assert member_sheets.status_code == 200
    assert [s["title"] for s in member_sheets.json()["sheets"]] == ["Tasks"]  # financial sections dropped for members
    member_xlsx = client.post(f"/api/projects/{pid}/export/spreadsheet", headers=H(client, "bulk_user_00"), json={"target": "excel"})
    assert "Expenses" not in load_workbook(io.BytesIO(member_xlsx.content)).sheetnames
    empty = new_project(client, name="Empty export")
    assert client.post(f"/api/projects/{empty['id']}/export/spreadsheet", headers=H(client, "jon"),
                       json={"target": "excel", "sections": ["tasks"]}).json()["detail"] == "Nothing to export"
    assert sanitize_spreadsheet_cell("=1+1") == "'=1+1" and sanitize_spreadsheet_cell(-5) == -5
    assert sanitize_spreadsheet_cell("\tcmd") == "'\tcmd" and sanitize_spreadsheet_cell("\rcmd") == "'\rcmd"

    # Owner-only delete.
    assert client.delete(f"/api/projects/{empty['id']}", headers=H(client, "staff")).status_code == 403
    assert client.delete(f"/api/projects/{empty['id']}", headers=H(client, "jon")).status_code == 204


# ---------------------------------------------------------------------------
# 6. UC-16 / UC-17 dashboard (Myoram Langwang)
# ---------------------------------------------------------------------------
def test_uc16_uc17_widget_aabb_collision_se_fr21_to_se_fr25_se_nfr07_se_nfr08(client):
    rects = [(x, y, WIDGET_TYPES[t].width, WIDGET_TYPES[t].height) for t, x, y in DEFAULT_LAYOUT]
    assert not any(overlaps(a, b) for i, a in enumerate(rects) for b in rects[i + 1:])
    assert overlaps((0, 0, 4, 3), (3, 2, 4, 3)) and not overlaps((0, 0, 4, 3), (4, 0, 4, 3))  # touching edges is fine

    started = time.perf_counter()
    dash = client.get("/api/dashboard/widgets", headers=H(client, "myoram"))
    assert dash.status_code == 200 and time.perf_counter() - started < 3.0  # SE-NFR-08
    body = dash.json()
    widgets = {w["widget_type"]: w for w in body["widgets"]}
    assert set(widgets) == {t for t, _, _ in DEFAULT_LAYOUT}
    assert {"upcoming_deadlines", "task_progress", "project_progress", "time_summary", "budget_overview"} <= set(body["data"])
    tp = body["data"]["task_progress"]
    assert tp["total"] >= tp["done"] >= 0 and 0 <= tp["progress_pct"] <= 100

    target = widgets["project_progress"]
    moving = widgets["time_summary"]
    clash = client.put(f"/api/dashboard/widgets/{moving['id']}/position", headers=H(client, "myoram"),
                       json={"grid_x": target["grid_x"] + 1, "grid_y": target["grid_y"] + 1})
    assert clash.status_code == 409 and clash.json()["detail"] == "Widget overlaps with an existing widget"
    still = {w["widget_type"]: w for w in client.get("/api/dashboard/widgets", headers=H(client, "myoram")).json()["widgets"]}
    assert (still["time_summary"]["grid_x"], still["time_summary"]["grid_y"]) == (moving["grid_x"], moving["grid_y"])  # snapped back
    moved = client.put(f"/api/dashboard/widgets/{moving['id']}/position", headers=H(client, "myoram"), json={"grid_x": 0, "grid_y": 20})
    assert moved.status_code == 200 and (moved.json()["grid_x"], moved.json()["grid_y"]) == (0, 20)
    outside = client.put(f"/api/dashboard/widgets/{moving['id']}/position", headers=H(client, "myoram"), json={"grid_x": 10, "grid_y": 20})
    assert outside.status_code == 400

    assert client.post("/api/dashboard/widgets", headers=H(client, "myoram"), json={"widget_type": "crypto_ticker"}).json()["detail"] == "Widget unavailable"
    assert client.post("/api/dashboard/widgets", headers=H(client, "myoram"), json={"widget_type": "task_progress"}).json()["detail"] == "Invalid action"
    added = client.post("/api/dashboard/widgets", headers=H(client, "myoram"), json={"widget_type": "calendar_week"})
    assert added.status_code == 201 and "calendar_week" in added.json()["data"]
    placed = [w for w in added.json()["widgets"] if not w["is_hidden"]]
    assert not any(
        overlaps((a["grid_x"], a["grid_y"], a["width"], a["height"]), (b["grid_x"], b["grid_y"], b["width"], b["height"]))
        for i, a in enumerate(placed) for b in placed[i + 1:]
    )
    assert client.delete("/api/dashboard/widgets/00000000-0000-0000-0000-000000000000", headers=H(client, "myoram")).json()["detail"] == "Invalid action"
    hidden = client.patch(f"/api/dashboard/widgets/{widgets['task_progress']['id']}/hide", headers=H(client, "myoram")).json()
    assert next(w for w in hidden["widgets"] if w["widget_type"] == "task_progress")["is_hidden"] is True
    assert "task_progress" not in hidden["data"]
    # Another user's widget cannot be touched.
    assert client.put(f"/api/dashboard/widgets/{moving['id']}/position", headers=H(client, "staff"), json={"grid_x": 0, "grid_y": 30}).status_code == 400

    restored = client.post("/api/dashboard/widgets/restore-default", headers=H(client, "myoram")).json()
    layout = sorted((w["widget_type"], w["grid_x"], w["grid_y"], w["is_hidden"]) for w in restored["widgets"])
    assert layout == sorted((t, x, y, False) for t, x, y in DEFAULT_LAYOUT)

    # Role-filtered data: staff is a member on the seeded platform project, so its budget never appears.
    staff_budget = client.get("/api/dashboard/widgets", headers=H(client, "staff")).json()["data"]["budget_overview"]
    assert "ProjectForge Platform" not in [p["name"] for p in staff_budget["projects"]]
    jon_budget = client.get("/api/dashboard/widgets", headers=H(client, "jon")).json()["data"]["budget_overview"]
    assert "ProjectForge Platform" in [p["name"] for p in jon_budget["projects"]]


# ---------------------------------------------------------------------------
# 7. UC-18 / UC-20 / UC-21 tasks, roles, comments (Aashwat Singh)
# ---------------------------------------------------------------------------
def test_uc18_uc20_uc21_tasks_last_owner_and_mentions_se_fr26_to_se_fr30_se_nfr11_se_nfr12(client):
    project = new_project(client, members=["tyler", "staff", "aashwat"], name="Roles & mentions")
    pid = project["id"]
    assert set_role(client, pid, "jon", "tyler", "manager").status_code == 200

    # UC-18: Membership.canAssignTasks().
    due = iso(future(10))
    denied = client.post(f"/api/projects/{pid}/tasks", headers=H(client, "staff"), json={"title": "Sneaky", "due_date": due})
    assert denied.status_code == 403
    outsider = client.post(
        f"/api/projects/{pid}/tasks", headers=H(client, "tyler"), json={"title": "x", "due_date": due, "assignee_id": user_id("preethi")}
    )
    assert outsider.status_code == 400 and "member" in outsider.json()["detail"]
    # UC-18 "Validate required fields (title and due date)": each missing field is reported by name.
    for body in ({"title": "No due date"}, {"title": "Null due date", "due_date": None}):
        missing_due = client.post(f"/api/projects/{pid}/tasks", headers=H(client, "tyler"), json=body)
        assert missing_due.status_code == 422 and missing_due.json()["errors"] == {"due_date": "Due date is required"}
    missing_both = client.post(f"/api/projects/{pid}/tasks", headers=H(client, "tyler"), json={"title": "   "})
    assert missing_both.status_code == 422 and set(missing_both.json()["errors"]) == {"title", "due_date"}
    assert client.get(f"/api/projects/{pid}/tasks", headers=H(client, "tyler")).json() == []  # nothing was saved
    mine = new_task(client, pid, actor="tyler", title="Staff task", assignee_id=user_id("staff"))
    theirs = new_task(client, pid, actor="tyler", title="Aashwat task", assignee_id=user_id("aashwat"))
    assert mine["can_assign"] is True
    reassign = client.put(f"/api/tasks/{mine['id']}", headers=H(client, "staff"), json={"assignee_id": user_id("aashwat")})
    assert reassign.status_code == 403 and reassign.json()["detail"] == "Only owners and managers can assign tasks"
    own_update = client.put(f"/api/tasks/{mine['id']}", headers=H(client, "staff"), json={"status": "done", "tags": ["Frontend", "frontend", "ux"]})
    assert own_update.status_code == 200 and own_update.json()["status"] == "done" and own_update.json()["tags"] == ["frontend", "ux"]
    assert client.put(f"/api/tasks/{theirs['id']}", headers=H(client, "staff"), json={"status": "done"}).status_code == 403
    assert client.put(f"/api/tasks/{mine['id']}", headers=H(client, "staff"), json={"estimated_hours": 3}).status_code == 403
    assert client.put(f"/api/tasks/{theirs['id']}", headers=H(client, "tyler"), json={"assignee_id": user_id("staff")}).status_code == 200

    # Task.moveTo(list_id, position) for drag-and-drop.
    lists = {l["name"]: l["id"] for l in project["lists"]}
    a = new_task(client, pid, title="Col A")
    b = new_task(client, pid, title="Col B")
    moved = client.patch(f"/api/tasks/{b['id']}/move", headers=H(client, "jon"), json={"status": "todo", "position": 0, "list_id": lists["Testing"]})
    assert moved.status_code == 200
    column = [t["id"] for t in moved.json()]
    assert column.index(b["id"]) == 0 and column.index(a["id"]) > 0
    assert next(t for t in moved.json() if t["id"] == b["id"])["list_id"] == lists["Testing"]
    to_review = client.patch(f"/api/tasks/{a['id']}/move", headers=H(client, "jon"), json={"status": "review", "position": 5}).json()
    assert [t["id"] for t in to_review] == [a["id"]] and to_review[0]["status"] == "review"

    # UC-20 last-owner protection.
    last = set_role(client, pid, "jon", "jon", "manager")
    assert last.status_code == 400 and last.json()["detail"] == "Project must have at least one owner"
    assert set_role(client, pid, "tyler", "jon", "member").status_code == 400
    assert set_role(client, pid, "tyler", "staff", "owner").status_code == 403  # managers cannot grant ownership
    assert set_role(client, pid, "staff", "aashwat", "manager").status_code == 403  # members cannot change roles
    assert set_role(client, pid, "jon", "tyler", "owner").status_code == 200
    assert set_role(client, pid, "jon", "jon", "manager").status_code == 200  # now allowed: Tyler is still an owner
    assert set_role(client, pid, "tyler", "tyler", "member").json()["detail"] == "Project must have at least one owner"
    promoted = set_role(client, pid, "tyler", "staff", "manager")
    assert promoted.status_code == 200 and promoted.json()["role"] == "manager"
    # New role applies on the very next request.
    assert client.post(f"/api/projects/{pid}/tasks", headers=H(client, "staff"), json={"title": "Now allowed", "due_date": due}).status_code == 201
    notes = client.get("/api/notifications", headers=H(client, "staff")).json()["items"]
    assert any(n["kind"] == "role_change" and "manager" in n["message"] for n in notes)

    # UC-21 comments: XSS stripped, invalid mention warned, valid mention notified live.
    url = f"/api/tasks/{mine['id']}/comments"
    assert client.post(url, headers=H(client, "aashwat"), json={"body": "   \n "}).json()["detail"] == "Comment can't be empty"
    assert client.post(url, headers=H(client, "aashwat"), json={"body": "<script>alert(1)</script>"}).status_code == 400
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "auth", "token": token(client, "staff")})  # token inside the socket, never in the URL
        assert ws.receive_json()["type"] == "connected"
        sent_at = time.perf_counter()
        r = client.post(url, headers=H(client, "aashwat"), json={
            "body": "<script>alert('x')</script>Hi **team** <img src=x onerror=alert(1)>, see [docs](javascript:alert(1)) "
                    "@staff and @ghost_user\n\n- item one\n- `code`",
        })
        assert r.status_code == 201
        result = r.json()
        message = ws.receive_json()
        assert message["type"] == "notification" and message["data"]["kind"] == "mention"
        assert time.perf_counter() - sent_at < 2.0  # SE-NFR-12
    body = result["comment"]["body"]
    assert "<script" not in body and "onerror" not in body and "javascript:" not in body.lower()
    assert "**team**" in body and "- item one" in body and "`code`" in body and "@staff" in body
    assert "@ghost_user" not in body and "ghost_user" in body
    assert result["warnings"] == ["@ghost_user is not a project member and was not notified"]
    assert result["notified"] == ["staff"]
    listed = client.get(url, headers=H(client, "tyler")).json()
    assert listed[-1]["body"] == body
    assert client.get(url, headers=H(client, "preethi")).status_code == 403  # non-member


# ---------------------------------------------------------------------------
# Additional requirement coverage
# ---------------------------------------------------------------------------
def test_uc03_uc04_hours_and_timer_se_fr04(client):
    project = new_project(client, members=["staff", "aashwat"], name="Timer")
    pid = project["id"]
    task = new_task(client, pid, title="Timed", assignee_id=user_id("staff"))
    other = new_task(client, pid, title="Someone else's", assignee_id=user_id("aashwat"))
    url = f"/api/projects/{pid}/tasks/{task['id']}/hours"
    assert client.post(url, headers=H(client, "staff"), json={"estimated_hours": 5}).status_code == 403
    assert client.post(url, headers=H(client, "jon"), json={"estimated_hours": 5, "assigned_hours": 6}).json()["estimated_hours"] == 5.0
    logged = client.post(url, headers=H(client, "staff"), json={"actual_hours": "1.25", "note": "pairing"})
    assert logged.status_code == 200 and logged.json()["actual_hours"] == 1.25
    assert client.post(f"/api/projects/{pid}/tasks/{other['id']}/hours", headers=H(client, "staff"), json={"actual_hours": 1}).status_code == 403
    assert client.post(url, headers=H(client, "staff"), json={"actual_hours": 0}).status_code == 422

    start = client.post("/api/time-entries/timer/start", headers=H(client, "staff"), json={"task_id": task["id"]})
    assert start.status_code == 201 and start.json()["is_running"] is True
    assert client.post("/api/time-entries/timer/start", headers=H(client, "staff"), json={"task_id": task["id"]}).status_code == 409
    assert client.post("/api/time-entries/timer/start", headers=H(client, "staff"), json={"task_id": other["id"]}).status_code in (403, 409)
    paused = client.post("/api/time-entries/timer/pause", headers=H(client, "staff"), json={})
    assert paused.status_code == 200 and paused.json()["is_paused"] is True
    assert client.post("/api/time-entries/timer/pause", headers=H(client, "staff"), json={}).status_code == 400
    assert client.post("/api/time-entries/timer/resume", headers=H(client, "staff"), json={}).json()["is_paused"] is False
    stopped = client.post("/api/time-entries/timer/stop", headers=H(client, "staff"), json={})
    assert stopped.status_code == 200 and stopped.json()["is_running"] is False and stopped.json()["duration_hours"] is not None
    assert client.post("/api/time-entries/timer/stop", headers=H(client, "staff"), json={}).status_code == 404

    base = datetime(2026, 1, 1, 9, 0, 0)
    assert duration_hours(base, base + timedelta(hours=1, minutes=30), 600) == Decimal("1.33")
    assert duration_hours(base, base + timedelta(minutes=10), 900) == Decimal("0.00")
    own = client.get("/api/time-entries", headers=H(client, "staff"), params={"project_id": pid}).json()
    assert own and all(e["username"] == "staff" for e in own)


def test_uc19_member_removal_reassigns_open_tasks_se_fr30(client):
    project = new_project(client, members=["tyler", "staff"], name="Removal")
    pid = project["id"]
    assert set_role(client, pid, "jon", "tyler", "manager").status_code == 200
    open_a = new_task(client, pid, title="Open A", assignee_id=user_id("staff"))
    open_b = new_task(client, pid, title="Open B", assignee_id=user_id("staff"), status="in_progress")
    done = new_task(client, pid, title="Done", assignee_id=user_id("staff"), status="done")

    assert client.delete(f"/api/projects/{pid}/members/{user_id('tyler')}", headers=H(client, "staff")).status_code == 403
    bad = client.delete(f"/api/projects/{pid}/members/{user_id('staff')}", headers=H(client, "tyler"),
                        params={"reassign_to_user_id": user_id("preethi")})
    assert bad.status_code == 400
    r = client.delete(f"/api/projects/{pid}/members/{user_id('staff')}", headers=H(client, "tyler"),
                      params={"reassign_to_user_id": user_id("tyler")})
    assert r.status_code == 200 and r.json()["reassigned_task_count"] == 2
    tasks = {t["id"]: t for t in client.get(f"/api/projects/{pid}/tasks", headers=H(client, "jon")).json()}
    assert tasks[open_a["id"]]["assignee_id"] == user_id("tyler") and tasks[open_b["id"]]["assignee_id"] == user_id("tyler")
    assert tasks[done["id"]]["assignee_id"] == user_id("staff")  # finished work keeps its history
    assert client.get(f"/api/projects/{pid}", headers=H(client, "staff")).status_code == 403  # access revoked immediately

    invite = client.post(f"/api/projects/{pid}/members/invite", headers=H(client, "tyler"), json={"identifier": "staff@example.com"})
    assert invite.status_code == 201 and invite.json()["role"] == "member"
    assert client.post(f"/api/projects/{pid}/members/invite", headers=H(client, "tyler"), json={"identifier": "staff"}).status_code == 409
    assert client.post(f"/api/projects/{pid}/members/invite", headers=H(client, "tyler"), json={"identifier": "nobody_here"}).status_code == 404
    assert client.post(f"/api/projects/{pid}/members/invite", headers=H(client, "staff"), json={"identifier": "preethi"}).status_code == 403
    last = client.delete(f"/api/projects/{pid}/members/{user_id('jon')}", headers=H(client, "jon"))
    assert last.status_code == 400 and last.json()["detail"] == "Project must have at least one owner"


def test_uc22_notifications_and_deadline_reminders_se_fr29(client):
    project = new_project(client, members=["staff"], name="Reminders")
    pid = project["id"]
    task = new_task(client, pid, title="Due soon", assignee_id=user_id("staff"), due_date=iso(future(0.5)))
    first = client.get("/api/notifications", headers=H(client, "staff")).json()
    second = client.get("/api/notifications", headers=H(client, "staff")).json()
    reminders = [n for n in second["items"] if n["kind"] == "deadline_reminder" and n["task_id"] == task["id"]]
    assert len(reminders) == 1  # deduplicated
    assert any(n["kind"] == "assignment" and n["task_id"] == task["id"] for n in first["items"])
    before = second["unread_count"]
    read = client.patch(f"/api/notifications/{reminders[0]['id']}/read", headers=H(client, "staff"))
    assert read.status_code == 200 and read.json()["is_read"] is True
    assert client.get("/api/notifications", headers=H(client, "staff")).json()["unread_count"] == before - 1
    assert client.patch(f"/api/notifications/{reminders[0]['id']}/read", headers=H(client, "jon")).status_code == 404
    assert client.patch("/api/notifications/read-all", headers=H(client, "staff")).json()["unread_count"] == 0


def test_se_nfr04_retry_with_idempotency_key_never_duplicates(client):
    project = new_project(client, name="Idempotency")
    pid = project["id"]
    payload = {"category": "other", "description": "Retried save", "amount": "12.34", "expense_date": "2026-02-02"}
    headers = {**H(client, "jon"), "Idempotency-Key": "save-123"}
    first = client.post(f"/api/projects/{pid}/expenses", headers=headers, json=payload)
    retry = client.post(f"/api/projects/{pid}/expenses", headers=headers, json=payload)
    assert first.status_code == retry.status_code == 201
    assert retry.headers.get("idempotent-replayed") == "true" and retry.json()["id"] == first.json()["id"]
    with SessionLocal() as db:
        assert db.query(Expense).filter(Expense.project_id == pid).count() == 1
    assert idempotency_store.get("missing") is None


def test_se_fr12_to_se_fr15_profile_theme_color_blind_and_mode(client):
    h = H(client, "preethi")
    r = client.put("/api/settings/profile", headers=h, json={"theme": "dark", "color_blind_mode": "deuteranopia", "default_project_type": "school", "display_name": "Preethi S."})
    assert r.status_code == 200
    body = r.json()
    assert (body["theme"], body["color_blind_mode"], body["default_project_type"], body["display_name"]) == ("dark", "deuteranopia", "school", "Preethi S.")
    assert client.get("/api/settings/profile", headers=h).json()["theme"] == "dark"
    assert client.put("/api/settings/profile", headers=h, json={"theme": "neon"}).status_code == 422
    assert client.put("/api/settings/profile", headers=h, json={"username": "jon"}).json()["errors"]["username"] == "That username is already taken"
    assert client.put("/api/settings/profile", headers=h, json={"avatar_url": "javascript:alert(1)"}).status_code == 422
    assert "password_hash" not in body and "mfa_secret" not in body


def test_se_fr28_markdown_sanitizer_unit_cases():
    cases = {
        "<script>alert(1)</script>**bold**": "**bold**",
        "<iframe src='x'></iframe>*it*": "*it*",
        "<object data='x'></object><embed src='y'>ok": "ok",
        "<style>body{}</style>`code`": "`code`",
        '<a href="javascript:alert(1)" onclick="x()">link</a>': "link",
        "[x](javascript:alert(1))": "[x](#)",
        "[x](  JaVa\tScRiPt:alert(1))": "[x](#)",
        "[x](data:text/html;base64,PHNjcmlwdD4=)": "[x](#)",
        "[ok](https://example.com/a_(b))": "[ok](https://example.com/a_(b))",
        "[ref]: javascript:alert(1)": "[ref]: #",
        "a > b and @alice": "a > b and @alice",
        "&lt;script&gt;alert(1)&lt;/script&gt;safe": "safe",
    }
    for raw, expected in cases.items():
        assert sanitize_markdown(raw) == expected, raw
    assert "<" not in sanitize_markdown("<scr<script>ipt>alert(1)</script>")
    assert sanitize_markdown("Data: 5 rows") == "Data: 5 rows"


def test_se_nfr02_rbac_guard_unit_and_task_visibility(client):
    from fastapi import HTTPException

    platform = seeded_project(client)
    with SessionLocal() as db:
        assert require_project_role(db, user_id("jon"), platform["id"], {"owner"}).role == "owner"
        with pytest.raises(HTTPException) as exc:
            require_project_role(db, user_id("staff"), platform["id"], {"owner", "manager"})
        assert exc.value.status_code == 403 and exc.value.detail == "Access denied"
        outsider = make_user("outsider_x")
        with pytest.raises(HTTPException):
            require_project_role(db, outsider, platform["id"], {"owner", "manager", "member"})
    assert client.get(f"/api/projects/{platform['id']}/tasks", headers=H(client, "outsider_x")).status_code == 403
    assert client.get(f"/api/projects/{platform['id']}/tasks", headers=H(client, "staff")).status_code == 200
    assert client.get("/api/projects", headers={"Authorization": "Bearer not-a-token"}).status_code == 401


def test_se_nfr10_progress_broadcast_over_websocket_se_fr18(client):
    project = new_project(client, members=["staff"], name="Live progress")
    pid = project["id"]
    task = new_task(client, pid, title="Finish me", assignee_id=user_id("staff"))
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "auth", "token": token(client, "jon")})  # token inside the socket, never in the URL
        assert ws.receive_json()["type"] == "connected"
        started = time.perf_counter()
        assert client.put(f"/api/tasks/{task['id']}", headers=H(client, "staff"), json={"status": "done"}).status_code == 200
        events = [ws.receive_json(), ws.receive_json()]
        elapsed = time.perf_counter() - started
    progress = next(e for e in events if e["type"] == "progress")
    assert progress["data"]["project_id"] == pid and progress["data"]["overall_progress_pct"] == 100.0
    assert elapsed < 2.0
    with SessionLocal() as db:
        assert db.get(Task, task["id"]).completed_at is not None


def test_se_nfr06_https_transport_and_bearer_only_sessions_se_fr11(client):
    """SE-NFR-06: HSTS + CSP when HTTPS is enforced; credentials never travel in cookies or URLs."""
    secure = transport_security_headers(True, html=True)
    assert secure["Strict-Transport-Security"] == HSTS_VALUE
    assert "default-src 'self'" in secure["Content-Security-Policy"] and "frame-ancestors 'none'" in secure["Content-Security-Policy"]
    assert "Strict-Transport-Security" not in transport_security_headers(False)  # demo mode runs on plain http://localhost
    auth_rate_limiter.reset()
    r = client.post("/api/auth/login", json={"email": "jon@example.com", "password": DEMO_PASSWORD})
    assert r.status_code == 200 and "set-cookie" not in {k.lower() for k in r.headers}
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY"
    token_value = r.json()["access_token"]
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_value}"}).status_code == 200
    assert client.get("/api/auth/me", params={"token": token_value}).status_code == 401  # never accepted from the URL
    # The FastAPI config turns HTTPS enforcement on automatically once demo mode is off.
    from app.core import config as cfg

    os.environ["DEMO_MODE"] = "false"
    cfg.get_settings.cache_clear()
    try:
        assert cfg.get_settings().force_https is True
    finally:
        os.environ["DEMO_MODE"] = "true"
        cfg.get_settings.cache_clear()


def test_se_fr29_notification_preferences_and_connected_accounts_uc22_uc14(client):
    """profile.html: the notification switches and export connections persist and are enforced on the server."""
    project = new_project(client, members=["staff", "aashwat"], name="Preferences")
    pid = project["id"]
    put = lambda who, body: client.put("/api/settings/profile", headers=H(client, who), json=body)  # noqa: E731
    kinds = lambda who: [  # noqa: E731
        n["kind"] for n in client.get("/api/notifications", headers=H(client, who)).json()["items"] if n["project_id"] == pid
    ]

    me = client.get("/api/auth/me", headers=H(client, "staff")).json()
    assert me["notification_prefs"] == {"task_assignments": True, "mentions": True, "deadline_reminders": True, "project_updates": False}
    assert all(me["connected_accounts"][p] == {"connected": False, "connected_at": None} for p in ("google_calendar", "outlook", "google_sheets"))

    # Defaults: assignment is delivered, a status change by someone else ("project update") is not.
    first = new_task(client, pid, title="First", assignee_id=user_id("staff"))
    assert client.put(f"/api/tasks/{first['id']}", headers=H(client, "jon"), json={"status": "in_progress"}).status_code == 200
    assert kinds("staff").count("assignment") == 1 and "project_update" not in kinds("staff")

    # A partial update flips only the named switches and survives a fresh read (it is stored, not UI state).
    saved = put("staff", {"notification_prefs": {"task_assignments": False, "mentions": False, "project_updates": True}})
    assert saved.status_code == 200
    expected = {"task_assignments": False, "mentions": False, "deadline_reminders": True, "project_updates": True}
    assert saved.json()["notification_prefs"] == expected
    assert client.get("/api/settings/profile", headers=H(client, "staff")).json()["notification_prefs"] == expected

    second = new_task(client, pid, title="Second", assignee_id=user_id("staff"))
    assert kinds("staff").count("assignment") == 1  # muted: no second assignment notification
    comment = client.post(f"/api/tasks/{second['id']}/comments", headers=H(client, "jon"), json={"body": "ping @staff and @aashwat"})
    assert comment.status_code == 201 and comment.json()["notified"] == ["aashwat"]  # staff muted mentions
    assert "mention" not in kinds("staff") and "mention" in kinds("aashwat")
    moved = client.patch(f"/api/tasks/{second['id']}/move", headers=H(client, "jon"), json={"status": "done", "position": 0})
    assert moved.status_code == 200
    updates = [n for n in client.get("/api/notifications", headers=H(client, "staff")).json()["items"] if n["kind"] == "project_update"]
    assert len(updates) == 1 and "completed" in updates[0]["message"] and updates[0]["task_id"] == second["id"]
    # Nobody is notified about their own action.
    assert client.put(f"/api/tasks/{first['id']}", headers=H(client, "staff"), json={"status": "review"}).status_code == 200
    assert len([k for k in kinds("staff") if k == "project_update"]) == 1
    # UC-20 role changes are always delivered, whatever the switches say.
    assert set_role(client, pid, "jon", "staff", "manager").status_code == 200
    assert "role_change" in kinds("staff")

    # Deadline reminders switch (UC-22).
    soon = new_task(client, pid, title="Due tomorrow", assignee_id=user_id("aashwat"), due_date=iso(future(0.5)))
    assert put("aashwat", {"notification_prefs": {"deadline_reminders": False}}).status_code == 200
    assert "deadline_reminder" not in kinds("aashwat")
    assert put("aashwat", {"notification_prefs": {"deadline_reminders": True}}).status_code == 200
    reminders = [n for n in client.get("/api/notifications", headers=H(client, "aashwat")).json()["items"] if n["kind"] == "deadline_reminder"]
    assert any(n["task_id"] == soon["id"] for n in reminders)

    # Connected accounts: connect two, disconnect one; the third is untouched.
    connected = put("staff", {"connected_accounts": {"google_calendar": True, "google_sheets": True}}).json()["connected_accounts"]
    assert connected["google_calendar"]["connected"] is True and connected["google_calendar"]["connected_at"]
    assert connected["google_sheets"]["connected"] is True and connected["outlook"] == {"connected": False, "connected_at": None}
    after = put("staff", {"connected_accounts": {"google_sheets": False}}).json()["connected_accounts"]
    assert after["google_sheets"] == {"connected": False, "connected_at": None}
    assert after["google_calendar"] == connected["google_calendar"]  # unchanged, including its timestamp
    # Each user only ever edits their own row; unknown switches and non-boolean values are rejected.
    assert client.get("/api/auth/me", headers=H(client, "jon")).json()["connected_accounts"]["google_calendar"]["connected"] is False
    assert put("staff", {"notification_prefs": {"sms": True}}).status_code == 422
    assert put("staff", {"connected_accounts": {"dropbox": True}}).status_code == 422
    assert put("staff", {"notification_prefs": {"mentions": "sometimes"}}).status_code == 422

    # Restore the shared demo accounts for any later test.
    restore = {"task_assignments": True, "mentions": True, "deadline_reminders": True, "project_updates": False}
    assert put("staff", {"notification_prefs": restore, "connected_accounts": {"google_calendar": False}}).status_code == 200
    assert set_role(client, pid, "jon", "staff", "member").status_code == 200
