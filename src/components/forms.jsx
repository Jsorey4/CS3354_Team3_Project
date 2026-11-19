// Create / edit dialogs shared across screens.
import { useState } from 'react';
import { useStore } from '../lib/store';
import { todayStr, timeToHours } from '../lib/date';
import { CATEGORIES, EVENT_COLORS, PRIORITIES, PROJECT_COLORS, STATUSES } from '../lib/theme';
import { isEmail } from '../lib/api';
import { ConfirmModal, Field, Modal, useToast } from './ui';

const Footer = ({ onClose, submitLabel, onDelete, deleteLabel = 'Delete' }) => (
  <>
    {onDelete && (
      <button type="button" className="btn btn-danger-ghost" onClick={onDelete} style={{ marginRight: 'auto' }}>
        {deleteLabel}
      </button>
    )}
    <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
    <button type="submit" form="pf-form" className="btn btn-primary">{submitLabel}</button>
  </>
);

// ---------------------------------------------------------------- Task
export function TaskModal({ task, defaults = {}, onClose, onSaved }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const editing = Boolean(task);
  const [f, setF] = useState(() => ({
    title: task?.title ?? '',
    projectId: task?.projectId ?? defaults.projectId ?? state.projects[0]?.id ?? '',
    status: task?.status ?? defaults.status ?? 'todo',
    due: task?.due ?? defaults.due ?? todayStr(),
    assignee: task?.assignee ?? defaults.assignee ?? state.meId,
    priority: task?.priority ?? 'Medium',
    tags: (task?.tags ?? []).join(', '),
  }));
  const [err, setErr] = useState({});
  const [confirm, setConfirm] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    const errors = {};
    if (!f.title.trim()) errors.title = 'Give the task a name.';
    if (!f.projectId) errors.projectId = 'Create a project first.';
    setErr(errors);
    if (Object.keys(errors).length) return;
    const data = {
      title: f.title.trim(),
      projectId: f.projectId,
      status: f.status,
      due: f.due || null,
      assignee: f.assignee || null,
      priority: f.priority,
      tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
    };
    if (editing) {
      actions.updateTask(task.id, data);
      toast('Task updated');
      onSaved?.(task.id);
    } else {
      const id = actions.addTask(data);
      toast('Task created');
      onSaved?.(id);
    }
    onClose();
  };

  return (
    <>
      <Modal
        title={editing ? 'Edit task' : 'New task'}
        onClose={onClose}
        footer={<Footer onClose={onClose} submitLabel={editing ? 'Save changes' : 'Create task'} onDelete={editing ? () => setConfirm(true) : null} />}
      >
        <form id="pf-form" className="pf-form" onSubmit={submit} noValidate>
          <Field label="Title" error={err.title}>
            <input className="pf-input" value={f.title} onChange={set('title')} placeholder="e.g. Write abstract" />
          </Field>
          <div className="pf-grid2">
            <Field label="Project" error={err.projectId}>
              <select className="pf-input" value={f.projectId} onChange={set('projectId')}>
                {state.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className="pf-input" value={f.status} onChange={set('status')}>
                {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.pill}</option>)}
              </select>
            </Field>
            <Field label="Due date">
              <input className="pf-input" type="date" value={f.due ?? ''} onChange={set('due')} />
            </Field>
            <Field label="Priority">
              <select className="pf-input" value={f.priority} onChange={set('priority')}>
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Assigned to">
            <select className="pf-input" value={f.assignee ?? ''} onChange={set('assignee')}>
              <option value="">Unassigned</option>
              {state.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Tags" hint="Comma separated, e.g. report, lab">
            <input className="pf-input" value={f.tags} onChange={set('tags')} placeholder="report, lab" />
          </Field>
        </form>
      </Modal>
      {confirm && (
        <ConfirmModal
          title="Delete task?"
          message={`“${task.title}” will be permanently removed.`}
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            actions.deleteTask(task.id);
            toast('Task deleted');
            onClose();
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------- Project
export function ProjectModal({ project, onClose, onSaved }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const editing = Boolean(project);
  const [f, setF] = useState(() => ({
    name: project?.name ?? '',
    category: project?.category ?? 'School',
    color: project?.color ?? 'purple',
    due: project?.due ?? '',
    budget: project?.budget ?? '',
    members: project?.members ?? [state.meId],
  }));
  const [err, setErr] = useState({});
  const [confirm, setConfirm] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleMember = (id) => setF({ ...f, members: f.members.includes(id) ? f.members.filter((m) => m !== id) : [...f.members, id] });

  const submit = (e) => {
    e.preventDefault();
    const errors = {};
    if (!f.name.trim()) errors.name = 'Give the project a name.';
    if (f.budget !== '' && (Number.isNaN(Number(f.budget)) || Number(f.budget) < 0)) errors.budget = 'Enter a positive amount.';
    setErr(errors);
    if (Object.keys(errors).length) return;
    const data = { name: f.name.trim(), category: f.category, color: f.color, due: f.due || null, budget: Number(f.budget) || 0, members: f.members };
    if (editing) {
      actions.updateProject(project.id, data);
      toast('Project updated');
      onSaved?.(project.id);
    } else {
      const id = actions.addProject(data);
      toast('Project created');
      onSaved?.(id);
    }
    onClose();
  };

  return (
    <>
      <Modal
        title={editing ? 'Edit project' : 'New project'}
        onClose={onClose}
        footer={<Footer onClose={onClose} submitLabel={editing ? 'Save changes' : 'Create project'} onDelete={editing ? () => setConfirm(true) : null} />}
      >
        <form id="pf-form" className="pf-form" onSubmit={submit} noValidate>
          <Field label="Name" error={err.name}>
            <input className="pf-input" value={f.name} onChange={set('name')} placeholder="e.g. Science fair" />
          </Field>
          <div className="pf-grid2">
            <Field label="Category">
              <select className="pf-input" value={f.category} onChange={set('category')}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Due date">
              <input className="pf-input" type="date" value={f.due ?? ''} onChange={set('due')} />
            </Field>
            <Field label="Budget ($)" error={err.budget}>
              <input className="pf-input" type="number" min="0" step="50" value={f.budget} onChange={set('budget')} placeholder="2000" />
            </Field>
            <Field label="Colour">
              <div className="pf-swatches">
                {Object.entries(PROJECT_COLORS).map(([k, c]) => (
                  <button
                    type="button"
                    key={k}
                    className={`pf-swatch${f.color === k ? ' on' : ''}`}
                    style={{ background: c.main }}
                    onClick={() => setF({ ...f, color: k })}
                    aria-label={c.label}
                    title={c.label}
                  />
                ))}
              </div>
            </Field>
          </div>
          <Field label="Members">
            <div className="pf-chips">
              {state.people.map((p) => (
                <button type="button" key={p.id} className={`pf-chip${f.members.includes(p.id) ? ' on' : ''}`} onClick={() => toggleMember(p.id)}>
                  {p.name}
                </button>
              ))}
            </div>
          </Field>
        </form>
      </Modal>
      {confirm && (
        <ConfirmModal
          title="Delete project?"
          message={`“${project.name}” and all of its tasks, time records and events will be removed.`}
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            actions.deleteProject(project.id);
            toast('Project deleted');
            onClose();
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------- Event
export function EventModal({ event, defaults = {}, onClose }) {
  const { actions } = useStore();
  const toast = useToast();
  const editing = Boolean(event?.id);
  const [f, setF] = useState(() => ({
    title: event?.title ?? '',
    date: event?.date ?? defaults.date ?? todayStr(),
    allDay: event?.allDay ?? defaults.allDay ?? false,
    start: event?.start ?? defaults.start ?? '10:00',
    end: event?.end ?? defaults.end ?? '11:00',
    color: event?.color ?? 'gold',
  }));
  const [err, setErr] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    const errors = {};
    if (!f.title.trim()) errors.title = 'Give the event a name.';
    if (!f.date) errors.date = 'Pick a date.';
    if (!f.allDay && timeToHours(f.end) <= timeToHours(f.start)) errors.end = 'End must be after start.';
    setErr(errors);
    if (Object.keys(errors).length) return;
    actions.saveEvent({ ...(event || {}), title: f.title.trim(), date: f.date, allDay: f.allDay, start: f.start, end: f.end, color: f.color });
    toast(editing ? 'Event updated' : 'Event added');
    onClose();
  };

  return (
    <Modal
      title={editing ? 'Edit event' : 'New event'}
      onClose={onClose}
      footer={
        <Footer
          onClose={onClose}
          submitLabel={editing ? 'Save changes' : 'Add event'}
          onDelete={
            editing
              ? () => {
                  actions.deleteEvent(event.id);
                  toast('Event deleted');
                  onClose();
                }
              : null
          }
        />
      }
    >
      <form id="pf-form" className="pf-form" onSubmit={submit} noValidate>
        <Field label="Title" error={err.title}>
          <input className="pf-input" value={f.title} onChange={set('title')} placeholder="e.g. Team sync" />
        </Field>
        <div className="pf-grid2">
          <Field label="Date" error={err.date}>
            <input className="pf-input" type="date" value={f.date} onChange={set('date')} />
          </Field>
          <Field label="Colour">
            <select className="pf-input" value={f.color} onChange={set('color')}>
              {Object.entries(EVENT_COLORS).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
            </select>
          </Field>
        </div>
        <label className="pf-inline-check">
          <input type="checkbox" checked={f.allDay} onChange={(e) => setF({ ...f, allDay: e.target.checked })} /> All-day event
        </label>
        {!f.allDay && (
          <div className="pf-grid2">
            <Field label="Start">
              <input className="pf-input" type="time" value={f.start} onChange={set('start')} />
            </Field>
            <Field label="End" error={err.end}>
              <input className="pf-input" type="time" value={f.end} onChange={set('end')} />
            </Field>
          </div>
        )}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- Member
export function MemberModal({ onClose }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const [f, setF] = useState({ name: '', email: '', projectIds: state.projects[0] ? [state.projects[0].id] : [] });
  const [err, setErr] = useState({});
  const toggle = (id) => setF({ ...f, projectIds: f.projectIds.includes(id) ? f.projectIds.filter((x) => x !== id) : [...f.projectIds, id] });

  const submit = (e) => {
    e.preventDefault();
    const errors = {};
    if (!f.name.trim()) errors.name = 'Enter a name.';
    if (f.email && !isEmail(f.email)) errors.email = 'Enter a valid email.';
    setErr(errors);
    if (Object.keys(errors).length) return;
    actions.addPerson({ name: f.name.trim(), email: f.email.trim(), projectIds: f.projectIds });
    toast(`${f.name.trim()} added to the team`);
    onClose();
  };

  return (
    <Modal title="Add member" onClose={onClose} footer={<Footer onClose={onClose} submitLabel="Add member" />}>
      <form id="pf-form" className="pf-form" onSubmit={submit} noValidate>
        <Field label="Name" error={err.name}>
          <input className="pf-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Full name" />
        </Field>
        <Field label="Email" error={err.email} hint="Optional – used for invites once the backend is connected">
          <input className="pf-input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@example.com" />
        </Field>
        <Field label="Projects">
          <div className="pf-chips">
            {state.projects.map((p) => (
              <button type="button" key={p.id} className={`pf-chip${f.projectIds.includes(p.id) ? ' on' : ''}`} onClick={() => toggle(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        </Field>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- Time entry
export function EntryModal({ onClose }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const firstProject = state.projects[0];
  const [f, setF] = useState({
    task: '',
    projectId: firstProject?.id ?? '',
    stageId: firstProject?.stages[0]?.id ?? '',
    date: todayStr(),
    hours: '1',
    minutes: '0',
  });
  const [err, setErr] = useState({});
  const project = state.projects.find((p) => p.id === f.projectId);

  const submit = (e) => {
    e.preventDefault();
    const minutes = (Number(f.hours) || 0) * 60 + (Number(f.minutes) || 0);
    const errors = {};
    if (!f.task.trim()) errors.task = 'What did you work on?';
    if (!f.projectId) errors.projectId = 'Create a project first.';
    if (minutes <= 0) errors.minutes = 'Enter a duration.';
    setErr(errors);
    if (Object.keys(errors).length) return;
    actions.addEntry({ task: f.task.trim(), projectId: f.projectId, stageId: f.stageId || null, minutes, date: f.date });
    toast('Time entry added');
    onClose();
  };

  return (
    <Modal title="Manual entry" onClose={onClose} footer={<Footer onClose={onClose} submitLabel="Add entry" />}>
      <form id="pf-form" className="pf-form" onSubmit={submit} noValidate>
        <Field label="Task" error={err.task}>
          <input className="pf-input" value={f.task} onChange={(e) => setF({ ...f, task: e.target.value })} placeholder="e.g. Collect samples" list="pf-task-names" />
          <datalist id="pf-task-names">
            {state.tasks.filter((t) => t.projectId === f.projectId).map((t) => <option key={t.id} value={t.title} />)}
          </datalist>
        </Field>
        <div className="pf-grid2">
          <Field label="Project" error={err.projectId}>
            <select
              className="pf-input"
              value={f.projectId}
              onChange={(e) => {
                const p = state.projects.find((x) => x.id === e.target.value);
                setF({ ...f, projectId: e.target.value, stageId: p?.stages[0]?.id ?? '' });
              }}
            >
              {state.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Stage">
            <select className="pf-input" value={f.stageId} onChange={(e) => setF({ ...f, stageId: e.target.value })}>
              <option value="">No stage</option>
              {project?.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Date">
            <input className="pf-input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="Duration" error={err.minutes}>
            <div className="pf-duration">
              <input className="pf-input" type="number" min="0" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} aria-label="Hours" />
              <span>h</span>
              <input className="pf-input" type="number" min="0" max="59" step="5" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} aria-label="Minutes" />
              <span>m</span>
            </div>
          </Field>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- Cost stage
export function StageModal({ project, stage, onClose }) {
  const { actions } = useStore();
  const toast = useToast();
  const editing = Boolean(stage);
  const [f, setF] = useState({ name: stage?.name ?? '', rate: stage?.rate ?? '', est: stage?.est ?? '' });
  const [err, setErr] = useState({});

  const submit = (e) => {
    e.preventDefault();
    const errors = {};
    if (!f.name.trim()) errors.name = 'Enter a stage name.';
    if (!(Number(f.rate) >= 0) || f.rate === '') errors.rate = 'Enter an hourly rate.';
    if (!(Number(f.est) >= 0) || f.est === '') errors.est = 'Enter estimated hours.';
    setErr(errors);
    if (Object.keys(errors).length) return;
    actions.saveStage(project.id, { id: stage?.id, name: f.name.trim(), rate: Number(f.rate), est: Number(f.est) });
    toast(editing ? 'Stage updated' : 'Stage added');
    onClose();
  };

  return (
    <Modal
      title={editing ? 'Edit stage' : `Add stage · ${project.name}`}
      onClose={onClose}
      width={420}
      footer={
        <Footer
          onClose={onClose}
          submitLabel={editing ? 'Save' : 'Add stage'}
          onDelete={
            editing
              ? () => {
                  actions.deleteStage(project.id, stage.id);
                  toast('Stage removed');
                  onClose();
                }
              : null
          }
        />
      }
    >
      <form id="pf-form" className="pf-form" onSubmit={submit} noValidate>
        <Field label="Stage" error={err.name}>
          <input className="pf-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Research" />
        </Field>
        <div className="pf-grid2">
          <Field label="Rate ($/h)" error={err.rate}>
            <input className="pf-input" type="number" min="0" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} />
          </Field>
          <Field label="Estimated hours" error={err.est}>
            <input className="pf-input" type="number" min="0" step="0.25" value={f.est} onChange={(e) => setF({ ...f, est: e.target.value })} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
