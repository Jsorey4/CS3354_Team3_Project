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

## Start here: shared project baseline

1. **This README summarizes the baseline.** Keep the README synchronized with accepted changes to the SE document. Its requirements describe intended behavior, not proof of completed implementation.
2. **The presentation supports the document:** `Group3_SE_Presentation_Project 2_ Fall2026.pptx`. Use consistent details to explain the design; identify differences instead of silently substituting them.
3. **Project Notes.md contains historical planning and proposals.** Its feature ideas, unresolved questions, and older requirement IDs do not override this baseline. Local diagrams likewise do not automatically supersede the SE document.
4. **Resolve ambiguity explicitly.** Check the open decisions below before choosing permissions, formulas, or integration behavior. Document proposed decisions so parallel contributors do not implement conflicting assumptions.
5. **Use branching when committing changes to preserve Main**. This will help ensure project safety and efficiency in case of needing to rollback any changes.

**Citation convention:** Document page numbers below are the printed footer numbers in the reviewed rendering, excluding the unnumbered cover. The corresponding physical page is one higher. The document's table of contents is stale, so its page references should not be used to locate diagrams. Presentation citations use slide order, starting at 1.

## Current repository status

At this review, this checkout contains documentation and design assets. It has **no application source, dependency manifest, database migrations, automated tests, CI configuration, or verified run command**. The architecture below is the intended implementation, not a deployed or working application. Other branches and external deployments have not been verified.

| Location                                    | Purpose                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| `README.md`                                 | Shared product requirements and implementation guidance.                    |
| `Project Notes.md`                          | Historical planning, proposals, and older traceability references.          |
| `docs/ProjectForge System Architecture.pdf` | Local logical, physical, and development architecture views.                |
| `docs/jon-diagrams/`                        | Local editable use-case and sequence diagrams and an exported use-case PDF. |
| `LICENSE`                                   | Repository license.                                                         |

The local `docs/` directory was untracked during this review; do not assume it is present in every clone until it is committed. Setup and test commands must be added and verified when application code exists.

## Functional requirements

The SE document lists **30 functional requirements** on pp. 4–5. The `SE-FR-xx` identifiers below follow that exact numbering and are README traceability labels. 

The tables preserve the document's scope. Supporting details come from its models and consistent presentation descriptions; workflow rules and unresolved details follow the tables.

### Budgets, costs, and reporting

Source: document p. 4; models pp. 7, 13, 22, 32; presentation slide 16.

| ID | Required behavior |
| --- | --- |
| SE-FR-01 | Record project bids, budgets, and stage costs, and calculate project costs. |
| SE-FR-02 | Record categorized expenses, including description, amount, and date. |
| SE-FR-03 | Provide searchable, sortable, and filterable cost tables. |
| SE-FR-04 | Track estimated hours, assigned hours, and actual logged hours as distinct quantities. |
| SE-FR-05 | Display project statistics and efficiency charts using only the viewer's permitted data. |

### Soft deadlines

Source: document p. 4; models pp. 8, 14, 23; presentation slides 17 and 26.

| ID       | Required behavior                                                                      |
| -------- | -------------------------------------------------------------------------------------- |
| SE-FR-06 | Create a soft deadline for a selected task before its final due date.                  |
| SE-FR-07 | Display a task's soft deadlines.                                                       |
| SE-FR-08 | Edit or remove existing soft deadlines.                                                |
| SE-FR-09 | Set and display soft-deadline priorities, shown as high, medium, or low in the models. |
| SE-FR-10 | Mark soft deadlines as completed.                                                      |

### Accounts and user preferences

Source: document p. 4; account models pp. 10, 17–18, 24; presentation slides 18 and 27.

| ID       | Required behavior                                                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| SE-FR-11 | Provide account login with multi-factor authentication. Account creation, login protection, and recovery appear in the supporting models. |
| SE-FR-12 | Provide user profiles with usernames, display names, and avatars.                                                                         |
| SE-FR-13 | Enable relevant features for school, personal, and work projects. The precise feature matrix remains to be agreed.                        |
| SE-FR-14 | Allow switching between light and dark themes.                                                                                            |
| SE-FR-15 | Provide selectable color-blindness settings.                                                                                              |

