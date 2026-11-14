/**
 * @author eLeet Coderz (Team 3) - each block mirrors the DTOs owned by the teammate named beside it
 * @description TypeScript shapes of everything the backend sends and receives. They match
 *   backend/app/schemas/dto.py one-to-one, so a mismatch is caught at build time. Money arrives as a
 *   string (e.g. "1234.50") to keep exact cents; dates arrive as ISO-8601 UTC strings ending in "Z".
 * @traces SE-FR-01..SE-FR-30, SE-NFR-01
 */

export type Role = 'owner' | 'manager' | 'member';
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';
export type ProjectType = 'work' | 'school' | 'personal';
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type Theme = 'light' | 'dark';
export type ColorBlindMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'high_contrast';
export type ExpenseCategory = 'labor' | 'materials' | 'software' | 'equipment' | 'travel' | 'services' | 'other';
export type Efficiency = number | 'N/A';
export type SoftDeadlinePriority = 'high' | 'medium' | 'low';

// --- Auth & settings (Tyler Gaines) -------------------------------------------------
/** Settings > Notification preferences (SE-FR-29). Stored on the user's profile row. */
export interface NotificationPrefs {
  task_assignments: boolean;
  mentions: boolean;
  deadline_reminders: boolean;
  project_updates: boolean;
}

/** One-way export targets the user has connected in Settings > Connected accounts (SE-FR-19, SE-FR-20). */
export type ConnectedProvider = 'google_calendar' | 'outlook' | 'google_sheets';

export interface ConnectedAccount {
  connected: boolean;
  connected_at: string | null;
}

export interface User {
  id: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  mfa_enabled: boolean;
  theme: Theme;
  color_blind_mode: ColorBlindMode;
  default_project_type: ProjectType;
  notification_prefs: NotificationPrefs;
  connected_accounts: Record<ConnectedProvider, ConnectedAccount>;
  created_at: string;
}

