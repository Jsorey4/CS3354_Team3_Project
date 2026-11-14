/**
 * @author Saaqib Shaik (calendar & export), Preethi Seereddy (soft deadlines on the calendar) - matches
 *   calendar.html (Month) and calendar-week.html (Week)
 * @description Month and Week views of every deadline across the user's projects: task due dates (blue),
 *   soft deadlines (purple) and project deadlines (gold), each chip also carrying an icon so the kind never
 *   depends on color. Month view is a Sunday-first grid with today circled; Week view places items at their
 *   time of day. "Connect Google", "Outlook" and "Export iCal" open the one-way export dialog for the
 *   selected project (Google / Outlook ask for consent first).
 * @traces SE-FR-07, SE-FR-19, UC-07, UC-14
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExportModal, type CalTarget } from '../features/export/ExportModal';
import { projectController } from '../features/projects/projectController';
import { useProjectScope } from '../features/projects/ProjectScope';
import { useRealtime } from '../services/realtimeClient';
import type { CalendarEvent } from '../shared/types';
import { formatTime } from '../shared/format';
import { Alert, Icon, PageHeader, Segmented, Spinner } from '../shared/ui';
import { toApiError } from '../shared/useSave';

type View = 'month' | 'week';
const KIND_ICON: Record<CalendarEvent['kind'], string> = { project_deadline: 'flag', task_due: 'check', soft_deadline: 'target' };
const KIND_LABEL: Record<CalendarEvent['kind'], string> = { project_deadline: 'Project deadline', task_due: 'Task due', soft_deadline: 'Soft deadline' };
/** Mockup chips: .chip-i (blue), .chip-p (purple), .chip-g (gold). */
const KIND_CHIP: Record<CalendarEvent['kind'], string> = {
  task_due: 'bg-brand/15 text-brand border-brand',
  soft_deadline: 'bg-accent-deep text-accent-tint border-accent',
  project_deadline: 'bg-warn/15 text-warn border-warn',
};
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 22;
const WEEK_BODY = 580;

function startOfWeek(d: Date): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - s.getDay());
  return s;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function chipLink(event: CalendarEvent): string {
  return event.task_id ? `/tasks/${event.task_id}` : `/projects/${event.project_id}`;
}

function Chip({ event }: { event: CalendarEvent }) {
  return (
    <Link to={chipLink(event)} title={`${KIND_LABEL[event.kind]} · ${event.title} · ${event.project_name} · ${formatTime(event.starts_at)}`}
      className={`mt-1.5 flex items-center gap-1 overflow-hidden whitespace-nowrap rounded-md border-l-[3px] px-2 py-[3px] text-xs font-semibold leading-4 ${KIND_CHIP[event.kind]} ${event.is_completed ? 'opacity-50 line-through' : ''}`}>
      <Icon name={KIND_ICON[event.kind]} className="h-3 w-3" />
      <span className="truncate">{event.title}</span>
    </Link>
  );
}