### Project organization and sharing

Source: document p. 5; models pp. 9, 15–16, 25–26; presentation slides 19 and 28.

| ID       | Required behavior                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| SE-FR-16 | Maintain project details and membership, including project name, ownership, status, deadlines, and members. |
| SE-FR-17 | Customize, reorder, and color-code project cards; retain the saved customization.                           |
| SE-FR-18 | Display overall project progress and individual-feature completion progress.                                |
| SE-FR-19 | Export project deadlines/calendar information to iCal, Google Calendar, and Outlook.                        |
| SE-FR-20 | Export authorized project data to Excel and Google Sheets.                                                  |

Calendar integration is **outbound export**. Two-way calendar synchronization or importing external calendar changes is not established by the requirements.

### Dashboard widgets

Source: document p. 5; models pp. 12, 21, 29–30, 34.

| ID | Required behavior |
| --- | --- |
| SE-FR-21 | Display customizable dashboard widgets with information the user is permitted to access. |
| SE-FR-22 | Add widgets to and remove widgets from the dashboard. |
| SE-FR-23 | Temporarily hide widgets. |
| SE-FR-24 | Rearrange widgets through drag and drop. |
| SE-FR-25 | Restore the default dashboard configuration. |

The document's layout workflows also save the customized arrangement. **Saving a layout and restoring the default are separate operations.** Slide 20 lists saving where the document's requirement 25 lists restoration; preserve restoration and the documented save workflow.

### Tasks and team collaboration

Source: document p. 5; models pp. 11, 19–20, 27–28, 37–38; presentation slides 21 and 30.

| ID | Required behavior |
| --- | --- |
| SE-FR-26 | Create, edit, assign, and track task completion. |
| SE-FR-27 | Organize personal and team tasks through lists, tags, and ordering. |
| SE-FR-28 | Support Markdown comments, replies, and user mentions in task discussions. |
| SE-FR-29 | Notify users of relevant project events and approaching deadlines. |
| SE-FR-30 | Control access to projects and available actions through current membership and roles. |

## Workflow and access rules

Implement these behaviors together with the requirements. The service/database must enforce authorization as well as the UI.

| Workflow | Rules and outcomes | Document source |
| --- | --- | --- |
| Manage project costs | Check financial access before reading or editing. Validate edits before saving. Calculate the total from permitted stage costs; label a partial sum as a **subtotal**. Show bids, budgets, and expenses separately. Do not add these amounts together or add expenses again without an agreed accounting rule. | pp. 7, 13, 22, 32 |
| Review performance | Resolve permitted projects, people, and fields before retrieval and aggregation. Managers can see authorized team/individual information; staff see their own. Use the selected period and distinguish estimated, assigned, and actual hours. Show an empty report when there are no matching records and **N/A** for missing inputs or undefined metrics. | pp. 7, 13, 22, 32 |
| Track time | Start/stop a timer for a task and persist its start, end, and duration. Duration is end time minus start time, excluding paused intervals. Update the displayed timer and recent time records after saving. | p. 33 |
| Create or edit a soft deadline | Select a task with a final due date, enter the soft date/time and priority, and validate that it is earlier than the final due date. Reject invalid dates; keep the previous value on an invalid edit. Save within the deadline-save target and display the updated value. The expanded flows include retry/warning behavior when saving fails. | pp. 14, 23 |
| Register and sign in | Validate account information and uniqueness, assign the agreed default role, and protect stored credentials. Rate-limit signup and login; apply repeated-login-failure lockout and generic incorrect-credential errors. Create a secure authenticated session and retain the explicit MFA requirement even where simplified diagrams omit it. Backend and unlock discrepancies are listed below. | pp. 4, 10, 17–18, 24, 36–37 |
| Reset a forgotten password | Show the same response whether or not the email has an account. Send an expiring, single-use reset link for an existing account. On a valid reset, confirm success and return to login; show an error for an expired link or unacceptable password. Password reset and unlocking a locked account are distinct flows. | p. 33 |
| Change a member's role | The acting user must be an owner or manager. A project must retain at least one owner. Save the membership change, notify the member, and apply the new permissions on the next request. | p. 19 |
| Create and assign a task | Validate the task and the selected assignee's project membership before saving. The sequence/logical diagrams restrict this operation to a project manager; do not broaden that access without reconciling the role model. | pp. 37, 45 |
| Post a comment with a mention | Reject an empty comment. Validate mentions against project membership; remove an invalid mention, warn the author, and still post an otherwise valid comment. Render Markdown with scripts/raw HTML removed. Save/display the comment in the task thread and notify valid mentioned members. Use the explicit **2-second** notification requirement while the conflicting diagrams are corrected. | pp. 5, 20, 28, 38 |
| Customize the dashboard | Distinguish adding/removing, hiding, moving, saving, and restoring defaults. An overlapping move snaps back to the original position; otherwise save the new position. If that save fails or takes over 5 seconds, retry once and show the outcome/warn if the retry fails. Widgets remain subject to underlying data permissions. | pp. 5, 12, 21, 29–30, 34 |
| Export data | Export only permitted records/fields from projects the member belongs to. Calendar exports represent project deadlines. Spreadsheet exports provide an Excel `.xlsx` download or Google Sheets link; show an empty state when no records match. Request provider authorization where required and report failures instead of claiming success. | pp. 25–26, 33, 35, 45, 48 |

