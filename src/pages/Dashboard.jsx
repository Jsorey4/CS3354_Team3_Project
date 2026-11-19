import { useState } from 'react';
import { AppLayout, PageHead } from '../components/AppLayout';
import { TaskModal } from '../components/forms';
import { IconPlus } from '../components/Icons';
import { Checkbox, Modal, Pill } from '../components/ui';
import { diffDays, duePill, greeting, minutesToHm, todayStr } from '../lib/date';
import { useNavigate } from '../lib/router';
import { getMe, getProject, projectSpend, projectStats, taskStats, upcomingDeadlines, useStore, weekMinutes } from '../lib/store';
import { PROJECT_COLORS, TONES, money } from '../lib/theme';

export const DASH_WIDGETS = [
  { key: 'deadlines', label: 'Upcoming deadlines' },
  { key: 'progress', label: 'Task progress' },
  { key: 'projects', label: 'Projects' },
  { key: 'time', label: 'Time tracked' },
  { key: 'cost', label: 'Cost summary' },
];

export function CustomizeModal({ onClose }) {
  const { state, actions } = useStore();
  return (
    <Modal title="Customize dashboard" onClose={onClose} width={400} footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
      <p className="pf-text" style={{ marginBottom: 12 }}>Choose which cards appear on your home screen.</p>
      <div className="pf-ck-list">
        {DASH_WIDGETS.map((w) => (
          <Checkbox key={w.key} className="pf-ck" label={w.label} checked={state.user.dashPrefs[w.key]} onChange={(v) => actions.setPref('dashPrefs', w.key, v)} />
        ))}
      </div>
    </Modal>
  );
}

export default function Dashboard() {
  const { state } = useStore();
  const navigate = useNavigate();
  const [modal, setModal] = useState(null);
  const me = getMe(state);
  const prefs = state.user.dashPrefs;
  const today = todayStr();

  const dueToday = state.tasks.filter((t) => t.status !== 'done' && t.due === today).length;
  const overdue = state.tasks.filter((t) => t.status !== 'done' && t.due && diffDays(t.due, today) < 0).length;
  const deadlines = upcomingDeadlines(state, 3);
  const ts = taskStats(state);
  const spent = state.projects.reduce((a, p) => a + projectSpend(state, p), 0);
  const budget = state.projects.reduce((a, p) => a + (p.budget || 0), 0);
  const firstName = me?.name.split(' ')[0] ?? '';

  const row1 = [prefs.deadlines, prefs.progress].filter(Boolean).length;
  const row2 = [prefs.projects, prefs.time, prefs.cost].filter(Boolean).length;
  const go = (to) => () => navigate(to);
  const keyGo = (to) => (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), navigate(to));
  const clickable = (to) => ({ role: 'link', tabIndex: 0, onClick: go(to), onKeyDown: keyGo(to) });

  return (
    <AppLayout page="dashboard">
      <PageHead
        title={`${greeting()}, ${firstName}`}
        sub={
          <>
            <b>{dueToday} {dueToday === 1 ? 'task' : 'tasks'}</b> due today
            {overdue > 0 && <> · <b className="text-pink">{overdue} overdue</b></>}
          </>
        }
      >
        <button className="btn btn-secondary" onClick={() => setModal('customize')}>Customize</button>
        <button className="btn btn-primary" onClick={() => setModal('task')}>
          <IconPlus />
          New task
        </button>
      </PageHead>

      {row1 > 0 && (
        <div className="grid-row row-1">
          {prefs.deadlines && (
            <div className={`card ${row1 === 1 ? 'w-full' : 'w-2of3'} h-1`}>
              <div className="card-head">
                <div className="card-title">Upcoming deadlines</div>
                <button className="link-btn" onClick={go('/tasks')}>View all</button>
              </div>
              <div className="dl-list">
                {deadlines.length === 0 && <div className="empty">Nothing due — nice work!</div>}
                {deadlines.map((t) => {
                  const p = duePill(t.due);
                  const tone = TONES[p.tone];
                  return (
                    <div key={t.id} className="dl-row is-clickable" {...clickable(`/tasks?task=${t.id}`)}>
                      <div className="dl-left">
                        <div className="dl-dot" style={{ background: tone.dot }} />
                        <div>
                          <div className="dl-name">{t.title}</div>
                          <div className="dl-proj">{getProject(state, t.projectId)?.name}</div>
                        </div>
                      </div>
                      <Pill tone={p.tone}>{p.label}</Pill>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {prefs.progress && (
            <div className={`card ${row1 === 1 ? 'w-full' : 'w-1of3'} h-1 is-clickable`} {...clickable('/charts')}>
              <div className="card-head"><div className="card-title">Task progress</div></div>
              <div className="tp-body">
                <div className="big">{ts.pct}%</div>
                <div className="progress"><div className="progress-fill" style={{ width: `${ts.pct}%` }} /></div>
                <div className="sub">{ts.done} of {ts.total} tasks done</div>
              </div>
            </div>
          )}
        </div>
      )}

      {row2 > 0 && (
        <div className={`grid-row ${row1 > 0 ? 'row-2' : 'row-1'} cols-${row2}`}>
          {prefs.projects && (
            <div className="card w-third h-2">
              <div className="card-head">
                <div className="card-title">Projects</div>
                <button className="link-btn" onClick={go('/projects')}>All</button>
              </div>
              <div className="pr-list">
                {state.projects.length === 0 && <div className="empty">No projects yet.</div>}
                {state.projects.slice(0, 2).map((p) => {
                  const s = projectStats(state, p.id);
                  return (
                    <div key={p.id} className="pr-item is-clickable" {...clickable(`/projects?project=${p.id}`)}>
                      <div className="pr-top"><div className="pr-name">{p.name}</div><div className="pr-pct">{s.pct}%</div></div>
                      <div className="progress"><div className="progress-fill" style={{ width: `${s.pct}%`, background: PROJECT_COLORS[p.color]?.main }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {prefs.time && (
            <div className="card w-third h-2 is-clickable" {...clickable('/time-tracking')}>
              <div className="card-head">
                <div className="card-title">Time tracked</div>
                {state.timer.active && <span className="mini-live"><span className="run-dot" />Timer running</span>}
              </div>
              <div className="stat-body">
                <div className="big">{minutesToHm(weekMinutes(state))}</div>
                <div className="sub">This week</div>
              </div>
            </div>
          )}
          {prefs.cost && (
            <div className="card w-third h-2 is-clickable" {...clickable('/cost')}>
              <div className="card-head"><div className="card-title">Cost summary</div></div>
              <div className="stat-body cost-body">
                <div className="big">{money(spent)}</div>
                <div className="sub">of {money(budget)} budget</div>
                <div className="progress">
                  <div className="progress-fill" style={{ width: `${budget ? Math.min(100, (spent / budget) * 100) : 0}%`, background: spent > budget ? '#F472B6' : undefined }} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {row1 + row2 === 0 && (
        <div className="card empty-card">
          <div className="card-title">Your dashboard is empty</div>
          <div className="sub">Use “Customize” to choose which cards to show.</div>
        </div>
      )}

      {modal === 'task' && <TaskModal onClose={() => setModal(null)} />}
      {modal === 'customize' && <CustomizeModal onClose={() => setModal(null)} />}
    </AppLayout>
  );
}
