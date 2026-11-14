/**
 * @author Aashwat Singh
 * @description Calls the backend to read and post task comments (which may contain @mentions), delete a
 *   comment, and read / mark-read notifications.
 * @traces SE-FR-28, SE-FR-29, UC-21, UC-22
 */
import { api } from '../../services/apiClient';
import type { Comment, CommentCreateResult, Notification, NotificationList } from '../../shared/types';

export const commentController = {
  list: (taskId: string) => api.get<Comment[]>(`/api/tasks/${taskId}/comments`),
  create: (taskId: string, body: string) => api.post<CommentCreateResult>(`/api/tasks/${taskId}/comments`, { body }),
  remove: (commentId: string) => api.del<void>(`/api/comments/${commentId}`),
};

export const notificationController = {
  list: (unreadOnly = false) => api.get<NotificationList>('/api/notifications', { unread_only: unreadOnly }),
  markRead: (id: string) => api.patch<Notification>(`/api/notifications/${id}/read`),
  markAllRead: () => api.patch<NotificationList>('/api/notifications/read-all'),
};
