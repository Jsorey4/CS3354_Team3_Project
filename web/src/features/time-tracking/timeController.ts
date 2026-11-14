/**
 * @author Jon Sorey
 * @description Calls the backend to set estimated / assigned hours (managers), log actual hours, run the
 *   start / pause / resume / stop timer, and list or delete time entries.
 * @traces SE-FR-04, UC-03, UC-04
 */
import { api } from '../../services/apiClient';
import type { TaskHours, TimeEntry } from '../../shared/types';

export const timeController = {
  setHours: (projectId: string, taskId: string, values: { estimated_hours?: number | null; assigned_hours?: number | null; actual_hours?: number; work_date?: string; note?: string }) =>
    api.post<TaskHours>(`/api/projects/${projectId}/tasks/${taskId}/hours`, values),
  active: () => api.get<TimeEntry | null>('/api/time-entries/timer/active'),
  start: (taskId: string, note = '') => api.post<TimeEntry>('/api/time-entries/timer/start', { task_id: taskId, note }),
  pause: () => api.post<TimeEntry>('/api/time-entries/timer/pause', {}),
  resume: () => api.post<TimeEntry>('/api/time-entries/timer/resume', {}),
  stop: () => api.post<TimeEntry>('/api/time-entries/timer/stop', {}),
  list: (filters: { project_id?: string; user_id?: string; start_date?: string; end_date?: string } = {}) =>
    api.get<TimeEntry[]>('/api/time-entries', filters),
  remove: (entryId: string) => api.del<void>(`/api/time-entries/${entryId}`),
};
