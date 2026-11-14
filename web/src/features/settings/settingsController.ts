/**
 * @author Tyler Gaines
 * @description Reads and saves the signed-in user's profile and preferences (name, avatar, theme,
 *   color-blindness palette, default project type, notification switches and connected export accounts).
 * @traces SE-FR-12, SE-FR-13, SE-FR-14, SE-FR-15, SE-FR-19, SE-FR-20, SE-FR-29
 */
import { api } from '../../services/apiClient';
import type { ProfileUpdate, User } from '../../shared/types';

export const settingsController = {
  getProfile: () => api.get<User>('/api/settings/profile'),
  updateProfile: (update: ProfileUpdate) => api.put<User>('/api/settings/profile', update),
};
