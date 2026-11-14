# ADR 001: FastAPI backend on top of the Supabase PostgreSQL schema

- **Status:** Proposed. Needs team sign-off (the team README's working rule is "Supabase only").
- **Owner:** Aashwat Singh (integration). Affects every area.
- **Traces:** SE-NFR-02, SE-NFR-06, SE-NFR-11; team README "Backend technology" open decision.

## Context

The team README says the backend is Supabase only (Auth, PostgREST, Realtime, Edge Functions) and that no second backend should be added. The full-stack MVP on this branch was built with a FastAPI backend, as its brief asked, so the two disagree. This record states how the two fit together and what the team has to decide.

## Decision

Keep **one database design** and let it be reached two ways:

1. **PostgreSQL is the source of truth.** `supabase/migrations/` creates every table, constraint, index, trigger and Row-Level Security (RLS) policy. The SQLAlchemy models in `backend/app/models/entities.py` describe the same tables and are only used to create them for local SQLite demos and tests.
2. **FastAPI is the application server.** It connects with a server role (which bypasses RLS) and enforces the permission matrix itself in `backend/app/core/permissions.py` before every read or write. It also owns what Supabase would otherwise provide: sign-in and tokens (`core/security.py`), live updates over one WebSocket (`core/realtime.py`), exports and the deadline reminders.
3. **RLS and triggers are a second, independent lock.** Anyone who reaches the database directly (a Supabase client, PostgREST, a future Edge Function) is held to the same rules by the database: project-scoped reads, owner / manager writes, no self-promotion to owner, never zero owners, child rows always in their task's project, credential columns unreadable.

| Concern | FastAPI path (used by the web app today) | Direct Supabase path |
| --- | --- | --- |
| Who is the caller | Signed HS256 token in `Authorization: Bearer` | `auth.uid()` from the Supabase JWT |
| Permission check | `require_project_role()` | `app_project_role()` in RLS policies + guard triggers |
| Passwords, lockout, 2FA | `routers/auth.py` | Supabase Auth (the `user_profiles` credential columns are then unused) |
| Live updates | WebSocket hub, recipients computed from current members | Supabase Realtime (obeys RLS) |

## How it is verified

- `backend/tests/test_all_requirements.py` and `test_security_audit.py` run the API on SQLite and on PostgreSQL 16, including against a schema built **from the migrations** (triggers active).
- `backend/tests/test_supabase_rls.py` skips the API entirely and attacks the database as the `authenticated` role.

## Consequences

- Schema changes go in a **new** migration file and in `entities.py`; both test suites must pass.
- The rules exist twice (Python and SQL). `002-rbac-permission-matrix.md` is the single description both must match.
- Local SQLite has no RLS; only the Python checks apply there. Production must use PostgreSQL.
- Comments and descriptions are cleaned by the API before storage. The database cannot do that for direct writers, so every client must render them as text or with a renderer that never outputs raw HTML (the web app's `SafeMarkdown` does).

## Options for the team

| Option | Effort | Result |
| --- | --- | --- |
| A. Keep FastAPI (this ADR) | None | Two places to keep in step; works today, tested on both databases |
| B. Move to Supabase only | Rewrite each router as Edge Functions / PostgREST calls, move auth to Supabase Auth | Matches the team README; the migrations, RLS and React UI carry over unchanged |

**Recommendation:** A for the course demo, because it is complete and tested. The schema and RLS were written so that B stays possible without redesign.
