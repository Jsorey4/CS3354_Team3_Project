/**
 * @author Aashwat Singh - matches tasks.html
 * @description The task board for the current project: To Do / In Progress / Review / Done columns with
 *   drag-and-drop (Task.moveTo) and a Task details panel for the selected card (status, due date, priority,
 *   assignee, tags, soft deadlines). Moves appear instantly and are rolled back if the server refuses them or
 *   the connection fails (with Retry). Filters by text, assignee, tag and feature list. Only owners and
 *   managers see "New task"; members can drag only the tasks assigned to them. Escape closes the task
 *   details panel.
 * @traces SE-FR-26, SE-FR-27, SE-FR-18, SE-NFR-04, SE-NFR-10, SE-NFR-11, UC-18
 */
import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { projectController } from '../features/projects/projectController';
import { ProjectPicker, useProjectScope } from '../features/projects/ProjectScope';
import { TaskCard } from '../features/tasks/TaskCard';
import { TaskForm } from '../features/tasks/TaskForm';
import { BOARD_COLUMNS, Membership, applyMove, canEditTask, filterTasks, groupByStatus, isOverdue, type TaskFilters } from '../features/tasks/model';
import { taskController } from '../features/tasks/taskController';
import { ApiError } from '../services/apiClient';
import { useRealtime } from '../services/realtimeClient';
import type { ProjectDetail, Task, TaskStatus } from '../shared/types';
import { formatDate, formatDateTime } from '../shared/format';
import { Alert, Avatar, EmptyState, Icon, ModeBadge, PageHeader, PriorityBadge, RetryBanner, Spinner, StatusBadge } from '../shared/ui';
import { toApiError } from '../shared/useSave';

const COLUMN_DOT: Record<TaskStatus, string> = { todo: 'bg-muted', in_progress: 'bg-brand', review: 'bg-accent', done: 'bg-ok' };

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="flex flex-wrap items-center justify-end gap-2 text-sm font-semibold text-ink">{children}</span>
    </div>
  );
}

function TaskDetailsPanel({ task, project, onClose }: { task: Task | undefined; project: ProjectDetail; onClose?: () => void }) {
  if (!task) {
    return (
      <aside className="card p-6">
        <p className="eyebrow">Task details</p>
        <p className="mt-3 text-sm text-muted">Select a card to see its details. Double-click (or press Enter) to open it.</p>
      </aside>
    );
  }
  const list = project.lists.find((l) => l.id === task.list_id);
  return (
    <aside className="card p-6" aria-label="Task details">
      <div className="flex items-center justify-between">
        <p className="eyebrow">Task details</p>
        {onClose ? <button type="button" className="btn-ghost p-1.5 2xl:hidden" onClick={onClose} aria-label="Close task details"><Icon name="x" /></button> : null}
      </div>
      <h2 className="mt-2 text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">{task.title}</h2>
      <p className="mt-2 flex items-center gap-2 text-sm text-body">{project.name} <ModeBadge mode={project.project_type} /></p>
      <div className="mt-6">
        <DetailRow label="Status"><StatusBadge status={task.status} /></DetailRow>
        <DetailRow label="Due"><span className={isOverdue(task) ? 'text-danger' : ''}>{task.due_date ? formatDateTime(task.due_date) : '—'}</span></DetailRow>
        <DetailRow label="Priority"><PriorityBadge priority={task.priority} /></DetailRow>
        <DetailRow label="Assigned to">
          {task.assignee ? <><Avatar name={task.assignee.display_name} url={task.assignee.avatar_url} size="h-7 w-7" text="text-[11px]" />{task.assignee.display_name}</> : <span className="font-normal italic text-muted">Unassigned</span>}
        </DetailRow>
        <DetailRow label="List">{list?.name ?? '—'}</DetailRow>
        <DetailRow label="Tags">
          {task.tags.length ? task.tags.map((t) => <span key={t} className="rounded-lg bg-line px-2.5 py-1 text-xs font-semibold text-body">{t}</span>) : <span className="font-normal text-muted">—</span>}
        </DetailRow>
        <DetailRow label="Soft deadlines">
          {task.soft_deadlines_total ? `${task.soft_deadlines_done}/${task.soft_deadlines_total} done${task.next_soft_deadline_at ? ` · next ${formatDate(task.next_soft_deadline_at, { year: undefined })}` : ''}` : <span className="font-normal text-muted">None</span>}
        </DetailRow>
      </div>
      <Link to={`/tasks/${task.id}`} className="btn-secondary mt-6 w-full">Open task <Icon name="chevron-right" /></Link>
    </aside>
  );
}

