# ProjectForge full-stack MVP: team handoff

For Team 3 (eLeet Coderz), CS 3354.001. This page tells each of us which files are ours, how to test our area, and what to click in a 60-second demo.

- **Decisions that need sign-off** are in [`docs/decisions/`](../decisions/): [001 backend](../decisions/001-hybrid-fastapi-supabase-architecture.md), [002 roles](../decisions/002-rbac-permission-matrix.md), [003 lockout](../decisions/003-account-lockout-and-unlock.md), [004 money](../decisions/004-financial-precision-and-stage-costs.md).
- **Backend layout:** the Python backend is organised as one router file per area, `backend/app/routers/<area>.py`, not `backend/app/features/<area>/`. Request / response shapes for every area are in `backend/app/schemas/dto.py`, tables in `backend/app/models/entities.py`.
- **Shared code** (tell the team in your pull request if you change it): `backend/app/core/`, `backend/app/main.py`, `backend/app/schemas/dto.py`, `backend/app/models/entities.py`, `supabase/migrations/`, `web/src/app/`, `web/src/shared/`, `web/src/services/`.

## Run it

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173. Every demo account uses the password `ProjectForge!1`. The sidebar's "Demo · switch role" box signs you in as Jon (owner), Tyler (manager) or Staff (member) in one click.

If you ran an older build, the backend notices the outdated `backend/projectforge.db`, saves a copy next to it (`projectforge.db.bak-v…`) and rebuilds the demo data.

## Test everything

```bash
cd backend
python -m pytest
```

```bash
cd web
npm test
```

```bash
cd web
npm run build
```

Results on this branch: backend 34 passed on SQLite (9 database-only tests skipped) and 43 passed on PostgreSQL 16; web 43 Vitest tests passed; the production build has no TypeScript errors.

