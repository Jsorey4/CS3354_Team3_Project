import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Router } from './lib/router';
import { StoreProvider } from './lib/store';
import { ToastProvider } from './components/ui';
import App from './App';

// Base + per-screen styles (each screen's CSS is scoped under .pg-<screen>)
import './styles/global.css';
import './styles/pages/landing.css';
import './styles/pages/login.css';
import './styles/pages/signup.css';
import './styles/pages/reset-password.css';
import './styles/pages/dashboard.css';
import './styles/pages/projects.css';
import './styles/pages/tasks.css';
import './styles/pages/charts.css';
import './styles/pages/cost.css';
import './styles/pages/people.css';
import './styles/pages/calendar.css';
import './styles/pages/calendar-week.css';
import './styles/pages/time-tracking.css';
import './styles/pages/notifications.css';
import './styles/pages/profile.css';
// App additions + hover / interaction polish (loaded last so it wins ties)
import './styles/app.css';
import './styles/hover.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router>
      <StoreProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </StoreProvider>
    </Router>
  </StrictMode>,
);