**Role vocabulary needs reconciliation.** Financial diagrams use manager/partner and staff; membership workflows use owner/manager/member; the class diagram lists only manager/member. These names are not an approved equivalence map. Preserve the explicit restrictions above and resolve a single project-role/action/field permission matrix before implementing shared authorization. Do not infer that every project member may assign tasks, view financial data, or inspect another person's productivity.

## Nonfunctional requirements

The SE document lists **12 nonfunctional requirements** on p. 5. `SE-NFR-xx` follows that order and differs from the older NFR numbering in Project Notes.md. These are acceptance targets, not measured results.

| ID | Required target | Verification or clarification needed |
| --- | --- | --- |
| SE-NFR-01 | Accurate financial and percentage calculations. | Compare against independent reference calculations. The document does not define rounding/precision; slide 22 provides additional wording that needs reconciliation before adopting a numeric tolerance. |
| SE-NFR-02 | Reports contain authorized data only. | Check details, totals, and charts; restricted records must not contribute to aggregates. |
| SE-NFR-03 | A simple interface for managing soft deadlines. | Agree on representative user tasks and measurable usability criteria. |
| SE-NFR-04 | Save deadline changes within **5 seconds**. | Verify successful persistence, not just an optimistic UI update; define timing boundaries and failure/retry behavior. |
| SE-NFR-05 | Compatibility with **Chrome, Edge, Firefox, and Safari**. | Agree on supported versions and test the main workflows in each. |
| SE-NFR-06 | Encrypt transmitted account and profile data using **HTTPS**. | Verify browser-to-service transport; the architecture also specifies HTTPS/TLS, JWT sessions, and MFA. |
| SE-NFR-07 | Responsive widgets without overlap. | Agree on supported viewport sizes and widget arrangements and inspect each. |
| SE-NFR-08 | Load dashboard widgets within **3 seconds**. | Define start/end events, initial versus cached load, and representative data/network conditions. |
| SE-NFR-09 | Support projects with **at least 50 members** without performance issues. | Exercise representative workflows with 50 or more members; define acceptable latency/concurrency rather than assuming member count alone proves performance. |
| SE-NFR-10 | Update project and feature progress indicators within **2 seconds** of a feature change. | Measure the interval from the agreed change event to the updated display. |
| SE-NFR-11 | Check every task, comment, and notification request against the user's **current project membership and role**. | Test allowed/denied requests and membership/role changes, including direct requests beyond the UI. |
| SE-NFR-12 | Deliver mention and project-event notifications within **2 seconds** of the triggering action. | Define what delivery means and measure it. Document pp. 20 and 28 say 10 seconds; the explicit NFR on p. 5 is the working target pending reconciliation. |

