/**
 * @author Saaqib Shaik
 * @description Calls the backend to list, create, edit and delete projects, customise the user's project
 *   cards, read live progress, manage feature lists, and load the calendar of deadlines.
 * @traces SE-FR-16, SE-FR-17, SE-FR-18, UC-12, UC-13
 */
import { api } from '../../services/apiClient';
import type { CalendarEvent, Progress, Project, ProjectCreate, ProjectDetail, ProjectUpdate, TaskList } from '../../shared/types';

export const projectController = {
  list: () => api.get<Project[]>('/api/projects'),
  get: (id: string) => api.get<ProjectDetail>(`/api/projects/${id}`),
  create: (input: ProjectCreate) => api.post<ProjectDetail>('/api/projects', input),
  update: (id: string, input: ProjectUpdate) => api.put<ProjectDetail>(`/api/projects/${id}`, input),
  remove: (id: string) => api.del<void>(`/api/projects/${id}`),
  customizeCard: (id: string, card: { card_color?: string; card_order?: number }) =>
    api.patch<Project>(`/api/projects/${id}/card-customization`, card),
  progress: (id: string) => api.get<Progress>(`/api/projects/${id}/progress`),
  createList: (projectId: string, name: string) => api.post<TaskList>(`/api/projects/${projectId}/lists`, { name }),
  renameList: (listId: string, name: string) => api.put<TaskList>(`/api/lists/${listId}`, { name }),
  deleteList: (listId: string) => api.del<void>(`/api/lists/${listId}`),
  calendarEvents: (start: Date, end: Date, projectId?: string) =>
    api.get<CalendarEvent[]>('/api/calendar/events', { start: start.toISOString(), end: end.toISOString(), project_id: projectId }),
};
