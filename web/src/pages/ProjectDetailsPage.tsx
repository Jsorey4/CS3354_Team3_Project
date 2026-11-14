/**
 * @author Saaqib Shaik - detail view styled like the selected-project panel in projects.html
 * @description One project's overview: details, overall progress and a progress bar for every feature list
 *   (to 0.01%, updated live within 2 seconds of any task change), feature-list management for managers,
 *   the team at a glance, shortcuts to its board / costs / people / charts, export, edit and delete.
 * @traces SE-FR-16, SE-FR-18, SE-NFR-10, SE-FR-19, SE-FR-20, UC-12, UC-14, UC-15
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ExportModal } from '../features/export/ExportModal';
import { PROJECT_STATUSES, PROJECT_TYPES, deadlineCountdown } from '../features/projects/model';
import { projectController } from '../features/projects/projectController';
import { useProjectScope } from '../features/projects/ProjectScope';
import { useRealtime } from '../services/realtimeClient';
import { isManager, isOwner } from '../shared/permissions';
import type { Progress, ProjectDetail, ProjectStatus, ProjectType } from '../shared/types';
import { formatDateTime, fromLocalInput, toLocalInput } from '../shared/format';
import { AccessDenied, Alert, Avatar, AvatarStack, Card, Field, Icon, Modal, ModeBadge, PageHeader, ProgressBar, RetryBanner, RoleBadge, Spinner, StatusBadge } from '../shared/ui';
import { toApiError, useSave } from '../shared/useSave';

/** Donut styled like charts.html: 208px, purple arc on a navy track, big percentage in the middle. */
function ProgressRing({ value }: { value: number }) {
  const r = 84;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[208px] w-[208px] shrink-0">
      <svg viewBox="0 0 208 208" className="h-[208px] w-[208px]" role="img" aria-label={`Overall progress ${value.toFixed(2)} percent`}>
        <circle cx="104" cy="104" r={r} fill="none" stroke="rgb(var(--c-line))" strokeWidth="20" />
        <circle cx="104" cy="104" r={r} fill="none" stroke="rgb(var(--c-accent))" strokeWidth="20" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} transform="rotate(-90 104 104)" style={{ transition: 'stroke-dashoffset .6s' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[40px] font-extrabold leading-[48px] tracking-[-0.02em] text-ink">{value.toFixed(2)}%</span>
        <span className="text-[13px] text-muted">complete</span>
      </div>
    </div>
  );
}