To include the PostgreSQL-only tests (race conditions and the database's own access rules), point both variables at a PostgreSQL server you can create databases on:

```bash
cd backend
TEST_DATABASE_URL=postgresql+psycopg://postgres@127.0.0.1:5432/projectforge_test SUPABASE_TEST_DB_URL=postgresql://postgres@127.0.0.1:5432/postgres python -m pytest
```

| Test file | What it proves |
| --- | --- |
| `backend/tests/test_all_requirements.py` | Every use case and requirement, through the real HTTP API and WebSocket |
| `backend/tests/test_security_audit.py` | The security review: other projects' ids, forged tokens, injection through titles, races, slow-pattern attacks, query counts |
| `backend/tests/test_supabase_rls.py` | The database's own rules, with the API bypassed (PostgreSQL only) |

---

## Jon Sorey: budgets, costs and reporting

SE-FR-01 to 05, SE-NFR-01 to 02, UC-01 to 04.

| Where | Files |
| --- | --- |
| Frontend features | `web/src/features/costs/` (`StageCostTable.tsx`, `ExpenseTable.tsx`, `costController.ts`, `model.ts`, `model.test.ts`), `web/src/features/time-tracking/` (`TaskTimerWidget.tsx`, `timeController.ts`, `model.ts`), `web/src/features/reports/` (`EfficiencyCharts.tsx`, `reportController.ts`) |
| Pages | `web/src/pages/CostsPage.tsx`, `PerformancePage.tsx`, `TimeTrackingPage.tsx` |
| Backend | `backend/app/routers/costs.py`, `time_tracking.py`, `reports.py` |
| Database | `project_financials`, `stage_costs`, `expenses`, `time_entries` in `supabase/migrations/` |

Test your area:

```bash
cd backend
python -m pytest -k "uc01 or uc02 or uc03 or uc04 or se_nfr01"
```

```bash
cd web
npx vitest run src/features/costs
```

60-second demo:

1. As **Jon (owner)** open **Cost**. Point at Bid, Budget and the stage-cost **Total** shown separately. "Bids, budgets and expenses are never added together."
2. Untick one stage: the label changes to **Subtotal**.
3. Add a stage cost of `0.10` and one of `0.20`: the total rises by exactly `0.30`. "All money is exact decimal, rounded half-up to the cent."
4. Add an expense, then search, filter by category and sort by amount.
5. Switch to **Staff (member)**: Cost shows "Financial records are restricted". "The server refuses before reading any financial row."
6. Open **Time tracking**, start the timer on a task, pause, stop: the entry appears with its duration.
7. Open **Charts**: Staff sees "Only your hours"; switch to Tyler for the team view. Estimated, assigned and actual hours are three separate bars; missing metrics show N/A.

---

## Preethi Seereddy: soft deadlines

SE-FR-06 to 10, SE-NFR-03 to 04, UC-05 to 07.

| Where | Files |
| --- | --- |
| Frontend features | `web/src/features/soft-deadlines/` (`SoftDeadlineList.tsx`, `SoftDeadlineBadge.tsx`, `softDeadlineController.ts`, `validation.ts`, `validation.test.ts`) |
| Pages | Shown inside `web/src/pages/TaskDetailPage.tsx` and on the task cards of `BoardPage.tsx` |
| Backend | `backend/app/routers/soft_deadlines.py` |
| Database | `soft_deadlines` and the trigger `enforce_soft_deadline_before_due` |

Test your area:

```bash
cd backend
python -m pytest -k "uc05 or se_nfr04"
```

```bash
cd web
npx vitest run src/features/soft-deadlines
```

60-second demo:

1. As **Jon** open **Tasks**, click a card, then **Open task**.
2. In **Soft deadlines** type a title, pick a date and time before the final due date, choose **High**, press Add. It appears in date order with its priority.
3. Try a date after the final due date: the message "must be earlier than the task's final due date" appears under the field and nothing is saved.
4. Edit an existing one to an invalid date: it snaps back to the saved value (UC-06).
5. Tick one as completed, then remove one.
6. "Saves have a 5-second limit. On a timeout the app retries once with the same key, then shows Retry / Cancel and keeps what you typed."

---

## Tyler Gaines: accounts and user preferences

SE-FR-11 to 15, SE-NFR-05 to 06, UC-08 to 11.

| Where | Files |
| --- | --- |
| Frontend features | `web/src/features/auth/` (`AuthProvider.tsx`, `AuthLayout.tsx`, `MfaCodeInput.tsx`, `authController.ts`, `validation.ts`, `validation.test.ts`), `web/src/features/settings/` (`AccessibilityToggles.tsx`, `PreferenceCards.tsx`, `settingsController.ts`) |
| Pages | `web/src/pages/LandingPage.tsx`, `SignUpPage.tsx`, `LoginPage.tsx`, `ResetPasswordPage.tsx`, `SettingsPage.tsx`; themes in `web/src/app/ThemeProvider.tsx` and `web/src/index.css` |
| Backend | `backend/app/routers/auth.py`, `settings.py`, `backend/app/core/security.py`, `core/config.py` |
| Database | `user_profiles` |

Test your area:

```bash
cd backend
python -m pytest -k "uc08 or uc09 or uc10 or se_fr11 or se_fr12 or se_nfr06 or json_preference"
```

```bash
cd web
npx vitest run src/features/auth
```

60-second demo:

1. **Sign up** with a weak password: each unmet rule is listed. Fix it and the account is created.
2. Log out. Log in as `tyler@example.com`: the **2FA** step appears; enter `123456` (demo code).
3. Log out. Enter a wrong password for your new account 5 times, then the right one: "Account is locked" (HTTP 423). "The lock is checked before the password."
4. On **Reset password**, press **Check email** and open the unlock link: the account unlocks. "Unlocking never changes the password, and a reset never unlocks."
5. In **Profile & settings** flip **Dark theme**, pick **Deuteranopia** then **High contrast**: status colours change everywhere.
6. Flip a **Notification preferences** switch and reload: it stayed. "Stored on the server, and a muted kind is never sent."
7. "Outside demo mode the API forces HTTPS with HSTS, and sessions travel only in the Authorization header."

---

## Saaqib Shaik: project organization and sharing

SE-FR-16 to 20, SE-NFR-09 to 10, UC-12 to 15.

| Where | Files |
| --- | --- |
| Frontend features | `web/src/features/projects/` (`CreateProjectModal.tsx`, `ProjectCard.tsx`, `ColorPicker.tsx`, `ProjectScope.tsx`, `projectController.ts`, `model.ts`), `web/src/features/export/` (`ExportModal.tsx`, `exportController.ts`) |
| Pages | `web/src/pages/ProjectsPage.tsx`, `ProjectDetailsPage.tsx`, `CalendarPage.tsx`; live progress in `web/src/services/realtimeClient.ts` |
| Backend | `backend/app/routers/projects.py`, `exports.py`, `backend/app/core/realtime.py` (progress events), `core/sanitizer.py` (spreadsheet cells) |
| Database | `projects`, `project_members` (card colour and order), `task_lists` |

Test your area:

```bash
cd backend
python -m pytest -k "uc12 or uc14 or uc15 or se_nfr10 or query_count"
```

60-second demo:

1. As **Jon** open **Projects**, press **New project**. Enter a name, a future deadline and members `tyler, staff, nobody_here`: the unknown name is flagged so you can remove it. Create.
2. The card appears with its avatar stack. Change its colour and drag it to reorder; reload: both stayed.
3. Open the project: overall progress and per-list progress bars.
4. In a second browser window as **Staff**, complete a task: Jon's progress bar moves without reloading (under 2 seconds).
5. Open **Calendar**, press **Export iCal**: an `.ics` file downloads, "n deadlines saved".
6. Choose **Google**: the permission prompt appears; Decline cancels and shares nothing.
7. From the project page open **Export** → **Spreadsheet** → Excel: the workbook downloads. As Staff the financial sheets are not offered.

---

## Myoram Langwang: dashboard widgets

SE-FR-21 to 25, SE-NFR-07 to 08, UC-16 to 17.

| Where | Files |
| --- | --- |
| Frontend features | `web/src/features/dashboard/` (`WidgetGrid.tsx`, `widgets.tsx`, `dashboardController.ts`, `model.ts`, `model.test.ts`) |
| Pages | `web/src/pages/DashboardPage.tsx` |
| Backend | `backend/app/routers/dashboard.py` |
| Database | `dashboard_widgets` |

Test your area:

```bash
cd backend
python -m pytest -k "uc16 or query_count"
```

```bash
cd web
npx vitest run src/features/dashboard
```

60-second demo:

1. As **Jon** open **Home**: five widgets, load time in the subtitle (target under 3 seconds).
2. Press **Customize**. Drag a widget onto another: red outline, and it snaps back with a shake (overlap, UC-17).
3. Drag it to an empty spot: green outline, it stays; reload and it is still there.
4. Move a widget with the arrow keys while its handle is focused.
5. **Hide** a widget, then **Add widget** to bring it back. Add "My tasks".
6. Press **Restore default**: the original five return (SE-FR-25).
7. Switch to **Staff**: the Cost summary widget says the data is restricted. "Widgets only ever show what the user may access."

---

## Aashwat Singh: tasks and team collaboration

SE-FR-26 to 30, SE-NFR-11 to 12, UC-18 to 22.

| Where | Files |
| --- | --- |
| Frontend features | `web/src/features/tasks/` (`TaskForm.tsx`, `TaskCard.tsx`, `taskController.ts`, `model.ts`, `validation.ts`, tests), `web/src/features/members/` (`InviteMemberModal.tsx`, `ReassignTasksModal.tsx`, `RoleSelect.tsx`, `memberController.ts`), `web/src/features/collaboration/` (`CommentThread.tsx`, `MentionInput.tsx`, `SafeMarkdown.tsx`, `markdown.ts`, `commentController.ts`, tests) |
| Pages | `web/src/pages/BoardPage.tsx`, `TaskDetailPage.tsx`, `PeoplePage.tsx`, `NotificationsPage.tsx`; `web/src/shared/permissions.ts` |
| Backend | `backend/app/routers/tasks.py`, `members.py`, `collaboration.py`, `backend/app/core/permissions.py`, `core/sanitizer.py` (Markdown), `core/realtime.py` (notifications) |
| Database | `tasks`, `comments`, `notifications`, `project_members` roles; triggers `guard_project_members`, `guard_tasks`, `sync_project_from_task` |

Test your area:

```bash
cd backend
python -m pytest -k "uc18 or uc19 or uc20 or uc22 or se_fr28 or se_nfr02 or se_nfr11"
```

```bash
cd web
npx vitest run src/features/tasks src/features/collaboration
```

60-second demo:

1. As **Tyler (manager)** open **Tasks**, press **New task**. Leave the due date empty: "Due date is required". Fill it in, assign Staff, create: the card appears at once.
2. Drag the card to **In Progress**.
3. Switch to **Staff (member)**: there is no **New task** button, and only Staff's own cards can be dragged.
4. Open the task and comment `Looks good @jon and @nobody **bold** <script>alert(1)</script>`: the warning says `@nobody` is not a member, the script is gone, bold renders.
5. In a second window as **Jon**: the notification toast arrives within 2 seconds; open **Notifications** and mark it read.
6. As **Jon** open **People**, change Staff to manager. Then try to make yourself a manager: "Project must have at least one owner".
7. Remove a member and choose who takes over their open tasks.

---

## What the security review changed (so you are not surprised)

| Area | Change |
| --- | --- |
| Live updates | The browser now sends its token as the first message inside the WebSocket; the URL is just `/ws`. Sockets that do not sign in within 5 seconds are closed. |
| Sessions | Resetting a password signs out every earlier session. Resetting no longer unlocks a locked account. |
| Removed members | Lose every view of the project immediately, including their finished tasks, their own time entries there, and their running timer (which is stopped and its hours kept). |
| Text fields | Names and titles are single-line with invisible characters removed. Task descriptions are cleaned like comments. Avatar links must be `https://`. |
| Ids | A malformed id returns 404 or 422, never a server error. Request bodies over 1 MB are refused (413). |
| Database | New migration `supabase/migrations/0002_security_hardening.sql`: role and last-owner triggers, child rows locked to their task's project, credential columns hidden from client roles, strict JSON preference columns, one running timer per person, new indexes. |
| Deleting a project | One statement; the database cascades. |

## Known limits (not hidden, not fixed here)

- Calendar and Sheets "connections" record consent for one-way exports only. No Google or Microsoft account is linked and no OAuth token is stored.
- Emails go to the in-app dev outbox in demo mode; a real mail provider is not wired up.
- The rate limiter and the live-update hub live in one server process. Running several API processes needs a shared store.
- Only Chromium is installed in the build environment, so Firefox, Safari and Edge still need a manual pass (SE-NFR-05).
- The session token is kept in the browser's local storage. The app never inserts raw HTML and serves a strict Content-Security-Policy, which is what protects it.
