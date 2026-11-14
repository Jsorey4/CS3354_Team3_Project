"""
@author: eLeet Coderz (Team 3) - security review; rules owned by Aashwat Singh (roles) and Tyler Gaines (accounts)
@description: Red-team tests for the database itself. They apply supabase/migrations and supabase/seed.sql
    to a throw-away PostgreSQL database and then act as a Supabase client (the "authenticated" role with
    a user id in the JWT), bypassing the Python API completely, to prove the Row-Level Security policies
    and triggers hold on their own: no cross-project reads or writes, no self-promotion to owner, no
    project without an owner (even when two requests race), no access to credential columns, strict
    JSON preference columns and a single running timer per person.
    Skipped unless SUPABASE_TEST_DB_URL points at a PostgreSQL server where a database may be created,
    for example: SUPABASE_TEST_DB_URL=postgresql://postgres@127.0.0.1:5432/postgres python -m pytest
@traces: SE-FR-04, SE-FR-11, SE-FR-29, SE-FR-30, SE-NFR-02, SE-NFR-06, SE-NFR-11, UC-04, UC-13, UC-18, UC-19, UC-20, UC-21
"""

from __future__ import annotations

import os
import threading
import uuid
from contextlib import contextmanager
from pathlib import Path

import pytest

ADMIN_URL = os.environ.get("SUPABASE_TEST_DB_URL", "").strip()
pytestmark = pytest.mark.skipif(not ADMIN_URL.startswith("postgres"), reason="SUPABASE_TEST_DB_URL is not set")

SUPABASE_DIR = Path(__file__).resolve().parents[2] / "supabase"
MIGRATIONS = sorted((SUPABASE_DIR / "migrations").glob("*.sql"))

JON = "00000000-0000-4000-8000-000000000001"  # owner of Platform, manager of Semester
TYLER = "00000000-0000-4000-8000-000000000002"  # manager of Platform, owner of Semester
STAFF = "00000000-0000-4000-8000-000000000003"  # member of both
PREETHI = "00000000-0000-4000-8000-000000000004"  # member of Platform only
PLATFORM = "10000000-0000-4000-8000-000000000001"
SEMESTER = "10000000-0000-4000-8000-000000000002"


def _url_for(database: str) -> str:
    base, _, _ = ADMIN_URL.rpartition("/")
    return f"{base}/{database}"


@pytest.fixture(scope="module")
def db_url():
    import psycopg

    name = f"pf_rls_{uuid.uuid4().hex[:10]}"
    with psycopg.connect(ADMIN_URL, autocommit=True) as admin:
        admin.execute(f'create database "{name}"')
        for role in ("anon", "authenticated"):
            if not admin.execute("select 1 from pg_roles where rolname = %s", (role,)).fetchone():
                admin.execute(f"create role {role} nologin")
    url = _url_for(name)
    try:
        with psycopg.connect(url, autocommit=True) as conn:
            # What a Supabase project provides: auth.uid() reads the user id from the request's JWT, and
            # client roles get table privileges by default (RLS is what restricts them).
            conn.execute("create schema if not exists auth")
            conn.execute(
                "create or replace function auth.uid() returns uuid language sql stable as "
                "$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$"
            )
            conn.execute("grant usage on schema auth, public to anon, authenticated")
            conn.execute("alter default privileges in schema public grant all on tables to anon, authenticated")
            for path in MIGRATIONS:
                conn.execute(path.read_text(encoding="utf-8"))
            conn.execute((SUPABASE_DIR / "seed.sql").read_text(encoding="utf-8"))
            for path in MIGRATIONS:  # every migration is idempotent
                conn.execute(path.read_text(encoding="utf-8"))
        yield url
    finally:
        with psycopg.connect(ADMIN_URL, autocommit=True) as admin:
            admin.execute(f'drop database if exists "{name}" with (force)')


@contextmanager
def as_user(db_url: str, user_id: str | None):
    """A connection acting as a signed-in Supabase client. Everything is rolled back afterwards."""
    import psycopg

    with psycopg.connect(db_url) as conn:
        conn.execute("set role authenticated")
        if user_id:
            conn.execute("select set_config('request.jwt.claim.sub', %s, false)", (user_id,))
        try:
            yield conn
        finally:
            conn.rollback()


@contextmanager
def as_server(db_url: str):
    """A connection like the Python API's (owner role, RLS bypassed, triggers still apply)."""
    import psycopg

    with psycopg.connect(db_url) as conn:
        try:
            yield conn
        finally:
            conn.rollback()


def refused(conn, sql: str, params: tuple = (), match: str = "") -> str:
    """Runs a statement that must be rejected by the database and returns the error text."""
    import psycopg

    with pytest.raises(psycopg.Error) as raised:
        with conn.transaction():
            conn.execute(sql, params)
    message = str(raised.value)
    assert match.lower() in message.lower(), message
    return message


