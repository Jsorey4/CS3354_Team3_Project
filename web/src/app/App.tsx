/**
 * @author eLeet Coderz (Team 3) - routing & guards: Tyler Gaines
 * @description Maps every web address to its screen. Public pages (landing, login, sign-up, reset password)
 *   are open to everyone; every other page sits behind ProtectedRoute, which also acts as the 2FA guard:
 *   someone who passed the password step but not the 6-digit code is sent back to finish it.
 * @traces SE-FR-11, UC-09
 */
import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { BoardPage } from '../pages/BoardPage';
import { CalendarPage } from '../pages/CalendarPage';
import { CostsPage } from '../pages/CostsPage';
import { DashboardPage } from '../pages/DashboardPage';
import { LandingPage } from '../pages/LandingPage';
import { LoginPage } from '../pages/LoginPage';
import { NotificationsPage } from '../pages/NotificationsPage';
import { PeoplePage } from '../pages/PeoplePage';
import { PerformancePage } from '../pages/PerformancePage';
import { ProjectDetailsPage } from '../pages/ProjectDetailsPage';
import { ProjectsPage } from '../pages/ProjectsPage';
import { ResetPasswordPage } from '../pages/ResetPasswordPage';
import { SettingsPage } from '../pages/SettingsPage';
import { SignUpPage } from '../pages/SignUpPage';
import { TaskDetailPage } from '../pages/TaskDetailPage';
import { TimeTrackingPage } from '../pages/TimeTrackingPage';
import { EmptyState, Spinner } from '../shared/ui';
import { AppShell } from './AppShell';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, pendingMfa } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Restoring your session…" />;
  if (!user) {
    // MFA guard: a half-finished sign-in must complete the 6-digit step first.
    const to = pendingMfa ? '/login?step=mfa' : '/login';
    return <Navigate to={to} replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState icon="alert" title="Page not found" action={<Link to="/" className="btn-primary">Go home</Link>}>
        The page you were looking for does not exist.
      </EmptyState>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/signup" element={<PublicOnly><SignUpPage /></PublicOnly>} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailsPage />} />
        <Route path="/board" element={<BoardPage />} />
        <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
        <Route path="/costs" element={<CostsPage />} />
        <Route path="/performance" element={<PerformancePage />} />
        <Route path="/time" element={<TimeTrackingPage />} />
        <Route path="/people" element={<PeoplePage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
