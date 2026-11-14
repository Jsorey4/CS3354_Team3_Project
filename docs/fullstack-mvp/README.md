# ProjectForge

ProjectForge is a project management web application for coordinating tasks, deadlines, people, progress, hours, and costs in one place. Its primary audience is businesses and professional teams; student groups are secondary users, and individuals managing personal projects are tertiary users. School, personal, and work project types expose relevant features. A customizable dashboard provides an overview and access to individual projects.

- **Course:** CS 3354.001, Software Engineering, Fall 2026
- **Professor:** Srimathi Srinivasan
- **Team 3:** eLeet Coderz
- **Members:**
  - Jon Sorey
  - Tyler Gaines
  - Saaqib Shaik
  - Preethi Seereddy
  - Myoram Langwang
  - Aashwat Singh

## Start here: rules for contributors and AI agents

This README is the single shared brief for every teammate working in this repository. Read the whole file before planning or writing code.

1. **Source authority.** The SE Document's functional and nonfunctional requirement lists define scope. This README turns them into implementation rules using the document's diagrams. If this README and the SE Document disagree, stop and raise it with the team; do not choose silently.
2. **Build only traceable behavior.** Every feature must trace to an `SE-FR-xx`, `SE-NFR-xx`, or `UC-xx` defined below. Where sources conflict, follow the working rule in [Open decisions](#open-decisions-and-source-conflicts). Anything not listed here is out of scope, including the AI assistant mentioned in one wireframe, two-way calendar synchronization, general email scheduling, and the `templates`/`pages` prototype tables.
3. **Ask instead of guessing.** If a needed detail is missing (a field, permission, formula, or message), ask the area owner or the team, or propose a decision in `docs/decisions/` and link it in the pull request. Never invent behavior that another teammate's code will depend on.
4. **Stay in your area.** Each requirement area has an owner (see [Ownership](#requirement-areas-and-ownership)). Work in your own feature folders. Call out any change to shared code in the pull request description: `web/src/app/`, `web/src/shared/`, `web/src/services/`, `supabase/migrations/`, CI configuration, or this README.
5. **Authorization lives on the server.** Enforce every permission rule with PostgreSQL Row Level Security (RLS) or an Edge Function. The UI may hide controls for usability, but it is never the only check.
6. **No secrets in Git.** Commit `.env.example` with variable names only. Never commit `.env`, Supabase service-role keys, OAuth client secrets, or real user data.
7. **Branch and review.** Never commit directly to `main`. Branch from the latest `main` using `<name>/<area>-<short-topic>` (for example, `tyler/auth-login`), open a pull request, get at least one teammate's review, then merge. Keep each pull request to one area and one purpose.
8. **Keep this file accurate.** Update this README in the same pull request that changes behavior, structure, setup, or a decision. Describe planned work as planned; state that something works only after it has been run.

**How sources are cited.** Diagrams are cited by type, title, and author, for example *EX "Log in" (Tyler)*. The SE Document (System Modeling and Architecture Design sections) and the SE Presentation contain the same diagrams under the same titles. Page and slide numbers are not used because they change between revisions. Diagram types: **UC** use-case diagram, **HL** high-level use case, **EX** expanded use case, **SEQ** sequence diagram, **WF** wireframe.

## Current repository status

As of this revision, the repository contains documentation and design assets only. There is **no application code, package manifest, database migration, automated test, CI workflow, or verified run command**. Everything under [Architecture](#architecture) and [Repository layout](#repository-layout) is the agreed target, not existing code.

| Path | Contents |
| --- | --- |
| `README.md` | This brief. |
| `AGENTS.md`, `CLAUDE.md` | Pointers that make AI coding agents load this README automatically. Put rules in this README, not in those files. |
| `LICENSE` | Repository license. |
| `docs/ProjectForge System Architecture.pdf` | Logical, Physical, and Development views (the same views as the SE Document). |
| `docs/jon-diagrams/` | Editable draw.io sources for Jon's cost and performance use-case and sequence diagrams. |
| `docs/SupabaseScreenshot.png` | Table diagram of the **prototype** schema in the hosted Supabase project (see [Data model](#data-model)). |
| `docs/ForgeLogo.png` | Project logo. |

The hosted Supabase project contains prototype tables that are not captured as migrations in this repository. Do not build on them until they are exported to `supabase/migrations/` and reconciled with the [Data model](#data-model).

## Requirement areas and ownership

Each teammate authored one requirement area in the SE Document and owns the matching code. Owners review pull requests that touch their folders.

| Area | Owner | Requirements | Use cases | Feature folders (`web/src/features/`) |
| --- | --- | --- | --- | --- |
| Budgets, costs, and reporting | Jon Sorey | SE-FR-01–05, SE-NFR-01–02 | UC-01–04 | `costs/`, `time-tracking/`, `reports/` |
| Soft deadlines | Preethi Seereddy | SE-FR-06–10, SE-NFR-03–04 | UC-05–07 | `soft-deadlines/` |
| Accounts and user preferences | Tyler Gaines | SE-FR-11–15, SE-NFR-05–06 | UC-08–11 | `auth/`, `settings/` |
| Project organization and sharing | Saaqib Shaik | SE-FR-16–20, SE-NFR-09–10 | UC-12–15 | `projects/`, `export/` |
| Dashboard widgets | Myoram Langwang | SE-FR-21–25, SE-NFR-07–08 | UC-16–17 | `dashboard/` |
| Tasks and team collaboration | Aashwat Singh | SE-FR-26–30, SE-NFR-11–12 | UC-18–22 | `tasks/`, `members/`, `collaboration/` |

Two sequence diagrams were drawn outside the author's own area: Preethi drew SEQ "Reset a forgotten password" (Tyler's area) and SEQ "Track time and export records" (Jon's and Saaqib's areas). Agree who implements each of these before starting.

## Functional requirements

The SE Document lists **30 functional requirements** in six groups. `SE-FR-xx` numbers follow the document's order, which matches the column numbers in the presentation's Traceability Matrix. The wording combines the document's short titles with the presentation's "The system shall…" statements. These requirements describe intended behavior, not completed work.

### Budgets, costs, and reporting (Jon)

| ID | Required behavior |
| --- | --- |
| SE-FR-01 | Record project bids, budgets, and stage costs, and calculate the total project cost. |
| SE-FR-02 | Record expenses with a category, description, amount, and date. |
| SE-FR-03 | Provide searchable, sortable, and filterable cost tables. |
| SE-FR-04 | Track estimated, assigned, and actual hours as distinct quantities. |
| SE-FR-05 | Display project statistics and efficiency charts using only data the viewer may see. |

### Soft deadlines (Preethi)

| ID | Required behavior |
| --- | --- |
| SE-FR-06 | Create a soft deadline for a selected task before its final due date. |
| SE-FR-07 | Display a task's soft deadlines. |
| SE-FR-08 | Edit or remove existing soft deadlines. |
| SE-FR-09 | Set and display a soft deadline's priority: high, medium, or low. |
| SE-FR-10 | Mark soft deadlines as completed. |

### Accounts and user preferences (Tyler)

| ID | Required behavior |
| --- | --- |
| SE-FR-11 | Log in with multi-factor authentication (MFA). Account creation, rate limiting, lockout, and password reset are specified by UC-08–11. |
| SE-FR-12 | Provide user profiles with usernames, display names, and avatars. |
| SE-FR-13 | Enable relevant features for school, personal, and work projects. Which features apply to each type is an open decision. |
| SE-FR-14 | Switch between light and dark themes. |
| SE-FR-15 | Provide selectable color-blindness settings. |

### Project organization and sharing (Saaqib)

| ID | Required behavior |
| --- | --- |
| SE-FR-16 | Maintain project details and membership, including name, owner, status, deadlines, and members. |
| SE-FR-17 | Customize, reorder, and color-code project cards, and keep the customization for future sessions. |
| SE-FR-18 | Display overall project completion and per-feature completion progress. |
| SE-FR-19 | Export project deadlines to iCal (`.ics`), Google Calendar, and Outlook. Export is one-way (outbound only). |
| SE-FR-20 | Export permitted project data to Excel (`.xlsx`) and Google Sheets. |

### Dashboard widgets (Myoram)

| ID | Required behavior |
| --- | --- |
| SE-FR-21 | Display customizable dashboard widgets containing only information the user may access. |
| SE-FR-22 | Add widgets to and remove widgets from the dashboard. |
| SE-FR-23 | Temporarily hide widgets. |
| SE-FR-24 | Rearrange widgets by drag and drop. |
| SE-FR-25 | Restore the default dashboard configuration. |

### Tasks and team collaboration (Aashwat)

| ID | Required behavior |
| --- | --- |
| SE-FR-26 | Create, edit, assign, and track completion of tasks. |
| SE-FR-27 | Organize personal and team tasks with lists, tags, and ordering. |
| SE-FR-28 | Support Markdown comments, replies, and user mentions in task discussions. |
| SE-FR-29 | Notify users of relevant project events and approaching deadlines. |
| SE-FR-30 | Control access to projects and available actions through current membership and roles. |

SE-FR-12–15 and SE-FR-18 have no use-case diagram. Implement them from the requirement text, the sitemap, and the wireframes.

## Use cases

Use these IDs in code headers, tests, and pull requests. The Diagrams column lists what exists in the SE Document and Presentation; the author is the area owner unless named.

| ID | Use case | Area owner | Requirements | Diagrams |
| --- | --- | --- | --- | --- |
| UC-01 | Manage project costs | Jon | SE-FR-01–03 | UC, HL, EX, SEQ |
| UC-02 | Review project performance | Jon | SE-FR-04–05 | UC, HL, EX, SEQ |
| UC-03 | Record project hours (estimated and assigned hours by authorized users; actual hours by the user) | Jon | SE-FR-04 | UC "Review project performance" |
| UC-04 | Track time with a task timer | Jon | SE-FR-04 | SEQ "Track time and export records" (Preethi) |
| UC-05 | Create soft deadline | Preethi | SE-FR-06, SE-FR-09 | UC, HL, EX |
| UC-06 | Edit soft deadline | Preethi | SE-FR-08 | UC, HL, EX |
| UC-07 | Display, remove, prioritize, and complete soft deadlines | Preethi | SE-FR-07–10 | UC |
| UC-08 | Create account | Tyler | SE-FR-11 | UC, HL, EX, SEQ |
| UC-09 | Log in | Tyler | SE-FR-11 | UC, HL, EX, SEQ |
| UC-10 | Unlock account | Tyler | SE-FR-11 | UC "Log in" |
| UC-11 | Reset a forgotten password | Tyler | SE-FR-11 | SEQ (Preethi) |
| UC-12 | Create project | Saaqib | SE-FR-16 | UC, HL, EX, SEQ |
| UC-13 | Customize project card | Saaqib | SE-FR-17 | Use-case description only |
| UC-14 | Export project to calendar | Saaqib | SE-FR-19 | UC, HL, EX, SEQ |
| UC-15 | Export project data to a spreadsheet | Saaqib | SE-FR-20 | SEQ "Track time and export records" (Preethi) |
| UC-16 | Manage dashboard widgets (add, remove, hide, restore default) | Myoram | SE-FR-21–23, SE-FR-25 | UC, HL, EX, SEQ |
| UC-17 | Rearrange and save the dashboard layout | Myoram | SE-FR-24 | UC, HL, EX, SEQ |
| UC-18 | Create and assign task | Aashwat | SE-FR-26–27 | SEQ, use-case description |
| UC-19 | Manage project access (invite, accept invitation, remove member, reassign open tasks) | Aashwat | SE-FR-30 | UC "Manage project access" |
| UC-20 | Change a member's role | Aashwat | SE-FR-30 | UC, HL, EX |
| UC-21 | Post a comment with a mention | Aashwat | SE-FR-28–29 | UC, HL, EX, SEQ |
| UC-22 | Receive notifications and deadline reminders | Aashwat | SE-FR-29 | UC "Comment and get notified" |

## Workflow and access rules

Implement these rules together with the requirements. "Server" means an RLS policy or an Edge Function.

| Use case | Rules and outcomes | Source |
| --- | --- | --- |
| UC-01 Manage project costs | Check financial access before reading or editing; on denial, show "access denied" and return no restricted data. Show bids, budgets, expenses, and stage costs separately, with the permitted total. Validate edits before saving: invalid input shows the error and keeps the entered values; revoked permission stops without saving; a failed save keeps the input and offers retry or cancel. The total is the sum of permitted stage costs; label a partial sum **subtotal**. Never add bids, budgets, and expenses together. Adding an expense requires category, description, amount, and date, and rechecks access. Search, filter, and sort apply only to permitted rows. | EX, SEQ "Manage project costs" (Jon) |
| UC-02 Review project performance | Check report access first. Resolve permitted projects, people, and fields before retrieving data. Validate the selected period. Managers see authorized team or individual hours; staff see only their own. Report estimated, assigned, and actual hours separately for the period. No matching records → empty report. Missing input or undefined metric → **N/A**. Load failure → retry or cancel. Out-of-scope requests are denied and change no data. | EX, SEQ "Review project performance" (Jon) |
| UC-04 Track time | Start or stop a timer on a task and persist its start, end, and duration. Duration is end time minus start time, excluding paused intervals. After saving, update the timer and the recent time records. | SEQ "Track time and export records" (Preethi) |
| UC-05, UC-06 Create or edit a soft deadline | Select a task that has a final due date and enter the soft deadline's date, time, and priority. The soft deadline must be earlier than the final due date. An invalid date shows an error and asks for a new date (create) or keeps the original value (edit). Save within **5 seconds**; otherwise retry and warn the user. Display the saved date and priority. | HL, EX (Preethi); SE-NFR-04 |
| UC-08 Create account | Rate-limit sign-up per IP address ("try again later"). Validate username, email, and password format, password strength, and uniqueness, and show field errors. Store the password only through Supabase Auth (hashed), assign the default role, confirm registration, and redirect to log in. | HL, EX, SEQ (Tyler) |
| UC-09 Log in | Refuse a locked account before checking the password. Rate-limit attempts per IP address. Wrong credentials show a generic error and increment the failed-attempt count; at the limit, lock the account. Success resets the count, starts a secure session, and redirects. Require MFA (SE-FR-11; the sitemap has a 2FA step) even though the Log in diagrams omit it. | HL, EX, SEQ (Tyler); sitemap |
| UC-10 Unlock account | The diagrams disagree on who unlocks an account. See [Open decisions](#open-decisions-and-source-conflicts). | UC (Tyler); Logical and Physical views |
| UC-11 Reset a forgotten password | Show the same "check your inbox" message whether or not the email has an account. Send a single-use, expiring reset link only for existing accounts. A valid link and acceptable password confirm success and return to log in; an expired link or weak password shows an error and offers a new link. Password reset is separate from account unlocking. | SEQ (Preethi) |
| UC-12 Create project | Name, owner, and deadline are required; status is also collected. The deadline must be a future date. Every listed member must be an existing user; flag unknown members so the creator can invite or remove them. The creator is saved as the project's owner (the SEQ calls this role "manager"; see [Roles](#roles-and-permissions)). Save the project, show its card on the dashboard, and push the new card to members' dashboards in real time. Must support 50 or more members (SE-NFR-09). | EX, SEQ (Saaqib) |
| UC-13 Customize project card | The user selects a card, chooses its color, and reorders cards. The order and color are saved and restored in future sessions. | Use-case description (Saaqib) |
| UC-14 Export project to calendar | No deadlines → "nothing to export" notice. Google and Outlook require OAuth consent first (iCal skips this); if consent is declined, cancel and share no data. Export only deadlines the member may see. iCal produces an `.ics` file returned as a signed download link. Google and Outlook create one event per deadline, then show "n deadlines added". On failure, show an error and offer retry. Export is one-way. | EX, SEQ (Saaqib) |
| UC-15 Export project data to a spreadsheet | Export only permitted records and fields from projects the member belongs to. Excel returns an `.xlsx` download; Google Sheets returns a link to the new sheet. No matching records → "nothing to export". Report failures; never claim success. | SEQ "Track time and export records" (Preethi); Logical view note |
| UC-16 Manage dashboard widgets | Add, remove, hide (keeps the widget but marks it hidden), and restore the default layout. A widget that cannot be found shows "widget unavailable"; an invalid action (already added, or not present to remove) shows "invalid action". Widgets display only data the user may access. | EX, SEQ "Manage Dashboard Widgets" (Myoram) |
| UC-17 Rearrange and save the layout | Drag a widget. If it overlaps another widget, snap it back to its original position. Otherwise save the new position; if the save fails or takes longer than 5 seconds, retry once, show the outcome, and warn if the retry fails. Saving a layout and restoring the default are separate operations. | EX, SEQ "Rearrange Dashboard Widgets" (Myoram) |
| UC-18 Create and assign task | Validate required fields (title and due date). Only a project manager may create and assign tasks (`Membership.canAssignTasks()`); others get "access denied". The assignee must be a project member. The new task appears in the task list immediately. | SEQ (Aashwat); Logical view note |
| UC-19 Manage project access | An owner or manager invites members, and the invitee accepts. An owner or manager removes members and may reassign the removed member's open tasks. Every action verifies owner or manager permission. | UC "Manage project access" (Aashwat) |
| UC-20 Change a member's role | The actor must be an owner or manager; otherwise deny access and change nothing. A project must always keep at least one owner; block a change that would remove the last owner. Save the role and notify the member; the new permissions apply on the member's next request. | HL, EX (Aashwat) |
| UC-21 Post a comment with a mention | Reject an empty comment ("comment can't be empty"). Mentions must be project members; remove an invalid mention, warn the author, and still post the comment. Render Markdown with scripts and raw HTML removed. Show the comment on the task thread and notify valid mentioned members in real time within **2 seconds** (SE-NFR-12). | HL, EX, SEQ (Aashwat) |
| UC-22 Notifications and deadline reminders | A scheduled job sends deadline reminders. Mentions and project events create notifications delivered in real time. Users view notifications and mark them read. | UC "Comment and get notified" (Aashwat); Physical view |

## Roles and permissions

Role names differ across diagrams, and no permission matrix has been approved yet:

- Cost and performance diagrams (Jon) use **manager/partner** and **staff**.
- Membership diagrams (Aashwat) use **owner**, **manager**, and **member**, and require at least one owner per project.
- The class diagram defines `Membership.role` as `manager | member` and allows only a manager to assign tasks.
- SEQ "Create project" (Saaqib) makes the creator the project manager and stores them as the owner (`owner = manager`).
- Account unlocking (Tyler) uses an application **administrator**, which is not a project role.

**Proposed working matrix (needs team sign-off).** Use it so features agree with each other. It maps manager/partner to owner or manager, and staff to member.

| Action | Owner | Manager | Member |
| --- | --- | --- | --- |
| View the project, tasks, comments, and soft deadlines | Yes | Yes | Yes |
| Edit project details and status | Yes | Yes | No |
| Delete the project | Yes | No | No |
| Invite or remove members; change roles | Yes | Yes | No |
| Create, edit, and assign tasks | Yes | Yes | No |
| Update or complete a task assigned to them | Yes | Yes | Yes |
| Create or edit soft deadlines | Yes | Yes | On tasks assigned to them |
| Comment, reply, and mention | Yes | Yes | Yes |
| View or edit bids, budgets, stage costs, and expenses | Yes | Yes | No |
| Set estimated and assigned hours | Yes | Yes | No |
| Log their own actual hours | Yes | Yes | Yes |
| View performance reports | Team and individuals | Team and individuals | Own only |
| Export data | Only data the role can view | Only data the role can view | Only data the role can view |

**Implement every role check through one shared helper**, so the matrix can change in one place: a SQL function used by RLS policies (for example, `has_project_role(project_id, roles)`) and a matching TypeScript helper in `web/src/shared/permissions.ts` used only to show or hide UI. Do not write inline role checks inside features.

## Nonfunctional requirements

The SE Document lists **12 nonfunctional requirements**. `SE-NFR-xx` follows the document's order. These are acceptance targets, not measured results.

| ID | Required target | Verification or clarification needed |
| --- | --- | --- |
| SE-NFR-01 | Accurate financial and percentage calculations. | Compare against independent reference calculations. The presentation adds: totals match to the nearest cent ("±1 for rounding") and percentages to 0.01%. The "±1" clause is ambiguous; agree on currency, rounding stage and method, and tolerance before encoding thresholds. |
| SE-NFR-02 | Reports contain authorized data only. | Check details, totals, and charts; restricted records must not contribute to aggregates. |
| SE-NFR-03 | A simple interface for managing soft deadlines. | Agree on representative user tasks and measurable usability criteria. |
| SE-NFR-04 | Save deadline changes within **5 seconds**. | Verify successful persistence, not just an optimistic UI update; define timing boundaries and failure/retry behavior. |
| SE-NFR-05 | Compatibility with **Chrome, Edge, Firefox, and Safari**. | Agree on supported versions and test the main workflows in each. |
| SE-NFR-06 | Encrypt transmitted account and profile data using **HTTPS**. | Verify browser-to-service transport; the architecture also specifies TLS, JWT sessions, and MFA. |
| SE-NFR-07 | Responsive widgets without overlap. | Agree on supported viewport sizes and widget arrangements and inspect each. |
| SE-NFR-08 | Load dashboard widgets within **3 seconds**. | Define start/end events, initial versus cached load, and representative data and network conditions. |
| SE-NFR-09 | Support projects with **at least 50 members** without performance issues. | Exercise representative workflows with 50 or more members; define acceptable latency and concurrency. |
| SE-NFR-10 | Update project and feature progress indicators within **2 seconds** of a feature change. | Measure from the agreed change event to the updated display. |
| SE-NFR-11 | Check every task, comment, and notification request against the user's **current project membership and role**. | Test allowed and denied requests and membership/role changes, including direct API requests that bypass the UI. |
| SE-NFR-12 | Deliver mention and project-event notifications within **2 seconds** of the triggering action. | Define what "delivered" means and measure it. Aashwat's HL and EX "Post a comment with a mention" say 10 seconds; 2 seconds is the requirement. |

## Architecture

Source: Logical, Physical, and Development views (`docs/ProjectForge System Architecture.pdf`) and the layered Architecture Diagram (Saaqib). Boxes describe intended components, not provisioned services.

| Layer | Technology and responsibility |
| --- | --- |
| Presentation | **React single-page application (TypeScript) with `supabase-js`**, built as static HTML/JS/CSS and served by **Vercel**. Screens follow the sitemap below. |
| Application | One feature module per area in `web/src/features/`, plus `web/src/services/` for the shared Supabase client, Realtime channels, and Storage links. |
| Services | **Supabase Cloud**: API gateway (Kong; checks the JWT on every call), **Auth** (sessions, JWT, MFA), **PostgREST** (REST CRUD), **Realtime** (WebSocket push of progress, task, comment, and notification changes), **Storage** (export files served by signed link), and **Edge Functions** (Deno): `auth-guard` (lockout and unlock), `export-excel`, `export-sheets`, `export-calendar`, and `deadline-notifier`. |
| Data | **PostgreSQL** with **RLS on every table** (project-role checks), triggers, and `pg_cron` scheduled jobs. Daily backups and a read replica are optional. |
| Integrations | Google OAuth 2.0 (consent and access tokens), Google Calendar API, Outlook through Microsoft Graph, downloadable iCal `.ics` files, Google Sheets API, and SMTP email for unlock links and deadline reminders. |
| Build and delivery | GitHub → GitHub Actions (lint, test, and build on every pull request) → web deployed to Vercel; database and functions deployed with the Supabase CLI. |

**Layer rule (Development view):** each layer uses only the layer below it plus `shared/`. Pages use features; features use services; services call Supabase. Pages never call Supabase directly, and features never import pages.

**Backend:** use Supabase only. Tyler's SEQ "Log in" and "Create account" show a "Django app", which conflicts with every architecture view. Do not add a Django or other second backend; those two diagrams should be redrawn against Supabase Auth.

**Sitemap:** Landing page → Sign up / Sign in → 2FA → Home/Dashboard, which links to:

- **Projects:** view all, create, details, status
- **Tasks/Charts:** view all, create/edit, soft deadlines, task priority, progress charts
- **Costs:** overview, details, export to Excel
- **People:** team members, assign tasks, user permissions
- **Calendar:** calendar view, due dates, export to calendar
- **Profile/Settings:** account info, edit profile, settings, dark/light mode

The wireframes add Create account, Reset password, Notifications, and Time tracking & export screens. Wireframes show layout only; they do not add scope.

## Data model

**Class diagram (Logical view):** `User`, `Membership`, `Project`, `TaskList`, `Task`, `Tag`, `Comment`, `Notification`, `Dashboard`, `Widget`, `ExportJob`.

- Membership links users to projects (`1..*` members per project). A task's assignee is a membership (`0..1`).
- Compositions (the part is deleted with its whole): User ◆ Dashboard, Dashboard ◆ Widget, Project ◆ TaskList, TaskList ◆ Task, Task ◆ Comment.
- Operations to implement: `Membership.canAssignTasks()`, `Widget.overlaps(other)`, `Widget.moveTo(x, y)`, `Widget.hide()`, `Dashboard.restoreDefault()`, `Task.assignTo(member)`, `Task.moveTo(list, position)`, `User.unlockAccount(token)`, `ExportJob.generateFile()`, `ExportJob.sendToSheets()`.

**Prototype schema (hosted Supabase project, `docs/SupabaseScreenshot.png`).** Reconcile it with the class diagram before writing migrations:

| Class | Prototype table | Action needed |
| --- | --- | --- |
| User | `profiles` (references `auth.users`) | Keep. Supabase Auth owns credentials; `profiles` holds username, display name, and avatar. |
| Membership | `project_members` | Keep. The `project_role` values must include `owner`. |
| Project | `projects` | Add status and deadline (SE-FR-16). |
| TaskList | `lists` | Keep. `TaskList` is the class name for this table. |
| Task | `tasks` | Keep (already has status, priority, assignee, due date, position, completed time). |
| Tag, Comment, Notification, Dashboard, Widget, ExportJob | — | Create. |
| — | `time_entries`, `expenses` | Keep. Required by SE-FR-02 and SE-FR-04 but missing from the class diagram. |
| — | `events` | No requirement defines stored calendar events. Decide or drop. |
| — | `templates`, `pages` | No requirement. Out of scope unless the team decides otherwise. |
| — | `Login Page`, `Sidebar` | **Drop.** Never store passwords in an application table; Supabase Auth handles credentials. UI structure is not data. |

**Required but not modeled anywhere yet:** soft deadlines (task, date/time, priority, completed), bids, budgets, and stage costs; estimated and assigned hours; invitations; user preferences (theme, color-blindness setting, project-type mode, notification preferences); project-card customization (color, order); and calendar/OAuth connection state. Add these when finalizing the schema. Do not shrink scope to the classes already drawn, and do not treat diagram attributes as a finished schema.

## Repository layout

This is the single target layout. Items marked *(planned)* do not exist yet. Create folders as work needs them.

```text
CS3354_Team3_Project/
├── README.md                      # This brief (read first)
├── AGENTS.md                      # Points AI agents (Codex, Cursor, Copilot, etc.) to README.md
├── CLAUDE.md                      # Imports README.md for Claude Code
├── CONTRIBUTING.md                # (planned) Branch, pull request, and review conventions
├── LICENSE
├── .gitignore                     # (planned) node_modules, .env, build output, .DS_Store, draw.io backups
├── .github/                       # (planned)
│   ├── workflows/ci.yml           # Lint, test, and build on every pull request
│   └── pull_request_template.md   # IDs implemented, tests run, screenshots
│
├── docs/
│   ├── ProjectForge System Architecture.pdf
│   ├── diagrams/                  # Editable diagram sources, one folder per author (currently docs/jon-diagrams/)
│   └── decisions/                 # (planned) One short Markdown file per resolved open decision
│
├── web/                           # (planned) React + TypeScript single-page application
│   ├── package.json
│   ├── package-lock.json
│   ├── .env.example               # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (names only, no values)
│   ├── index.html
│   ├── vite.config.ts
│   ├── public/                    # Static files served as-is
│   ├── e2e/                       # End-to-end tests of complete workflows
│   └── src/
│       ├── main.tsx               # Application entry point
│       ├── app/                   # Router, layout shell, providers, session guard
│       ├── pages/                 # One file per screen; assembles feature components
│       ├── components/            # UI shared by several features (buttons, dialogs, loading/empty/error states)
│       ├── features/              # One folder per module (see below)
│       ├── services/              # Shared Supabase infrastructure only
│       │   ├── db/                # client.ts, database.types.ts (generated)
│       │   ├── realtime/          # Channel subscription helpers
│       │   └── storage/           # Upload and signed-link helpers
│       ├── shared/                # Types, validation, constants, and permissions.ts used across features
│       ├── styles/                # Global styles, light/dark themes, color-blindness palettes
│       └── test/                  # Test setup and shared fixtures
│
└── supabase/                      # (planned)
    ├── config.toml
    ├── migrations/                # Timestamped SQL: tables, RLS policies, triggers, cron jobs
    ├── seed.sql                   # Fake development data only
    ├── functions/                 # Deno Edge Functions
    │   ├── _shared/
    │   ├── auth-guard/            # Login lockout and unlock
    │   ├── export-calendar/
    │   ├── export-excel/
    │   ├── export-sheets/
    │   └── deadline-notifier/
    └── tests/                     # Database and RLS policy tests
```

### Pages

Names match the UI lifelines in the sequence diagrams where one exists.

```text
web/src/pages/
├── LandingPage.tsx
├── SignUpPage.tsx
├── LoginPage.tsx            # Includes the MFA step
├── ResetPasswordPage.tsx
├── DashboardPage.tsx
├── ProjectsPage.tsx
├── ProjectDetailsPage.tsx
├── BoardPage.tsx            # Task board (sitemap "Tasks/Charts")
├── TaskDetailPage.tsx
├── CostsPage.tsx
├── PerformancePage.tsx      # Statistics, progress, and efficiency charts
├── TimeTrackingPage.tsx
├── PeoplePage.tsx
├── CalendarPage.tsx
├── NotificationsPage.tsx
└── SettingsPage.tsx         # Profile and preferences
```

### Features

```text
web/src/features/
├── auth/            # Tyler   — sign-up, log-in, MFA, lockout and unlock, password reset
├── settings/        # Tyler   — profile, avatar, theme, color-blindness, project-type mode
├── projects/        # Saaqib  — project details, status, cards, progress
├── export/          # Saaqib  — calendar (.ics, Google, Outlook) and spreadsheet (.xlsx, Sheets) export
├── dashboard/       # Myoram  — widgets, layout, overlap check, restore default
├── tasks/           # Aashwat — tasks, lists, tags, ordering, assignment
├── members/         # Aashwat — invitations, membership, roles
├── collaboration/   # Aashwat — comments, mentions, notifications
├── soft-deadlines/  # Preethi — create, edit, remove, priority, completion
├── costs/           # Jon     — bids, budgets, stage costs, expenses, cost tables
├── time-tracking/   # Jon     — task timer and hour records
└── reports/         # Jon     — project statistics and efficiency charts
```

The Development view names six modules (`auth`, `projects`, `tasks`, `collaboration`, `dashboard`, `export`). `settings/`, `members/`, `soft-deadlines/`, `costs/`, `time-tracking/`, and `reports/` are split out so each owner works in separate folders and so areas the view omitted (costs, hours, preferences) have a home.

Inside each feature, keep related UI, logic, queries, and tests together:

```text
features/tasks/
├── index.ts                 # Public exports; other code imports this feature only through index.ts
├── taskController.ts        # Operations named on the SEQ "TaskController" lifeline, e.g. createTask(form)
├── api.ts                   # Supabase queries for this feature only
├── model.ts                 # Pure domain rules from the class diagram, e.g. canAssignTasks()
├── validation.ts            # Input validation
├── types.ts                 # Feature-specific types
├── hooks/
│   └── useTasks.ts
├── components/
│   ├── TaskCard.tsx
│   └── TaskForm.tsx
├── model.test.ts            # Unit tests sit next to the code they test
└── TaskForm.test.tsx
```

### Coding conventions

- **Controllers.** Sequence diagrams name controllers (`ProjectController`, `ExportController`, `DashboardController`, `TaskController`, `CommentController`). Implement each as a plain TypeScript module, `<name>Controller.ts`, in the owning feature, exposing the operations named in the diagram (for example, `createProject(form)`, `exportToCalendar(project, target)`, `moveWidget(id, x, y)`, `postComment(body)`). Do not create a top-level `controllers/` folder.
- **Testable rules.** Put pure rules (widget overlap, `canAssignTasks`, stage-cost totals, soft-deadline date validation) in `model.ts` or `validation.ts` with no Supabase calls, so they can be unit-tested directly.
- **File headers.** Start every source file with a comment naming its author(s), what the module does, and the `SE-FR`/`SE-NFR`/`UC` IDs it implements. Comment logic that is not obvious.
- **Test names.** Include IDs in test names, for example `"UC-05: rejects a soft deadline after the final due date (SE-FR-06)"`.
- **Migrations.** Create migrations with `supabase migration new <name>`. Never edit a migration that has merged to `main`; add a new one. Enable RLS in the same migration that creates a table. Regenerate `database.types.ts` after migrations merge.
- **Dependencies.** Before adding a library, check whether the project already uses one for the same job. List every new dependency in the pull request description.

### Toolchain

Working default, implied by the layout above; confirm it when the application is first scaffolded and record any change here:

- Node.js LTS and npm (commit `package-lock.json`)
- Vite, React, and TypeScript (strict mode); React Router; `@supabase/supabase-js` v2
- Vitest and React Testing Library for unit and component tests; Playwright for end-to-end tests
- Supabase CLI for the local stack, migrations, type generation, Edge Functions, and database tests
- ESLint and Prettier

## Implementation and verification guidance

This sequence organizes the documented dependencies. It does not declare any feature complete.

1. **Agree on shared contracts.** Settle the permission matrix, table names, and the open decisions that affect your use case before others depend on them. Reference `SE-FR`/`SE-NFR`/`UC` IDs in every change.
2. **Scaffold once.** One person creates the `web/` and `supabase/` skeletons, toolchain configuration, CI, and `.env.example`, and merges them to `main` before others branch. Do not create a separate scaffold on your own branch.
3. **Build complete workflows.** Connect each UI action through the controller, validation, API call, RLS policy, and persistence to visible feedback, including error paths.
4. **Verify observable behavior.** Write requirement-linked test cases with preconditions, inputs/actions, expected results, and actual results. Cover normal flows, invalid input, access denial, persistence failures, and relevant performance targets. Test financial calculations independently, and test RLS policies and exports directly, not only through the UI.
5. **Keep setup and status accurate.** Once code exists, add a Setup section listing prerequisites, environment variable names, database setup and seed steps, and the run, build, and test commands that have actually been run.

Keep course deadlines, grading, submission formats, and assignment checklists out of this README.

## Open decisions and source conflicts

Follow the working rule until the team records a decision in `docs/decisions/` and updates this table. Continue independent work where possible.

| Item | Evidence | Working rule |
| --- | --- | --- |
| Restore default vs. save layout (SE-FR-25) | SE Document and the Traceability Matrix: "Default dashboard restoration". Presentation FR slide (Myoram): "save their customized dashboard widget layout". Myoram's UC, HL, and EX describe saving. | Implement both as separate operations; SE-FR-25 is restore default. Correct the presentation's FR slide. |
| When the layout saves | EX "Save Dashboard Layout" uses an explicit Save action; SEQ "Rearrange Dashboard Widgets" saves every non-overlapping move immediately. | Save each valid move, as in the SEQ. Decide whether an explicit Save action is also needed. |
| Notification timing | SE-NFR-12: 2 seconds. Aashwat's HL and EX "Post a comment with a mention": 10 seconds. | 2 seconds. Correct the HL and EX. |
| Financial and percentage precision | SE-NFR-01 states accuracy only; the presentation adds nearest cent, an ambiguous "±1 for rounding", and 0.01% for percentages. | Agree on currency, formulas, rounding stage and method, and tolerance before encoding acceptance thresholds. Keep the stage-cost and subtotal rules in UC-01. |
| Backend technology | Tyler's SEQ "Log in" and "Create account": Django. All architecture views: Supabase. | Supabase only. Redraw those two diagrams. |
| Account unlocking | Tyler's UC, EX, and SEQ: an administrator unlocks. Class diagram `unlockAccount(token)`, Physical view (unlock-account emails), and Architecture diagram (`auth-guard`): unlock by emailed token. | Implement lockout. Hold unlocking until the team decides who unlocks and how, along with the lockout threshold and duration. |
| Roles and permissions | See [Roles and permissions](#roles-and-permissions). | Use the proposed matrix through the shared helpers. Get team sign-off before merging RLS policies for finance and performance data. |
| Where Excel files are generated | Preethi's SEQ builds the `.xlsx` in the browser. The Physical view stores exported `.xlsx` files in Storage with signed links, and the Architecture diagram lists an `export-excel` Edge Function. | Follow the architecture views: generate on the server and return a signed link. |
| Calendar export contents | The SEQ exports "deadlines" without saying which. HL "Export to calendar" says ".ics file or calendar sync". The Context diagram draws calendar events flowing *into* ProjectForge. | Outbound export only. Which dates are exported (project deadline, task due dates, soft deadlines) and how re-exports avoid duplicates is undecided; ask Saaqib. |
| Email scope | Physical view: unlock-account and deadline-reminder emails. Context diagram: "scheduled follow-ups & task reminders". Settings wireframe: "deadline and task digests". | Email only for account security and deadline reminders. Digests and follow-ups are out of scope until decided. |
| Widget settings | Myoram's UC includes "Edit Widget Settings"; no requirement defines it. | Out of scope until decided. |
| AI wireframe copy | The landing-page wireframe (Saaqib) advertises an AI assistant; no requirement defines one. | Do not build it; treat the copy as placeholder text. |
| Prototype tables | The hosted Supabase project has `templates`, `pages`, `events`, `Login Page`, and `Sidebar`. | See [Data model](#data-model). |
| Metrics and progress | No formulas are defined. | Define efficiency formulas, completion/progress calculations, missing-data handling, and hour precision. Show N/A for undefined metrics; meet the 2-second progress target (SE-NFR-10). |
| Project modes and preferences | SE-FR-13, SE-FR-15, SE-FR-17. | Define which features apply to school, personal, and work projects; the exact color-blindness settings; and whether card customization is saved per user or per project. |
| Integration contracts | — | Define export fields and scope, timezone and date handling, provider authorization, duplicate/retry behavior, and failure messages. |
| Library choices | — | Agree before first use on styling, data fetching, drag and drop, charts, Markdown rendering and sanitization, and spreadsheet generation. Do not add a second library for a job one already does. |
| Operational and test settings | — | Agree on runtime versions, MFA method, lockout threshold, rate limits, notification channels, performance measurement conditions, and supported browser versions and viewports. |
