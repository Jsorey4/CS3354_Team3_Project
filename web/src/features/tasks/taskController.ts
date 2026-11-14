/**
 * @author Aashwat Singh
 * @description Calls the backend to list, create, edit, move (drag-and-drop) and delete tasks, list the tags
 *   used in a project, and fetch the tasks assigned to the signed-in user.
 * @traces SE-FR-26, SE-FR-27, UC-18
 */
import { api } from '../../services/apiClient';
import type { Task, TaskDetail, TaskInput, TaskStatus } from '../../shared/types';

export const taskController = {
  list: (projectId: string, filters: { status?: string; list_id?: string; assignee_id?: string; tag?: string; search?: string } = {}) =>
    api.get<Task[]>(`/api/projects/${projectId}/tasks`, filters),
  mine: (includeDone = false) => api.get<Task[]>('/api/my/tasks', { include_done: includeDone }),
  get: (taskId: string) => api.get<TaskDetail>(`/api/tasks/${taskId}`),
  create: (projectId: string, input: TaskInput) => api.post<TaskDetail>(`/api/projects/${projectId}/tasks`, input),
  update: (taskId: string, input: TaskInput) => api.put<TaskDetail>(`/api/tasks/${taskId}`, input),
  /** Task.moveTo(list_id, position) */
  moveTo: (taskId: string, position: number, status?: TaskStatus, listId?: string | null) =>
    api.patch<Task[]>(`/api/tasks/${taskId}/move`, listId === undefined ? { position, status } : { position, status, list_id: listId }),
  remove: (taskId: string) => api.del<void>(`/api/tasks/${taskId}`),
  tags: (projectId: string) => api.get<string[]>(`/api/projects/${projectId}/tags`),
};
