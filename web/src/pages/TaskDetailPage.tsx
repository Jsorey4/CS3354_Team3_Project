/**
 * @author Aashwat Singh (task, comments), Preethi Seereddy (soft deadlines), Jon Sorey (hours & timer) -
 *   styled like the Task details panel in tasks.html
 * @description Everything about one task: status, priority, assignee, list, due date, tags and Markdown
 *   description; its soft deadlines; estimated / assigned / actual hours with a manual log form and the
 *   task timer; and the comment thread with @mentions. Controls appear only for people allowed to use them
 *   (assignee or manager), and the server re-checks every action.
 * @traces SE-FR-26, SE-FR-27, SE-FR-28, SE-FR-29, SE-FR-04, SE-FR-06..SE-FR-10, SE-NFR-03, SE-NFR-11, UC-03, UC-04, UC-05, UC-06, UC-07, UC-18, UC-21
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CommentThread } from '../features/collaboration/CommentThread';
import { SafeMarkdown } from '../features/collaboration/SafeMarkdown';
import { memberController } from '../features/members/memberController';
import { projectController } from '../features/projects/projectController';
import { SoftDeadlineList } from '../features/soft-deadlines/SoftDeadlineList';
import { TaskForm } from '../features/tasks/TaskForm';
import { BOARD_COLUMNS, isOverdue } from '../features/tasks/model';
import { taskController } from '../features/tasks/taskController';
import { TaskTimerWidget } from '../features/time-tracking/TaskTimerWidget';
import { isValidHours } from '../features/time-tracking/model';
import { timeController } from '../features/time-tracking/timeController';
import { useRealtime } from '../services/realtimeClient';
import type { Member, TaskDetail, TaskList, TaskStatus } from '../shared/types';
import { formatDateTime, formatHours, todayIso } from '../shared/format';
import { AccessDenied, Alert, Avatar, Badge, Card, Icon, PriorityBadge, RetryBanner, RoleBadge, Spinner, StatusBadge } from '../shared/ui';
import { toApiError, useSave } from '../shared/useSave';

function HoursCard({ task, onChanged }: { task: TaskDetail; onChanged: () => void }) {
  const manager = task.can_assign;
  const [est, setEst] = useState(task.estimated_hours?.toString() ?? '');
  const [assigned, setAssigned] = useState(task.assigned_hours?.toString() ?? '');
  const [actual, setActual] = useState('');
  const [workDate, setWorkDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const plan = useSave(() => timeController.setHours(task.project_id, task.id, { estimated_hours: est === '' ? null : Number(est), assigned_hours: assigned === '' ? null : Number(assigned) }), () => { setMessage('Planned hours saved'); onChanged(); });
  const log = useSave(() => timeController.setHours(task.project_id, task.id, { actual_hours: Number(actual), work_date: workDate, note }), (r) => { setMessage(`Logged. Actual total: ${formatHours(r.actual_hours)}`); setActual(''); setNote(''); onChanged(); });
  const canTrack = task.can_edit;
  return (
    <Card title="Hours">
      <div className="space-y-4">
        {message ? <Alert tone="ok" onClose={() => setMessage(null)}>{message}</Alert> : null}
        <dl className="grid grid-cols-3 gap-3 text-center">
          {[['Estimated', task.estimated_hours], ['Assigned', task.assigned_hours], ['Actual', task.actual_hours]].map(([k, v]) => (
            <div key={k as string} className="rounded-lg bg-surface-2 p-3"><dt className="text-[10px] font-semibold uppercase text-muted">{k}</dt><dd className="text-lg font-bold">{formatHours(v as number | null)}</dd></div>
          ))}
        </dl>
        {manager ? (
          <div className="space-y-2 border-t border-line pt-4">
            <p className="label">Plan (owners & managers)</p>
            <RetryBanner error={plan.networkError} onRetry={plan.retry} onCancel={plan.cancel} busy={plan.saving} />
            {plan.error ? <Alert>{plan.error.detail}</Alert> : null}
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <input className="input" type="number" min={0} step="0.25" placeholder="Estimated" value={est} onChange={(e) => setEst(e.target.value)} aria-label="Estimated hours" />
              <input className="input" type="number" min={0} step="0.25" placeholder="Assigned" value={assigned} onChange={(e) => setAssigned(e.target.value)} aria-label="Assigned hours" />
              <button type="button" className="btn-secondary" onClick={() => void plan.run()} disabled={plan.saving}>Save</button>
            </div>
          </div>
        ) : null}
        <div className="space-y-2 border-t border-line pt-4">
          <p className="label">Timer</p>
          <TaskTimerWidget taskId={task.id} taskTitle={task.title} canTrack={canTrack} onStopped={onChanged} />
        </div>
        {canTrack ? (
          <div className="space-y-2 border-t border-line pt-4">
            <p className="label">Log hours manually</p>
            <RetryBanner error={log.networkError} onRetry={log.retry} onCancel={log.cancel} busy={log.saving} />
            {log.error ? <Alert>{log.error.detail}</Alert> : null}
            <div className="grid grid-cols-[6rem_1fr] gap-2">
              <input className="input" type="number" min={0.25} max={24} step="0.25" placeholder="Hours" value={actual} onChange={(e) => setActual(e.target.value)} aria-label="Hours worked" />
              <input className="input" type="date" value={workDate} max={todayIso()} onChange={(e) => setWorkDate(e.target.value)} aria-label="Work date" />
            </div>
            <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} aria-label="Note" />
            <button type="button" className="btn-primary w-full" disabled={!isValidHours(actual) || log.saving} onClick={() => void log.run()}><Icon name="clock" /> Log time</button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function TaskDetailPage() {
  const { taskId = '' } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  // Hash set of member usernames: each @mention in the description is checked in O(1).
  const memberNames = useMemo(() => new Set(members.map((m) => m.username.toLowerCase())), [members]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [error, setError] = useState<{ status: number; detail: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const t = await taskController.get(taskId);
      setTask(t);
      const [m, p] = await Promise.all([memberController.list(t.project_id), projectController.get(t.project_id)]);
      setMembers(m);
      setLists(p.lists);
      setError(null);
    } catch (err) {
      const e = toApiError(err);
      setError({ status: e.status, detail: e.detail });
    }
  }, [taskId]);

  useEffect(() => void load(), [load]);
  useRealtime('task_changed', (d: { task_id: string | null }) => (d.task_id === taskId || d.task_id === null) && void load());

  if (error) return error.status === 403 ? <AccessDenied>You are not a member of this task's project.</AccessDenied> : <Alert>{error.detail}</Alert>;
  if (!task) return <Spinner label="Loading task…" />;

  const setStatus = async (status: TaskStatus) => {
    try {
      setTask(await taskController.update(task.id, { status }));
    } catch (err) {
      setActionError(toApiError(err).detail);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    try {
      await taskController.remove(task.id);
      navigate(`/board?project=${task.project_id}`);
    } catch (err) {
      setActionError(toApiError(err).detail);
    }
  };

  const list = lists.find((l) => l.id === task.list_id);
  const overdue = isOverdue(task);
  return (
    <div>
      <nav className="mb-2 text-sm text-muted">
        <Link to={`/projects/${task.project_id}`} className="hover:text-ink">{task.project_name}</Link> <span aria-hidden>/</span>{' '}
        <Link to={`/board?project=${task.project_id}`} className="hover:text-ink">Tasks</Link>
      </nav>
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow">Task details</p>
          <h1 className="page-title mt-1">{task.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            {list ? <Badge tone="neutral" icon="layout">{list.name}</Badge> : null}
            {task.tags.map((t) => <span key={t} className="rounded-lg bg-line px-2.5 py-1 text-xs font-semibold text-body">{t}</span>)}
            <span className="ml-1 text-xs text-muted">Your role</span><RoleBadge role={task.my_role} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {task.can_edit ? (
            <select className="input w-auto" value={task.status} onChange={(e) => void setStatus(e.target.value as TaskStatus)} aria-label="Change status">
              {BOARD_COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
            </select>
          ) : null}
          {task.can_edit ? <button type="button" className="btn-secondary" onClick={() => setEditing(true)}><Icon name="edit" /> Edit</button> : null}
          {task.can_assign ? <button type="button" className="btn-danger" onClick={() => void remove()}><Icon name="trash" /></button> : null}
        </div>
      </div>
      {actionError ? <div className="mb-4"><Alert onClose={() => setActionError(null)}>{actionError}</Alert></div> : null}
      {!task.can_edit ? <div className="mb-4"><Alert tone="info">You can view and comment on this task. Only its assignee or a manager can change it.</Alert></div> : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Description">
            {task.description ? <SafeMarkdown source={task.description} memberNames={memberNames} /> : <p className="text-sm text-muted">No description.</p>}
          </Card>
          <Card title="Soft deadlines">
            <SoftDeadlineList taskId={task.id} taskDueDate={task.due_date} canManage={task.can_edit} />
          </Card>
          <Card title={`Comments (${task.comment_count})`}>
            <CommentThread taskId={task.id} members={members} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Details">
            <dl className="text-sm">
              <div className="flex min-h-14 items-center justify-between gap-2 border-b border-line">
                <dt className="text-muted">Status</dt><dd><StatusBadge status={task.status} /></dd>
              </div>
              <div className="flex min-h-14 items-center justify-between gap-2 border-b border-line">
                <dt className="text-muted">Due</dt><dd className={`font-semibold ${overdue ? 'text-danger' : 'text-ink'}`}>{formatDateTime(task.due_date)}{overdue ? ' · overdue' : ''}</dd>
              </div>
              <div className="flex min-h-14 items-center justify-between gap-2 border-b border-line">
                <dt className="text-muted">Priority</dt><dd><PriorityBadge priority={task.priority} /></dd>
              </div>
              <div className="flex min-h-14 items-center justify-between gap-2 border-b border-line">
                <dt className="text-muted">Assigned to</dt>
                <dd className="flex items-center gap-2 font-semibold text-ink">{task.assignee ? <><Avatar name={task.assignee.display_name} url={task.assignee.avatar_url} size="h-7 w-7" text="text-[11px]" /> {task.assignee.display_name}</> : <span className="font-normal italic text-muted">Unassigned</span>}</dd>
              </div>
              <div className="flex min-h-14 items-center justify-between gap-2 border-b border-line last:border-b-0">
                <dt className="text-muted">Created</dt><dd className="font-semibold text-ink">{formatDateTime(task.created_at)}</dd>
              </div>
              {task.completed_at ? <div className="flex min-h-14 items-center justify-between gap-2"><dt className="text-muted">Completed</dt><dd className="font-semibold text-ink">{formatDateTime(task.completed_at)}</dd></div> : null}
            </dl>
            {!task.can_assign ? <p className="mt-4 flex items-center gap-1.5 text-xs text-muted"><Icon name="lock" className="h-3 w-3" /> Only owners and managers can assign tasks.</p> : null}
          </Card>
          <HoursCard key={`${task.id}-${task.updated_at}`} task={task} onChanged={() => void load()} />
        </div>
      </div>
      {editing ? <TaskForm open onClose={() => setEditing(false)} projectId={task.project_id} role={task.my_role} members={members} lists={lists} task={task} onSaved={(t) => { setTask(t); setEditing(false); }} /> : null}
    </div>
  );
}
