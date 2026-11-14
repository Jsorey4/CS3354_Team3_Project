# ProjectForge

CS 3354.001 · Team 3 · **eLeet Coderz**: Jon Sorey, Tyler Gaines, Preethi Seereddy, Saaqib Shaik, Myoram Langwang, Aashwat Singh

A project management web app with Python FastAPI on the backend, React + TypeScript + Tailwind (Vite) on the frontend, and PostgreSQL / Supabase for storage. When no database is configured, it falls back to SQLite automatically, so the demo needs no setup.

## Quick start (zero config)

Requirements: Python 3.11+ and Node 18+.

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

```bash
cd web
npm install
npm run dev          # http://localhost:5173 (proxies /api and /ws to :8000)
```

On first start the backend creates `backend/projectforge.db` and seeds the demo team. To run everything as one process, run `npm run build` in `web/`. `uvicorn app.main:app` then serves the built site at http://localhost:8000.

### Demo accounts

All demo accounts use the password `ProjectForge!1`.

| Username | Role on "ProjectForge Platform" | Notes |
|---|---|---|
| `jon` | Owner | |
| `tyler` | Manager | 2FA on. Demo code `123456` |
| `staff` | Member | Owner of "Personal Portfolio Site" |
| `preethi`, `saaqib`, `myoram`, `aashwat` | Member | |

When demo mode is on, the sidebar footer has a **Quick Demo Role Switcher** (Jon · Owner / Tyler · Manager / Staff · Member). The reset-password page also has a **demo inbox** that shows the reset and unlock emails the server would send.

### Suggested live demo

1. Log in as `tyler` to show the password step, then the 2FA step (code `123456`).
2. Switch to **Jon · Owner**, open **Cost**, and show the separate Bid, Budget, Stage costs, and Expenses figures. Untick a stage to show **Total** change to **Subtotal**. (UC-01)
3. Switch to **Staff · Member** and open **Cost** again to show the server's 403 "Access denied" with no figures. Open **Charts** to show "Only your hours". (UC-01, UC-02)
4. On **Tasks** as Staff, show that there is no "New task" button and that other people's cards are locked. Switch to Tyler to create and assign a task. (UC-18)
5. Open a task and post `**hi** <script>alert(1)</script> @staff @nobody`. The script is stripped, a warning appears for `@nobody`, and Staff gets a live toast. (UC-21, UC-22)
6. On **Home** (dashboard), choose **Customize** and drag a widget onto another one. A red outline shows the overlap and the widget snaps back. Then use **Restore default**. (UC-16, UC-17)
7. On **People**, try to demote the only owner. You get "Project must have at least one owner". (UC-20)

## Configuration

Copy `backend/.env.example` to `backend/.env`. With nothing set you get SQLite in demo mode. For Supabase:

1. In the Supabase SQL editor, run `supabase/migrations/0001_initial_schema.sql`. It creates the tables, indexes, the soft-deadline trigger, and the RLS policies. You can then optionally run `supabase/seed.sql`.
2. Set `DATABASE_URL` to the Supabase connection string, then set `JWT_SECRET` (32+ characters), `DEMO_MODE=false` and `ENVIRONMENT=production` for a real deployment. With demo mode off, `FORCE_HTTPS` defaults to on: plain-HTTP requests are redirected to HTTPS and every response carries HSTS (SE-NFR-06). Behind a TLS-terminating proxy, start uvicorn with `--proxy-headers`.

If Postgres is unreachable and `DB_FALLBACK_TO_SQLITE=true`, the backend logs a warning and falls back to SQLite.

## Tests

```bash
cd backend && python -m pytest                     # 17 tests, UC-01..UC-22 and SE-NFR-01..12
TEST_DATABASE_URL=postgresql://user@host/db python -m pytest   # same suite on PostgreSQL
cd web && npm test                                 # 35 Vitest unit tests
cd web && npm run build                            # type-check + production build
```

Every test name carries the requirement IDs it verifies, for example `test_uc01_cost_access_and_subtotal_math_se_fr01_se_fr02_se_fr03_se_nfr01_se_nfr02`.

## RBAC matrix (enforced server-side in `backend/app/core/permissions.py`)

| Action | Owner | Manager | Member |
|---|:-:|:-:|:-:|
| View project, tasks, comments, soft deadlines | ✓ | ✓ | ✓ |
| Edit project, manage feature lists | ✓ | ✓ | |
| Delete project | ✓ | | |
| Invite / remove members, change roles | ✓ | ✓ (cannot grant or remove *owner*) | |
| Create tasks, change assignee | ✓ | ✓ | |
| Update / complete a task | ✓ | ✓ | own tasks only |
| Manage soft deadlines | ✓ | ✓ | on own tasks only |
| Bids, budgets, stage costs, expenses | ✓ | ✓ | 403 |
| Set estimated / assigned hours | ✓ | ✓ | |
| Log actual hours / timer | ✓ | ✓ | own tasks only |
| Performance report | team-wide | team-wide | own hours only |
| Calendar / spreadsheet export | all sheets | all sheets | no financial sheets, own hours only |