function EditProjectModal({ project, open, onClose, onSaved }: { project: ProjectDetail; open: boolean; onClose: () => void; onSaved: (p: ProjectDetail) => void }) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [type, setType] = useState<ProjectType>(project.project_type);
  const [deadline, setDeadline] = useState(toLocalInput(project.deadline));
  const save = useSave(() => projectController.update(project.id, { name, description, status, project_type: type, deadline: fromLocalInput(deadline) ?? undefined }), onSaved);
  return (
    <Modal open={open} onClose={onClose} title="Edit project" footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" onClick={() => void save.run()} disabled={save.saving}>{save.saving ? 'Saving…' : 'Save'}</button></>}>
      <div className="space-y-4">
        <RetryBanner error={save.networkError} onRetry={save.retry} onCancel={save.cancel} busy={save.saving} />
        {save.error && !Object.keys(save.fieldErrors).length ? <Alert>{save.error.detail}</Alert> : null}
        <Field label="Name" error={save.fieldErrors.name}><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Description"><textarea className="input min-h-[80px]" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Status"><select className="input" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>{PROJECT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></Field>
          <Field label="Type"><select className="input" value={type} onChange={(e) => setType(e.target.value as ProjectType)}>{PROJECT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
          <Field label="Deadline" error={save.fieldErrors.deadline}><input type="datetime-local" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

export function ProjectDetailsPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const { setCurrentProjectId, refresh: refreshScope } = useProjectScope();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<{ status: number; detail: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [newList, setNewList] = useState('');
  const [flash, setFlash] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, prog] = await Promise.all([projectController.get(projectId), projectController.progress(projectId)]);
      setProject(p);
      setProgress(prog);
      setError(null);
    } catch (err) {
      const e = toApiError(err);
      setError({ status: e.status, detail: e.detail });
    }
  }, [projectId]);

  useEffect(() => {
    setCurrentProjectId(projectId);
    void load();
  }, [projectId, load, setCurrentProjectId]);

  useRealtime('progress', (data: Progress) => {
    if (data.project_id !== projectId) return;
    setProgress(data);
    setFlash(true);
    setTimeout(() => setFlash(false), 900);
  });
  useRealtime('membership_changed', (d: { project_id: string }) => d.project_id === projectId && void load());
  useRealtime('project_updated', (d: { project_id: string }) => d.project_id === projectId && void load());

  if (error) return error.status === 403 ? <AccessDenied>You are not a member of this project.</AccessDenied> : <Alert>{error.detail}</Alert>;
  if (!project || !progress) return <Spinner />;
  const manager = isManager(project.my_role);
  const due = deadlineCountdown(project.deadline);

  const addList = async () => {
    if (!newList.trim()) return;
    try {
      await projectController.createList(project.id, newList.trim());
      setNewList('');
      await load();
    } catch (err) {
      setError({ status: 0, detail: toApiError(err).detail });
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${project.name}" and everything in it? This cannot be undone.`)) return;
    try {
      await projectController.remove(project.id);
      await refreshScope();
      navigate('/projects');
    } catch (err) {
      setError({ status: 0, detail: toApiError(err).detail });
    }
  };

  return (
    <div>
      <PageHeader
        title={project.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <ModeBadge mode={project.project_type} />
            <StatusBadge status={project.status} />
            <RoleBadge role={project.my_role} />
            <AvatarStack people={project.members.map((m) => ({ name: m.display_name, url: m.avatar_url }))} max={5} />
            <span className={due.overdue ? 'font-semibold text-danger' : due.soon ? 'font-semibold text-warn' : ''}>Deadline {formatDateTime(project.deadline)} · {due.text}</span>
          </span>
        }
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => setExporting(true)}><Icon name="download" /> Export</button>
            {manager ? <button type="button" className="btn-secondary" onClick={() => setEditing(true)}><Icon name="edit" /> Edit</button> : null}
            {isOwner(project.my_role) ? <button type="button" className="btn-danger" onClick={() => void remove()}><Icon name="trash" /> Delete</button> : null}
          </>
        }
      />
      {project.description ? <p className="-mt-4 mb-6 max-w-3xl text-[15px] text-body">{project.description}</p> : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Progress" className={`lg:col-span-2 transition ${flash ? 'ring-2 ring-ok/50' : ''}`} actions={<span className="text-xs text-muted">{progress.done_tasks}/{progress.total_tasks} tasks done · live</span>}>
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <ProgressRing value={progress.overall_progress_pct} />
            <div className="w-full flex-1 space-y-4">
              {progress.feature_progress.length === 0 ? <p className="text-sm text-muted">No feature lists yet.</p> : progress.feature_progress.map((f) => (
                <div key={f.list_id ?? 'none'}>
                  <ProgressBar value={f.progress_pct} color={project.card_color} label={`${f.name} · ${f.done}/${f.total}`} />
                </div>
              ))}
            </div>
          </div>
          {manager ? (
            <div className="mt-6 flex gap-2 border-t border-line pt-4">
              <input className="input max-w-xs" placeholder="New feature list (e.g. Mobile app)" value={newList} onChange={(e) => setNewList(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addList()} aria-label="New feature list name" />
              <button type="button" className="btn-secondary" onClick={() => void addList()} disabled={!newList.trim()}><Icon name="plus" /> Add list</button>
            </div>
          ) : null}
        </Card>
        <Card title={`Team (${project.members.length})`} actions={<Link to={`/people?project=${project.id}`} className="text-xs font-semibold text-accent">Manage →</Link>}>
          <ul className="space-y-3">
            {project.members.slice(0, 8).map((m) => (
              <li key={m.user_id} className="flex items-center gap-3">
                <Avatar name={m.display_name} url={m.avatar_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.display_name}</p>
                  <p className="text-xs text-muted">{m.open_task_count} open task{m.open_task_count === 1 ? '' : 's'}</p>
                </div>
                <RoleBadge role={m.role} />
              </li>
            ))}
            {project.members.length > 8 ? <li className="text-xs text-muted">+{project.members.length - 8} more</li> : null}
          </ul>
        </Card>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { to: `/board?project=${project.id}`, icon: 'tasks', title: 'Task board', text: 'Plan and move work' },
          { to: `/performance?project=${project.id}`, icon: 'chart', title: 'Performance', text: manager ? 'Team efficiency' : 'Your hours' },
          { to: `/time?project=${project.id}`, icon: 'clock', title: 'Time tracking', text: 'Timers and hours' },
          { to: `/costs?project=${project.id}`, icon: manager ? 'dollar' : 'lock', title: 'Costs', text: manager ? 'Bids, budgets, expenses' : 'Owners & managers only' },
        ].map((l) => (
          <Link key={l.to} to={l.to} className="card flex items-center gap-3 p-5 transition hover:border-accent">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-deep text-accent"><Icon name={l.icon} className="h-5 w-5" /></span>
            <span><span className="block font-semibold text-ink">{l.title}</span><span className="block text-[13px] text-muted">{l.text}</span></span>
          </Link>
        ))}
      </div>
      {editing ? <EditProjectModal project={project} open={editing} onClose={() => setEditing(false)} onSaved={(p) => { setProject(p); setEditing(false); void refreshScope(); }} /> : null}
      <ExportModal open={exporting} onClose={() => setExporting(false)} projectId={project.id} projectName={project.name} role={project.my_role} />
    </div>
  );
}
