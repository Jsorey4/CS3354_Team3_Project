-- =============================================================================
-- @author: eLeet Coderz (Team 3) - schema owners per table noted inline
-- @description: Creates every ProjectForge table in PostgreSQL / Supabase, the
--   indexes that keep lookups logarithmic, and Row-Level Security policies so a
--   user can only ever read rows of projects they belong to, even if someone
--   bypasses the Python API and talks to the database directly.
-- @traces: SE-FR-01..SE-FR-30, SE-NFR-01, SE-NFR-02, SE-NFR-09, UC-01..UC-22
--
-- Security notes
--   * There are deliberately NO tables named "Login Page", "Sidebar",
--     "templates" or "pages" (the prototype schema stored credentials in UI
--     tables, CWE-256). Password hashes and TOTP secrets live only on
--     user_profiles and are never exposed through RLS to other users.
--   * The FastAPI backend connects with the service role (which bypasses RLS)
--     and enforces the RBAC matrix itself. RLS is defence in depth for direct
--     PostgREST / Supabase client access. Policies resolve the caller from
--     auth.uid() when Supabase Auth is used, or from the
--     "app.current_user_id" setting for other connections.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helper: id of the calling user for RLS
-- ---------------------------------------------------------------------------
create or replace function public.app_current_user_id() returns uuid
language plpgsql stable as $$
declare
  uid uuid;
begin
  begin
    execute 'select auth.uid()' into uid;
  exception when others then
    uid := null;
  end;
  if uid is null then
    uid := nullif(current_setting('app.current_user_id', true), '')::uuid;
  end if;
  return uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. user_profiles (Tyler Gaines: UC-08..UC-11, SE-FR-11..SE-FR-15)
-- ---------------------------------------------------------------------------
create table if not exists public.user_profiles (
  id                     uuid primary key default gen_random_uuid(),
  username               varchar(30)  not null,
  email                  varchar(254) not null,
  display_name           varchar(80)  not null default '',
  avatar_url             varchar(500),
  password_hash          varchar(255) not null,
  mfa_enabled            boolean      not null default false,
  mfa_secret             varchar(64),
  failed_login_attempts  integer      not null default 0,
  locked_until           timestamptz,
  unlock_token_jti       varchar(64),
  reset_token_jti        varchar(64),
  theme                  varchar(10)  not null default 'dark'
                         check (theme in ('light', 'dark')),
  color_blind_mode       varchar(20)  not null default 'none'
                         check (color_blind_mode in ('none', 'protanopia', 'deuteranopia', 'tritanopia', 'high_contrast')),
  default_project_type   varchar(10)  not null default 'work'
                         check (default_project_type in ('work', 'school', 'personal')),
  -- SE-FR-29: which notification kinds this user receives (Settings > Notification preferences).
  notification_prefs     jsonb        not null default
                         '{"task_assignments": true, "mentions": true, "deadline_reminders": true, "project_updates": false}'::jsonb
                         check (jsonb_typeof(notification_prefs) = 'object'),
  -- SE-FR-19 / SE-FR-20: export targets the user has connected, e.g.
  -- {"google_calendar": {"connected": true, "connected_at": "2026-11-14T10:00:00"}}. No OAuth tokens are stored here.
  connected_accounts     jsonb        not null default '{}'::jsonb
                         check (jsonb_typeof(connected_accounts) = 'object'),
  created_at             timestamptz  not null default now(),
  updated_at             timestamptz  not null default now(),
  constraint uq_user_profiles_username unique (username),
  constraint uq_user_profiles_email unique (email),
  constraint ck_user_profiles_username_len check (char_length(username) between 3 and 30),
  constraint ck_user_profiles_failed_attempts check (failed_login_attempts >= 0)
);

-- Case-insensitive lookups for login and the single-query bulk member check (SE-NFR-09).
create index if not exists ix_user_profiles_username_lower on public.user_profiles (lower(username));
create index if not exists ix_user_profiles_email_lower on public.user_profiles (lower(email));