def scalar(conn, sql: str, params: tuple = ()):
    return conn.execute(sql, params).fetchone()[0]


def test_se_nfr11_rls_cross_project_reads_and_identity_spoofing(db_url):
    with as_user(db_url, PREETHI) as conn:  # member of Platform only
        assert scalar(conn, "select count(*) from projects") == 1
        assert scalar(conn, "select count(*) from tasks where project_id = %s", (SEMESTER,)) == 0
        assert scalar(conn, "select count(*) from tasks where project_id = %s", (PLATFORM,)) > 0
        assert scalar(conn, "select count(*) from comments where project_id = %s", (SEMESTER,)) == 0
        # SE-NFR-02 / UC-01: members never see a financial row, even in their own project.
        for table in ("expenses", "stage_costs", "project_financials"):
            assert scalar(conn, f"select count(*) from {table}") == 0
    with as_user(db_url, None) as conn:  # no JWT: nobody
        assert scalar(conn, "select count(*) from projects") == 0
        # A client role cannot impersonate someone through the server-side convenience setting.
        conn.execute("select set_config('app.current_user_id', %s, false)", (JON,))
        assert scalar(conn, "select count(*) from projects") == 0
        assert scalar(conn, "select count(*) from expenses") == 0
        assert scalar(conn, "select public.app_project_role(%s)", (PLATFORM,)) is None


def test_se_nfr11_child_rows_cannot_be_attached_to_another_projects_task(db_url):
    with as_server(db_url) as server:
        foreign_task = scalar(server, "select id from tasks where project_id = %s limit 1", (SEMESTER,))
        own_task = scalar(server, "select id from tasks where project_id = %s limit 1", (PLATFORM,))
    with as_user(db_url, PREETHI) as conn:
        # Claims her own project but points at another project's task: the project id is re-derived from
        # the task, so the row belongs to Semester and the membership check fails.
        refused(
            conn,
            "insert into comments (task_id, project_id, author_id, body) values (%s, %s, %s, 'injected')",
            (foreign_task, PLATFORM, PREETHI),
            "row-level security",
        )
        refused(
            conn,
            "insert into time_entries (task_id, project_id, user_id, started_at) values (%s, %s, %s, now())",
            (foreign_task, PLATFORM, PREETHI),
            "row-level security",
        )
        refused(
            conn,
            "insert into soft_deadlines (task_id, project_id, title, due_at) values (%s, %s, 'x', now())",
            (foreign_task, PLATFORM),
            "",
        )
        # The same statement on a task of her own project is fine.
        conn.execute(
            "insert into comments (task_id, project_id, author_id, body) values (%s, %s, %s, 'hello')",
            (own_task, SEMESTER, PREETHI),  # wrong project id is corrected, not trusted
        )
        assert scalar(conn, "select project_id::text from comments where body = 'hello'") == PLATFORM
    with as_server(db_url) as server:  # the server path gets the same correction
        server.execute(
            "insert into time_entries (task_id, project_id, user_id, started_at, ended_at) values (%s, %s, %s, now(), now())",
            (own_task, SEMESTER, STAFF),
        )
        assert scalar(server, "select project_id::text from time_entries where task_id = %s and user_id = %s order by created_at desc limit 1", (own_task, STAFF)) == PLATFORM
        refused(server, "update tasks set project_id = %s where id = %s", (SEMESTER, own_task), "another project")
        refused(server, "update tasks set assignee_id = %s where project_id = %s", (PREETHI, SEMESTER), "member of this project")


