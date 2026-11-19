import { useState } from 'react';
import { AppLayout, PageHead } from '../components/AppLayout';
import { MemberModal } from '../components/forms';
import { IconPlus } from '../components/Icons';
import { Avatar, ConfirmModal, Modal, Pill, useToast } from '../components/ui';
import { dueLabel, fmtShort } from '../lib/date';
import { useNavigate } from '../lib/router';
import { getProject, useStore } from '../lib/store';
import { PROJECT_COLORS, statusInfo } from '../lib/theme';

function personProjects(state, person) {
  const fromTasks = [...new Set(state.tasks.filter((t) => t.assignee === person.id).map((t) => t.projectId))];
  const ids = fromTasks.length ? fromTasks : state.projects.filter((p) => p.members.includes(person.id)).map((p) => p.id);
  return ids.map((id) => getProject(state, id)).filter(Boolean);
}

function PersonModal({ person, onClose }) {
  const { state, actions } = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const tasks = state.tasks.filter((t) => t.assignee === person.id);
  const isMe = person.id === state.meId;
  return (
    <>
      <Modal
        title={person.name}
        onClose={onClose}
        width={460}
        footer={
          <>
            {!isMe && (
              <button className="btn btn-danger-ghost" style={{ marginRight: 'auto' }} onClick={() => setConfirm(true)}>
                Remove from team
              </button>
            )}
            <button className="btn btn-primary" onClick={onClose}>Close</button>
          </>
        }
      >
        <div className="pm-head">
          <Avatar person={person} className="p-av pm-av" />
          <div>
            <div className="pm-name">{person.name}{isMe && <span className="muted"> (you)</span>}</div>
            <div className="pm-email">{person.email || 'No email'}</div>
          </div>
        </div>
        <div className="pf-label" style={{ marginTop: 20 }}>Assigned tasks</div>
        <div className="pm-list">
          {tasks.length === 0 && <div className="pf-text">No tasks assigned yet.</div>}
          {tasks.map((t) => {
            const s = statusInfo(t.status);
            return (
              <button key={t.id} className="pm-task" onClick={() => { onClose(); navigate(`/tasks?task=${t.id}`); }}>
                <span className="pm-task-title">{t.title}</span>
                <span className="pm-task-meta">{t.status === 'done' ? `Done ${t.doneDate ? fmtShort(t.doneDate) : ''}` : t.due ? dueLabel(t.due) : ''}</span>
                <Pill tone={s.tone}>{s.pill}</Pill>
              </button>
            );
          })}
        </div>
      </Modal>
      {confirm && (
        <ConfirmModal
          title="Remove member?"
          message={`${person.name} will be removed from all projects and their tasks will become unassigned.`}
          confirmLabel="Remove"
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            actions.removePerson(person.id);
            toast(`${person.name} removed`);
            onClose();
          }}
        />
      )}
    </>
  );
}

export default function People() {
  const { state } = useStore();
  const [modal, setModal] = useState(null);

  return (
    <AppLayout page="people">
      <PageHead title="People">
        <button className="btn btn-primary" onClick={() => setModal({ type: 'add' })}>
          <IconPlus />
          Add member
        </button>
      </PageHead>
      <div className="p-row">
        {state.people.map((person) => {
          const tasks = state.tasks.filter((t) => t.assignee === person.id);
          const done = tasks.filter((t) => t.status === 'done').length;
          const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
          const projects = personProjects(state, person);
          const color = PROJECT_COLORS[projects[0]?.color]?.main || '#A78BFA';
          return (
            <div
              key={person.id}
              className="card p-card is-clickable"
              onClick={() => setModal({ type: 'person', person })}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setModal({ type: 'person', person })}
            >
              <div className="p-top"><Avatar person={person} className="p-av" /><div className="p-name">{person.name}</div></div>
              <div className="p-meta">
                <div className="p-proj">{projects.length ? projects.map((p) => p.name).join(', ') : 'No projects'}</div>
                <div className="p-tasks">{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</div>
              </div>
              <div className="p-bar">
                <div className="p-bar-top"><span><b>{done}</b> of {tasks.length} done</span><span>{pct}%</span></div>
                <div className="progress"><div className="progress-fill" style={{ width: `${pct}%`, background: color }} /></div>
              </div>
            </div>
          );
        })}
      </div>
      {modal?.type === 'add' && <MemberModal onClose={() => setModal(null)} />}
      {modal?.type === 'person' && <PersonModal person={state.people.find((p) => p.id === modal.person.id) || modal.person} onClose={() => setModal(null)} />}
    </AppLayout>
  );
}