export function BoardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { currentProjectId, loading: scopeLoading } = useProjectScope();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [filters, setFilters] = useState<TaskFilters>({ search: '', assignee: 'all', tag: '', listId: '' });
  const [dragId, setDragId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedMove, setFailedMove] = useState<{ taskId: string; status: TaskStatus; index: number; error: ApiError } | null>(null);
  const [creating, setCreating] = useState<TaskStatus | null>(null);

  // Escape closes the task details panel (a slide-in drawer on smaller screens), unless a dialog is open
  // on top of it - the dialog handles its own Escape first.
  useEffect(() => {
    if (!selectedId || creating) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) setSelectedId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedId, creating]);

  const load = useCallback(async () => {
    if (!currentProjectId) return;
    try {
      const [p, t, tg] = await Promise.all([projectController.get(currentProjectId), taskController.list(currentProjectId), taskController.tags(currentProjectId)]);
      setProject(p);
      setTasks(t);
      setTags(tg);
      setError(null);
    } catch (err) {
      setError(toApiError(err).detail);
    }
  }, [currentProjectId]);

  useEffect(() => {
    setTasks(null);
    setSelectedId(null);
    void load();
  }, [load]);

  useEffect(() => {
    // Dashboard "New task" button lands here with ?new=1.
    if (params.get('new') === '1' && project && Membership.canAssignTasks(project.my_role)) {
      setCreating('todo');
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, project, setParams]);

  useRealtime('task_changed', (d: { project_id: string }) => {
    if (d.project_id === currentProjectId && !dragId) void load();
  });

  const visible = useMemo(() => filterTasks(tasks ?? [], filters, user?.id), [tasks, filters, user?.id]);
  const columns = useMemo(() => groupByStatus(visible), [visible]);
  const lists = useMemo(() => new Map((project?.lists ?? []).map((l) => [l.id, l])), [project]);

  const commitMove = async (taskId: string, status: TaskStatus, index: number) => {
    if (!tasks) return;
    const before = tasks;
    setTasks(applyMove(tasks, taskId, status, index));
    try {
      await taskController.moveTo(taskId, index, status);
      setFailedMove(null);
    } catch (err) {
      setTasks(before); // snap back to the original column / position
      const apiErr = toApiError(err);
      if (apiErr.isConnectivity) setFailedMove({ taskId, status, index, error: apiErr });
      else setError(apiErr.detail);
    }
  };

  const onDragStart = (e: DragEvent<HTMLElement>, task: Task) => {
    setDragId(task.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
  };

  const dropIndex = (e: DragEvent<HTMLElement>, status: TaskStatus): number => {
    const cards = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-task-id]')).filter((el) => el.dataset.taskId !== dragId);
    const idx = cards.findIndex((el) => {
      const rect = el.getBoundingClientRect();
      return e.clientY < rect.top + rect.height / 2;
    });
    const position = idx === -1 ? cards.length : idx;
    // Map the index among *visible* cards to the full column order used by the server.
    const fullColumn = groupByStatus((tasks ?? []).filter((t) => t.id !== dragId))[status];
    const anchor = cards[position]?.dataset.taskId;
    return anchor ? fullColumn.findIndex((t) => t.id === anchor) : fullColumn.length;
  };

  const onDrop = (e: DragEvent<HTMLElement>, status: TaskStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || dragId;
    setOverColumn(null);
    setDragId(null);
    if (!id) return;
    void commitMove(id, status, dropIndex(e, status));
  };

  if (scopeLoading) return <Spinner />;
  if (!currentProjectId) return <EmptyState title="No project selected" icon="tasks">Create or join a project to see its tasks.</EmptyState>;
  if (error && !tasks) return <Alert>{error}</Alert>;
  if (!tasks || !project) return <Spinner label="Loading tasks…" />;
  const canCreate = Membership.canAssignTasks(project.my_role);
  const weekAhead = Date.now() + 7 * 86_400_000;
  const dueThisWeek = tasks.filter((t) => t.status !== 'done' && t.due_date && new Date(t.due_date).getTime() <= weekAhead).length;
  const selected = tasks.find((t) => t.id === selectedId);

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle={<><b>{dueThisWeek} task{dueThisWeek === 1 ? '' : 's'}</b> due this week · {project.name}{canCreate ? '' : ' · owners and managers create and assign tasks'}</>}
        actions={
          <>
            <ProjectPicker />
            {canCreate ? <button type="button" className="btn-primary" onClick={() => setCreating('todo')}><Icon name="plus" /> New task</button> : null}
          </>
        }
      />
      <div className="-mt-2 mb-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-10" placeholder="Search tasks" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} aria-label="Search tasks" />
        </div>
        <select className="input w-auto" value={filters.assignee} onChange={(e) => setFilters({ ...filters, assignee: e.target.value })} aria-label="Filter by assignee">
          <option value="all">Everyone</option>
          <option value="me">Assigned to me</option>
          <option value="none">Unassigned</option>
          {project.members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
        </select>
        <select className="input w-auto" value={filters.listId} onChange={(e) => setFilters({ ...filters, listId: e.target.value })} aria-label="Filter by feature list">
          <option value="">All lists</option>
          {project.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select className="input w-auto" value={filters.tag} onChange={(e) => setFilters({ ...filters, tag: e.target.value })} aria-label="Filter by tag">
          <option value="">All tags</option>
          {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
        </select>
      </div>
      <div className="mb-4 space-y-3 empty:hidden">
        {error ? <Alert onClose={() => setError(null)}>{error} The card was moved back.</Alert> : null}
        <RetryBanner error={failedMove?.error ?? null} onRetry={() => failedMove && void commitMove(failedMove.taskId, failedMove.status, failedMove.index)} onCancel={() => setFailedMove(null)} />
      </div>
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BOARD_COLUMNS.map((col) => (
            <section
              key={col.status}
              aria-label={`${col.label} column`}
              onDragOver={(e) => { e.preventDefault(); setOverColumn(col.status); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverColumn(null); }}
              onDrop={(e) => onDrop(e, col.status)}
              className={`flex min-h-[420px] min-w-0 flex-col rounded-card border bg-surface-2 p-4 transition ${overColumn === col.status ? 'border-accent' : 'border-line'}`}
            >
              <header className="flex h-7 items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-bold"><span className={`h-2 w-2 rounded-full ${COLUMN_DOT[col.status]}`} />{col.label}</h2>
                <span className="flex items-center gap-1">
                  {canCreate ? <button type="button" className="btn-ghost p-1" onClick={() => setCreating(col.status)} aria-label={`Add task to ${col.label}`}><Icon name="plus" className="h-3.5 w-3.5" /></button> : null}
                  <span className="flex h-[22px] min-w-6 items-center justify-center rounded-full bg-line px-2 text-xs font-semibold text-body">{columns[col.status].length}</span>
                </span>
              </header>
              <div className="mt-3 flex flex-1 flex-col gap-2">
                {columns[col.status].map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    list={task.list_id ? lists.get(task.list_id) : undefined}
                    draggable={canEditTask(project.my_role, task, user?.id)}
                    selected={task.id === selectedId}
                    onSelect={(t) => setSelectedId(t.id)}
                    onOpen={(t) => navigate(`/tasks/${t.id}`)}
                    onDragStart={onDragStart}
                  />
                ))}
                {columns[col.status].length === 0 ? <p className="rounded-btn border border-dashed border-line py-8 text-center text-xs text-muted">Drop tasks here</p> : null}
              </div>
            </section>
          ))}
        </div>
        {selected ? (
          // Below 1536px the panel slides in from the right so the four columns keep the mockup's card width.
          <div className="fixed inset-y-0 right-0 z-40 w-full max-w-[360px] overflow-y-auto border-l border-line bg-canvas p-4 shadow-pop 2xl:sticky 2xl:top-8 2xl:z-auto 2xl:max-w-none 2xl:self-start 2xl:overflow-visible 2xl:border-0 2xl:bg-transparent 2xl:p-0 2xl:shadow-none">
            <TaskDetailsPanel task={selected} project={project} onClose={() => setSelectedId(null)} />
          </div>
        ) : (
          <div className="hidden 2xl:sticky 2xl:top-8 2xl:block 2xl:self-start">
            <TaskDetailsPanel task={undefined} project={project} />
          </div>
        )}
      </div>
      {creating ? (
        <TaskForm
          open
          onClose={() => setCreating(null)}
          projectId={project.id}
          role={project.my_role}
          members={project.members}
          lists={project.lists}
          defaultStatus={creating}
          onSaved={(t) => { setCreating(null); setSelectedId(t.id); void load(); }}
        />
      ) : null}
    </div>
  );
}
