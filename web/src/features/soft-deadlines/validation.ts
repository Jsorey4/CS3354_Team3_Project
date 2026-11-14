/**
 * @author Preethi Seereddy
 * @description The soft-deadline rules, checked instantly in the browser before saving so the inline controls
 *   can show clear feedback next to the field: a soft deadline is valid only if it is strictly earlier than the
 *   task's final due date, and its priority must be high, medium or low (the server checks both again).
 * @traces SE-FR-06, SE-FR-09, SE-NFR-03, UC-05, UC-06
 */

import type { SoftDeadlinePriority } from '../../shared/types';

export const SOFT_DEADLINE_PRIORITIES: { value: SoftDeadlinePriority; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

export function isValidSoftDeadlinePriority(value: string): value is SoftDeadlinePriority {
  return value === 'high' || value === 'medium' || value === 'low';
}

export const SOFT_DEADLINE_ERROR = "Soft deadline must be earlier than the task's final due date.";
export const NEEDS_DUE_DATE = 'Add a final due date to this task before setting soft deadlines.';

/** true iff t_soft < t_final (O(1)). */
export function validateSoftDeadlineDate(softDateIso: string | null | undefined, taskDueDateIso: string | null | undefined): boolean {
  if (!softDateIso || !taskDueDateIso) return false;
  const soft = new Date(softDateIso).getTime();
  const final = new Date(taskDueDateIso).getTime();
  if (Number.isNaN(soft) || Number.isNaN(final)) return false;
  return soft < final;
}

export function softDeadlineError(softDateIso: string | null | undefined, taskDueDateIso: string | null | undefined): string | null {
  if (!taskDueDateIso) return NEEDS_DUE_DATE;
  if (!softDateIso) return 'Choose a date and time';
  return validateSoftDeadlineDate(softDateIso, taskDueDateIso) ? null : SOFT_DEADLINE_ERROR;
}