-- ---------------------------------------------------------------------------
-- 2. projects (Saaqib Shaik: UC-12, SE-FR-16)
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  name          varchar(120) not null,
  description   text         not null default '',
  status        varchar(20)  not null default 'active'
                check (status in ('planning', 'active', 'on_hold', 'completed', 'archived')),
  project_type  varchar(10)  not null default 'work'
                check (project_type in ('work', 'school', 'personal')),
  deadline      timestamptz  not null,
  created_by    uuid references public.user_profiles(id) on delete set null,
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. project_members (Aashwat Singh: UC-19, UC-20, SE-FR-30; Saaqib: UC-13)
-- ---------------------------------------------------------------------------
create table if not exists public.project_members (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references public.user_profiles(id) on delete cascade,
  role        varchar(10) not null default 'member'
              check (role in ('owner', 'manager', 'member')),
  card_color  varchar(7)  not null default '#6366F1'
              check (card_color ~ '^#[0-9A-Fa-f]{6}$'),
  card_order  integer     not null default 0,
  joined_at   timestamptz not null default now(),
  -- Composite B-tree index: require_project_role() is an O(log M) lookup.
  constraint uq_project_members_project_user unique (project_id, user_id)
);
create index if not exists ix_project_members_user on public.project_members (user_id);
create index if not exists ix_project_members_project_role on public.project_members (project_id, role);

-- ---------------------------------------------------------------------------
-- 4. task_lists (Aashwat Singh: SE-FR-26; Saaqib: SE-FR-18 feature progress)
-- ---------------------------------------------------------------------------
create table if not exists public.task_lists (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  name        varchar(80) not null,
  position    integer     not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists ix_task_lists_project_position on public.task_lists (project_id, position);

-- ---------------------------------------------------------------------------
-- 5. tasks (Aashwat Singh: UC-18, SE-FR-26, SE-FR-27; Jon: SE-FR-04 hours)
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  list_id          uuid references public.task_lists(id) on delete set null,
  title            varchar(200) not null,
  description      text         not null default '',
  status           varchar(20)  not null default 'todo'
                   check (status in ('todo', 'in_progress', 'review', 'done')),
  priority         varchar(10)  not null default 'medium'
                   check (priority in ('low', 'medium', 'high', 'urgent')),
  assignee_id      uuid references public.user_profiles(id) on delete set null,
  due_date         timestamptz  not null,  -- UC-18: title and due date are required
  position         integer      not null default 0,
  tags             jsonb        not null default '[]'::jsonb,
  estimated_hours  numeric(8, 2) check (estimated_hours is null or estimated_hours >= 0),
  assigned_hours   numeric(8, 2) check (assigned_hours is null or assigned_hours >= 0),
  completed_at     timestamptz,
  created_by       uuid references public.user_profiles(id) on delete set null,
  created_at       timestamptz  not null default now(),
  updated_at       timestamptz  not null default now()
);
create index if not exists ix_tasks_project_status_position on public.tasks (project_id, status, position);
create index if not exists ix_tasks_assignee on public.tasks (assignee_id);
create index if not exists ix_tasks_project_due on public.tasks (project_id, due_date);
create index if not exists ix_tasks_list on public.tasks (list_id);

-- ---------------------------------------------------------------------------
-- 6. soft_deadlines (Preethi Seereddy: UC-05..UC-07, SE-FR-06..SE-FR-10, SE-NFR-03)
-- ---------------------------------------------------------------------------
create table if not exists public.soft_deadlines (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  project_id    uuid not null references public.projects(id) on delete cascade,
  title         varchar(120) not null,
  due_at        timestamptz  not null,
  priority      varchar(10)  not null default 'medium'
                check (priority in ('high', 'medium', 'low')),          -- SE-FR-09
  is_completed  boolean      not null default false,
  completed_at  timestamptz,
  created_by    uuid references public.user_profiles(id) on delete set null,
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now()
);
create index if not exists ix_soft_deadlines_project_due on public.soft_deadlines (project_id, due_at);
create index if not exists ix_soft_deadlines_task_due on public.soft_deadlines (task_id, due_at);

