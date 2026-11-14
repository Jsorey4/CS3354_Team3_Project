/**
 * @author Tyler Gaines
 * @description Calls the backend for sign-up, sign-in, the 2FA step, account unlock, password reset, and
 *   turning two-factor authentication on or off. Also wraps the demo-only helpers (one-click role switcher
 *   and the stand-in email inbox).
 * @traces SE-FR-11, UC-08, UC-09, UC-10, UC-11
 */
import { api } from '../../services/apiClient';
import type { DemoUser, LoginResponse, MfaSetup, OutboxMessage, User } from '../../shared/types';

export interface SignupInput {
  username: string;
  email: string;
  password: string;
  display_name?: string;
}

export const authController = {
  signup: (input: SignupInput) => api.post<LoginResponse>('/api/auth/signup', input, { retry: false, skipAuthRedirect: true }),
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/api/auth/login', { email, password }, { retry: false, skipAuthRedirect: true }),
  verifyMfa: (tempToken: string, code: string) =>
    api.post<LoginResponse>('/api/auth/verify-mfa', { temp_token: tempToken, code }, { skipAuthRedirect: true }),
  unlock: (unlockToken: string) => api.post<{ message: string }>('/api/auth/unlock', { unlock_token: unlockToken }),
  requestReset: (email: string) => api.post<{ message: string }>('/api/auth/reset-password/request', { email }),
  confirmReset: (token: string, newPassword: string) =>
    api.post<{ message: string }>('/api/auth/reset-password/confirm', { token, new_password: newPassword }),
  me: () => api.get<User>('/api/auth/me'),
  mfaSetup: () => api.post<MfaSetup>('/api/auth/mfa/setup'),
  mfaEnable: (code: string) => api.post<User>('/api/auth/mfa/enable', { code }),
  mfaDisable: (code: string) => api.post<User>('/api/auth/mfa/disable', { code }),
  demoUsers: () => api.get<DemoUser[]>('/api/auth/demo-users', undefined, { retry: false }),
  demoSwitch: (username: string) => api.post<LoginResponse>('/api/auth/demo-switch', { username }, { skipAuthRedirect: true }),
  devOutbox: () => api.get<OutboxMessage[]>('/api/auth/dev-outbox', undefined, { retry: false }),
  health: () => api.get<{ status: string; demo_mode: boolean; database: string }>('/api/health', undefined, { retry: false }),
};
