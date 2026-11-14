/**
 * @author Tyler Gaines
 * @description Applies the user's light / dark theme and color-blindness palette to the whole page (the
 *   "dark" class and a data-cb attribute that swap the CSS color variables). Signed-in users' choices are
 *   saved to their profile; visitors' choices are remembered in this browser.
 * @traces SE-FR-14, SE-FR-15, SE-NFR-05
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../features/auth/AuthProvider';
import { settingsController } from '../features/settings/settingsController';
import type { ColorBlindMode, Theme } from '../shared/types';

interface ThemeState {
  theme: Theme;
  colorBlindMode: ColorBlindMode;
  setTheme: (theme: Theme) => Promise<void>;
  setColorBlindMode: (mode: ColorBlindMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeState | null>(null);
const THEME_KEY = 'pf_theme';
const CB_KEY = 'pf_cb_mode';

function initialTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return 'dark'; // the mockups' reference theme
}

export function applyAppearance(theme: Theme, mode: ColorBlindMode, root: HTMLElement = document.documentElement): void {
  root.classList.toggle('dark', theme === 'dark');
  if (mode === 'none') root.removeAttribute('data-cb');
  else root.setAttribute('data-cb', mode);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, setUser } = useAuth();
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [colorBlindMode, setMode] = useState<ColorBlindMode>(() => (localStorage.getItem(CB_KEY) as ColorBlindMode) || 'none');

  useEffect(() => {
    if (user) {
      setThemeState(user.theme);
      setMode(user.color_blind_mode);
    }
  }, [user?.id, user?.theme, user?.color_blind_mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    applyAppearance(theme, colorBlindMode);
    localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem(CB_KEY, colorBlindMode);
  }, [theme, colorBlindMode]);

  const setTheme = useCallback(
    async (next: Theme) => {
      setThemeState(next);
      if (user) setUser(await settingsController.updateProfile({ theme: next }));
    },
    [user, setUser],
  );

  const setColorBlindMode = useCallback(
    async (next: ColorBlindMode) => {
      setMode(next);
      if (user) setUser(await settingsController.updateProfile({ color_blind_mode: next }));
    },
    [user, setUser],
  );

  const value = useMemo<ThemeState>(
    () => ({ theme, colorBlindMode, setTheme, setColorBlindMode, toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark') }),
    [theme, colorBlindMode, setTheme, setColorBlindMode],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
