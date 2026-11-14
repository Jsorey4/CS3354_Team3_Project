-- =============================================================================
-- @author: eLeet Coderz (Team 3) - demo scenario: Jon Sorey
-- @description: Optional demo data for a Supabase / PostgreSQL database (run after
--   0001_initial_schema.sql). Mirrors backend/app/seed.py in a smaller form. Every
--   demo account's password is "ProjectForge!1" (bcrypt hash below). The Python
--   backend seeds automatically when its database is empty, so this file is only
--   needed when loading data straight into Supabase.
-- @traces: UC-01, UC-02, UC-05, UC-12, UC-18, UC-21, SE-FR-01..SE-FR-05
-- =============================================================================

begin;

insert into public.user_profiles (id, username, email, display_name, password_hash, mfa_enabled, mfa_secret) values
  ('00000000-0000-4000-8000-000000000001', 'jon',     'jon@example.com',     'Jon Sorey',        '$2b$12$Xh7UtlTYzDYQhmwkDK2hT.lVu/.nhMGXmaxinnp9GW8zhJB2gvUUS', false, null),
  ('00000000-0000-4000-8000-000000000002', 'tyler',   'tyler@example.com',   'Tyler Gaines',     '$2b$12$Xh7UtlTYzDYQhmwkDK2hT.lVu/.nhMGXmaxinnp9GW8zhJB2gvUUS', true,  'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'),
  ('00000000-0000-4000-8000-000000000003', 'staff',   'staff@example.com',   'Staff Member',     '$2b$12$Xh7UtlTYzDYQhmwkDK2hT.lVu/.nhMGXmaxinnp9GW8zhJB2gvUUS', false, null),
  ('00000000-0000-4000-8000-000000000004', 'preethi', 'preethi@example.com', 'Preethi Seereddy', '$2b$12$Xh7UtlTYzDYQhmwkDK2hT.lVu/.nhMGXmaxinnp9GW8zhJB2gvUUS', false, null),
  ('00000000-0000-4000-8000-000000000005', 'saaqib',  'saaqib@example.com',  'Saaqib Shaik',     '$2b$12$Xh7UtlTYzDYQhmwkDK2hT.lVu/.nhMGXmaxinnp9GW8zhJB2gvUUS', false, null),
  ('00000000-0000-4000-8000-000000000006', 'myoram',  'myoram@example.com',  'Myoram Langwang',  '$2b$12$Xh7UtlTYzDYQhmwkDK2hT.lVu/.nhMGXmaxinnp9GW8zhJB2gvUUS', false, null),
  ('00000000-0000-4000-8000-000000000007', 'aashwat', 'aashwat@example.com', 'Aashwat Singh',    '$2b$12$Xh7UtlTYzDYQhmwkDK2hT.lVu/.nhMGXmaxinnp9GW8zhJB2gvUUS', false, null)
on conflict (username) do nothing;

insert into public.projects (id, name, description, status, project_type, deadline, created_by) values
  ('10000000-0000-4000-8000-000000000001', 'ProjectForge Platform',
   'Build and launch the ProjectForge web app: auth, boards, costs, time tracking and reports.',
   'active', 'work', now() + interval '45 days', '00000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002', 'CS 3354 Semester Deliverables',
   'SRS, design document, test plan and the final presentation for CS 3354.001.',
   'active', 'school', now() + interval '21 days', '00000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.project_members (project_id, user_id, role, card_color, card_order) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'owner',   '#6366F1', 0),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'manager', '#6366F1', 0),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'member',  '#6366F1', 0),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004', 'member',  '#6366F1', 0),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005', 'member',  '#6366F1', 0),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000006', 'member',  '#6366F1', 0),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000007', 'member',  '#6366F1', 0),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'owner',   '#0EA5E9', 1),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'manager', '#0EA5E9', 1),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', 'member',  '#0EA5E9', 1)
on conflict (project_id, user_id) do nothing;

insert into public.task_lists (id, project_id, name, position) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Planning', 0),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Backend',  1),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Frontend', 2),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'Documents', 0)
on conflict (id) do nothing;