-- Database-level guarantee of SE-FR-06: soft deadline strictly before final due date.
create or replace function public.enforce_soft_deadline_before_due() returns trigger
language plpgsql as $$
declare
  final_due timestamptz;
begin
  select due_date into final_due from public.tasks where id = new.task_id;
  if final_due is null then
    raise exception 'Task must have a final due date before adding soft deadlines.';
  end if;
  if new.due_at >= final_due then
    raise exception 'Soft deadline must be earlier than the task''s final due date.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_soft_deadline_before_due on public.soft_deadlines;
create trigger trg_soft_deadline_before_due
  before insert or update of due_at, task_id on public.soft_deadlines
  for each row execute function public.enforce_soft_deadline_before_due();

-- ---------------------------------------------------------------------------
-- 7. comments (Aashwat Singh: UC-21, SE-FR-28)
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  author_id   uuid references public.user_profiles(id) on delete set null,
  body        text not null check (char_length(btrim(body)) > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists ix_comments_task_created on public.comments (task_id, created_at);

-- ---------------------------------------------------------------------------
-- 8. notifications (Aashwat Singh: UC-22, SE-FR-29)
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.user_profiles(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete cascade,
  task_id     uuid references public.tasks(id) on delete cascade,
  kind        varchar(30)  not null
              check (kind in ('mention', 'assignment', 'role_change', 'member_added', 'member_removed',
                              'deadline_reminder', 'soft_deadline_reminder', 'task_reassigned', 'project_update',
                              'system')),
  message     varchar(500) not null,
  link        varchar(300) not null default '',
  is_read     boolean      not null default false,
  dedupe_key  varchar(200),
  created_at  timestamptz  not null default now(),
  constraint uq_notifications_user_dedupe unique (user_id, dedupe_key)
);
create index if not exists ix_notifications_user_read_created on public.notifications (user_id, is_read, created_at);

-- ---------------------------------------------------------------------------
-- 9. dashboard_widgets (Myoram Langwang: UC-16, UC-17, SE-FR-21..SE-FR-25)
-- ---------------------------------------------------------------------------
create table if not exists public.dashboard_widgets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.user_profiles(id) on delete cascade,
  widget_type  varchar(40) not null,
  grid_x       integer not null default 0 check (grid_x >= 0),
  grid_y       integer not null default 0 check (grid_y >= 0),
  width        integer not null default 4 check (width between 1 and 12),
  height       integer not null default 2 check (height between 1 and 12),
  is_hidden    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint uq_dashboard_widgets_user_type unique (user_id, widget_type)
);

-- ---------------------------------------------------------------------------
-- 10. project_financials - bid and budget (Jon Sorey: UC-01, SE-FR-01)
-- ---------------------------------------------------------------------------
create table if not exists public.project_financials (
  project_id     uuid primary key references public.projects(id) on delete cascade,
  bid_amount     numeric(12, 2) not null default 0 check (bid_amount >= 0),
  budget_amount  numeric(12, 2) not null default 0 check (budget_amount >= 0),
  currency       varchar(3)     not null default 'USD',
  updated_by     uuid references public.user_profiles(id) on delete set null,
  updated_at     timestamptz    not null default now()
);

-- ---------------------------------------------------------------------------
-- 11. stage_costs (Jon Sorey: UC-01, SE-FR-02, SE-NFR-01)
-- ---------------------------------------------------------------------------
create table if not exists public.stage_costs (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  stage_name  varchar(80)    not null,
  amount      numeric(12, 2) not null default 0 check (amount >= 0),
  position    integer        not null default 0,
  notes       text           not null default '',
  created_at  timestamptz    not null default now(),
  updated_at  timestamptz    not null default now()
);
create index if not exists ix_stage_costs_project_position on public.stage_costs (project_id, position);

