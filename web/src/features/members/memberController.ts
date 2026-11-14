/**
 * @author Aashwat Singh
 * @description Calls the backend to list project members, invite someone by username or email, remove a
 *   member (optionally handing their open tasks to another member) and change a member's role.
 * @traces SE-FR-30, UC-19, UC-20
 */
import { api } from '../../services/apiClient';
import type { Member, RemoveMemberResult, Role } from '../../shared/types';

export const memberController = {
  list: (projectId: string) => api.get<Member[]>(`/api/projects/${projectId}/members`),
  invite: (projectId: string, identifier: string, role: Role) =>
    api.post<Member>(`/api/projects/${projectId}/members/invite`, { identifier, role }),
  remove: (projectId: string, userId: string, reassignToUserId?: string | null) =>
    api.del<RemoveMemberResult>(`/api/projects/${projectId}/members/${userId}`, { reassign_to_user_id: reassignToUserId ?? undefined }),
  changeRole: (projectId: string, userId: string, role: Role) =>
    api.patch<Member>(`/api/projects/${projectId}/members/${userId}/role`, { role }),
};
