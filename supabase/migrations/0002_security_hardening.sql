-- =============================================================================
-- @author: eLeet Coderz (Team 3) - security review; table owners noted inline
-- @description: Closes the gaps found in the pre-release security audit for
--   anyone who talks to the database directly (Supabase client / PostgREST)
--   instead of through the Python API, and adds the indexes the audit asked for.
--   In plain words:
--     * a manager can no longer make themselves an owner, and a project can
--       never be left with zero owners, even if two requests race;
--     * a comment, soft deadline or time entry always belongs to the same
--       project as its task (it cannot be attached to another project's task);
--     * password hashes, 2FA secrets and lockout counters cannot be read or
--       changed by client roles, only the profile fields a user may edit;
--     * the two JSON preference columns accept only their known true/false keys;
--     * only one timer can run per person, and a time entry cannot end before
--       it starts.
--   The script is idempotent: running it twice changes nothing.
-- @traces: SE-FR-04, SE-FR-11, SE-FR-26, SE-FR-28, SE-FR-29, SE-FR-30,
--   SE-NFR-02, SE-NFR-06, SE-NFR-08, SE-NFR-09, SE-NFR-11,
--   UC-04, UC-10, UC-11, UC-13, UC-18, UC-19, UC-20, UC-21
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Who is calling?  (SE-NFR-11)
--    The "app.current_user_id" setting is a convenience for trusted server
--    connections and tests. Supabase client roles must never be able to use it
--    to pretend to be someone else, so it is ignored for them. The check reads
--    the session's SET ROLE value, which stays the same inside SECURITY DEFINER
--    functions (current_user does not).
-- ---------------------------------------------------------------------------
create or replace function public.app_current_user_id() returns uuid
language plpgsql stable as $$
declare
  uid uuid;
  active_role text := coalesce(nullif(current_setting('role', true), ''), 'none');
begin
  begin
    execute 'select auth.uid()' into uid;
  exception when others then
    uid := null;
  end;
  if uid is null
     and active_role not in ('anon', 'authenticated')
     and session_user not in ('anon', 'authenticated', 'authenticator') then
    begin
      uid := nullif(current_setting('app.current_user_id', true), '')::uuid;
    exception when others then
      uid := null;  -- not a UUID: treat as "nobody"
    end;
  end if;
  return uid;
end;
$$;

-- True while a freshly created project has no members yet and the caller is its
-- creator: the one moment a user may add themselves (as owner) without already
-- being an owner or manager. SECURITY DEFINER so it can count rows RLS hides.
create or replace function public.app_can_bootstrap_owner(p_project_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from public.projects p
           where p.id = p_project_id and p.created_by = public.app_current_user_id()
         )
     and not exists (select 1 from public.project_members m where m.project_id = p_project_id)
$$;

-- ---------------------------------------------------------------------------
-- 2. user_profiles (Tyler Gaines: SE-FR-11, SE-FR-12, SE-NFR-06, UC-10, UC-11)
--    Client roles may read and edit only harmless profile columns of their own
--    row. The first migration tried to hide credential columns with a
--    column-level REVOKE, which has no effect while the role still holds the
--    table-level privilege (Supabase grants that by default). Here the
--    table-level privileges are removed and only safe columns are granted back.
-- ---------------------------------------------------------------------------
drop policy if exists user_profiles_self on public.user_profiles;
drop policy if exists user_profiles_select_self on public.user_profiles;
create policy user_profiles_select_self on public.user_profiles
  for select using (id = public.app_current_user_id());
drop policy if exists user_profiles_update_self on public.user_profiles;
create policy user_profiles_update_self on public.user_profiles
  for update using (id = public.app_current_user_id()) with check (id = public.app_current_user_id());
-- No INSERT or DELETE policy: accounts are created and removed by the server only.

do $$
declare
  client_role text;
begin
  foreach client_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = client_role) then
      execute format('revoke all on public.user_profiles from %I', client_role);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    -- Never granted: password_hash, mfa_secret, unlock_token_jti, reset_token_jti,
    -- failed_login_attempts, locked_until, mfa_enabled (changing 2FA needs a code).
    grant select (id, username, email, display_name, avatar_url, mfa_enabled, theme, color_blind_mode,
                  default_project_type, notification_prefs, connected_accounts, created_at, updated_at)
      on public.user_profiles to authenticated;
    grant update (username, display_name, avatar_url, theme, color_blind_mode, default_project_type,
                  notification_prefs, connected_accounts)
      on public.user_profiles to authenticated;
  end if;