-- ---------------------------------------------------------------------------
-- 12. expenses (Jon Sorey: UC-01, SE-FR-03)
-- ---------------------------------------------------------------------------
create table if not exists public.expenses (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  stage_cost_id  uuid references public.stage_costs(id) on delete set null,
  category       varchar(30)    not null
                 check (category in ('labor', 'materials', 'software', 'equipment', 'travel', 'services', 'other')),
  description    varchar(300)   not null,
  amount         numeric(12, 2) not null check (amount >= 0),
  expense_date   date           not null,
  created_by     uuid references public.user_profiles(id) on delete set null,
  created_at     timestamptz    not null default now(),
  updated_at     timestamptz    not null default now()
);
-- O(log N + K) filtered / sorted reads.
create index if not exists ix_expenses_project_date on public.expenses (project_id, expense_date);
create index if not exists ix_expenses_project_category on public.expenses (project_id, category);
create index if not exists ix_expenses_project_amount on public.expenses (project_id, amount);

-- ---------------------------------------------------------------------------
-- 13. time_entries (Jon Sorey: UC-03, UC-04, SE-FR-04, SE-FR-05)
-- ---------------------------------------------------------------------------
create table if not exists public.time_entries (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  task_id           uuid not null references public.tasks(id) on delete cascade,
  user_id           uuid not null references public.user_profiles(id) on delete cascade,
  source            varchar(10)  not null default 'timer' check (source in ('timer', 'manual')),
  started_at        timestamptz  not null,
  ended_at          timestamptz,
  paused_seconds    integer      not null default 0 check (paused_seconds >= 0),
  pause_started_at  timestamptz,
  duration_hours    numeric(8, 2) check (duration_hours is null or duration_hours >= 0),
  note              varchar(300) not null default '',
  created_at        timestamptz  not null default now()
);
create index if not exists ix_time_entries_project_user_started on public.time_entries (project_id, user_id, started_at);
create index if not exists ix_time_entries_user_ended on public.time_entries (user_id, ended_at);
create index if not exists ix_time_entries_task on public.time_entries (task_id);

