// Drag-and-drop task columns used by Projects and Tasks.
import { useState } from 'react';
import { dueLabel, fmtShort } from '../lib/date';
import { getPerson, getProject, useStore } from '../lib/store';
import { STATUSES } from '../lib/theme';
import { Avatar } from './ui';
import { IconCheckCircle, IconPlus } from './Icons';

export function TaskCard({ task, showProject, selected, onClick }) {
  const { state } = useStore();
  const done = task.status === 'done';
  const overdue = !done && task.due && dueLabel(task.due).startsWith('Overdue');
  return (
    <div
      className={`task${done ? ' task-done' : ''}${selected ? ' selected' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/task-id', task.id);
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.classList.add('dragging');
      }}
      onDragEnd={(e) => e.currentTarget.classList.remove('dragging')}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      <div className="task-title">
        {done && <IconCheckCircle />}
        {task.title}
      </div>
      {showProject && <div className="task-proj">{getProject(state, task.projectId)?.name}</div>}
      <div className="task-meta">
        <div className={`task-due${overdue ? ' overdue' : ''}`}>
          {done ? `Done ${task.doneDate ? fmtShort(task.doneDate) : ''}` : task.due ? dueLabel(task.due) : 'No due date'}
        </div>
        <Avatar person={getPerson(state, task.assignee)} />
      </div>
    </div>
  );
}

export function BoardColumn({ status, tasks, className, labelKey = 'label', showProject, selectedId, onSelect, onAdd }) {
  const { actions } = useStore();
  const [over, setOver] = useState(false);
  const info = STATUSES.find((s) => s.key === status);
  return (
    <div
      className={`${className}${over ? ' drop-over' : ''}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('text/task-id')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData('text/task-id');
        if (id) actions.updateTask(id, { status });
      }}
    >
      <div className="col-head">
        <div className="col-label"><span className="col-dot" style={{ background: info.dot }} />{info[labelKey]}</div>
        <div className="col-count">{tasks.length}</div>
      </div>
      <div className="col-list">
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} showProject={showProject} selected={t.id === selectedId} onClick={() => onSelect?.(t)} />
        ))}
        {onAdd && (
          <button className="col-add" onClick={() => onAdd(status)}>
            <IconPlus size={14} color="currentColor" /> Add task
          </button>
        )}
      </div>
    </div>
  );
}

export const sortTasks = (list) =>
  [...list].sort((a, b) => {
    if (a.status === 'done' && b.status === 'done') return (a.doneDate || '') < (b.doneDate || '') ? -1 : 1;
    return (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : 0;
  });