The project can never be left without an owner: demoting or removing the last owner returns HTTP 400 "Project must have at least one owner".

## Requirement traceability

| Area (owner) | Backend | Frontend | Requirements |
|---|---|---|---|
| Auth & settings (Tyler) | `routers/auth.py`, `routers/settings.py`, `core/security.py` (hashing, lockout, rate limit, HSTS / CSP) | `features/auth`, `features/settings`, Login / SignUp / ResetPassword / Settings pages, `ThemeProvider`, `index.css` / Tailwind tokens, build targets | UC-08..UC-11, SE-FR-11..15, SE-NFR-05/06 |
| Costs, time, reports (Jon) | `routers/costs.py`, `routers/time_tracking.py`, `routers/reports.py` | `features/costs`, `features/time-tracking`, `features/reports`, Costs / TimeTracking / Performance pages | UC-01..UC-04, SE-FR-01..05, SE-NFR-01/02 |
| Soft deadlines (Preethi) | `routers/soft_deadlines.py` (date, time, high / medium / low priority), DB trigger | `features/soft-deadlines` (inline date / time / priority controls), `services/apiClient.ts` (5 s timeout + retry) | UC-05..UC-07, SE-FR-06..10, SE-NFR-03/04 |
| Projects & exports (Saaqib) | `routers/projects.py`, `routers/exports.py`, `core/realtime.py` | `features/projects`, `features/export`, Projects / ProjectDetails / Calendar pages | UC-12..UC-15, SE-FR-16..20, SE-NFR-09/10 |
| Dashboard (Myoram) | `routers/dashboard.py` | `features/dashboard` (AABB `Widget.overlaps` / `moveTo`), Dashboard page | UC-16, UC-17, SE-FR-21..25, SE-NFR-07/08 |
| Tasks, members, collaboration (Aashwat) | `routers/tasks.py`, `routers/members.py`, `routers/collaboration.py`, `core/sanitizer.py` | `features/tasks`, `features/members`, `features/collaboration`, Board / TaskDetail / People / Notifications pages | UC-18..UC-22, SE-FR-26..30, SE-NFR-11/12 |

### Nonfunctional requirements

The 12 NFRs below use the definitions in the team README (`Jsorey4/CS3354_Team3_Project`). Password hashing, lockout and rate limiting are not NFRs; they are traced to SE-FR-11 and UC-08..UC-11.

| ID | Requirement | How it is met | Verified by |
|---|---|---|---|
| SE-NFR-01 | Accurate financial and percentage calculations | `Decimal` with `ROUND_HALF_UP` to $0.01 on the server, BigInt cents in the browser, percentages to 0.01 % | `test_uc01_…`, `test_uc02_…` (33.33 %), `costs/model.test.ts` |
| SE-NFR-02 | Reports contain authorized data only | Every report, dashboard and export query for a member is filtered by their user id; financial routes return 403 | `test_uc01_…`, `test_uc02_…`, `test_uc16_…`, Playwright member checks |
| SE-NFR-03 | A simple interface for managing soft deadlines | Inline date, time and priority controls on the task screen; problems are explained under the controls before saving; failed edits snap back to the saved value | `test_uc05_uc06_…_se_nfr03`, `soft-deadlines/validation.test.ts`, Playwright soft-deadline flow |
| SE-NFR-04 | Save deadline changes within 5 seconds | 5 s request timeout, one automatic retry with the same `Idempotency-Key`, then a Retry / Cancel banner that keeps the input | `test_se_nfr04_…`, `services/apiClient.test.ts` |
| SE-NFR-05 | Chrome, Edge, Firefox and Safari compatibility | Only standard CSS custom properties, Flexbox and Grid; `browserslist` + autoprefixer; Vite build targets Chrome / Edge / Firefox 111+ and Safari 16.4+; no single-engine browser APIs | Production build. Only Chromium is installed in this environment, so Firefox, Safari and Edge still need a manual pass |
| SE-NFR-06 | Encrypt transmitted account and profile data using HTTPS | TLS enforced with `FORCE_HTTPS` (redirect + HSTS) whenever demo mode is off, CSP on the web app, JWT only in the `Authorization: Bearer` header (no cookies, never in URLs), TOTP MFA | `test_se_nfr06_https_transport_and_bearer_only_sessions_se_fr11` |
| SE-NFR-07 | Responsive widgets without overlap | AABB overlap check in the browser and on the server (409), snap back with a red outline, single-column layout on small screens | `test_uc16_uc17_…`, `dashboard/model.test.ts`, Playwright drag |
| SE-NFR-08 | Load dashboard widgets within 3 seconds | One consolidated `/api/dashboard/widgets` call; load time shown in the page subtitle | `test_uc16_uc17_…` |
| SE-NFR-09 | Projects with 50+ members | Single bulk username query on create; grouped queries for member lists and avatar stacks | `test_uc12_uc14_uc15_…` (55 members, one query) |
| SE-NFR-10 | Progress updates within 2 seconds | WebSocket `progress` event after every task change | `test_se_nfr10_…` |
| SE-NFR-11 | Every task, comment and notification request checked against current membership and role | `require_project_role()` on every route, re-read from the database on each request | `test_uc18_uc20_uc21_…`, `test_se_nfr02_rbac_…` |
| SE-NFR-12 | Mention and project-event notifications within 2 seconds | WebSocket `notification` event plus toast | `test_uc18_uc20_uc21_…` (< 2 s), Playwright (≈120 ms) |

