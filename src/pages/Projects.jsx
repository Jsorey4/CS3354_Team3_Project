import { useEffect, useState } from 'react';
import { AppLayout, PageHead } from '../components/AppLayout';
import { BoardColumn, sortTasks } from '../components/Board';
import { ProjectModal, TaskModal } from '../components/forms';
import { IconPencil, IconPlus } from '../components/Icons';
import { Avatar, Pill } from '../components/ui';
import { fmtShort } from '../lib/date';
import { useNavigate, useQuery } from '../lib/router';
import { getPerson, projectStats, useStore } from '../lib/store';
import { CATEGORIES, CATEGORY_TONE, PROJECT_COLORS } from '../lib/theme';

export default function Projects() {
  const { state } = useStore();
  const navigate = useNavigate();
  const query = useQuery();
  const [filter, setFilter] = useState('All');
  const [selectedId, setSelectedId] = useState(query.get('project') || state.projects[0]?.id);
  const [modal, setModal] = useState(null); // {type:'project'|'task', ...}

  const visible = state.projects.filter((p) => filter === 'All' || p.category === filter);
  const selected = visible.find((p) => p.id === selectedId) || visible[0];
  const active = state.projects.filter((p) => projectStats(state, p.id).pct < 100).length;

  useEffect(() => {
    const q = query.get('project');
    if (q) setSelectedId(q);
  }, [query]);

  const tasks = selected ? state.tasks.filter((t) => t.projectId === selected.id) : [];

  return (
    <AppLayout page="projects">
      <PageHead title="Projects" sub={<><b>{active}</b> active</>}>
        <button className="btn btn-primary" onClick={() => setModal({ type: 'project' })}>
          <IconPlus />
          New project
        </button>
      </PageHead>

      <div className="filters" role="tablist">
        {['All', ...CATEGORIES].map((c) => (
          <button key={c} role="tab" aria-selected={filter === c} className={`filter${filter === c ? ' active' : ''}`} onClick={() => setFilter(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="proj-row">
        {visible.length === 0 && (
          <div className="card empty-card proj-empty">
            <div className="card-title">No {filter.toLowerCase()} projects yet</div>
            <button className="btn btn-secondary btn-sm-x" onClick={() => setModal({ type: 'project' })}>Create one</button>
          </div>
        )}
        {visible.map((p) => {
          const s = projectStats(state, p.id);
          return (
            <div
              key={p.id}
              className={`card proj-card is-clickable${selected?.id === p.id ? ' selected' : ''}`}
              onClick={() => setSelectedId(p.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setSelectedId(p.id)}
            >
              <div className="pc-top">
                <div className="pc-name">{p.name}</div>
                <Pill tone={CATEGORY_TONE[p.category]}>{p.category}</Pill>
              </div>
              <div className="pc-mid avatars">
                {p.members.map((m) => <Avatar key={m} person={getPerson(state, m)} />)}
              </div>
              <div className="pc-meta">
                <div className="pc-due">{p.due ? `Due ${fmtShort(p.due)}` : 'No due date'}</div>
                <div className="pc-pct">{s.pct}% done</div>
              </div>
              <div className="progress"><div className="progress-fill" style={{ width: `${s.pct}%`, background: PROJECT_COLORS[p.color]?.main }} /></div>
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="card detail">
          <div className="detail-head">
            <div className="detail-left">
              <div className="detail-title">{selected.name}</div>
              <Pill tone={CATEGORY_TONE[selected.category]}>{selected.category}</Pill>
            </div>
            <div className="detail-right">
              <div className="avatars">
                {selected.members.map((m) => <Avatar key={m} person={getPerson(state, m)} />)}
              </div>
              <button className="btn btn-secondary btn-xs" onClick={() => setModal({ type: 'project', project: selected })}>
                <IconPencil size={14} /> Edit
              </button>
            </div>
          </div>

          <div className="board">
            {['todo', 'progress', 'done'].map((st) => (
              <BoardColumn
                key={st}
                status={st}
                className="col"
                labelKey="boardLabel"
                tasks={sortTasks(tasks.filter((t) => t.status === st))}
                onSelect={(t) => navigate(`/tasks?task=${t.id}`)}
                onAdd={(status) => setModal({ type: 'task', defaults: { projectId: selected.id, status } })}
              />
            ))}
          </div>
          <div className="board-hint">Drag cards between columns to update their status.</div>
        </div>
      )}

      {modal?.type === 'project' && (
        <ProjectModal project={modal.project} onClose={() => setModal(null)} onSaved={(id) => { setFilter('All'); setSelectedId(id); }} />
      )}
      {modal?.type === 'task' && <TaskModal defaults={modal.defaults} onClose={() => setModal(null)} />}
    </AppLayout>
  );
}