insert into public.tasks (id, project_id, list_id, title, status, priority, assignee_id, due_date, position, tags, estimated_hours, assigned_hours, completed_at) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   'Write the requirements traceability matrix', 'done', 'high', '00000000-0000-4000-8000-000000000004', now() - interval '5 days', 0, '["docs"]', 6, 6, now() - interval '2 days'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
   'Cost summary API with Decimal math', 'in_progress', 'high', '00000000-0000-4000-8000-000000000001', now() + interval '6 days', 0, '["finance"]', 12, 12, null),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003',
   'Board drag-and-drop', 'in_progress', 'high', '00000000-0000-4000-8000-000000000003', now() + interval '4 days', 1, '["frontend","ux"]', 8, 10, null),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003',
   'Color-blind friendly palettes', 'todo', 'medium', '00000000-0000-4000-8000-000000000003', now() + interval '12 days', 0, '["accessibility"]', 5, 5, null),
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000004',
   'Design document with UML diagrams', 'in_progress', 'high', '00000000-0000-4000-8000-000000000003', now() + interval '5 days', 0, '["deliverable","uml"]', 15, 14, null)
on conflict (id) do nothing;

insert into public.soft_deadlines (task_id, project_id, title, due_at, priority, is_completed, created_by) values
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Prototype drag handles', now() + interval '1 day', 'high', true,  '00000000-0000-4000-8000-000000000003'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Review with Myoram',     now() + interval '3 days', 'medium', false, '00000000-0000-4000-8000-000000000003'),
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', 'Class diagram draft',    now() + interval '2 days', 'high', false, '00000000-0000-4000-8000-000000000003');

insert into public.comments (task_id, project_id, author_id, body) values
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
   'Looks great so far. @staff can you make sure **failed moves snap back**?'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
   'Remember: bids, budgets and expenses are **never** added together.');

insert into public.project_financials (project_id, bid_amount, budget_amount, currency, updated_by) values
  ('10000000-0000-4000-8000-000000000001', 48500.00, 42000.00, 'USD', '00000000-0000-4000-8000-000000000001')
on conflict (project_id) do nothing;

insert into public.stage_costs (project_id, stage_name, amount, position) values
  ('10000000-0000-4000-8000-000000000001', 'Requirements',    4250.00, 0),
  ('10000000-0000-4000-8000-000000000001', 'Design',          6800.50, 1),
  ('10000000-0000-4000-8000-000000000001', 'Implementation', 18400.25, 2),
  ('10000000-0000-4000-8000-000000000001', 'Testing',         5120.10, 3),
  ('10000000-0000-4000-8000-000000000001', 'Deployment',      2300.00, 4);

insert into public.expenses (project_id, category, description, amount, expense_date, created_by) values
  ('10000000-0000-4000-8000-000000000001', 'software',  'Supabase Pro plan (1 month)',   25.00, current_date - 30, '00000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000001', 'labor',     'Contract QA tester - week 1', 1200.00, current_date - 21, '00000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000001', 'equipment', 'USB-C test devices',           389.99, current_date - 18, '00000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000001', 'travel',    'Client demo travel',           212.35, current_date - 9,  '00000000-0000-4000-8000-000000000001');

insert into public.time_entries (project_id, task_id, user_id, source, started_at, ended_at, duration_hours, note) values
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', 'timer',
   now() - interval '6 days', now() - interval '6 days' + interval '4 hours 15 minutes', 4.25, 'Drag handles'),
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', 'manual',
   now() - interval '2 days', now() - interval '2 days' + interval '2 hours', 2.00, 'Snap-back on failure'),
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'timer',
   now() - interval '3 days', now() - interval '3 days' + interval '2 hours 30 minutes', 2.50, '');

insert into public.notifications (user_id, project_id, task_id, kind, message, link) values
  ('00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003',
   'mention', 'Tyler Gaines mentioned you on “Board drag-and-drop”', '/tasks/30000000-0000-4000-8000-000000000003');

commit;