def test_uc20_role_escalation_and_last_owner_are_blocked_in_the_database(db_url):
    role_of = "select role from project_members where project_id = %s and user_id = %s"
    with as_user(db_url, TYLER) as conn:  # manager of Platform
        refused(conn, "update project_members set role = 'owner' where project_id = %s and user_id = %s", (PLATFORM, TYLER), "only an owner")
        refused(conn, "update project_members set role = 'member' where project_id = %s and user_id = %s", (PLATFORM, JON), "only an owner")
        refused(conn, "delete from project_members where project_id = %s and user_id = %s", (PLATFORM, JON), "only an owner")
        refused(conn, "insert into project_members (project_id, user_id, role) select %s, id, 'owner' from user_profiles where username = 'tyler'", (PLATFORM,), "")
        conn.execute("update project_members set role = 'manager' where project_id = %s and user_id = %s", (PLATFORM, STAFF))
        assert scalar(conn, role_of, (PLATFORM, STAFF)) == "manager"  # managers may promote a member
    with as_user(db_url, STAFF) as conn:  # plain member
        refused(conn, "update project_members set role = 'manager' where project_id = %s and user_id = %s", (PLATFORM, STAFF), "access denied")
        refused(conn, "update project_members set project_id = %s where project_id = %s and user_id = %s", (SEMESTER, PLATFORM, STAFF), "")
        assert conn.execute("update project_members set role = 'member' where project_id = %s and user_id = %s", (PLATFORM, PREETHI)).rowcount == 0
        # UC-13: their own card colour and order are theirs to change.
        conn.execute("update project_members set card_color = '#112233', card_order = 4 where project_id = %s and user_id = %s", (PLATFORM, STAFF))
        assert scalar(conn, "select card_color from project_members where project_id = %s and user_id = %s", (PLATFORM, STAFF)) == "#112233"
    for actor in (as_user(db_url, JON), as_server(db_url)):  # the only owner: client and server paths
        with actor as conn:
            refused(conn, "update project_members set role = 'manager' where project_id = %s and user_id = %s", (PLATFORM, JON), "at least one owner")
            refused(conn, "delete from project_members where project_id = %s and user_id = %s", (PLATFORM, JON), "at least one owner")
    with as_server(db_url) as server:  # deleting the project itself still cascades cleanly
        server.execute("delete from projects where id = %s", (SEMESTER,))
        assert scalar(server, "select count(*) from project_members where project_id = %s", (SEMESTER,)) == 0


def test_uc20_two_owners_demoting_each_other_at_once_leaves_one_owner(db_url):
    """TOCTOU: both requests see "2 owners" unless the check and the write are serialised."""
    import psycopg

    with psycopg.connect(db_url, autocommit=True) as setup:
        setup.execute("update project_members set role = 'owner' where project_id = %s and user_id = %s", (PLATFORM, TYLER))
    demote = "update project_members set role = 'manager' where project_id = %s and user_id = %s"
    outcome: dict[str, str] = {}
    first = psycopg.connect(db_url)
    second = psycopg.connect(db_url)
    try:
        first.execute(demote, (PLATFORM, JON))  # holds the project lock, not yet committed

        def run_second() -> None:
            try:
                second.execute(demote, (PLATFORM, TYLER))  # waits for the lock
                second.commit()
                outcome["second"] = "committed"
            except psycopg.Error as exc:
                second.rollback()
                outcome["second"] = str(exc)

        worker = threading.Thread(target=run_second)
        worker.start()
        worker.join(timeout=1.0)
        assert worker.is_alive(), "the second change must wait for the first one"
        first.commit()
        worker.join(timeout=10)
        assert "at least one owner" in outcome["second"]
    finally:
        first.close()
        second.close()
    with psycopg.connect(db_url, autocommit=True) as check:
        owners = [r[0] for r in check.execute("select user_id::text from project_members where project_id = %s and role = 'owner'", (PLATFORM,))]
        assert owners == [TYLER]
        check.execute("update project_members set role = 'owner' where project_id = %s and user_id = %s", (PLATFORM, JON))
        check.execute(demote, (PLATFORM, TYLER))


def test_uc18_members_cannot_reassign_or_change_hours_directly(db_url):
    with as_server(db_url) as server:
        task = scalar(server, "select id from tasks where project_id = %s and assignee_id = %s limit 1", (PLATFORM, STAFF))
        other = scalar(server, "select id from tasks where project_id = %s and assignee_id is distinct from %s limit 1", (PLATFORM, STAFF))
    with as_user(db_url, STAFF) as conn:
        conn.execute("update tasks set status = 'review', title = 'Renamed by assignee' where id = %s", (task,))
        assert scalar(conn, "select status from tasks where id = %s", (task,)) == "review"
        refused(conn, "update tasks set estimated_hours = 99 where id = %s", (task,), "only owners and managers")
        refused(conn, "update tasks set assigned_hours = 1 where id = %s", (task,), "only owners and managers")
        refused(conn, "update tasks set assignee_id = %s where id = %s", (PREETHI, task), "")
        assert conn.execute("update tasks set title = 'not mine' where id = %s", (other,)).rowcount == 0
        refused(conn, "insert into tasks (project_id, title, due_date) values (%s, 'sneaky', now())", (PLATFORM,), "row-level security")
        assert conn.execute("delete from tasks where id = %s", (task,)).rowcount == 0


