/**
 * @author Myoram Langwang
 * @description What each dashboard widget shows, styled like dashboard.html: upcoming deadlines with colored
 *   dots and Today / Tmrw / date pills, task progress as a big percentage, per-project completion bars, time
 *   tracked this week, the role-filtered cost summary, my open tasks, unread notifications and a seven-day
 *   strip. Every widget reads from the single consolidated dashboard payload.
 * @traces SE-FR-21, SE-NFR-02, SE-NFR-08
 */
import { Link } from 'react-router-dom';
import { sumAmounts } from '../costs/model';
import type { CalendarEvent, Notification } from '../../shared/types';
import { formatDate, formatMoney, relativeTime } from '../../shared/format';
import { Badge, EmptyState, Icon, PriorityBadge, ProgressBar, StatusBadge } from '../../shared/ui';

interface ProgressItem { project_id: string; name: string; role: string; color: string; total: number; done: number; progress_pct: number; deadline: string }
interface MyTask { task_id: string; title: string; status: string; priority: string; project_name: string; due_date: string | null; overdue: boolean }
interface TimeSummary { total_hours: number; per_day: number[]; running_timer: { task_id: string; task_title: string; started_at: string; is_paused: boolean } | null }
interface BudgetRow { project_id: string; name: string; currency: string; bid_amount: string; budget_amount: string; stage_cost_total: string; expense_total: string }
interface TaskProgress { total: number; done: number; progress_pct: number; due_today: number }

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const BIG = 'text-[44px] font-extrabold leading-[52px] tracking-[-0.02em] text-ink';

/** "Today" / "Tmrw" / "Nov 20" pill, colored like the mockup (gold, blue, purple). */
export function duePill(iso: string, now: Date = new Date()): { label: string; tone: 'warn' | 'info' | 'accent' | 'danger' } {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(now)) / 86_400_000);
  if (days < 0) return { label: 'Overdue', tone: 'danger' };
  if (days === 0) return { label: 'Today', tone: 'warn' };
  if (days === 1) return { label: 'Tmrw', tone: 'info' };
  return { label: formatDate(iso, { year: undefined }), tone: 'accent' };
}

export function hoursLabel(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

function DeadlineRow({ event }: { event: CalendarEvent }) {
  const to = event.task_id ? `/tasks/${event.task_id}` : `/projects/${event.project_id}`;
  const pill = duePill(event.starts_at);
  const kind = event.kind === 'soft_deadline' ? 'Soft deadline · ' : event.kind === 'project_deadline' ? 'Project deadline · ' : '';
  return (
    <li className="border-b border-line last:border-b-0">
      <Link to={to} className="flex h-14 items-center justify-between gap-3 hover:opacity-90">
        <span className="flex min-w-0 items-center gap-3">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: event.color }} aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold leading-[22px] text-ink">{event.title}</span>
            <span className="block truncate text-[13px] leading-[18px] text-muted">{kind}{event.project_name}</span>
          </span>
        </span>
        <Badge tone={pill.tone}>{pill.label}</Badge>
      </Link>
    </li>
  );
}