-- =============================================================================
-- Row-Level Security
-- =============================================================================
create or replace function public.app_project_role(p_project_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.project_members
  where project_id = p_project_id and user_id = public.app_current_user_id()
$$;

alter table public.user_profiles      enable row level security;
alter table public.projects           enable row level security;
alter table public.project_members    enable row level security;
alter table public.task_lists         enable row level security;
alter table public.tasks              enable row level security;
alter table public.soft_deadlines     enable row level security;
alter table public.comments           enable row level security;
alter table public.notifications      enable row level security;
alter table public.dashboard_widgets  enable row level security;
alter table public.project_financials enable row level security;
alter table public.stage_costs        enable row level security;
alter table public.expenses           enable row level security;
alter table public.time_entries       enable row level security;

-- user_profiles: a user can see and edit only their own row. Credentials columns
-- are additionally revoked from the client roles below.
drop policy if exists user_profiles_self on public.user_profiles;
create policy user_profiles_self on public.user_profiles
  for all using (id = public.app_current_user_id()) with check (id = public.app_current_user_id());

-- projects: visible to members; editable by owner/manager; deletable by owner.
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select using (public.app_project_role(id) is not null);
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update using (public.app_project_role(id) in ('owner', 'manager'));
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete using (public.app_project_role(id) = 'owner');
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert with check (created_by = public.app_current_user_id());

-- project_members: visible to co-members; managed by owner/manager.
drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members
  for select using (public.app_project_role(project_id) is not null);
drop policy if exists project_members_write on public.project_members;
create policy project_members_write on public.project_members
  for all using (public.app_project_role(project_id) in ('owner', 'manager'))
  with check (public.app_project_role(project_id) in ('owner', 'manager'));

-- Generic "members can read, managers can write" project-scoped tables.
drop policy if exists task_lists_select on public.task_lists;
create policy task_lists_select on public.task_lists
  for select using (public.app_project_role(project_id) is not null);
drop policy if exists task_lists_write on public.task_lists;
create policy task_lists_write on public.task_lists
  for all using (public.app_project_role(project_id) in ('owner', 'manager'))
  with check (public.app_project_role(project_id) in ('owner', 'manager'));

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select using (public.app_project_role(project_id) is not null);
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert with check (public.app_project_role(project_id) in ('owner', 'manager'));
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update using (
    public.app_project_role(project_id) in ('owner', 'manager')
    or (public.app_project_role(project_id) = 'member' and assignee_id = public.app_current_user_id())
  );
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete using (public.app_project_role(project_id) in ('owner', 'manager'));

drop policy if exists soft_deadlines_select on public.soft_deadlines;
create policy soft_deadlines_select on public.soft_deadlines
  for select using (public.app_project_role(project_id) is not null);
drop policy if exists soft_deadlines_write on public.soft_deadlines;
create policy soft_deadlines_write on public.soft_deadlines
  for all using (
    public.app_project_role(project_id) in ('owner', 'manager')
    or exists (select 1 from public.tasks t where t.id = task_id and t.assignee_id = public.app_current_user_id())
  );

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select using (public.app_project_role(project_id) is not null);
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert with check (public.app_project_role(project_id) is not null and author_id = public.app_current_user_id());
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete using (author_id = public.app_current_user_id() or public.app_project_role(project_id) in ('owner', 'manager'));

drop policy if exists notifications_self on public.notifications;
create policy notifications_self on public.notifications
  for all using (user_id = public.app_current_user_id()) with check (user_id = public.app_current_user_id());

drop policy if exists dashboard_widgets_self on public.dashboard_widgets;
create policy dashboard_widgets_self on public.dashboard_widgets
  for all using (user_id = public.app_current_user_id()) with check (user_id = public.app_current_user_id());

-- Financial tables: owner / manager ONLY (UC-01, SE-NFR-02). Members see zero rows.
drop policy if exists project_financials_managers on public.project_financials;
create policy project_financials_managers on public.project_financials
  for all using (public.app_project_role(project_id) in ('owner', 'manager'))
  with check (public.app_project_role(project_id) in ('owner', 'manager'));
drop policy if exists stage_costs_managers on public.stage_costs;
create policy stage_costs_managers on public.stage_costs
  for all using (public.app_project_role(project_id) in ('owner', 'manager'))
  with check (public.app_project_role(project_id) in ('owner', 'manager'));
drop policy if exists expenses_managers on public.expenses;
create policy expenses_managers on public.expenses
  for all using (public.app_project_role(project_id) in ('owner', 'manager'))
  with check (public.app_project_role(project_id) in ('owner', 'manager'));

-- time_entries: owner/manager see the whole project; members see only their own rows.
drop policy if exists time_entries_select on public.time_entries;
create policy time_entries_select on public.time_entries
  for select using (
    user_id = public.app_current_user_id()
    or public.app_project_role(project_id) in ('owner', 'manager')
  );
drop policy if exists time_entries_write_own on public.time_entries;
create policy time_entries_write_own on public.time_entries
  for all using (user_id = public.app_current_user_id())
  with check (user_id = public.app_current_user_id() and public.app_project_role(project_id) is not null);

-- Never let Supabase client roles read credential columns directly.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke select (password_hash, mfa_secret, unlock_token_jti, reset_token_jti) on public.user_profiles from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke select (password_hash, mfa_secret, unlock_token_jti, reset_token_jti) on public.user_profiles from authenticated;
  end if;
end;
$$;