def test_se_fr11_credentials_and_lockout_columns_are_out_of_reach(db_url):
    with as_user(db_url, STAFF) as conn:
        assert scalar(conn, "select username from user_profiles") == "staff"  # own row only
        for column in ("password_hash", "mfa_secret", "unlock_token_jti", "reset_token_jti", "failed_login_attempts", "locked_until"):
            refused(conn, f"select {column} from user_profiles", (), "permission denied")
        refused(conn, "select * from user_profiles", (), "permission denied")
        for assignment in ("password_hash = 'x'", "failed_login_attempts = 0", "locked_until = null", "mfa_enabled = false", "mfa_secret = null", "email = 'a@b.co'"):
            refused(conn, f"update user_profiles set {assignment} where id = %s", (STAFF,), "permission denied")
        refused(conn, "delete from user_profiles where id = %s", (STAFF,), "permission denied")
        refused(conn, "insert into user_profiles (username, email) values ('ghost', 'ghost@example.com')", (), "permission denied")
        conn.execute("update user_profiles set display_name = 'Staffer', theme = 'light' where id = %s", (STAFF,))
        assert conn.execute("update user_profiles set display_name = 'hacked' where id = %s", (JON,)).rowcount == 0
    with as_user(db_url, None) as anon:
        import psycopg

        anon.execute("set role anon")
        with pytest.raises(psycopg.Error):
            anon.execute("select username from user_profiles")


def test_se_fr29_json_preference_columns_accept_only_known_boolean_keys(db_url):
    update_prefs = "update user_profiles set notification_prefs = %s::jsonb where id = %s"
    update_accounts = "update user_profiles set connected_accounts = %s::jsonb where id = %s"
    with as_user(db_url, STAFF) as conn:
        conn.execute(update_prefs, ('{"mentions": false, "project_updates": true}', STAFF))
        conn.execute(update_accounts, ('{"outlook": {"connected": true, "connected_at": "2026-11-14T10:00:00"}}', STAFF))
        for bad in (
            '{"__proto__": {"polluted": true}}',
            '{"mentions": "yes"}',
            '{"mentions": 1}',
            '{"mentions": {"nested": true}}',
            '{"sms": true}',
            '[true]',
            '"text"',
            '{"mentions": true, "blob": "' + "A" * 5000 + '"}',
        ):
            refused(conn, update_prefs, (bad, STAFF), "ck_user_profiles_notification_prefs_shape")
        for bad in (
            '{"dropbox": {"connected": true}}',
            '{"outlook": true}',
            '{"outlook": {"connected": "true"}}',
            '{"outlook": {"connected": true, "access_token": "secret"}}',
            '{"outlook": {"connected": true, "connected_at": "' + "9" * 500 + '"}}',
            '{"constructor": {"prototype": {}}}',
        ):
            refused(conn, update_accounts, (bad, STAFF), "ck_user_profiles_connected_accounts_shape")


def test_uc04_one_running_timer_and_no_negative_durations(db_url):
    with as_server(db_url) as server:
        task = scalar(server, "select id from tasks where project_id = %s and assignee_id = %s limit 1", (PLATFORM, STAFF))
        server.execute("update time_entries set ended_at = greatest(started_at, now()) where user_id = %s and ended_at is null", (STAFF,))
        server.execute("insert into time_entries (task_id, project_id, user_id, started_at) values (%s, %s, %s, now())", (task, PLATFORM, STAFF))
        refused(
            server,
            "insert into time_entries (task_id, project_id, user_id, started_at) values (%s, %s, %s, now())",
            (task, PLATFORM, STAFF),
            "uq_time_entries_one_running_per_user",
        )
        refused(
            server,
            "insert into time_entries (task_id, project_id, user_id, started_at, ended_at) values (%s, %s, %s, now(), now() - interval '1 hour')",
            (task, PLATFORM, JON),
            "ck_time_entries_end_after_start",
        )
        refused(server, "update time_entries set duration_hours = -1 where user_id = %s", (STAFF,), "")
    with as_user(db_url, STAFF) as conn:  # nobody can log time as someone else
        refused(
            conn,
            "insert into time_entries (task_id, project_id, user_id, started_at, ended_at) values (%s, %s, %s, now(), now())",
            (task, PLATFORM, JON),
            "row-level security",
        )


def test_phase2_required_indexes_exist(db_url):
    with as_server(db_url) as server:
        defs = {name: definition for name, definition in server.execute("select indexname, indexdef from pg_indexes where schemaname = 'public'")}
    expected = {
        "uq_project_members_project_user": "(project_id, user_id)",
        "ix_project_members_user": "(user_id)",
        "ix_tasks_project_list_position": "(project_id, list_id, \"position\")",
        "ix_tasks_assignee_status_due": "(assignee_id, status, due_date)",
        "ix_soft_deadlines_task_due": "(task_id, due_at)",
        "ix_expenses_project_date_category": "(project_id, expense_date, category)",
        "ix_time_entries_project_user_started": "(project_id, user_id, started_at)",
        "ix_notifications_user_read_created": "(user_id, is_read, created_at DESC)",
        "ix_notifications_user_created": "(user_id, created_at DESC)",
        "uq_time_entries_one_running_per_user": "(user_id) WHERE (ended_at IS NULL)",
    }
    for name, columns in expected.items():
        assert name in defs, name
        assert columns in defs[name], defs[name]
