/**
 * @author Tyler Gaines
 * @description Remembers who is signed in for the whole app. It restores the session on page load, runs
 *   the two-step (password, then 6-digit code) sign-in, keeps the pending 2FA step so protected pages can
 *   send the user back to finish it, opens the live-update connection, and signs out everywhere on 401.
 * @traces SE-FR-11, UC-09, SE-NFR-12
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getToken, setToken, setUnauthorizedHandler } from '../../services/apiClient';
import { realtime } from '../../services/realtimeClient';
import type { LoginResponse, User } from '../../shared/types';
import { authController } from './authController';

const MFA_KEY = 'pf_mfa_temp';

interface AuthState {
  user: User | null;
  loading: boolean;
  pendingMfa: string | null;
  demoMode: boolean;
  login: (email: string, password: string) => Promise<LoginResponse>;
  verifyMfa: (code: string) => Promise<void>;
  completeSession: (response: LoginResponse) => void;
  demoSwitch: (username: string) => Promise<void>;
  cancelMfa: () => void;
  logout: () => void;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(() => !!getToken());
  const [pendingMfa, setPendingMfa] = useState<string | null>(() => sessionStorage.getItem(MFA_KEY));
  const [demoMode, setDemoMode] = useState(false);

  const logout = useCallback(() => {
    setToken(null);
    sessionStorage.removeItem(MFA_KEY);
    setPendingMfa(null);
    setUserState(null);
    realtime.disconnect();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    authController.health().then((h) => setDemoMode(h.demo_mode)).catch(() => setDemoMode(false));
    if (!getToken()) return;
    authController
      .me()
      .then((me) => {
        setUserState(me);
        realtime.connect(getToken()!);
      })
      .catch(() => logout())
      .finally(() => setLoading(false));
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const completeSession = useCallback((response: LoginResponse) => {
    if (!response.access_token || !response.user) return;
    setToken(response.access_token);
    sessionStorage.removeItem(MFA_KEY);
    setPendingMfa(null);
    setUserState(response.user);
    realtime.connect(response.access_token);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await authController.login(email, password);
      if (response.mfa_required && response.temp_token) {
        sessionStorage.setItem(MFA_KEY, response.temp_token);
        setPendingMfa(response.temp_token);
      } else {
        completeSession(response);
      }
      return response;
    },
    [completeSession],
  );

  const verifyMfa = useCallback(
    async (code: string) => {
      if (!pendingMfa) throw new Error('Sign in again to continue');
      completeSession(await authController.verifyMfa(pendingMfa, code));
    },
    [pendingMfa, completeSession],
  );

  const demoSwitch = useCallback(
    async (username: string) => {
      completeSession(await authController.demoSwitch(username));
    },
    [completeSession],
  );

  const cancelMfa = useCallback(() => {
    sessionStorage.removeItem(MFA_KEY);
    setPendingMfa(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, pendingMfa, demoMode, login, verifyMfa, completeSession, demoSwitch, cancelMfa, logout, setUser: setUserState }),
    [user, loading, pendingMfa, demoMode, login, verifyMfa, completeSession, demoSwitch, cancelMfa, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
