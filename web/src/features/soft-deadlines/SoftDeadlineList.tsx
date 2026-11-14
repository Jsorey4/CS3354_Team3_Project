/**
 * @author Preethi Seereddy
 * @description Soft deadlines on the task screen - the "simple interface" of SE-NFR-03. Checkpoints are
 *   listed in date order with their High / Medium / Low priority. The assignee or a manager adds and edits
 *   them inline with separate date, time and priority controls, ticks them off and deletes them. Problems are
 *   explained right under the controls before anything is sent (date must be earlier than the final due
 *   date); if the server still rejects an edit, the controls snap back to the original saved value it
 *   returns, and a timed-out save offers Retry / Cancel while keeping what was typed (SE-NFR-04).
 * @traces SE-FR-06, SE-FR-07, SE-FR-08, SE-FR-09, SE-FR-10, SE-NFR-03, SE-NFR-04, UC-05, UC-06, UC-07
 */
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../services/apiClient';
import { useRealtime } from '../../services/realtimeClient';
import type { SoftDeadline, SoftDeadlinePriority } from '../../shared/types';
import { formatDateTime } from '../../shared/format';
import { Alert, Badge, EmptyState, Icon, RetryBanner, Spinner, type Tone } from '../../shared/ui';
import { toApiError, useSave } from '../../shared/useSave';
import { SoftDeadlineStateBadge } from './SoftDeadlineBadge';
import { softDeadlineController } from './softDeadlineController';
import { NEEDS_DUE_DATE, SOFT_DEADLINE_PRIORITIES, softDeadlineError } from './validation';

interface Props {
  taskId: string;
  taskDueDate: string | null;
  canManage: boolean;
}

const PRIORITY_TONE: Record<SoftDeadlinePriority, Tone> = { high: 'danger', medium: 'warn', low: 'info' };

