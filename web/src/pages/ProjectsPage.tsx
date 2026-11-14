/**
 * @author Saaqib Shaik - matches projects.html
 * @description All of the user's projects as color-coded cards with All / School / Personal / Work filter
 *   tabs and a New project button. Selecting a card shows that project below as a To-do / In progress /
 *   Completed board with member avatars, like the mockup. Card color and order (drag to reorder) are saved
 *   per user; completion bars update live.
 * @traces SE-FR-16, SE-FR-17, SE-FR-18, SE-NFR-09, SE-NFR-10, UC-12, UC-13
 */
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { CreateProjectModal } from '../features/projects/CreateProjectModal';
import { PROJECT_TYPES } from '../features/projects/model';
import { ProjectCard } from '../features/projects/ProjectCard';
import { projectController } from '../features/projects/projectController';
import { useProjectScope } from '../features/projects/ProjectScope';
import { taskController } from '../features/tasks/taskController';
import { useRealtime } from '../services/realtimeClient';
import type { Task } from '../shared/types';
import { formatDate } from '../shared/format';
import { Alert, Avatar, AvatarStack, EmptyState, Icon, ModeBadge, PageHeader, Segmented, Spinner } from '../shared/ui';
import { toApiError } from '../shared/useSave';

const COLUMNS: { key: string; label: string; dot: string; match: (t: Task) => boolean }[] = [
  { key: 'todo', label: 'To-do', dot: 'bg-muted', match: (t) => t.status === 'todo' },
  { key: 'progress', label: 'In progress', dot: 'bg-brand', match: (t) => t.status === 'in_progress' || t.status === 'review' },
  { key: 'done', label: 'Completed', dot: 'bg-ok', match: (t) => t.status === 'done' },
];

function MiniTask({ task }: { task: Task }) {
  const done = task.status === 'done';
  return (
    <Link to={`/tasks/${task.id}`} className="block rounded-btn border border-line bg-surface px-3.5 py-2.5 hover:border-line-strong">
      <span className={`flex items-center gap-2 text-sm font-semibold leading-5 ${done ? 'text-body' : 'text-ink'}`}>
        {done ? <Icon name="check-circle" className="h-4 w-4 text-ok" /> : null}
        <span className="truncate">{task.title}</span>
      </span>
      <span className="mt-1.5 flex items-center justify-between">
        <span className="text-xs text-muted">
          {done ? `Done ${formatDate(task.completed_at, { year: undefined })}` : `Due ${formatDate(task.due_date, { year: undefined })}`}
        </span>
        {task.assignee ? <Avatar name={task.assignee.display_name} url={task.assignee.avatar_url} size="h-[22px] w-[22px]" text="text-[9px]" /> : null}
      </span>
    </Link>
  );
}

