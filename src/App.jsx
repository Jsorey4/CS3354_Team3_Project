import { useEffect } from 'react';
import { Redirect, useLocation } from './lib/router';
import { useStore } from './lib/store';
import Landing from './pages/Landing';
import { Login, ResetPassword, Signup } from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Tasks from './pages/Tasks';
import Charts from './pages/Charts';
import Cost from './pages/Cost';
import People from './pages/People';
import Calendar from './pages/Calendar';
import TimeTracking from './pages/TimeTracking';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';

const PUBLIC = {
  '/': { el: Landing, title: 'Forge great projects, together' },
  '/login': { el: Login, title: 'Log in' },
  '/signup': { el: Signup, title: 'Sign up' },
  '/reset-password': { el: ResetPassword, title: 'Reset password' },
};

const PRIVATE = {
  '/dashboard': { el: Dashboard, title: 'Dashboard' },
  '/projects': { el: Projects, title: 'Projects' },
  '/tasks': { el: Tasks, title: 'Tasks' },
  '/charts': { el: Charts, title: 'Charts' },
  '/cost': { el: Cost, title: 'Cost' },
  '/people': { el: People, title: 'People' },
  '/calendar': { el: Calendar, title: 'Calendar' },
  '/time-tracking': { el: TimeTracking, title: 'Time tracking' },
  '/notifications': { el: Notifications, title: 'Notifications' },
  '/profile': { el: Profile, title: 'Profile & settings' },
};

// Old static-file links (e.g. /dashboard.html) keep working
const normalize = (p) => {
  const x = p.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  if (x === '/index' || x === '/landing') return '/';
  if (x === '/calendar-week') return '/calendar?view=week';
  return x;
};

export default function App() {
  const { pathname, search } = useLocation();
  const { state } = useStore();
  const path = normalize(pathname);
  const route = PUBLIC[path] || PRIVATE[path];

  useEffect(() => {
    document.title = route ? `ProjectForge – ${route.title}` : 'ProjectForge';
  }, [route]);

  if (path !== pathname) return <Redirect to={path.includes('?') ? path : path + search} />;
  if (!route) return <Redirect to="/" />;
  if (PRIVATE[path] && !state.auth.loggedIn) return <Redirect to="/login" />;
  if ((path === '/login' || path === '/signup') && state.auth.loggedIn) return <Redirect to="/dashboard" />;

  const Page = route.el;
  return <Page key={path} />;
}
