/**
 * @author Aashwat Singh
 * @description Client-side validation for the create / edit task form. UC-18 requires a title and a final
 *   due date; the server applies the same rule (TaskCreate in backend/app/schemas/dto.py), so this check
 *   only saves a round trip and points at the field to fix.
 * @traces SE-FR-26, UC-18
 */
import { fromLocalInput } from '../../shared/format';

export interface TaskFormValues {
  title: string;
  /** Value of the datetime-local input, e.g. "2026-11-20T17:00". */
  due: string;
}

export type TaskFormErrors = Partial<Record<'title' | 'due_date', string>>;

export interface TaskFormResult {
  errors: TaskFormErrors;
  /** Trimmed title and ISO due date; only present when there are no errors. */
  value?: { title: string; due_date: string };
}

export function validateTaskForm({ title, due }: TaskFormValues): TaskFormResult {
  const errors: TaskFormErrors = {};
  const trimmed = title.trim();
  if (!trimmed) errors.title = 'Title is required';
  const dueIso = fromLocalInput(due.trim());
  if (!due.trim()) errors.due_date = 'Due date is required';
  else if (!dueIso) errors.due_date = 'Enter a valid due date and time';
  if (errors.title || errors.due_date || !dueIso) return { errors };
  return { errors, value: { title: trimmed, due_date: dueIso } };
}