## Intended architecture

The local architecture PDF provides supporting views. Infrastructure boxes describe intended components, not verified provisioned services or service guarantees.

| Layer              | Technology and responsibility                                                                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Presentation       | **React single-page application with `supabase-js`**, served as static HTML/JS/CSS through **Vercel**. Browser views include sign-in/MFA, dashboard, projects/details, tasks, costs, calendar, and settings.                                 |
| Application        | Feature modules for authentication, projects/membership, tasks/soft deadlines, collaboration/notifications, dashboards/reporting, and exports. Shared service code handles Supabase queries, Realtime channels, storage, and download links. |
| Services           | **Supabase** API gateway, **Auth**, **PostgREST**, **Realtime**, **Storage**, and **Deno Edge Functions**. Functions support protected workflows such as account recovery, exports, and deadline notifications.                              |
| Data               | **PostgreSQL** with project/role **Row Level Security (RLS)**, validation/trigger logic, and scheduled jobs where required. Authorization and reporting scope must hold at this layer as well as in the UI.                                  |
| Integrations       | Google authorization/Calendar/Sheets, Outlook through Microsoft Graph, downloadable iCal `.ics` files, Excel `.xlsx` export, and SMTP for supported account/deadline emails.                                                                 |
| Build and delivery | GitHub source control; planned GitHub Actions lint/test/build checks; web deployment to Vercel and backend deployment through Supabase tooling. Exact commands and configuration remain to be implemented and verified.                      |

**Backend conflict:** Account sequence diagrams on document pp. 36–37 and presentation slides 69–70 name a **Django app**, while document p. 48 and presentation slides 73–75 use Supabase. This README follows the dedicated architecture as the working design and flags the account sequences for reconciliation. Do not independently introduce a second backend based on those labels.

The sitemap (document p. 6; slide 52) includes landing/sign-up/sign-in/MFA, dashboard, projects, tasks/charts, costs, people, calendar, and profile/settings. Keep access to each area consistent with project permissions.

### Code organization and data model

The development view on document p. 47, presentation slide 74, and the local architecture PDF proposes the following separation.

```text
web/src/app/         Routing, layout, session guards
web/src/pages/       Application screens
web/src/components/  Reusable UI components
web/src/features/    auth, projects, tasks, collaboration, dashboard, export
web/src/services/    Supabase/data access, Realtime, storage
supabase/migrations/ Database schema, RLS policies, triggers
supabase/functions/  Server-side Edge Functions
```

This is a **proposed structure**, not a listing of existing directories. The development view also calls for shared types/validation, seed data, and unit/integration/end-to-end tests. Record the agreed tooling and final paths when creating the application.

The class diagram on document p. 48 names `User`, `Membership`, `Project`, `TaskList`, `Task`, `Tag`, `Comment`, `Notification`, `Dashboard`, `Widget`, and `ExportJob`. Membership connects users to projects; projects organize task lists/tasks; dashboards contain widgets; comments, notifications, and exports connect to the relevant users and project data.

**The class diagram is incomplete relative to the requirements.** It does not fully model budgets, stage costs, expenses, hours, soft deadlines, calendar exports, or all role distinctions. Include these needs when finalizing the schema and service contracts. Do not reduce functional scope to the classes already drawn or treat diagram attributes as a finished database schema.

## Implementation and verification guidance

The following sequence organizes the documented dependencies; it does not assign work to individual team members or declare features complete.

