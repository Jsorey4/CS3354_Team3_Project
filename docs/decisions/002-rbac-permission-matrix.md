# ADR 002: One Owner / Manager / Member permission matrix, enforced through shared helpers

- **Status:** Proposed. The team README asks for sign-off before RLS policies for finance and performance data merge.
- **Owner:** Aashwat Singh (SE-FR-30). Finance rows: Jon Sorey. Soft deadlines: Preethi Seereddy.
- **Traces:** SE-FR-30, SE-NFR-02, SE-NFR-11, UC-01, UC-02, UC-18, UC-19, UC-20.

## Context

The diagrams use different role names (manager/partner and staff; owner, manager, member; `manager | member`). The team README proposes one working matrix and requires that every check goes through one shared helper per layer.

## Decision

Three project roles: **owner**, **manager**, **member**. "manager/partner" in the cost diagrams means owner or manager; "staff" means member. The application "administrator" in the unlock diagrams is not a project role (see ADR 003).

| Action | Owner | Manager | Member |
| --- | --- | --- | --- |
| View project, tasks, comments, soft deadlines | Yes | Yes | Yes |
| Edit project details and status | Yes | Yes | No |
| Delete the project | Yes | No | No |
| Invite or remove members; change roles | Yes | Yes, except anything involving the owner role | No |
| Grant or remove the **owner** role | Yes | No | No |
| Create, edit, assign and delete tasks | Yes | Yes | No |
| Update or complete a task assigned to them | Yes | Yes | Yes |
| Set estimated and assigned hours | Yes | Yes | No |
| Create or edit soft deadlines | Yes | Yes | On tasks assigned to them |
| Comment, reply, mention | Yes | Yes | Yes |
| Delete a comment | Any | Any | Their own |
| View or edit bids, budgets, stage costs, expenses | Yes | Yes | No (403, no rows) |
| Log their own hours / run their own timer | Yes | Yes | On tasks assigned to them |
| View performance reports and time entries | Team | Team | Own only |
| Export | What the role can view | What the role can view | Tasks, soft deadlines, own time |
| Change their own card colour / order; leave the project | Yes | Yes | Yes |

Rules that hold for every role:

- A project always has at least one owner. The check and the write happen under a per-project lock, so two simultaneous requests cannot both pass it.
- Access is decided from the **current** membership on every request. A removed member loses every view at once, including tasks they finished, their own time entries in that project, and live events.
- Ids are never trusted. Every task, soft deadline, comment, expense, stage cost, time entry and list id is traced back to its project, and that project's membership is checked.

## The shared helpers (the only places a role is compared)

| Layer | Helper | File |
| --- | --- | --- |
| Python API | `require_project_role(db, user_id, project_id, allowed_roles)`, `require_task_access`, `require_task_editor`, `can_assign_tasks` | `backend/app/core/permissions.py` |
| Database | `app_project_role(project_id)` in every RLS policy; `guard_project_members`, `guard_tasks`, `sync_project_from_task` triggers | `supabase/migrations/0001_initial_schema.sql`, `0002_security_hardening.sql` |
| Browser (show / hide only) | `hasProjectRole`, `isManager`, `isOwner`, `grantableRoles` | `web/src/shared/permissions.ts` |

Do not write `role === 'owner'` (or the SQL / Python equivalent) inside a feature. Change the matrix by changing these helpers and this table together.

## How it is verified

- API: `test_se_nfr02_rbac_guard_unit_and_task_visibility`, `test_uc18_uc20_uc21_…`, `test_uc19_…`, `test_se_nfr11_cross_project_ids_are_rejected_for_every_object_type…`, `test_se_nfr11_a_removed_member_keeps_no_view_of_the_project…`, `test_uc20_last_owner_protection_holds_sequentially_and_under_concurrency…`.
- Database: `test_uc20_role_escalation_and_last_owner_are_blocked_in_the_database`, `test_uc18_members_cannot_reassign_or_change_hours_directly`, `test_se_nfr11_child_rows_cannot_be_attached_to_another_projects_task`.

## Open points for sign-off

- Managers can remove other managers and members but not owners. Confirm.
- Members see teammates' email addresses on the People page. Confirm, or restrict to owners and managers.
- A finished task keeps its assignee after that person is removed, so reports stay correct.