export interface UserBrief {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface LoginResponse {
  mfa_required: boolean;
  temp_token: string | null;
  access_token: string | null;
  token_type: string;
  user: User | null;
}

export interface MfaSetup {
  secret: string;
  otpauth_uri: string;
}

export interface DemoUser {
  username: string;
  display_name: string;
  label: string;
  mfa_enabled: boolean;
}

export interface OutboxMessage {
  to: string;
  subject: string;
  body: string;
  link: string;
  sent_at: string;
}

export interface ProfileUpdate {
  username?: string;
  display_name?: string;
  avatar_url?: string;
  theme?: Theme;
  color_blind_mode?: ColorBlindMode;
  default_project_type?: ProjectType;
  /** Partial: only the switches named are changed. */
  notification_prefs?: Partial<NotificationPrefs>;
  /** true connects, false disconnects; providers not named are left alone. */
  connected_accounts?: Partial<Record<ConnectedProvider, boolean>>;
}

// --- Projects (Saaqib Shaik) -------------------------------------------------------
export interface TaskList {
  id: string;
  project_id: string;
  name: string;
  position: number;
}

export interface Member {
  user_id: string;
  username: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  role: Role;
  joined_at: string;
  open_task_count: number;
  task_count: number;
  done_task_count: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  project_type: ProjectType;
  deadline: string;
  created_at: string;
  my_role: Role;
  card_color: string;
  card_order: number;
  progress_pct: number;
  task_count: number;
  done_count: number;
  member_count: number;
  members_preview: UserBrief[];
}

export interface ProjectDetail extends Project {
  members: Member[];
  lists: TaskList[];
}

export interface ProjectCreate {
  name: string;
  description: string;
  status: ProjectStatus;
  project_type: ProjectType;
  deadline: string;
  members: string[];
  card_color?: string;
}

export type ProjectUpdate = Partial<Omit<ProjectCreate, 'members' | 'card_color'>>;

export interface FeatureProgress {
  list_id: string | null;
  name: string;
  total: number;
  done: number;
  progress_pct: number;
}

export interface Progress {
  project_id: string;
  overall_progress_pct: number;
  total_tasks: number;
  done_tasks: number;
  feature_progress: FeatureProgress[];
}

export interface CalendarEvent {
  id: string;
  kind: 'project_deadline' | 'task_due' | 'soft_deadline';
  title: string;
  starts_at: string;
  project_id: string;
  project_name: string;
  task_id: string | null;
  color: string;
  is_completed: boolean;
}

// --- Exports (Saaqib Shaik) ---------------------------------------------------------
export type CalendarTarget = 'ical' | 'google' | 'outlook';
export type SpreadsheetTarget = 'excel' | 'sheets';
export type SpreadsheetSection = 'tasks' | 'soft_deadlines' | 'time_entries' | 'financials' | 'stage_costs' | 'expenses';

export interface ProviderLink {
  title: string;
  starts_at: string;
  url: string;
}

export interface CalendarExportResult {
  message: string;
  count: number;
  provider_links: ProviderLink[];
}

export interface SheetsExportResult {
  message: string;
  count: number;
  sheets: { title: string; values: (string | number)[][] }[];
}

// --- Dashboard (Myoram Langwang) ---------------------------------------------------
export interface Widget {
  id: string;
  widget_type: string;
  title: string;
  grid_x: number;
  grid_y: number;
  width: number;
  height: number;
  is_hidden: boolean;
}

export interface WidgetType {
  widget_type: string;
  title: string;
  description: string;
  width: number;
  height: number;
}

export interface DashboardPayload {
  widgets: Widget[];
  available_types: WidgetType[];
  data: Record<string, unknown>;
  grid_columns: number;
  generated_at: string;
}

// --- Tasks, members, collaboration (Aashwat Singh) ---------------------------------
export interface Task {
  id: string;
  project_id: string;
  list_id: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  assignee: UserBrief | null;
  /** Always set: UC-18 makes the final due date required. */
  due_date: string;
  position: number;
  tags: string[];
  estimated_hours: number | null;
  assigned_hours: number | null;
  actual_hours: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  soft_deadlines_total: number;
  soft_deadlines_done: number;
  next_soft_deadline_at: string | null;
  comment_count: number;
}

export interface TaskDetail extends Task {
  project_name: string;
  my_role: Role;
  can_edit: boolean;
  can_assign: boolean;
}

export interface TaskInput {
  title?: string;
  description?: string;
  list_id?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee_id?: string | null;
  /** Required on create (UC-18); cannot be cleared on edit. */
  due_date?: string;
  tags?: string[];
  estimated_hours?: number | null;
  assigned_hours?: number | null;
}

export interface RemoveMemberResult {
  removed_user_id: string;
  reassigned_task_count: number;
  reassigned_to: string | null;
}

export interface Comment {
  id: string;
  task_id: string;
  author: UserBrief | null;
  body: string;
  created_at: string;
  can_delete: boolean;
}

export interface CommentCreateResult {
  comment: Comment;
  warnings: string[];
  notified: string[];
}

export interface Notification {
  id: string;
  kind: string;
  message: string;
  link: string;
  is_read: boolean;
  created_at: string;
  project_id: string | null;
  task_id: string | null;
}

export interface NotificationList {
  items: Notification[];
  unread_count: number;
}

// --- Soft deadlines (Preethi Seereddy) ---------------------------------------------
export interface SoftDeadline {
  id: string;
  task_id: string;
  project_id: string;
  task_title: string;
  task_due_date: string | null;
  title: string;
  due_at: string;
  priority: SoftDeadlinePriority;
  is_completed: boolean;
  completed_at: string | null;
  state: 'upcoming' | 'due_soon' | 'overdue' | 'completed';
  can_edit: boolean;
}

// --- Costs, time, reports (Jon Sorey) ----------------------------------------------
export interface StageCost {
  id: string;
  stage_name: string;
  amount: string;
  position: number;
  notes: string;
}

export interface Expense {
  id: string;
  category: ExpenseCategory;
  description: string;
  amount: string;
  expense_date: string;
  stage_cost_id: string | null;
  created_at: string;
}

export interface CostSummary {
  project_id: string;
  currency: string;
  bid_amount: string;
  budget_amount: string;
  stage_costs: StageCost[];
  stage_cost_sum: string;
  sum_label: 'Total' | 'Subtotal';
  included_stage_ids: string[];
  expenses: Expense[];
  expense_total: string;
  expense_count: number;
  categories: string[];
}

export interface CostQuery {
  search?: string;
  category?: string;
  sort_by?: 'expense_date' | 'amount' | 'category';
  sort_dir?: 'asc' | 'desc';
  stage_ids?: string[] | null;
}

export interface TaskHours {
  task_id: string;
  estimated_hours: number | null;
  assigned_hours: number | null;
  actual_hours: number | null;
}

export interface TimeEntry {
  id: string;
  project_id: string;
  project_name: string;
  task_id: string;
  task_title: string;
  user_id: string;
  username: string;
  source: 'timer' | 'manual';
  started_at: string;
  ended_at: string | null;
  paused_seconds: number;
  is_running: boolean;
  is_paused: boolean;
  elapsed_seconds: number;
  duration_hours: number | null;
  note: string;
}

export interface PerformanceRow {
  user_id: string;
  username: string;
  display_name: string;
  estimated_hours: number;
  assigned_hours: number;
  actual_hours: number;
  efficiency_pct: Efficiency;
  tasks_total: number;
  tasks_done: number;
}

export interface PerformanceReport {
  project_id: string;
  scope: 'team' | 'self';
  start_date: string;
  end_date: string;
  totals: Omit<PerformanceRow, 'user_id' | 'username' | 'display_name'>;
  members: PerformanceRow[];
  weekly: { week_start: string; actual_hours: number }[];
  completion: { done: number; total: number; progress_pct: number };
  progress_over_time: { week_start: string; completion_pct: number }[];
  tasks: {
    task_id: string;
    title: string;
    assignee_username: string | null;
    estimated_hours: number | null;
    actual_hours: number;
    efficiency_pct: Efficiency;
  }[];
}