export function CalendarPage() {
  const { projects, currentProject } = useProjectScope();
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [projectFilter, setProjectFilter] = useState('');
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportTarget, setExportTarget] = useState<CalTarget | null>(null);

  const range = useMemo(() => {
    if (view === 'week') {
      const start = startOfWeek(cursor);
      return { start, end: addDays(start, 7), days: Array.from({ length: 7 }, (_, i) => addDays(start, i)) };
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = startOfWeek(first);
    const lastOfMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const weeks = Math.ceil((lastOfMonth.getDate() + first.getDay()) / 7);
    return { start, end: addDays(start, weeks * 7), days: Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i)) };
  }, [view, cursor]);

  const load = useCallback(async () => {
    try {
      setEvents(await projectController.calendarEvents(range.start, range.end, projectFilter || undefined));
      setError(null);
    } catch (err) {
      setError(toApiError(err).detail);
    }
  }, [range, projectFilter]);

  useEffect(() => void load(), [load]);
  useRealtime('task_changed', () => void load());
  useRealtime('soft_deadline_changed', () => void load());

  const byDay = (day: Date) => (events ?? []).filter((e) => sameDay(new Date(e.starts_at), day));
  const shift = (dir: number) => setCursor((c) => (view === 'week' ? addDays(c, dir * 7) : new Date(c.getFullYear(), c.getMonth() + dir, 1)));
  const subtitle = view === 'month'
    ? cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : `${range.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${addDays(range.start, 6).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const exportProject = projects.find((p) => p.id === (projectFilter || currentProject?.id));
  const today = new Date();

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle={subtitle}
        actions={
          <select className="input w-auto" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} aria-label="Filter by project">
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        }
      />
      <div className="-mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented ariaLabel="Calendar view" value={view} onChange={setView} options={[{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }]} />
          <button type="button" className="btn-secondary btn-sm px-2" onClick={() => shift(-1)} aria-label="Previous"><Icon name="chevron-left" /></button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setCursor(new Date())}>Today</button>
          <button type="button" className="btn-secondary btn-sm px-2" onClick={() => shift(1)} aria-label="Next"><Icon name="chevron-right" /></button>
        </div>
        {exportProject ? (
          <div className="flex flex-wrap gap-2.5">
            <button type="button" className="btn-secondary btn-sm" onClick={() => setExportTarget('google')}>Connect Google</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setExportTarget('outlook')}>Outlook</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setExportTarget('ical')}>Export iCal</button>
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
        {(Object.keys(KIND_LABEL) as CalendarEvent['kind'][]).map((k) => (
          <span key={k} className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded-sm border-l-[3px] ${KIND_CHIP[k]}`} /><Icon name={KIND_ICON[k]} className="h-3 w-3" /> {KIND_LABEL[k]}</span>
        ))}
      </div>
      {error ? <div className="mt-5"><Alert>{error}</Alert></div> : events === null ? <Spinner /> : view === 'month' ? (
        <div className="card mt-5 overflow-hidden">
          <div className="grid h-10 grid-cols-7 border-b border-line bg-surface-2">
            {WEEKDAYS.map((d) => <div key={d} className="flex items-center justify-center border-r border-line text-xs font-bold uppercase tracking-[0.06em] text-muted last:border-r-0">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 [&>div:nth-child(7n)]:border-r-0">
            {range.days.map((day) => {
              const items = byDay(day);
              const inMonth = day.getMonth() === cursor.getMonth();
              const isToday = sameDay(day, today);
              return (
                <div key={day.toISOString()} className={`min-h-[118px] min-w-0 border-b border-r border-line p-2 ${inMonth ? '' : 'bg-surface-2'}`}>
                  <span className={`block h-6 w-6 text-center text-[13px] font-semibold leading-6 ${isToday ? 'rounded-full bg-accent font-bold text-canvas' : inMonth ? 'text-body' : 'text-muted'}`}>{day.getDate()}</span>
                  {items.slice(0, 3).map((e) => <Chip key={e.id} event={e} />)}
                  {items.length > 3 ? <button type="button" className="mt-1 text-[11px] font-semibold text-accent" onClick={() => { setCursor(day); setView('week'); }}>+{items.length - 3} more</button> : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card mt-5 overflow-hidden">
          <div className="grid h-16 grid-cols-7 border-b border-line bg-surface-2">
            {range.days.map((day) => (
              <div key={day.toISOString()} className="flex flex-col items-center justify-center gap-0.5 border-r border-line last:border-r-0">
                <span className="text-xs font-bold uppercase tracking-[0.06em] text-muted">{WEEKDAYS[day.getDay()]}</span>
                <span className={`h-7 w-7 text-center text-[17px] font-bold leading-7 ${sameDay(day, today) ? 'rounded-full bg-accent text-canvas' : 'text-ink'}`}>{day.getDate()}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7" style={{ height: WEEK_BODY }}>
            {range.days.map((day) => {
              let lastBottom = -Infinity;
              return (
                <div key={day.toISOString()} className="relative min-w-0 border-r border-line last:border-r-0" aria-label={day.toDateString()}>
                  {byDay(day).map((e) => {
                    const d = new Date(e.starts_at);
                    const hours = Math.min(DAY_END_HOUR, Math.max(DAY_START_HOUR, d.getHours() + d.getMinutes() / 60));
                    let top = ((hours - DAY_START_HOUR) / (DAY_END_HOUR - DAY_START_HOUR)) * (WEEK_BODY - 64) + 8;
                    if (top < lastBottom + 4) top = lastBottom + 4;
                    lastBottom = top + 52;
                    return (
                      <Link key={e.id} to={chipLink(e)} style={{ top }} title={`${KIND_LABEL[e.kind]} · ${e.project_name}`}
                        className={`absolute left-2 right-2 overflow-hidden rounded-lg border-l-[3px] px-2.5 py-2 ${KIND_CHIP[e.kind]} ${e.is_completed ? 'opacity-50' : ''}`}>
                        <span className="flex items-center gap-1 truncate text-[13px] font-bold leading-[18px]"><Icon name={KIND_ICON[e.kind]} className="h-3 w-3" />{e.title}</span>
                        <span className="block truncate text-xs leading-4">{formatTime(e.starts_at)} · {e.project_name}</span>
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {exportProject && exportTarget ? (
        <ExportModal open onClose={() => setExportTarget(null)} projectId={exportProject.id} projectName={exportProject.name} role={exportProject.my_role} initialTab="calendar" initialTarget={exportTarget} />
      ) : null}
    </div>
  );
}
