/**
 * @author Saaqib Shaik
 * @description Pure helpers for project screens: the allowed project types / statuses, the card color
 *   palette, deadline countdown wording, and client-side checks for the create-project form.
 * @traces SE-FR-16, SE-FR-17, UC-12, UC-13
 */
import type { Project, ProjectStatus, ProjectType } from '../../shared/types';

/** Order of the mode tabs in projects.html: School, Personal, Work. */
export const PROJECT_TYPES: { value: ProjectType; label: string; icon: string }[] = [
  { value: 'school', label: 'School', icon: 'flag' },
  { value: 'personal', label: 'Personal', icon: 'target' },
  { value: 'work', label: 'Work', icon: 'folder' },
];

export const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

export const CARD_COLORS = ['#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#64748B'];

export function deadlineCountdown(iso: string, now: Date = new Date()): { text: string; overdue: boolean; soon: boolean } {
  const ms = new Date(iso).getTime() - now.getTime();
  const days = Math.round(ms / 86_400_000);
  if (ms < 0) return { text: `${Math.abs(days) || 'Less than 1'} day${Math.abs(days) === 1 ? '' : 's'} overdue`, overdue: true, soon: false };
  if (days === 0) return { text: 'Due today', overdue: false, soon: true };
  return { text: `${days} day${days === 1 ? '' : 's'} left`, overdue: false, soon: days <= 7 };
}

export function sortByCardOrder(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => a.card_order - b.card_order || a.created_at.localeCompare(b.created_at));
}

export function validateProjectForm(form: { name: string; deadline: string; project_type: string }, now: Date = new Date()): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = 'Project name is required';
  if (!form.project_type) errors.project_type = 'Choose a project type';
  if (!form.deadline) errors.deadline = 'Choose a deadline';
  else if (new Date(form.deadline).getTime() <= now.getTime()) errors.deadline = 'Deadline must be in the future';
  return errors;
}

/** Splits "alice, @bob  carol" into unique usernames. */
export function parseUsernames(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const name = part.trim().replace(/^@/, '');
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      out.push(name);
    }
  }
  return out;
}