end;
$$;

-- The two JSON preference columns (SE-FR-29, SE-FR-19, SE-FR-20) accept only
-- their known keys with true / false values, so they cannot be used to store
-- arbitrary or oversized data, whichever path writes them.
create or replace function public.app_valid_notification_prefs(prefs jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(prefs) = 'object'
     and (prefs - array['task_assignments', 'mentions', 'deadline_reminders', 'project_updates']) = '{}'::jsonb
     and coalesce(jsonb_typeof(prefs -> 'task_assignments'), 'boolean') = 'boolean'
     and coalesce(jsonb_typeof(prefs -> 'mentions'), 'boolean') = 'boolean'
     and coalesce(jsonb_typeof(prefs -> 'deadline_reminders'), 'boolean') = 'boolean'
     and coalesce(jsonb_typeof(prefs -> 'project_updates'), 'boolean') = 'boolean'
$$;

create or replace function public.app_valid_connected_account(account jsonb) returns boolean
language sql immutable as $$
  select account is null
      or (jsonb_typeof(account) = 'object'
          and (account - array['connected', 'connected_at']) = '{}'::jsonb
          and jsonb_typeof(account -> 'connected') = 'boolean'
          and coalesce(jsonb_typeof(account -> 'connected_at'), 'null') in ('null', 'string')
          and char_length(coalesce(account ->> 'connected_at', '')) <= 40)
$$;

create or replace function public.app_valid_connected_accounts(accounts jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(accounts) = 'object'
     and (accounts - array['google_calendar', 'outlook', 'google_sheets']) = '{}'::jsonb
     and public.app_valid_connected_account(accounts -> 'google_calendar')
     and public.app_valid_connected_account(accounts -> 'outlook')
     and public.app_valid_connected_account(accounts -> 'google_sheets')
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_user_profiles_notification_prefs_shape') then
    alter table public.user_profiles add constraint ck_user_profiles_notification_prefs_shape
      check (public.app_valid_notification_prefs(notification_prefs));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_user_profiles_connected_accounts_shape') then
    alter table public.user_profiles add constraint ck_user_profiles_connected_accounts_shape
      check (public.app_valid_connected_accounts(connected_accounts));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. projects (Saaqib Shaik: UC-12). The creator may read the row they just
--    inserted until its first membership exists; after that, members only.
-- ---------------------------------------------------------------------------
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select using (public.app_project_role(id) is not null or public.app_can_bootstrap_owner(id));
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update using (public.app_project_role(id) in ('owner', 'manager'))
  with check (public.app_project_role(id) in ('owner', 'manager'));

-- ---------------------------------------------------------------------------
-- 4. project_members (Aashwat Singh: UC-19, UC-20, SE-FR-30; Saaqib: UC-13)
--    One trigger carries the rules of the permission matrix for direct access
--    and the "at least one owner" rule for everyone:
--      * only owners grant or revoke the owner role (a manager cannot promote
--        themselves or demote / remove an owner);
--      * members may change only their own card colour and order (UC-13), or
--        leave the project;
--      * a membership cannot be moved to another project or person;
--      * the last owner can never be demoted or removed.
--    Each change first locks the project row, so two requests for the same
--    project run one after the other and both see the true owner count.
-- ---------------------------------------------------------------------------
create or replace function public.guard_project_members() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := public.app_current_user_id();
  caller_role text;
  pid uuid;
  remaining integer;
begin
  if tg_op = 'DELETE' then pid := old.project_id; else pid := new.project_id; end if;

  perform 1 from public.projects where id = pid for update;
  if not found then
    -- The project itself is being deleted (ON DELETE CASCADE): nothing left to protect.
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'Project not found' using errcode = '23503';
  end if;

  if tg_op = 'UPDATE' and (new.project_id <> old.project_id or new.user_id <> old.user_id) then
    raise exception 'A membership cannot be moved to another project or person' using errcode = '42501';
  end if;

  -- Permission matrix for direct client access. The Python API connects as a
  -- server role (caller is null) and enforces the same matrix before it writes.
  if caller is not null then
    select role into caller_role from public.project_members where project_id = pid and user_id = caller;
    if tg_op = 'INSERT' then
      if caller_role is null then
        if not (new.user_id = caller and new.role = 'owner' and public.app_can_bootstrap_owner(pid)) then
          raise exception 'Access denied' using errcode = '42501';
        end if;
      elsif caller_role not in ('owner', 'manager') then
        raise exception 'Access denied' using errcode = '42501';
      elsif new.role = 'owner' and caller_role <> 'owner' then
        raise exception 'Only an owner can grant or remove the owner role' using errcode = '42501';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.role is distinct from old.role then
        if caller_role is null or caller_role not in ('owner', 'manager') then
          raise exception 'Access denied' using errcode = '42501';
        end if;
        if (old.role = 'owner' or new.role = 'owner') and caller_role <> 'owner' then
          raise exception 'Only an owner can grant or remove the owner role' using errcode = '42501';
        end if;
      elsif old.user_id <> caller then
        raise exception 'Card colour and order can only be changed by the member they belong to' using errcode = '42501';
      end if;
    else
      if old.user_id <> caller then
        if caller_role is null or caller_role not in ('owner', 'manager') then
          raise exception 'Access denied' using errcode = '42501';
        end if;
        if old.role = 'owner' and caller_role <> 'owner' then
          raise exception 'Only an owner can grant or remove the owner role' using errcode = '42501';
        end if;
      end if;
    end if;
  end if;

  -- UC-20: applies to every writer, including the server.
  if (tg_op = 'DELETE' and old.role = 'owner')
     or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    select count(*) into remaining
      from public.project_members
     where project_id = pid and role = 'owner' and id <> old.id;
    if remaining = 0 then
      raise exception 'Project must have at least one owner' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_project_members on public.project_members;
create trigger trg_guard_project_members
  before insert or update or delete on public.project_members
  for each row execute function public.guard_project_members();

drop policy if exists project_members_write on public.project_members;
drop policy if exists project_members_insert on public.project_members;
create policy project_members_insert on public.project_members
  for insert with check (
    public.app_project_role(project_id) in ('owner', 'manager')
    or public.app_can_bootstrap_owner(project_id)
  );
drop policy if exists project_members_update on public.project_members;
create policy project_members_update on public.project_members
  for update using (
    public.app_project_role(project_id) in ('owner', 'manager') or user_id = public.app_current_user_id()
  ) with check (
    public.app_project_role(project_id) in ('owner', 'manager') or user_id = public.app_current_user_id()
  );
drop policy if exists project_members_delete on public.project_members;
create policy project_members_delete on public.project_members
  for delete using (
    public.app_project_role(project_id) in ('owner', 'manager') or user_id = public.app_current_user_id()
  );

-- ---------------------------------------------------------------------------
-- 5. tasks (Aashwat Singh: UC-18, SE-FR-26, SE-NFR-11)
--    * a task never changes project;
--    * its assignee must be a member of its project, its list must be a list
--      of its project;
--    * its final due date stays later than all of its soft deadlines;
--    * a member (not owner / manager) may edit their own task but can never
--      reassign it or change its estimated / assigned hours.
-- ---------------------------------------------------------------------------
create or replace function public.guard_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := public.app_current_user_id();
  caller_role text;
begin
  if tg_op = 'UPDATE' and new.project_id <> old.project_id then
    raise exception 'A task cannot be moved to another project' using errcode = '42501';
  end if;
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not exists (select 1 from public.project_members
                      where project_id = new.project_id and user_id = new.assignee_id) then
    raise exception 'Assignee must be a member of this project' using errcode = '23514';
  end if;
  if new.list_id is not null
     and (tg_op = 'INSERT' or new.list_id is distinct from old.list_id)
     and not exists (select 1 from public.task_lists where id = new.list_id and project_id = new.project_id) then
    raise exception 'That list does not belong to this project' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.due_date is distinct from old.due_date
     and exists (select 1 from public.soft_deadlines where task_id = new.id and due_at >= new.due_date) then
    raise exception 'The final due date must be later than all of this task''s soft deadlines' using errcode = '23514';
  end if;
  if caller is not null and tg_op = 'UPDATE' then
    select role into caller_role from public.project_members where project_id = new.project_id and user_id = caller;
    if caller_role is null or caller_role not in ('owner', 'manager') then
      if new.assignee_id is distinct from old.assignee_id
         or new.estimated_hours is distinct from old.estimated_hours
         or new.assigned_hours is distinct from old.assigned_hours
         or new.created_by is distinct from old.created_by then
        raise exception 'Only owners and managers can assign tasks or set estimated and assigned hours'
          using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_tasks on public.tasks;
create trigger trg_guard_tasks
  before insert or update on public.tasks
  for each row execute function public.guard_tasks();

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update using (
    public.app_project_role(project_id) in ('owner', 'manager')
    or (public.app_project_role(project_id) = 'member' and assignee_id = public.app_current_user_id())
  ) with check (
    public.app_project_role(project_id) in ('owner', 'manager')
    or (public.app_project_role(project_id) = 'member' and assignee_id = public.app_current_user_id())
  );

-- ---------------------------------------------------------------------------
-- 6. Rows that hang off a task: soft_deadlines, comments, time_entries.
--    Each carries a copy of the project id (for fast policies and reports).
--    The copy is now always taken from the task, never from the client, so a
--    row can never claim one project while pointing at another project's task
--    (cross-project write, SE-NFR-11).
-- ---------------------------------------------------------------------------
create or replace function public.sync_project_from_task() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  task_project uuid;
begin
  select project_id into task_project from public.tasks where id = new.task_id;
  if task_project is null then
    raise exception 'Task not found' using errcode = '23503';
  end if;
  new.project_id := task_project;
  return new;
end;
$$;

drop trigger if exists trg_soft_deadlines_project on public.soft_deadlines;
create trigger trg_soft_deadlines_project
  before insert or update of task_id, project_id on public.soft_deadlines
  for each row execute function public.sync_project_from_task();
drop trigger if exists trg_comments_project on public.comments;
create trigger trg_comments_project
  before insert or update of task_id, project_id on public.comments
  for each row execute function public.sync_project_from_task();
drop trigger if exists trg_time_entries_project on public.time_entries;
create trigger trg_time_entries_project
  before insert or update of task_id, project_id on public.time_entries
  for each row execute function public.sync_project_from_task();

-- soft_deadlines (Preethi Seereddy: UC-05..UC-07): managers, or the task's
-- assignee while they are still a member. WITH CHECK covers the new row too.
drop policy if exists soft_deadlines_write on public.soft_deadlines;
create policy soft_deadlines_write on public.soft_deadlines
  for all using (
    public.app_project_role(project_id) in ('owner', 'manager')
    or (public.app_project_role(project_id) = 'member'
        and exists (select 1 from public.tasks t
                     where t.id = task_id and t.assignee_id = public.app_current_user_id()))
  ) with check (
    public.app_project_role(project_id) in ('owner', 'manager')
    or (public.app_project_role(project_id) = 'member'
        and exists (select 1 from public.tasks t
                     where t.id = task_id and t.assignee_id = public.app_current_user_id()))
  );

-- comments (Aashwat Singh: UC-21): an author who has left the project can no
-- longer delete (or otherwise touch) that project's discussion.
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete using (
    public.app_project_role(project_id) in ('owner', 'manager')
    or (author_id = public.app_current_user_id() and public.app_project_role(project_id) is not null)
  );

-- time_entries (Jon Sorey: UC-03, UC-04): own rows while still a member;
-- owners / managers see and may delete the whole project's rows.
drop policy if exists time_entries_select on public.time_entries;
create policy time_entries_select on public.time_entries
  for select using (
    public.app_project_role(project_id) in ('owner', 'manager')
    or (user_id = public.app_current_user_id() and public.app_project_role(project_id) is not null)
  );
drop policy if exists time_entries_write_own on public.time_entries;
drop policy if exists time_entries_insert on public.time_entries;
create policy time_entries_insert on public.time_entries
  for insert with check (user_id = public.app_current_user_id() and public.app_project_role(project_id) is not null);
drop policy if exists time_entries_update on public.time_entries;
create policy time_entries_update on public.time_entries
  for update using (user_id = public.app_current_user_id() and public.app_project_role(project_id) is not null)
  with check (user_id = public.app_current_user_id() and public.app_project_role(project_id) is not null);
drop policy if exists time_entries_delete on public.time_entries;
create policy time_entries_delete on public.time_entries
  for delete using (
    public.app_project_role(project_id) in ('owner', 'manager')
    or (user_id = public.app_current_user_id() and public.app_project_role(project_id) is not null)
  );

-- UC-04: a time entry never ends before it starts, and one person has at most
-- one running timer (the second simultaneous "start" fails on this index).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_time_entries_end_after_start') then
    alter table public.time_entries add constraint ck_time_entries_end_after_start
      check (ended_at is null or ended_at >= started_at);
  end if;
end;
$$;
create unique index if not exists uq_time_entries_one_running_per_user
  on public.time_entries (user_id) where ended_at is null;

-- ---------------------------------------------------------------------------
-- 7. expenses (Jon Sorey: UC-01): an expense can only point at a stage of its
--    own project.
-- ---------------------------------------------------------------------------
create or replace function public.guard_expense_stage() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.project_id <> old.project_id then
    raise exception 'An expense cannot be moved to another project' using errcode = '42501';
  end if;
  if new.stage_cost_id is not null
     and not exists (select 1 from public.stage_costs where id = new.stage_cost_id and project_id = new.project_id) then
    raise exception 'That stage does not belong to this project' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_expense_stage on public.expenses;
create trigger trg_guard_expense_stage
  before insert or update of stage_cost_id, project_id on public.expenses
  for each row execute function public.guard_expense_stage();

-- ---------------------------------------------------------------------------
-- 8. notifications (Aashwat Singh: UC-22): users read, mark read and clear
--    their own; only the server creates them.
-- ---------------------------------------------------------------------------
drop policy if exists notifications_self on public.notifications;
drop policy if exists notifications_select_self on public.notifications;
create policy notifications_select_self on public.notifications
  for select using (user_id = public.app_current_user_id());
drop policy if exists notifications_update_self on public.notifications;
create policy notifications_update_self on public.notifications
  for update using (user_id = public.app_current_user_id()) with check (user_id = public.app_current_user_id());
drop policy if exists notifications_delete_self on public.notifications;
create policy notifications_delete_self on public.notifications
  for delete using (user_id = public.app_current_user_id());

-- ---------------------------------------------------------------------------
-- 9. Indexes for the hot filters and sorts (SE-NFR-08, SE-NFR-09).
--    Already present from 0001 and unchanged:
--      project_members (project_id, user_id) UNIQUE   -> every permission check, O(log M)
--      project_members (user_id)                      -> "my projects"
--      soft_deadlines  (task_id, due_at)              -> a task's soft deadlines in date order
--      time_entries    (project_id, user_id, started_at) -> hour reports per person and period
-- ---------------------------------------------------------------------------
-- Feature lists and per-list progress: WHERE project_id = ? [AND list_id = ?] ORDER BY position.
create index if not exists ix_tasks_project_list_position on public.tasks (project_id, list_id, position);
-- "My tasks", reminders, dashboard: WHERE assignee_id = ? AND status <> 'done' ORDER BY due_date.
-- (Replaces the single-column assignee index; the assignee column still leads.)
create index if not exists ix_tasks_assignee_status_due on public.tasks (assignee_id, status, due_date);
drop index if exists public.ix_tasks_assignee;
-- Cost table: default date order, and date + category filters, in one index.
create index if not exists ix_expenses_project_date_category on public.expenses (project_id, expense_date, category);
drop index if exists public.ix_expenses_project_date;
create index if not exists ix_expenses_stage on public.expenses (stage_cost_id);
-- Notification bell and list: newest first, optionally unread only.
drop index if exists public.ix_notifications_user_read_created;
create index ix_notifications_user_read_created on public.notifications (user_id, is_read, created_at desc);
create index if not exists ix_notifications_user_created on public.notifications (user_id, created_at desc);
-- Foreign keys that cascade when a task or project is deleted.
create index if not exists ix_notifications_task on public.notifications (task_id);
create index if not exists ix_notifications_project on public.notifications (project_id);
create index if not exists ix_comments_project on public.comments (project_id);
