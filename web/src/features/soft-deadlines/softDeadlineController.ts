/**
 * @author Preethi Seereddy
 * @description Calls the backend to list, add, edit (date, time and priority), complete and delete soft deadlines.
 * @traces SE-FR-06, SE-FR-07, SE-FR-08, SE-FR-09, SE-FR-10, UC-05, UC-06, UC-07
 */
import { api } from '../../services/apiClient';
import type { SoftDeadline, SoftDeadlinePriority } from '../../shared/types';

export const softDeadlineController = {
  listForProject: (projectId: string, taskId?: string) =>
    api.get<SoftDeadline[]>(`/api/projects/${projectId}/soft-deadlines`, { task_id: taskId }),
  listForTask: (taskId: string) => api.get<SoftDeadline[]>(`/api/tasks/${taskId}/soft-deadlines`),
  create: (taskId: string, title: string, dueAtIso: string, priority: SoftDeadlinePriority) =>
    api.post<SoftDeadline>(`/api/tasks/${taskId}/soft-deadlines`, { title, due_at: dueAtIso, priority }),
  update: (id: string, changes: { title?: string; due_at?: string; priority?: SoftDeadlinePriority }) =>
    api.put<SoftDeadline>(`/api/soft-deadlines/${id}`, changes),
  complete: (id: string, isCompleted: boolean) => api.patch<SoftDeadline>(`/api/soft-deadlines/${id}/complete`, { is_completed: isCompleted }),
  remove: (id: string) => api.del<void>(`/api/soft-deadlines/${id}`),
};
