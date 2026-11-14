/**
 * @author Jon Sorey (time), Saaqib Shaik (export) - matches time-tracking.html
 * @description "Time tracking & export": a Timer card (pick one of your tasks, big live clock, Start /
 *   Pause / Stop), a Recent time records card with "Manual entry", and an Export card (project, which data
 *   to include, Excel (.xlsx) or Google Sheets). Below, the full time-entry table: members only ever see
 *   their own entries; owners and managers can switch to the whole project. Cost data is only offered to
 *   owners and managers, and the server applies the same rule.
 * @traces SE-FR-04, SE-FR-20, SE-NFR-02, UC-03, UC-04, UC-15
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { exportController } from '../features/export/exportController';
import { useProjectScope } from '../features/projects/ProjectScope';
import { taskController } from '../features/tasks/taskController';
import { TaskTimerWidget } from '../features/time-tracking/TaskTimerWidget';
import { hoursByDay, isValidHours } from '../features/time-tracking/model';
import { timeController } from '../features/time-tracking/timeController';
import { useRealtime } from '../services/realtimeClient';
import { isManager } from '../shared/permissions';
import type { SpreadsheetSection, Task, TimeEntry } from '../shared/types';
import { formatDateTime, formatDuration, formatHours, todayIso } from '../shared/format';
import { Alert, Badge, Card, EmptyState, Field, Icon, Modal, PageHeader, RetryBanner, Segmented, Spinner } from '../shared/ui';
import { toApiError, useSave } from '../shared/useSave';

function weekDays(): string[] {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

/** "2:10" style duration used by the mockup's recent records. */
function hm(hours: number | null): string {
  if (hours == null) return '—';
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

type Include = 'project' | 'time' | 'cost';
const INCLUDE_SECTIONS: Record<Include, SpreadsheetSection[]> = {
  project: ['tasks', 'soft_deadlines'],
  time: ['time_entries'],
  cost: ['financials', 'stage_costs', 'expenses'],
};

function ExportCard() {
  const { projects, currentProject } = useProjectScope();
  const [projectId, setProjectId] = useState(currentProject?.id ?? '');
  const [include, setInclude] = useState<Record<Include, boolean>>({ project: true, time: true, cost: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'danger' | 'warn'; text: string } | null>(null);
  useEffect(() => { if (!projectId && currentProject) setProjectId(currentProject.id); }, [currentProject, projectId]);
  const project = projects.find((p) => p.id === projectId);
  const canCost = isManager(project?.my_role);
  const sections = (Object.keys(include) as Include[]).filter((k) => include[k] && (k !== 'cost' || canCost)).flatMap((k) => INCLUDE_SECTIONS[k]);

  const run = async (kind: 'excel' | 'sheets') => {
    if (!project) return;
    setBusy(true);
    setMessage(null);
    try {
      if (kind === 'excel') {
        const { count, filename } = await exportController.downloadXlsx(project.id, sections);
        setMessage({ tone: 'ok', text: `${count} records saved to ${filename}` });
      } else {
        const result = await exportController.toSheets(project.id, sections);
        setMessage({ tone: 'ok', text: result.message });
      }
    } catch (err) {
      const e = toApiError(err);
      setMessage({ tone: e.detail === 'Nothing to export' ? 'warn' : 'danger', text: e.detail });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Export" className="flex flex-col" bodyClass="flex flex-1 flex-col">
      <label className="text-[13px] font-semibold text-muted" htmlFor="ex-project">Project</label>
      <select id="ex-project" className="input mt-2" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
        {projects.map((p) => <option key={p.id} value={p.id}>Project: {p.name}</option>)}
      </select>
      <p className="mt-4 text-[13px] font-semibold text-muted">Include</p>
      <div className="mt-3 flex flex-col gap-3.5">
        {([['project', 'Project info'], ['time', 'Time records'], ['cost', 'Cost summary']] as [Include, string][]).map(([key, label]) => {
          const locked = key === 'cost' && !canCost;
          return (
            <label key={key} className={`flex items-center gap-3 text-[15px] text-ink ${locked ? 'opacity-60' : ''}`}>
              <input type="checkbox" className="h-5 w-5" disabled={locked} checked={!locked && include[key]} onChange={(e) => setInclude({ ...include, [key]: e.target.checked })} />
              {label}
              {locked ? <span className="ml-auto flex items-center gap-1 text-xs text-muted"><Icon name="lock" className="h-3 w-3" /> Managers only</span> : null}
            </label>
          );
        })}
      </div>
      {message ? <div className="mt-4"><Alert tone={message.tone} onClose={() => setMessage(null)}>{message.text}</Alert></div> : null}
      <div className="mt-auto flex flex-col gap-2.5 pt-6">
        <button type="button" className="btn-primary w-full" disabled={busy || !project || sections.length === 0} onClick={() => void run('excel')}><Icon name="download" /> Excel (.xlsx)</button>
        <button type="button" className="btn-secondary w-full" disabled={busy || !project || sections.length === 0} onClick={() => void run('sheets')}><Icon name="download" /> Google Sheets</button>
      </div>
    </Card>
  );
}

export function TimeTrackingPage() {
  const { currentProject } = useProjectScope();
  const [myTasks, setMyTasks] = useState<Task[] | null>(null);
  const [taskId, setTaskId] = useState('');
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const [myEntries, setMyEntries] = useState<TimeEntry[]>([]);
  const [running, setRunning] = useState<TimeEntry | null>(null);
  const [scope, setScope] = useState<'mine' | 'project'>('mine');
  const [manualOpen, setManualOpen] = useState(false);
  const [hours, setHours] = useState('');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [manualTask, setManualTask] = useState('');
  const [error, setError] = useState<string | null>(null);
  const days = weekDays();
  const canSeeProject = isManager(currentProject?.my_role);

  const loadEntries = useCallback(async () => {
    try {
      const own = await timeController.list({});
      setMyEntries(own);
      setEntries(scope === 'project' && currentProject ? await timeController.list({ project_id: currentProject.id }) : own);
    } catch (err) {
      setError(toApiError(err).detail);
    }
  }, [scope, currentProject]);

  useEffect(() => {
    taskController.mine(false).then((t) => {
      setMyTasks(t);
      setTaskId((cur) => cur || t[0]?.id || '');
      setManualTask((cur) => cur || t[0]?.id || '');
    }).catch((err) => setError(toApiError(err).detail));
  }, []);
  useEffect(() => void loadEntries(), [loadEntries]);
  useEffect(() => { if (!canSeeProject) setScope('mine'); }, [canSeeProject]);
  useRealtime('timer', () => void loadEntries());
  const onActiveChange = useCallback((entry: TimeEntry | null) => {
    setRunning(entry);
    if (entry) setTaskId(entry.task_id);
  }, []);

  const selected = myTasks?.find((t) => t.id === taskId);
  const manual = myTasks?.find((t) => t.id === manualTask);
  const log = useSave(
    () => timeController.setHours(manual!.project_id, manual!.id, { actual_hours: Number(hours), work_date: date, note }),
    () => { setHours(''); setNote(''); setManualOpen(false); void loadEntries(); },
  );

  const weekTotal = hoursByDay(myEntries, days).reduce((a, b) => a + b, 0);
  const recent = myEntries.filter((e) => !e.is_running).slice(0, 4);

  const remove = async (id: string) => {
    try {
      await timeController.remove(id);
      void loadEntries();
    } catch (err) {
      setError(toApiError(err).detail);
    }
  };

  return (
    <div>
      <PageHeader title="Time tracking & export" subtitle={running ? <><b>1 timer</b> running</> : 'No timer running'} />
      {error ? <div className="mb-4"><Alert onClose={() => setError(null)}>{error}</Alert></div> : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          title="Timer"
          className="flex min-h-[440px] flex-col"
          actions={running ? <span className="flex items-center gap-1.5 text-xs font-semibold text-ok"><span className="h-2 w-2 rounded-full bg-ok" />{running.is_paused ? 'Paused' : 'Running'}</span> : null}
        >
          {myTasks === null ? <Spinner /> : myTasks.length === 0 ? (
            <EmptyState icon="clock" title="No open tasks assigned to you">When a manager assigns you a task, you can time it here.</EmptyState>
          ) : (
            <>
              <select className="input" value={taskId} onChange={(e) => setTaskId(e.target.value)} aria-label="Task to time" disabled={!!running}>
                {myTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
              {selected ? (
                <div className="mt-10">
                  <TaskTimerWidget variant="hero" taskId={selected.id} taskTitle={selected.title} projectName={`Est ${formatHours(selected.estimated_hours)} · Actual ${formatHours(selected.actual_hours)}`} canTrack onStopped={() => void loadEntries()} onActiveChange={onActiveChange} />
                </div>
              ) : null}
            </>
          )}
        </Card>
        <Card title="Recent time records" className="flex min-h-[440px] flex-col" bodyClass="flex flex-1 flex-col">
          {recent.length === 0 ? <EmptyState icon="clock" title="No time logged yet" /> : (
            <ul>
              {recent.map((e) => (
                <li key={e.id} className="flex h-16 items-center justify-between gap-3 border-b border-line last:border-b-0">
                  <Link to={`/tasks/${e.task_id}`} className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-ink">{e.task_title}</span>
                    <span className="block truncate text-[13px] text-muted">{e.project_name}</span>
                  </Link>
                  <span className="text-[15px] font-bold tabular-nums text-ink">{hm(e.duration_hours)}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn-secondary mt-auto w-full" disabled={!myTasks?.length} onClick={() => setManualOpen(true)}><Icon name="plus" /> Manual entry</button>
        </Card>
        <ExportCard />
      </div>

      <Card
        title="Time entries"
        className="mt-6"
        actions={
          <span className="flex items-center gap-3">
            <span>This week <b className="text-ink">{weekTotal.toFixed(2)} h</b></span>
            {canSeeProject ? <Segmented ariaLabel="Entries scope" value={scope} onChange={setScope} options={[{ value: 'mine', label: 'Mine' }, { value: 'project', label: 'Whole project' }]} /> : <Badge tone="neutral" icon="lock">Only your entries</Badge>}
          </span>
        }
      >
        {entries === null ? <Spinner /> : entries.length === 0 ? <EmptyState icon="clock" title="No time logged yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><th className="table-head">Task</th><th className="table-head">Project</th>{scope === 'project' ? <th className="table-head">Person</th> : null}<th className="table-head">Started</th><th className="table-head">Source</th><th className="table-head text-right">Hours</th><th className="table-head w-12" /></tr></thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-b-0">
                    <td className="table-cell"><Link to={`/tasks/${e.task_id}`} className="font-semibold text-ink hover:underline">{e.task_title}</Link>{e.note ? <p className="text-xs text-muted">{e.note}</p> : null}</td>
                    <td className="table-cell">{e.project_name}</td>
                    {scope === 'project' ? <td className="table-cell">@{e.username}</td> : null}
                    <td className="table-cell whitespace-nowrap">{formatDateTime(e.started_at)}</td>
                    <td className="table-cell">{e.is_running ? <Badge tone="ok" icon={e.is_paused ? 'pause' : 'play'}>{e.is_paused ? 'Paused' : 'Running'} {formatDuration(e.elapsed_seconds)}</Badge> : <Badge tone="neutral" icon={e.source === 'timer' ? 'clock' : 'edit'}>{e.source === 'timer' ? 'Timer' : 'Manual'}</Badge>}</td>
                    <td className="table-cell text-right font-bold tabular-nums text-ink">{formatHours(e.duration_hours)}</td>
                    <td className="table-cell">{!e.is_running ? <button type="button" className="btn-ghost p-1.5 hover:text-danger" onClick={() => void remove(e.id)} aria-label="Delete entry"><Icon name="trash" /></button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={manualOpen}
        title="Manual entry"
        onClose={() => setManualOpen(false)}
        footer={<><button type="button" className="btn-secondary" onClick={() => setManualOpen(false)}>Cancel</button><button type="button" className="btn-primary" disabled={!isValidHours(hours) || log.saving || !manual} onClick={() => void log.run()}>{log.saving ? 'Saving…' : 'Log time'}</button></>}
      >
        <div className="space-y-4">
          <RetryBanner error={log.networkError} onRetry={log.retry} onCancel={log.cancel} busy={log.saving} />
          {log.error ? <Alert>{log.error.detail}</Alert> : null}
          <Field label="Task" htmlFor="me-task">
            <select id="me-task" className="input" value={manualTask} onChange={(e) => setManualTask(e.target.value)}>
              {(myTasks ?? []).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Hours" htmlFor="me-hours" hint="0.25 to 24"><input id="me-hours" className="input" type="number" min={0.25} max={24} step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
            <Field label="Date" htmlFor="me-date"><input id="me-date" className="input" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
          <Field label="Note" htmlFor="me-note"><input id="me-note" className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></Field>
        </div>
      </Modal>
    </div>
  );
}