export function WidgetBody({ type, data }: { type: string; data: Record<string, unknown> }) {
  switch (type) {
    case 'upcoming_deadlines': {
      const items = (data.upcoming_deadlines as CalendarEvent[] | undefined) ?? [];
      if (!items.length) return <EmptyState icon="calendar" title="No deadlines in the next 14 days" />;
      return <ul>{items.map((e) => <DeadlineRow key={e.id} event={e} />)}</ul>;
    }
    case 'task_progress': {
      const t = (data.task_progress as TaskProgress | undefined) ?? { total: 0, done: 0, progress_pct: 0, due_today: 0 };
      return (
        <div className="mt-1">
          <p className={BIG}>{t.total ? `${Math.round(t.progress_pct)}%` : 'N/A'}</p>
          <div className="mt-4"><ProgressBar value={t.progress_pct} size="h-2.5" /></div>
          <p className="mt-4 text-sm text-body">{t.done} of {t.total} tasks done</p>
        </div>
      );
    }
    case 'project_progress': {
      const items = (data.project_progress as ProgressItem[] | undefined) ?? [];
      if (!items.length) return <EmptyState title="No projects yet" action={<Link className="btn-primary btn-sm" to="/projects">Create a project</Link>} />;
      return (
        <ul className="flex flex-col gap-5">
          {items.map((p) => (
            <li key={p.project_id}>
              <Link to={`/projects/${p.project_id}`} className="mb-2 flex items-center justify-between gap-2">
                <span className="truncate text-[15px] font-semibold text-ink">{p.name}</span>
                <span className="text-sm font-bold text-ink">{Math.round(p.progress_pct)}%</span>
              </Link>
              <ProgressBar value={p.progress_pct} color={p.color} />
            </li>
          ))}
        </ul>
      );
    }
    case 'time_summary': {
      const t = (data.time_summary as TimeSummary | undefined) ?? { total_hours: 0, per_day: [0, 0, 0, 0, 0, 0, 0], running_timer: null };
      return (
        <div className="mt-1 flex h-full flex-col">
          <p className={BIG}>{hoursLabel(t.total_hours)}</p>
          <p className="mt-1 text-sm text-body">This week</p>
          {t.running_timer ? (
            <Link to={`/tasks/${t.running_timer.task_id}`} className="mt-4 flex items-center gap-2 text-xs font-semibold text-ok">
              <span className="h-2 w-2 rounded-full bg-ok" /> {t.running_timer.is_paused ? 'Paused' : 'Running'}: {t.running_timer.task_title}
            </Link>
          ) : (
            <Link to="/time" className="mt-4 text-xs font-semibold text-accent">Open time tracking →</Link>
          )}
        </div>
      );
    }
    case 'budget_overview': {
      const b = (data.budget_overview as { restricted: boolean; projects: BudgetRow[] } | undefined) ?? { restricted: true, projects: [] };
      if (b.restricted) {
        return <EmptyState icon="lock" title="Owners and managers only">You are a member on all of your projects, so no cost data is shown.</EmptyState>;
      }
      const spent = sumAmounts(b.projects.map((p) => p.expense_total));
      const budget = sumAmounts(b.projects.map((p) => p.budget_amount));
      const pct = Number(budget) > 0 ? (Number(spent) / Number(budget)) * 100 : 0;
      const currency = b.projects[0]?.currency ?? 'USD';
      return (
        <div className="mt-1">
          <p className={BIG}>{formatMoney(spent, currency).replace(/\.00$/, '')}</p>
          <p className="mt-1 text-sm text-body">of {formatMoney(budget, currency).replace(/\.00$/, '')} budget · {b.projects.length} project{b.projects.length === 1 ? '' : 's'}</p>
          <div className="mt-5"><ProgressBar value={pct} color="rgb(var(--c-ok))" /></div>
          <Link to="/costs" className="mt-3 inline-block text-xs font-semibold text-accent">Open cost breakdown →</Link>
        </div>
      );
    }
    case 'my_tasks': {
      const items = (data.my_tasks as MyTask[] | undefined) ?? [];
      if (!items.length) return <EmptyState icon="check" title="Nothing assigned to you" />;
      return (
        <ul>
          {items.map((t) => (
            <li key={t.task_id} className="border-b border-line last:border-b-0">
              <Link to={`/tasks/${t.task_id}`} className="block py-2.5">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[15px] font-semibold text-ink">{t.title}</span>
                  <PriorityBadge priority={t.priority} />
                </span>
                <span className="mt-1 flex items-center gap-2 text-[13px] text-muted">
                  <StatusBadge status={t.status} />
                  <span className="truncate">{t.project_name}</span>
                  {t.due_date ? <span className={t.overdue ? 'font-semibold text-danger' : ''}>{t.overdue ? 'Overdue' : `Due ${relativeTime(t.due_date)}`}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      );
    }
    case 'notifications': {
      const n = (data.notifications as { unread_count: number; items: Notification[] } | undefined) ?? { unread_count: 0, items: [] };
      return (
        <div>
          <p className="text-sm text-body"><b className="font-semibold text-ink">{n.unread_count}</b> unread</p>
          {n.items.length === 0 ? <EmptyState icon="bell" title="You're all caught up" /> : (
            <ul className="mt-2">
              {n.items.map((item) => (
                <li key={item.id} className="border-b border-line last:border-b-0">
                  <Link to={item.link || '/notifications'} className="flex items-start gap-3 py-2.5 text-sm">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
                    <span><span className="line-clamp-2 text-ink">{item.message}</span><span className="text-xs text-muted">{relativeTime(item.created_at)}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    case 'calendar_week': {
      const c = (data.calendar_week as { week_start: string; events: CalendarEvent[] } | undefined) ?? { week_start: '', events: [] };
      const start = c.week_start ? new Date(`${c.week_start}T00:00:00`) : new Date();
      return (
        <div className="grid h-full grid-cols-7 gap-2 text-center">
          {DAYS.map((d, i) => {
            const day = new Date(start);
            day.setDate(start.getDate() + i);
            const events = c.events.filter((e) => new Date(e.starts_at).toDateString() === day.toDateString());
            return (
              <div key={d} className="rounded-btn bg-surface-2 p-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{d}</p>
                <p className="text-base font-bold text-ink">{day.getDate()}</p>
                <div className="mt-1 flex flex-wrap justify-center gap-1">
                  {events.map((e) => <span key={e.id} className="h-2 w-2 rounded-full" style={{ background: e.color }} title={e.title} />)}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    default:
      return <p className="flex items-center gap-2 text-sm text-muted"><Icon name="alert" /> Widget unavailable</p>;
  }
}
