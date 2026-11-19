import { useEffect, useState } from 'react';
import { AppLayout, PageHead } from '../components/AppLayout';
import { BoardColumn, sortTasks } from '../components/Board';
import { TaskModal } from '../components/forms';
import { IconPencil, IconPlus, IconTrash } from '../components/Icons';
import { Avatar, ConfirmModal, Pill, useToast } from '../components/ui';
import { diffDays, fmtShort, todayStr } from '../lib/date';
import { useNavigate, useQuery } from '../lib/router';
import { getPerson, getProject, useStore } from '../lib/store';
import { CATEGORY_TONE, PRIORITY_TONE, TONES, statusInfo } from '../lib/theme';

function dueText(t) {
  if (!t.due) return 'No due date';
  const d = diffDays(t.due, todayStr());
  if (d === 0) return `Today, ${fmtShort(t.due)}`;
  if (d === 1) return `Tomorrow, ${fmtShort(t.due)}`;
  return fmtShort(t.due);
}

export default function Tasks() {
  const { state, actions } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const query = useQuery();
  const [selectedId, setSelectedId] = useState(() => query.get('task') || state.tasks.find((t) => t.status === 'progress')?.id || state.tasks[0]?.id);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    const q = query.get('task');
    if (q) setSelectedId(q);
  }, [query]);

  const t = state.tasks.find((x) => x.id === selectedId);
  const today = todayStr();
  const dueWeek = state.tasks.filter((x) => x.status !== 'done' && x.due && diffDays(x.due, today) >= 0 && diffDays(x.due, today) < 7).length;

  const select = (task) => {
    setSelectedId(task.id);
    navigate(`/tasks?task=${task.id}`, { replace: true });
  };

  const project = t && getProject(state, t.projectId);
  const assignee = t && getPerson(state, t.assignee);
  const status = t && statusInfo(t.status);

  return (
    <AppLayout page="tasks">
      <PageHead title="Tasks" sub={<><b>{dueWeek} {dueWeek === 1 ? 'task' : 'tasks'}</b> due this week</>}>
        <button className="btn btn-primary" onClick={() => setModal({})}>
          <IconPlus />
          New task
        </button>
      </PageHead>

      <div className="tasks-layout">
        {['todo', 'progress', 'done'].map((st) => (
          <BoardColumn
            key={st}
            status={st}
            className="tcol"
            showProject
            selectedId={selectedId}
            tasks={sortTasks(state.tasks.filter((x) => x.status === st))}
            onSelect={select}
            onAdd={(status) => setModal({ defaults: { status } })}
          />
        ))}

        <div className="card details">
          {!t ? (
            <div className="details-empty">
              <div className="d-eyebrow">Task details</div>
              <p>Select a task to see its details.</p>
            </div>
          ) : (
            <>
              <div className="d-eyebrow">Task details</div>
              <div className="d-title">{t.title}</div>
              <div className="d-proj">
                {project?.name} {project && <Pill tone={CATEGORY_TONE[project.category]}>{project.category}</Pill>}
              </div>

              <div className="d-rows">
                <div className="d-row">
                  <div className="d-label">Status</div>
                  <select
                    className="pill-select"
                    value={t.status}
                    onChange={(e) => {
                      actions.updateTask(t.id, { status: e.target.value });
                      toast(`Moved to ${statusInfo(e.target.value).pill}`);
                    }}
                    aria-label="Status"
                    style={{ background: TONES[status.tone].bg, color: TONES[status.tone].fg }}
                  >
                    <option value="todo">To do</option>
                    <option value="progress">In progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>
                <div className="d-row">
                  <div className="d-label">{t.status === 'done' ? 'Completed' : 'Due'}</div>
                  <div className={`d-value${t.status !== 'done' && t.due && diffDays(t.due, today) < 0 ? ' text-pink' : ''}`}>
                    {t.status === 'done' && t.doneDate ? fmtShort(t.doneDate) : dueText(t)}
                  </div>
                </div>
                <div className="d-row">
                  <div className="d-label">Priority</div>
                  <Pill tone={PRIORITY_TONE[t.priority]}>{t.priority}</Pill>
                </div>
                <div className="d-row">
                  <div className="d-label">Assigned to</div>
                  <div className="d-value">
                    {assignee ? <><Avatar person={assignee} />{assignee.name}</> : <span className="muted">Unassigned</span>}
                  </div>
                </div>
                <div className="d-row">
                  <div className="d-label">Tags</div>
                  <div className="d-value tags">
                    {t.tags?.length ? t.tags.map((g) => <span key={g} className="tag">{g}</span>) : <span className="muted">—</span>}
                  </div>
                </div>
              </div>

              <div className="d-actions">
                <button
                  className="btn btn-primary btn-block"
                  onClick={() => {
                    const next = t.status === 'done' ? 'todo' : 'done';
                    actions.updateTask(t.id, { status: next });
                    toast(next === 'done' ? 'Task completed 🎉' : 'Task reopened');
                  }}
                >
                  {t.status === 'done' ? 'Reopen task' : 'Mark as done'}
                </button>
                <div className="d-actions-row">
                  <button className="btn btn-secondary" onClick={() => setModal({ task: t })}>
                    <IconPencil size={15} /> Edit
                  </button>
                  <button className="btn btn-secondary btn-danger-outline" onClick={() => setConfirm(true)}>
                    <IconTrash size={15} /> Delete
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {modal && <TaskModal task={modal.task} defaults={modal.defaults} onClose={() => setModal(null)} onSaved={(id) => setSelectedId(id)} />}
      {confirm && t && (
        <ConfirmModal
          title="Delete task?"
          message={`“${t.title}” will be permanently removed.`}
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            actions.deleteTask(t.id);
            toast('Task deleted');
            setSelectedId(null);
            navigate('/tasks', { replace: true });
          }}
        />
      )}
    </AppLayout>
  );
}