export function ProjectsPage() {
  const { user } = useAuth();
  const { projects, loading, refresh, currentProjectId, setCurrentProjectId } = useProjectScope();
  const navigate = useNavigate();
  const [type, setType] = useState<'all' | string>('all');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const visible = useMemo(() => projects.filter((p) => type === 'all' || p.project_type === type), [projects, type]);
  const selected = visible.find((p) => p.id === currentProjectId) ?? visible[0];

  useEffect(() => {
    if (!selected) return;
    setTasks(null);
    taskController.list(selected.id).then(setTasks).catch((err) => setError(toApiError(err).detail));
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useRealtime('task_changed', (d: { project_id: string }) => {
    if (selected && d.project_id === selected.id) taskController.list(selected.id).then(setTasks).catch(() => undefined);
  });

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(toApiError(err).detail);
    }
  };

  const dropOn = (e: DragEvent<HTMLElement>, targetId: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || dragId;
    setDragId(null);
    if (!id || id === targetId) return;
    void act(() => projectController.customizeCard(id, { card_order: projects.findIndex((p) => p.id === targetId) }));
  };

  const active = projects.filter((p) => p.status === 'active').length;
  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={<><b>{active}</b> active · {projects.length} total</>}
        actions={<button type="button" className="btn-primary" onClick={() => setCreating(true)}><Icon name="plus" /> New project</button>}
      />
      <div className="-mt-4 mb-6">
        <Segmented ariaLabel="Project mode" value={type} onChange={setType} options={[{ value: 'all', label: 'All' }, ...PROJECT_TYPES.map((t) => ({ value: t.value, label: t.label }))]} />
      </div>
      {error ? <div className="mb-4"><Alert onClose={() => setError(null)}>{error}</Alert></div> : null}
      {loading ? <Spinner /> : visible.length === 0 ? (
        <div className="card">
          <EmptyState title={projects.length ? 'No projects of this type' : 'No projects yet'} action={<button type="button" className="btn-primary" onClick={() => setCreating(true)}><Icon name="plus" /> New project</button>}>
            {projects.length ? 'Pick another mode above.' : 'Create your first project to get started.'}
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            {visible.map((p) => {
              const index = projects.findIndex((x) => x.id === p.id);
              return (
                <ProjectCard
                  key={p.id}
                  project={p}
                  index={index}
                  total={projects.length}
                  selected={selected?.id === p.id}
                  onSelect={() => setCurrentProjectId(p.id)}
                  onOpen={() => navigate(`/projects/${p.id}`)}
                  onRecolor={(hex) => void act(() => projectController.customizeCard(p.id, { card_color: hex }))}
                  onMove={(order) => void act(() => projectController.customizeCard(p.id, { card_order: order }))}
                  onDragStart={(e) => { setDragId(p.id); e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move'; }}
                  onDropOn={(e) => dropOn(e, p.id)}
                />
              );
            })}
          </div>
          {selected ? (
            <section className="card mt-6 p-6" aria-label={`${selected.name} board`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Link to={`/projects/${selected.id}`} className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em] text-ink hover:underline">{selected.name}</Link>
                  <ModeBadge mode={selected.project_type} />
                </div>
                <span className="flex items-center gap-3">
                  <AvatarStack people={selected.members_preview.map((m) => ({ name: m.display_name || m.username, url: m.avatar_url }))} max={5} />
                  <span className="text-sm text-muted">{selected.member_count} member{selected.member_count === 1 ? '' : 's'}</span>
                </span>
              </div>
              {tasks === null ? <Spinner /> : (
                <div className="mt-4 grid gap-5 rounded-xl border border-line bg-surface-2 px-5 pb-5 pt-4 md:grid-cols-3">
                  {COLUMNS.map((col) => {
                    const items = tasks.filter(col.match);
                    return (
                      <div key={col.key} className="min-w-0">
                        <div className="flex h-7 items-center justify-between">
                          <span className="flex items-center gap-2 text-sm font-bold text-ink"><span className={`h-2 w-2 rounded-full ${col.dot}`} />{col.label}</span>
                          <span className="flex h-[22px] min-w-6 items-center justify-center rounded-full bg-line px-2 text-xs font-semibold text-body">{items.length}</span>
                        </div>
                        <div className="mt-2 flex flex-col gap-2">
                          {items.slice(0, 6).map((t) => <MiniTask key={t.id} task={t} />)}
                          {items.length > 6 ? <Link to={`/board?project=${selected.id}`} className="text-xs font-semibold text-accent">+{items.length - 6} more on the board →</Link> : null}
                          {items.length === 0 ? <p className="rounded-btn border border-dashed border-line py-6 text-center text-xs text-muted">Nothing here</p> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}
        </>
      )}
      <CreateProjectModal
        open={creating}
        defaultType={user?.default_project_type ?? 'work'}
        onClose={() => setCreating(false)}
        onCreated={async (project) => {
          setCreating(false);
          await refresh();
          setCurrentProjectId(project.id);
          navigate(`/projects/${project.id}`);
        }}
      />
    </div>
  );
}
