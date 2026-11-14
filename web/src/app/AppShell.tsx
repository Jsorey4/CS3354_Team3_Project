/**
 * @author eLeet Coderz (Team 3) - layout from the mockups' shared .sidebar / .main; demo switcher: Jon Sorey;
 *   notifications badge: Aashwat Singh
 * @description The frame around every signed-in screen, matching the HTML mockups: a 240px sidebar with the
 *   gold-hammer logo and wordmark, Home / Projects / Tasks / Charts / Cost / People / Calendar / Time tracking
 *   links, and at the bottom the Notifications link (with unread count) and the profile row. The sidebar
 *   footer also holds the Quick Demo Role Switcher (Jon = Owner, Tyler = Manager, Staff = Member - demo mode
 *   only), the live-connection dot and the theme toggle. Live notifications pop up as toasts.
 * @traces SE-FR-14, SE-FR-29, SE-NFR-05, SE-NFR-12, UC-01, UC-02, UC-18, UC-22
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { authController } from '../features/auth/authController';
import { notificationController } from '../features/collaboration/commentController';
import { ProjectScopeProvider } from '../features/projects/ProjectScope';
import { realtime, useRealtime } from '../services/realtimeClient';
import type { DemoUser, Notification } from '../shared/types';
import { Avatar, Icon, Logo } from '../shared/ui';
import { useTheme } from './ThemeProvider';

const NAV = [
  { to: '/dashboard', label: 'Home', icon: 'home' },
  { to: '/projects', label: 'Projects', icon: 'folder' },
  { to: '/board', label: 'Tasks', icon: 'tasks' },
  { to: '/performance', label: 'Charts', icon: 'chart' },
  { to: '/costs', label: 'Cost', icon: 'dollar' },
  { to: '/people', label: 'People', icon: 'users' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/time', label: 'Time tracking', icon: 'clock' },
];

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex h-11 items-center gap-3 rounded-btn px-3 text-[15px] transition ${
    isActive ? 'bg-accent-deep font-semibold text-accent-tint [&_svg]:text-accent' : 'font-medium text-nav hover:bg-surface hover:text-ink'
  }`;

function DemoRoleSwitcher() {
  const { user, demoSwitch } = useAuth();
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    authController.demoUsers().then(setUsers).catch(() => setUsers([]));
  }, []);
  if (users.length === 0) return null;
  return (
    <div className="rounded-btn border border-dashed border-warn/50 p-1.5" aria-label="Quick demo role switcher">
      <p className="px-1.5 pb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-warn">Demo · switch role</p>
      <div className="grid grid-cols-3 gap-1">
        {users.map((u) => (
          <button
            key={u.username}
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await demoSwitch(u.username);
              } finally {
                setBusy(false);
              }
            }}
            aria-pressed={user?.username === u.username}
            className={`rounded-md px-1 py-1 text-[11px] font-semibold leading-tight transition ${user?.username === u.username ? 'bg-accent-deep text-accent-tint' : 'text-nav hover:bg-surface hover:text-ink'}`}
            title={`Sign in as ${u.display_name} (${u.label})`}
          >
            {u.display_name.split(' ')[0]}
            <span className="block text-[10px] font-medium opacity-80">{u.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Sidebar({ unread, onNavigate }: { unread: number; onNavigate?: () => void }) {
  const { user, logout, demoMode } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [connected, setConnected] = useState(realtime.connected);
  useEffect(() => realtime.onStatus(setConnected), []);
  return (
    <div className="flex h-full flex-col px-4 py-6">
      <Link to="/dashboard" className="flex h-10 items-center px-2" onClick={onNavigate} aria-label="ProjectForge home">
        <Logo className="mx-[5.5px] h-10" withName />
      </Link>
      <nav className="mt-8 flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="Main">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} onClick={onNavigate} className={navClass}>
            <Icon name={item.icon} className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-4 flex flex-col gap-1 border-t border-line pt-4">
        {demoMode ? <DemoRoleSwitcher /> : null}
        <div className="flex items-center justify-between px-3 py-1.5 text-xs">
          <span className={`flex items-center gap-1.5 font-semibold ${connected ? 'text-ok' : 'text-muted'}`} title={connected ? 'Live updates connected' : 'Reconnecting…'}>
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-ok' : 'bg-muted'}`} />
            {connected ? 'Live' : 'Offline'}
          </span>
          <button type="button" className="flex items-center gap-1.5 rounded-md px-2 py-1 font-semibold text-nav hover:bg-surface hover:text-ink" onClick={() => void toggleTheme()} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="h-3.5 w-3.5" /> {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
        <NavLink to="/notifications" onClick={onNavigate} className={navClass}>
          <Icon name="bell" className="h-5 w-5" />
          <span className="flex-1">Notifications</span>
          {unread > 0 ? (
            <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-accent px-[7px] text-xs font-bold text-canvas" aria-label={`${unread} unread`}>
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </NavLink>
        {user ? (
          <div className="flex items-center gap-1">
            <NavLink
              to="/settings"
              onClick={onNavigate}
              className={({ isActive }) => `flex h-[52px] min-w-0 flex-1 items-center gap-3 rounded-btn px-3 ${isActive ? 'bg-accent-deep' : 'hover:bg-surface'}`}
            >
              <Avatar name={user.display_name || user.username} url={user.avatar_url} />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold leading-5 text-ink">{user.display_name}</span>
                <span className="block truncate text-xs leading-4 text-muted">Profile &amp; settings</span>
              </span>
            </NavLink>
            <button type="button" className="btn-ghost p-2" onClick={logout} aria-label="Sign out" title="Sign out">
              <Icon name="logout" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Toasts({ items, onDismiss }: { items: Notification[]; onDismiss: (id: string) => void }) {
  const navigate = useNavigate();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2" aria-live="polite">
      {items.map((n) => (
        <div key={n.id} className="card pointer-events-auto flex items-start gap-3 p-4 shadow-pop">
          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-hidden />
          <button type="button" className="min-w-0 flex-1 text-left text-sm" onClick={() => { onDismiss(n.id); if (n.link) navigate(n.link); }}>
            <span className="block font-semibold text-ink">New notification</span>
            <span className="line-clamp-2 text-body">{n.message}</span>
          </button>
          <button type="button" className="text-muted hover:text-ink" onClick={() => onDismiss(n.id)} aria-label="Dismiss notification"><Icon name="x" /></button>
        </div>
      ))}
    </div>
  );
}

export function AppShell() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState<Notification[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Escape closes the slide-in navigation drawer on small screens.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const refreshUnread = useCallback(() => {
    notificationController.list(true).then((r) => setUnread(r.unread_count)).catch(() => undefined);
  }, []);

  useEffect(() => refreshUnread(), [refreshUnread, user?.id, location.pathname]);
  useRealtime('notification', (n: Notification) => {
    setUnread((u) => u + 1);
    setToasts((t) => [n, ...t].slice(0, 3));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== n.id)), 6000);
  });

  return (
    <ProjectScopeProvider key={user?.id}>
      <div className="flex min-h-screen bg-canvas">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line bg-surface-2 lg:block">
          <Sidebar unread={unread} />
        </aside>
        {mobileOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-60 border-r border-line bg-surface-2">
              <Sidebar unread={unread} onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface-2 px-4 py-3 lg:hidden">
            <button type="button" className="btn-ghost p-2" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <Icon name="menu" />
            </button>
            <Logo className="h-8" withName nameClass="text-lg" />
            <span className="flex-1" />
            <Link to="/notifications" className="btn-ghost relative p-2" aria-label={`Notifications, ${unread} unread`}>
              <Icon name="bell" />
              {unread > 0 ? <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-accent" /> : null}
            </Link>
          </header>
          <main className="w-full max-w-[1200px] flex-1 px-5 pb-12 pt-8 sm:px-12 sm:pt-10">
            <Outlet key={user?.id} />
          </main>
        </div>
      </div>
      <Toasts items={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </ProjectScopeProvider>
  );
}
