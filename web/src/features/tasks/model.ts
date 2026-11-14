/**
 * @author Aashwat Singh
 * @description Pure task rules used by the board and task screens: Membership.canAssignTasks() (owners and
 *   managers only), who may edit a task, the four board columns, filtering, and the optimistic reorder that
 *   mirrors the server's Task.moveTo() so a drag looks instant and can be rolled back on failure.
 * @traces SE-FR-26, SE-FR-27, UC-18
 */
import type { Role, Task, TaskStatus } from '../../shared/types';

export const Membership = {
  canAssignTasks: (role: Role | null | undefined): boolean => role === 'owner' || role === 'manager',
};

export function canEditTask(role: Role | null | undefined, task: Pick<Task, 'assignee_id'>, userId: string | undefined): boolean {
  return Membership.canAssignTasks(role) || (role === 'member' && !!userId && task.assignee_id === userId);
}

export const BOARD_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'todo', label: 'To Do' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'review', label: 'Review' },
  { status: 'done', label: 'Done' },
];

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export function groupByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  const groups: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], review: [], done: [] };
  for (const t of tasks) groups[t.status].push(t);
  for (const key of Object.keys(groups) as TaskStatus[]) groups[key].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  return groups;
}

/** Client mirror of Task.moveTo(): removes the task, inserts it at `toIndex` in `toStatus`, renumbers. */
export function applyMove(tasks: Task[], taskId: string, toStatus: TaskStatus, toIndex: number): Task[] {
  const moving = tasks.find((t) => t.id === taskId);
  if (!moving) return tasks;
  const groups = groupByStatus(tasks.filter((t) => t.id !== taskId));
  const column = groups[toStatus];
  const index = Math.max(0, Math.min(toIndex, column.length));
  column.splice(index, 0, { ...moving, status: toStatus });
  const renumbered = new Map<string, Task>();
  for (const status of Object.keys(groups) as TaskStatus[]) {
    groups[status].forEach((t, i) => renumbered.set(t.id, { ...t, position: i }));
  }
  return tasks.map((t) => renumbered.get(t.id) ?? t);
}

export interface TaskFilters {
  search: string;
  assignee: 'all' | 'me' | 'none' | string;
  tag: string;
  listId: string;
}

export function filterTasks(tasks: Task[], filters: TaskFilters, userId?: string): Task[] {
  const q = filters.search.trim().toLowerCase();
  return tasks.filter((t) => {
    if (q && !t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
    if (filters.assignee === 'me' && t.assignee_id !== userId) return false;
    if (filters.assignee === 'none' && t.assignee_id) return false;
    if (!['all', 'me', 'none'].includes(filters.assignee) && t.assignee_id !== filters.assignee) return false;
    if (filters.tag && !t.tags.includes(filters.tag)) return false;
    if (filters.listId && t.list_id !== filters.listId) return false;
    return true;
  });
}

export function isOverdue(task: Pick<Task, 'due_date' | 'status'>, now: Date = new Date()): boolean {
  return !!task.due_date && task.status !== 'done' && new Date(task.due_date).getTime() < now.getTime();
}

export function normalizeTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const tag = part.trim().toLowerCase();
    if (tag) seen.add(tag);
  }
  return [...seen].slice(0, 10);
}
