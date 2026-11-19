import { Link, useLocation } from '../lib/router';
import { getMe, useStore } from '../lib/store';
import { initials } from '../lib/theme';
import { Logo } from './ui';
import { IconBell, IconCalendar, IconChart, IconClock, IconDollar, IconFolder, IconHome, IconPeople, IconTasks } from './Icons';

const NAV = [
  { to: '/dashboard', label: 'Home', Icon: IconHome },
  { to: '/projects', label: 'Projects', Icon: IconFolder },
  { to: '/tasks', label: 'Tasks', Icon: IconTasks },
  { to: '/charts', label: 'Charts', Icon: IconChart },
  { to: '/cost', label: 'Cost', Icon: IconDollar },
  { to: '/people', label: 'People', Icon: IconPeople },
  { to: '/calendar', label: 'Calendar', Icon: IconCalendar },
  { to: '/time-tracking', label: 'Time tracking', Icon: IconClock },
];

export function Sidebar() {
  const { pathname } = useLocation();
  const { state } = useStore();
  const me = getMe(state);
  const unread = state.notifications.filter((n) => !n.read).length;
  const running = state.timer.active;

  return (
    <aside className="sidebar">
      <Link className="sb-brand" to="/dashboard">
        <Logo className="sb-logo" />
        <span className="sb-name">ProjectForge</span>
      </Link>

      <nav className="sb-nav">
        {NAV.map(({ to, label, Icon }) => (
          <Link key={to} className={`nav-item${pathname === to ? ' active' : ''}`} to={to}>
            <Icon />
            {label}
            {to === '/time-tracking' && running && <span className="nav-live" title="Timer running" />}
          </Link>
        ))}
      </nav>

      <div className="sb-bottom">
        <Link className={`nav-item${pathname === '/notifications' ? ' active' : ''}`} to="/notifications">
          <IconBell />
          Notifications
          {unread > 0 && <span className="nav-badge">{unread}</span>}
        </Link>
        <Link className={`sb-user${pathname === '/profile' ? ' active' : ''}`} to="/profile">
          <div className="avatar">{initials(me?.name || '')}</div>
          <div>
            <div className="sb-user-name">{me?.name}</div>
            <div className="sb-user-role">Profile &amp; settings</div>
          </div>
        </Link>
      </div>
    </aside>
  );
}

// Wraps an app screen in the shared shell. `page` selects the scoped stylesheet.
export function AppLayout({ page, children }) {
  return (
    <div className={`pf pg-${page}`}>
      <div className="app">
        <Sidebar />
        <main className="main">{children}</main>
      </div>
    </div>
  );
}

export function PageHead({ title, sub, children }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <div className="page-sub">{sub}</div>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}