1. **Agree on shared contracts.** Settle the role/permission matrix, entity relationships, relevant open decisions, and common types before parallel implementations depend on them. Reference `SE-FR-xx`/`SE-NFR-xx` and the affected use case for each change.
2. **Establish the foundation.** Create the web/backend structure, authentication/session handling, project membership, migrations, and RLS. Provide reproducible configuration without committing credentials.
3. **Implement complete workflows.** Connect each UI operation to validation, authorization, persistence, error feedback, and a verified result. Coordinate shared project/task/user data across feature modules.
4. **Verify observable behavior.** Use requirement-linked cases with preconditions, inputs/actions, expected results, and actual results. Cover normal flows, invalid inputs, access denial, persistence failures, and relevant performance targets. Test financial calculations independently and test unauthorized report/export access directly.
5. **Keep setup and status accurate.** Once code exists, document prerequisites, environment variable names, database setup/seed steps, run/build/test commands, and deployment steps that have actually been exercised. Update feature status with evidence; a mockup or passing isolated unit test alone does not establish a completed workflow.

Keep course deadlines, grading quotas, submission formats, and assignment checklists outside this README. Historical brainstorming such as AI features, general email scheduling, new project-management methodologies, or two-way calendar synchronization requires an explicit scope decision before implementation.

## Open decisions and source reconciliation

These items are not permission to invent behavior. Continue independent work where possible and resolve the affected contract before implementing a dependent feature.

| Item                                               | Evidence and current treatment                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default dashboard restoration versus layout saving | Document p. 5 requirement 25 specifies restoration; presentation slide 20 lists saving instead. Slide 31's traceability matrix also specifies restoration. Document workflows on pp. 21 and 29–30 describe saving. Keep both distinct behaviors and reconcile the requirement lists.                                                                                                                     |
| Notification timing                                | Document p. 5 NFR12 and presentation slide 23 require 2 seconds. Document pp. 20 and 28 and presentation slides 43 and 49 say 10 seconds. Use 2 seconds as the explicit requirement and correct the inconsistent diagrams in both artifacts.                                                                                                                                                             |
| Financial/percentage precision                     | Document p. 5 only states calculation accuracy. Slide 22 adds nearest-cent monetary results with an ambiguous "±1 for rounding" clause and percentage results to `.01%`. This is additional detail, not an opposing document value. Agree on currency, formula definitions, rounding stage/method, and tolerance before encoding acceptance thresholds. Preserve the stage-cost/subtotal rules on p. 32. |
| Backend technology                                 | Account sequences on document pp. 36–37 / slides 69–70 say Django; document p. 48 / slides 73–75 specify Supabase. Follow the dedicated architecture as the working design and reconcile the account sequences before implementing them.                                                                                                                                                                 |
| Account unlocking                                  | Document pp. 10, 24, 36 / slides 36, 48, 69 describe administrator unlocking; document p. 46 / slide 73 describe email/token unlocking. Agree on who can unlock an account and how the flows relate. The password-reset sequence on p. 33 / slide 61 does not by itself resolve account unlocking.                                                                                                       |
| Roles and assignment permissions                   | Document p. 19 requires owner/manager role administration and at least one owner, p. 32 distinguishes manager/staff reporting, p. 37 restricts task creation/assignment to managers, and p. 48's class model lists manager/member. Reconcile one permission matrix covering assignment, finance, hours, exports, and membership changes.                                                                 |
| Metrics and progress                               | Define efficiency formulas, completion/progress calculations, treatment of missing data, and hour precision. Preserve N/A for undefined reporting metrics and the explicit progress-update timing target.                                                                                                                                                                                                |
| Project modes and preferences                      | Define which features apply to school/personal/work projects and the precise color-blindness settings.                                                                                                                                                                                                                                                                                                   |
| AI wireframe copy                                  | The landing-page wireframe on document p. 40 / slide 55 advertises an AI assistant, but the functional requirements on pp. 4–5 / slides 16–21 do not define one. Treat that copy as unconfirmed scope, not an instruction to add an AI feature.                                                                                                                                                          |
| Integration contracts                              | Define export fields/scope, timezone/date handling, provider authorization, duplicate/retry behavior, and failure messages. Calendar export does not imply ongoing synchronization.                                                                                                                                                                                                                      |
| Operational and test settings                      | Agree on runtime/dependency versions, tooling, MFA method, account-protection settings, notification channels, performance measurement conditions, and supported browser/viewports. Record assumptions explicitly.                                                                                                                                                                                       |

