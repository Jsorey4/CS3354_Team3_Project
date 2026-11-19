import { useEffect, useRef, useState } from 'react';
import { AppLayout, PageHead } from '../components/AppLayout';
import { EntryModal } from '../components/forms';
import { IconCheck, IconChevronDown, IconDownload, IconPlay, IconPlus, IconTrash } from '../components/Icons';
import { Checkbox, Field, Modal, useToast } from '../components/ui';
import { fmtShort, minutesToClock, secondsToTimer, todayStr } from '../lib/date';
import { download, toCSV, toXLSX } from '../lib/export';
import { getProject, projectStats, useStore } from '../lib/store';
import { costSheetRows } from './Cost';

function useNow(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function StartTimerModal({ onClose }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const myOpen = state.tasks.filter((t) => t.status !== 'done');
  const [f, setF] = useState(() => {
    const t = myOpen.find((x) => x.assignee === state.meId) || myOpen[0];
    const p = getProject(state, t?.projectId) || state.projects[0];
    return { task: t?.title ?? '', projectId: p?.id ?? '', stageId: p?.stages[0]?.id ?? '' };
  });
  const [err, setErr] = useState('');
  const project = getProject(state, f.projectId);

  const submit = (e) => {
    e.preventDefault();
    if (!f.task.trim()) return setErr('What are you working on?');
    if (!f.projectId) return setErr('Create a project first.');
    actions.startTimer({ task: f.task.trim(), projectId: f.projectId, stageId: f.stageId || null });
    toast('Timer started');
    onClose();
  };

  return (
    <Modal
      title="Start timer"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="submit" form="pf-form">Start</button>
        </>
      }
    >
      <form id="pf-form" className="pf-form" onSubmit={submit} noValidate>
        <Field label="Task" error={err}>
          <input
            className="pf-input"
            value={f.task}
            list="pf-open-tasks"
            onChange={(e) => {
              const t = myOpen.find((x) => x.title === e.target.value);
              const p = t && getProject(state, t.projectId);
              setF(p ? { task: e.target.value, projectId: p.id, stageId: p.stages[0]?.id ?? '' } : { ...f, task: e.target.value });
            }}
            placeholder="What are you working on?"
          />
          <datalist id="pf-open-tasks">{myOpen.map((t) => <option key={t.id} value={t.title} />)}</datalist>
        </Field>
        <div className="pf-grid2">
          <Field label="Project">
            <select
              className="pf-input"
              value={f.projectId}
              onChange={(e) => {
                const p = getProject(state, e.target.value);
                setF({ ...f, projectId: e.target.value, stageId: p?.stages[0]?.id ?? '' });
              }}
            >
              {state.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Stage" hint="Used for cost tracking">
            <select className="pf-input" value={f.stageId} onChange={(e) => setF({ ...f, stageId: e.target.value })}>
              <option value="">No stage</option>
              {project?.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>
      </form>
    </Modal>
  );
}

function ProjectSelect({ value, onChange, projects }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const options = [{ id: 'all', name: 'All' }, ...projects];
  const current = options.find((o) => o.id === value) || options[0];
  return (
    <div className="select-wrap" ref={ref}>
      <button type="button" className={`select${open ? ' open' : ''}`} onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}>
        <span>Project: {current.name}</span>
        <IconChevronDown />
      </button>
      {open && (
        <div className="select-menu" role="listbox">
          {options.map((o) => (
            <button
              key={o.id}
              role="option"
              aria-selected={o.id === value}
              className={`select-opt${o.id === value ? ' on' : ''}`}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            >
              {o.name}
              {o.id === value && <IconCheck size={14} color="#A78BFA" width={3} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TimeTracking() {
  const { state, actions } = useStore();
  const toast = useToast();
  const timer = state.timer;
  const now = useNow(timer.active && Boolean(timer.startedAt));
  const [modal, setModal] = useState(null);
  const [exportProject, setExportProject] = useState('all');
  const [include, setInclude] = useState({ info: true, records: true, cost: false });

  const elapsed = timer.active ? timer.accumulated + (timer.startedAt ? (now - timer.startedAt) / 1000 : 0) : 0;
  const paused = timer.active && !timer.startedAt;
  const timerProject = timer.active ? getProject(state, timer.projectId) : null;

  const records = [...state.entries].sort((a, b) => b.createdAt - a.createdAt);

  // ---------- export
  const scoped = (list) => (exportProject === 'all' ? list : list.filter((x) => (x.projectId ?? x.id) === exportProject));
  const buildSheets = () => {
    const projects = exportProject === 'all' ? state.projects : state.projects.filter((p) => p.id === exportProject);
    const sheets = [];
    if (include.info)
      sheets.push({
        name: 'Project info',
        rows: [
          ['Project', 'Category', 'Due date', 'Budget $', 'Tasks', 'Done', 'Progress %', 'Members'],
          ...projects.map((p) => {
            const s = projectStats(state, p.id);
            return [p.name, p.category, p.due || '', p.budget, s.total, s.done, s.pct, p.members.map((m) => state.people.find((x) => x.id === m)?.name).filter(Boolean).join(', ')];
          }),
        ],
      });
    if (include.records)
      sheets.push({
        name: 'Time records',
        rows: [
          ['Date', 'Task', 'Project', 'Stage', 'Hours', 'Duration'],
          ...scoped(records).map((e) => {
            const p = getProject(state, e.projectId);
            return [e.date, e.task, p?.name ?? '', p?.stages.find((s) => s.id === e.stageId)?.name ?? '', Math.round((e.minutes / 60) * 100) / 100, minutesToClock(e.minutes)];
          }),
        ],
      });
    if (include.cost) sheets.push({ name: 'Cost summary', rows: costSheetRows(state, projects) });
    return sheets;
  };

  const exportExcel = () => {
    const sheets = buildSheets();
    if (!sheets.length) return toast('Choose at least one thing to include', 'error');
    download(`projectforge-export-${todayStr()}.xlsx`, toXLSX(sheets));
    toast('Excel file downloaded');
  };

  const exportSheets = () => {
    const sheets = buildSheets();
    if (!sheets.length) return toast('Choose at least one thing to include', 'error');
    // Google Sheets imports CSV; one file per section, stacked with headings.
    const rows = sheets.flatMap((s, i) => [...(i ? [[]] : []), [s.name.toUpperCase()], ...s.rows]);
    download(`projectforge-export-${todayStr()}.csv`, toCSV(rows), 'text/csv');
    window.open('https://sheets.new', '_blank', 'noopener');
    toast('CSV downloaded — in the new sheet choose File → Import to load it');
  };

  return (
    <AppLayout page="time-tracking">
      <PageHead title="Time tracking & export" sub={timer.active ? (paused ? '1 timer paused' : '1 timer running') : 'No timer running'} />

      <div className="tt-row">
        {/* Timer */}
        <div className="card tt-card">
          <div className="tt-head">
            <div className="card-title">Timer</div>
            {timer.active && (
              <div className={`run${paused ? ' paused' : ''}`}><span className="run-dot" />{paused ? 'Paused' : 'Running'}</div>
            )}
          </div>
          <div className="timer-wrap">
            <div className={`timer-time${paused ? ' is-paused' : ''}`}>{secondsToTimer(elapsed)}</div>
            {timer.active ? (
              <>
                <div className="timer-task">{timer.task}</div>
                <div className="timer-proj">{timerProject?.name ?? '—'}</div>
              </>
            ) : (
              <>
                <div className="timer-task">Ready when you are</div>
                <div className="timer-proj">Start a timer to log time to a task</div>
              </>
            )}
          </div>
          <div className="timer-btns">
            {timer.active ? (
              <>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    actions.stopTimer();
                    toast(`Logged ${minutesToClock(Math.max(1, Math.round(elapsed / 60)))} to ${timer.task}`);
                  }}
                >
                  Stop
                </button>
                <button className="btn btn-primary" onClick={paused ? actions.resumeTimer : actions.pauseTimer}>
                  {paused ? 'Resume' : 'Pause'}
                </button>
              </>
            ) : (
              <button className="btn btn-primary btn-start" onClick={() => setModal('start')}>
                <IconPlay size={14} /> Start timer
              </button>
            )}
          </div>
          {timer.active && (
            <button className="link-btn discard" onClick={() => { actions.discardTimer(); toast('Timer discarded'); }}>Discard timer</button>
          )}
        </div>

        {/* Recent time records */}
        <div className="card tt-card">
          <div className="card-title">Recent time records</div>
          <div className="r-list">
            {timer.active && (
              <div className="r-row live">
                <div><div className="r-name">{timer.task}</div><div className="r-proj">{timerProject?.name} · <span className="live-text">{paused ? 'paused' : 'live'}</span></div></div>
                <div className="r-time">{minutesToClock(Math.floor(elapsed / 60))}</div>
              </div>
            )}
            {records.length === 0 && !timer.active && <div className="empty">No time logged yet.</div>}
            {records.slice(0, timer.active ? 3 : 4).map((e) => (
              <div key={e.id} className="r-row">
                <div>
                  <div className="r-name">{e.task}</div>
                  <div className="r-proj">{getProject(state, e.projectId)?.name ?? '—'} · {e.date === todayStr() ? 'Today' : fmtShort(e.date)}</div>
                </div>
                <div className="r-right">
                  <div className="r-time">{minutesToClock(e.minutes)}</div>
                  <button className="r-del" onClick={() => { actions.deleteEntry(e.id); toast('Time record deleted'); }} aria-label={`Delete ${e.task}`} title="Delete record">
                    <IconTrash size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="tt-foot">
            <button className="btn btn-secondary btn-block" onClick={() => setModal('entry')}>
              <IconPlus color="#F1F4FF" />
              Manual entry
            </button>
          </div>
        </div>

        {/* Export */}
        <div className="card tt-card">
          <div className="card-title">Export</div>
          <div className="ex-label">Project</div>
          <ProjectSelect value={exportProject} onChange={setExportProject} projects={state.projects} />
          <div className="ex-label" style={{ marginTop: 24 }}>Include</div>
          <div className="ck-list">
            <Checkbox label="Project info" checked={include.info} onChange={(v) => setInclude({ ...include, info: v })} />
            <Checkbox label="Time records" checked={include.records} onChange={(v) => setInclude({ ...include, records: v })} />
            <Checkbox label="Cost summary" checked={include.cost} onChange={(v) => setInclude({ ...include, cost: v })} />
          </div>
          <div className="ex-btns">
            <button className="btn btn-primary btn-block" onClick={exportExcel}>
              <IconDownload color="#0F1424" />
              Excel (.xlsx)
            </button>
            <button className="btn btn-secondary btn-block" onClick={exportSheets}>
              <IconDownload />
              Google Sheets
            </button>
          </div>
        </div>
      </div>

      {modal === 'start' && <StartTimerModal onClose={() => setModal(null)} />}
      {modal === 'entry' && <EntryModal onClose={() => setModal(null)} />}
    </AppLayout>
  );
}