/** Local date ("2026-11-20") and time ("17:00") parts of an ISO instant, for the inline inputs. */
function splitLocal(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

function joinLocal(date: string, time: string): string | null {
  if (!date) return null;
  const d = new Date(`${date}T${time || '17:00'}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function PriorityBadge({ priority }: { priority: SoftDeadlinePriority }) {
  return <Badge tone={PRIORITY_TONE[priority]} icon="flag">{priority.charAt(0).toUpperCase() + priority.slice(1)}</Badge>;
}

/** Inline date / time / priority controls shared by the add row and the edit row. */
function DeadlineControls({ title, date, time, priority, onTitle, onDate, onTime, onPriority, maxDate, idPrefix }: {
  title: string; date: string; time: string; priority: SoftDeadlinePriority;
  onTitle: (v: string) => void; onDate: (v: string) => void; onTime: (v: string) => void; onPriority: (v: SoftDeadlinePriority) => void;
  maxDate?: string; idPrefix: string;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9.5rem_8.5rem_7.5rem]">
      <input className="input" placeholder="Checkpoint, e.g. First draft" value={title} onChange={(e) => onTitle(e.target.value)} aria-label={`${idPrefix} soft deadline title`} maxLength={120} />
      <input className="input" type="date" value={date} max={maxDate} onChange={(e) => onDate(e.target.value)} aria-label={`${idPrefix} soft deadline date`} />
      <input className="input" type="time" value={time} onChange={(e) => onTime(e.target.value)} aria-label={`${idPrefix} soft deadline time`} />
      <select className="input" value={priority} onChange={(e) => onPriority(e.target.value as SoftDeadlinePriority)} aria-label={`${idPrefix} soft deadline priority`}>
        {SOFT_DEADLINE_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
    </div>
  );
}

function EditRow({ item, taskDueDate, onSaved, onCancel }: { item: SoftDeadline; taskDueDate: string | null; onSaved: (sd: SoftDeadline) => void; onCancel: () => void }) {
  const original = splitLocal(item.due_at);
  const [title, setTitle] = useState(item.title);
  const [date, setDate] = useState(original.date);
  const [time, setTime] = useState(original.time);
  const [priority, setPriority] = useState<SoftDeadlinePriority>(item.priority);
  const [clientError, setClientError] = useState<string | null>(null);
  const save = useSave(() => softDeadlineController.update(item.id, { title, due_at: joinLocal(date, time) ?? undefined, priority }), onSaved);

  useEffect(() => {
    // UC-06: the server rejected the date and sent back the record it kept - restore that value.
    const kept = (save.error?.body as { original?: SoftDeadline } | undefined)?.original;
    if (kept) {
      const parts = splitLocal(kept.due_at);
      setDate(parts.date);
      setTime(parts.time);
      setTitle(kept.title);
      setPriority(kept.priority);
    }
  }, [save.error]);

  const submit = () => {
    const err = !title.trim() ? 'Give the checkpoint a title' : softDeadlineError(joinLocal(date, time), taskDueDate);
    setClientError(err);
    if (err) {
      setDate(original.date); // keep the original value on an invalid edit
      setTime(original.time);
      return;
    }
    void save.run();
  };

  return (
    <div className="space-y-2 rounded-btn border border-accent bg-accent-deep/40 p-3">
      <RetryBanner error={save.networkError} onRetry={save.retry} onCancel={save.cancel} busy={save.saving} />
      <DeadlineControls title={title} date={date} time={time} priority={priority} onTitle={setTitle} onDate={setDate} onTime={setTime} onPriority={setPriority} idPrefix="Edit" />
      {clientError || save.error ? <p className="flex items-center gap-1 text-xs font-medium text-danger" role="alert"><Icon name="alert" className="h-3 w-3" /> {clientError ?? save.error?.detail}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn-primary btn-sm" onClick={submit} disabled={save.saving}>{save.saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

export function SoftDeadlineList({ taskId, taskDueDate, canManage }: Props) {
  const [items, setItems] = useState<SoftDeadline[] | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('17:00');
  const [priority, setPriority] = useState<SoftDeadlinePriority>('medium');
  const [clientError, setClientError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const load = useCallback(async () => setItems(await softDeadlineController.listForTask(taskId)), [taskId]);
  useEffect(() => void load(), [load]);
  useRealtime('soft_deadline_changed', (data: { task_id: string }) => data.task_id === taskId && void load());

  const sortAndSet = (next: SoftDeadline[]) => setItems([...next].sort((a, b) => a.due_at.localeCompare(b.due_at)));

  const create = useSave(() => softDeadlineController.create(taskId, title.trim(), joinLocal(date, time) ?? '', priority), (sd) => {
    sortAndSet([...(items ?? []), sd]);
    setTitle('');
    setDate('');
    setPriority('medium');
  });

  const add = () => {
    const err = !title.trim() ? 'Give the checkpoint a title' : softDeadlineError(joinLocal(date, time), taskDueDate);
    setClientError(err);
    if (!err) void create.run();
  };

  const toggle = async (sd: SoftDeadline) => {
    try {
      const updated = await softDeadlineController.complete(sd.id, !sd.is_completed);
      sortAndSet((items ?? []).map((x) => (x.id === sd.id ? updated : x)));
    } catch (err) {
      setRowError(toApiError(err).detail);
    }
  };

  const remove = async (sd: SoftDeadline) => {
    try {
      await softDeadlineController.remove(sd.id);
      setItems((items ?? []).filter((x) => x.id !== sd.id));
    } catch (err) {
      setRowError(err instanceof ApiError ? err.detail : 'Could not delete');
    }
  };

  if (items === null) return <Spinner label="Loading soft deadlines…" />;
  return (
    <div className="space-y-3">
      {taskDueDate ? (
        <p className="text-[13px] text-muted">Final due date: <span className="font-semibold text-ink">{formatDateTime(taskDueDate)}</span>. Checkpoints must come before it.</p>
      ) : (
        <Alert tone="info">{NEEDS_DUE_DATE}</Alert>
      )}
      {rowError ? <Alert onClose={() => setRowError(null)}>{rowError}</Alert> : null}
      {items.length === 0 ? (
        <EmptyState icon="target" title="No soft deadlines">Break the work into checkpoints before the final due date.</EmptyState>
      ) : (
        <ul>
          {items.map((sd) =>
            editing === sd.id ? (
              <li key={sd.id} className="py-2">
                <EditRow item={sd} taskDueDate={taskDueDate} onCancel={() => setEditing(null)} onSaved={(u) => { sortAndSet(items.map((x) => (x.id === u.id ? u : x))); setEditing(null); }} />
              </li>
            ) : (
              <li key={sd.id} className="flex min-h-14 items-center gap-3 border-b border-line py-2 last:border-b-0">
                <input type="checkbox" className="h-5 w-5" checked={sd.is_completed} disabled={!canManage} onChange={() => void toggle(sd)} aria-label={`Mark ${sd.title} complete`} />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-[15px] font-semibold ${sd.is_completed ? 'text-muted line-through' : 'text-ink'}`}>{sd.title}</p>
                  <p className="text-[13px] text-muted">{formatDateTime(sd.due_at)}</p>
                </div>
                <PriorityBadge priority={sd.priority} />
                <SoftDeadlineStateBadge state={sd.state} />
                {canManage ? (
                  <>
                    <button type="button" className="btn-ghost p-1.5" onClick={() => setEditing(sd.id)} aria-label={`Edit ${sd.title}`}><Icon name="edit" /></button>
                    <button type="button" className="btn-ghost p-1.5 hover:text-danger" onClick={() => void remove(sd)} aria-label={`Delete ${sd.title}`}><Icon name="trash" /></button>
                  </>
                ) : null}
              </li>
            ),
          )}
        </ul>
      )}
      {canManage && taskDueDate ? (
        <div className="space-y-2 rounded-btn border border-dashed border-line-strong p-3">
          <RetryBanner error={create.networkError} onRetry={create.retry} onCancel={create.cancel} busy={create.saving} />
          <DeadlineControls title={title} date={date} time={time} priority={priority} onTitle={setTitle} onDate={setDate} onTime={setTime} onPriority={setPriority}
            maxDate={splitLocal(taskDueDate).date} idPrefix="New" />
          <div className="flex items-center justify-between gap-3">
            {clientError || create.error ? (
              <p className="flex items-center gap-1 text-xs font-medium text-danger" role="alert"><Icon name="alert" className="h-3 w-3" /> {clientError ?? create.error?.detail}</p>
            ) : (
              <p className="text-xs text-muted">Pick a date and time before the final due date, then a priority.</p>
            )}
            <button type="button" className="btn-primary btn-sm" onClick={add} disabled={create.saving}><Icon name="plus" /> Add</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