## Security notes

- Passwords are hashed with bcrypt (SE-FR-11, UC-08) and TOTP secrets are stored only on `user_profiles`. There are no UI-named tables (CWE-256). The migration also revokes client roles' read access to credential columns.
- `/api/auth/signup` and `/api/auth/login` are limited to 5 requests per 60 s per IP, with HTTP 429 `{"detail": "Try again later"}` (CWE-307). Login checks the lockout before checking the password. After 5 failures the account locks for 30 minutes and a signed, single-use unlock link is sent.
- Comments pass through an `nh3` sanitizer (no tags, no `on*=` handlers, no `javascript:` or `data:` links). The browser renders Markdown with a parser that never inserts raw HTML (CWE-79).
- Before `.xlsx` and Google Sheets export, every cell starting with `= + - @ \t \r` is prefixed with `'` (CWE-1236).
- Saves retried by the browser carry the same `Idempotency-Key`, so a timed-out request cannot be stored twice.
- Outside demo mode, HTTP is redirected to HTTPS with HSTS; the served web app carries a strict Content-Security-Policy (SE-NFR-06).

## Notification preferences and connected accounts

Profile & settings has the mockup's **Notification preferences** and **Connections** cards. Both are stored on the user's own `user_profiles` row and saved as soon as a switch or button is used (`PUT /api/settings/profile`).

- `notification_prefs` (`jsonb`): `task_assignments`, `mentions` and `deadline_reminders` default to on; `project_updates` defaults to off. The server checks these values before it creates a notification, so a muted kind is never stored or pushed. The mapping is: assignment and reassignment → task assignments; mention → mentions; deadline and soft-deadline reminders → deadline reminders; status changes on a task you own or created → project updates (a new `project_update` notification kind). Role and membership changes are always sent, because UC-19 and UC-20 require telling the member (SE-FR-29, UC-22).
- `connected_accounts` (`jsonb`): `{google_calendar | outlook | google_sheets: {connected, connected_at}}`. Connecting records the user's consent for one-way exports, so the export dialog skips its permission prompt for a connected provider. No OAuth tokens are stored, and nothing is imported (SE-FR-19, SE-FR-20, UC-14, UC-15).
- Updates are partial: only the switches named in the request change. Unknown switch names and non-boolean values return 422.
- A task's final due date is required on create and cannot be cleared on edit (UC-18: "Validate required fields (title and due date)"). The form and the API both report `Due date is required`, and `tasks.due_date` is `not null`.

## Deviations from the requested file tree

- `backend/app/core/realtime.py` holds the WebSocket hub. Routers need to broadcast, and importing from `main.py` would be circular. `main.py` mounts the `/ws` endpoint.
- Extra shared modules: `web/src/shared/ui.tsx` (UI kit), `shared/format.ts`, `shared/useSave.ts` (Retry/Cancel state), feature sub-components, Vitest `*.test.ts` files and `backend/pytest.ini`.

## Visual design

Every screen follows the ProjectForge Design System in the 15 HTML mockups: Midnight `#0F1424` background, `#1C2340` cards with 16 px corners, periwinkle `#8FA8FF` primary buttons, purple `#A78BFA` accents, the gold wordmark `#F5B942`, Inter, and the gold-hammer logo (`web/public/logo.png`). The tokens live in `web/tailwind.config.js` and `web/src/index.css`. Dark is the default theme; light is its daylight counterpart (SE-FR-14).

Intentional differences from the mockups:

- **Landing:** the "AI assistant" feature card and copy are replaced by Time tracking, because no requirement defines an AI assistant.
- **Tasks:** there are four columns (To Do, In Progress, Review, Done) because the task model has a Review status. On screens narrower than 1536 px the Task details panel slides in when a card is selected, so the columns keep the mockup's card width.
- **Calendar:** there is no "+ Event" button or Day view; no requirement defines stored calendar events. "Connect Google", "Outlook" and "Export iCal" open the one-way export dialog.
- **Profile:** the mockup's "Connections" card lists Google Calendar, Outlook and Google Sheets (the three one-way export targets). It drops the "Email reminders / digests" row, because the team README puts digests out of scope; deadline reminders are a notification switch instead. The page adds Appearance (theme and project mode), Color vision and Security (2FA) cards.
- **Shell:** the mockups have no top bar, so the demo role switcher, live indicator and theme toggle sit in the sidebar footer.

## Open items against the team README

- **Backend technology:** the team README says "Supabase only" with no second backend. This build has a FastAPI backend (as requested) on top of the Supabase-compatible schema and RLS policies. The team should decide whether to keep FastAPI or move the routers into Edge Functions / RLS.
- **UC-10:** who unlocks an account is an open decision; this build unlocks with an emailed, signed, single-use token.
