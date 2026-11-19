import { useMemo, useState } from 'react';
import { AppLayout, PageHead } from '../components/AppLayout';
import { EventModal } from '../components/forms';
import { IconCheck, IconChevronLeft, IconChevronRight, IconPlus } from '../components/Icons';
import { useToast } from '../components/ui';
import * as api from '../lib/api';
import { DOW, MONTHS_LONG, addDays, fmtRange, fmtShort, fmtTimeRange, parse, timeToHours, toStr, todayStr, weekStart } from '../lib/date';
import { download, toICS } from '../lib/export';
import { useNavigate, useQuery } from '../lib/router';
import { useStore } from '../lib/store';
import { EVENT_COLORS, PROJECT_COLORS } from '../lib/theme';

const START_HOUR = 8;
const END_HOUR = 18;
const HOUR_PX = 58;

// Everything that shows on the calendar for a given date
function useCalendarItems(state) {
  return useMemo(() => {
    const map = {};
    const push = (date, item) => (map[date] ||= []).push(item);
    state.tasks
      .filter((t) => t.due && t.status !== 'done')
      .forEach((t) => {
        const p = state.projects.find((x) => x.id === t.projectId);
        push(t.due, { key: `t-${t.id}`, kind: 'task', id: t.id, title: t.title, allDay: true, chip: PROJECT_COLORS[p?.color]?.chip || 'chip-p' });
      });
    state.projects
      .filter((p) => p.due)
      .forEach((p) => push(p.due, { key: `p-${p.id}`, kind: 'project', id: p.id, title: p.name, allDay: true, chip: PROJECT_COLORS[p.color]?.chip || 'chip-p', milestone: true }));
    state.events.forEach((e) => push(e.date, { key: `e-${e.id}`, kind: 'event', id: e.id, title: e.title, allDay: e.allDay, start: e.start, end: e.end, chip: EVENT_COLORS[e.color]?.chip || 'chip-g' }));
    Object.values(map).forEach((list) =>
      list.sort((a, b) => (a.allDay === b.allDay ? (a.start || '').localeCompare(b.start || '') : a.allDay ? -1 : 1)),
    );
    return map;
  }, [state.tasks, state.projects, state.events]);
}

export default function Calendar() {
  const { state, actions } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const query = useQuery();
  const view = ['month', 'week', 'day'].includes(query.get('view')) ? query.get('view') : 'month';
  const [anchor, setAnchor] = useState(todayStr());
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(null);
  const items = useCalendarItems(state);
  const today = todayStr();

  const setView = (v) => navigate(`/calendar?view=${v}`, { replace: true });

  const shift = (dir) => {
    if (view === 'month') {
      const d = parse(anchor);
      setAnchor(toStr(new Date(d.getFullYear(), d.getMonth() + dir, 1)));
    } else setAnchor(addDays(anchor, dir * (view === 'week' ? 7 : 1)));
  };

  const openItem = (it, e) => {
    e?.stopPropagation();
    if (it.kind === 'task') navigate(`/tasks?task=${it.id}`);
    else if (it.kind === 'project') navigate(`/projects?project=${it.id}`);
    else setModal({ event: state.events.find((x) => x.id === it.id) });
  };

  const toggleConnection = async (provider, label) => {
    setBusy(provider);
    const connected = state.user.connections[provider];
    try {
      if (connected) await api.disconnectProvider(provider);
      else await api.connectProvider(provider);
      actions.setPref('connections', provider, !connected);
      toast(connected ? `${label} disconnected` : `${label} connected`);
    } catch (err) {
      toast(err.message, 'error');
    }
    setBusy(null);
  };

  const exportIcal = () => {
    const list = [
      ...state.events.map((e) => ({ uid: e.id, title: e.title, date: e.date, allDay: e.allDay, start: e.start, end: e.end })),
      ...state.tasks
        .filter((t) => t.due && t.status !== 'done')
        .map((t) => ({ uid: `task-${t.id}`, title: `Due: ${t.title}`, date: t.due, allDay: true, description: state.projects.find((p) => p.id === t.projectId)?.name })),
      ...state.projects.filter((p) => p.due).map((p) => ({ uid: `project-${p.id}`, title: `${p.name} deadline`, date: p.due, allDay: true })),
    ];
    download('projectforge-calendar.ics', toICS(list), 'text/calendar');
    toast(`Exported ${list.length} items to iCal`);
  };

  // ---- subtitle
  const a = parse(anchor);
  let sub;
  if (view === 'month') sub = `${MONTHS_LONG[a.getMonth()]} ${a.getFullYear()}`;
  else if (view === 'week') sub = fmtRange(weekStart(anchor), addDays(weekStart(anchor), 6));
  else sub = `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][a.getDay()]}, ${fmtShort(anchor)}, ${a.getFullYear()}`;

  const conn = state.user.connections;

  return (
    <AppLayout page={view === 'month' ? 'calendar' : 'calendar-week'}>
      <PageHead title="Calendar" sub={sub}>
        <button className="btn btn-primary" onClick={() => setModal({ defaults: { date: view === 'month' ? today : anchor } })}>
          <IconPlus />
          Event
        </button>
      </PageHead>

      <div className="toolbar">
        <div className="tb-left">
          <div className="seg" role="tablist">
            {['month', 'week', 'day'].map((v) => (
              <button key={v} role="tab" aria-selected={view === v} className={`seg-item${view === v ? ' active' : ''}`} onClick={() => setView(v)}>
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <div className="cal-nav">
            <button className="btn btn-secondary btn-sm btn-icon" onClick={() => shift(-1)} aria-label="Previous"><IconChevronLeft /></button>
            <button className="btn btn-secondary btn-sm" onClick={() => setAnchor(todayStr())}>Today</button>
            <button className="btn btn-secondary btn-sm btn-icon" onClick={() => shift(1)} aria-label="Next"><IconChevronRight /></button>
          </div>
        </div>
        <div className="tb-actions">
          <button className={`btn btn-sm ${conn.google ? 'btn-conn' : 'btn-secondary'}`} disabled={busy === 'google'} onClick={() => toggleConnection('google', 'Google Calendar')} title={conn.google ? 'Click to disconnect' : ''}>
            {conn.google ? <><IconCheck size={14} color="#34D399" width={3} />Google connected</> : 'Connect Google'}
          </button>
          <button className={`btn btn-sm ${conn.outlook ? 'btn-conn' : 'btn-secondary'}`} disabled={busy === 'outlook'} onClick={() => toggleConnection('outlook', 'Outlook')} title={conn.outlook ? 'Click to disconnect' : ''}>
            {conn.outlook ? <><IconCheck size={14} color="#34D399" width={3} />Outlook connected</> : 'Outlook'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={exportIcal}>Export iCal</button>
        </div>
      </div>

      {view === 'month' && <MonthView anchor={anchor} items={items} today={today} onOpen={openItem} onNew={(date) => setModal({ defaults: { date } })} onDay={(date) => { setAnchor(date); setView('day'); }} />}
      {view !== 'month' && (
        <TimeGrid
          days={view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i)) : [anchor]}
          items={items}
          today={today}
          onOpen={openItem}
          onNew={(defaults) => setModal({ defaults })}
          onDay={(date) => { setAnchor(date); setView('day'); }}
        />
      )}

      {modal && <EventModal event={modal.event} defaults={modal.defaults} onClose={() => setModal(null)} />}
    </AppLayout>
  );
}

function MonthView({ anchor, items, today, onOpen, onNew, onDay }) {
  const a = parse(anchor);
  const first = toStr(new Date(a.getFullYear(), a.getMonth(), 1));
  const last = toStr(new Date(a.getFullYear(), a.getMonth() + 1, 0));
  const start = weekStart(first);
  const rows = [];
  for (let d = start; d <= last; d = addDays(d, 7)) rows.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));

  return (
    <div className="cal">
      <div className="cal-head">{DOW.map((d) => <div key={d} className="cal-hd">{d}</div>)}</div>
      {rows.map((week) => (
        <div key={week[0]} className="cal-row">
          {week.map((date) => {
            const inMonth = date >= first && date <= last;
            if (!inMonth) return <div key={date} className="cal-cell out" />;
            const list = items[date] || [];
            const shown = list.slice(0, 2);
            return (
              <div key={date} className="cal-cell is-clickable" onClick={() => onNew(date)} title="Add event">
                <button className={`dn${date === today ? ' today' : ''}`} onClick={(e) => { e.stopPropagation(); onDay(date); }} aria-label={`Open ${fmtShort(date)}`}>
                  {parse(date).getDate()}
                </button>
                {shown.map((it) => (
                  <div key={it.key} className={`chip ${it.chip}`} onClick={(e) => onOpen(it, e)} title={it.title}>
                    {it.kind === 'event' && !it.allDay ? `${it.title}` : it.title}
                  </div>
                ))}
                {list.length > 2 && (
                  <button className="more-link" onClick={(e) => { e.stopPropagation(); onDay(date); }}>+{list.length - 2} more</button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function TimeGrid({ days, items, today, onOpen, onNew, onDay }) {
  return (
    <div className={`cal${days.length === 1 ? ' day-view' : ''}`}>
      <div className="wk-head">
        {days.map((date) => (
          <button key={date} className="wk-hd" onClick={() => days.length > 1 && onDay(date)}>
            <div className="dow">{DOW[parse(date).getDay()]}</div>
            <div className={`wk-num${date === today ? ' today' : ''}`}>{parse(date).getDate()}</div>
          </button>
        ))}
      </div>
      <div className="wk-body">
        {days.map((date) => {
          const list = items[date] || [];
          const allDay = list.filter((it) => it.allDay);
          const timed = list.filter((it) => !it.allDay);
          return (
            <div
              key={date}
              className="wk-col"
              onClick={(e) => {
                const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                const h = Math.min(END_HOUR - 1, Math.max(START_HOUR, START_HOUR + Math.floor(y / HOUR_PX)));
                const pad = (n) => String(n).padStart(2, '0');
                onNew({ date, start: `${pad(h)}:00`, end: `${pad(h + 1)}:00` });
              }}
              title="Click to add an event"
            >
              {allDay.map((it, i) => (
                <div key={it.key} className={`chip ${it.chip}`} style={{ top: 2 + i * 26 }} onClick={(e) => onOpen(it, e)} title={it.title}>
                  {it.title}
                </div>
              ))}
              {layoutTimed(timed).map(({ it, col, cols }) => {
                const s = Math.max(START_HOUR, timeToHours(it.start));
                const en = Math.min(END_HOUR, Math.max(s + 0.5, timeToHours(it.end)));
                const style = { top: (s - START_HOUR) * HOUR_PX, height: (en - s) * HOUR_PX };
                if (cols > 1) Object.assign(style, { left: `calc(8px + (100% - 16px) * ${col / cols})`, right: 'auto', width: `calc((100% - 16px) / ${cols} - 4px)` });
                return (
                  <div key={it.key} className={`ev ${it.chip}${cols > 1 ? ' ev-narrow' : ''}`} style={style} onClick={(e) => onOpen(it, e)}>
                    <div className="ev-title">{it.title}</div>
                    <div className="ev-time">{fmtTimeRange(it.start, it.end)}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Place overlapping timed events side by side
function layoutTimed(timed) {
  const list = [...timed].sort((a, b) => timeToHours(a.start) - timeToHours(b.start));
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
    cluster.forEach((c) => out.push({ ...c, cols }));
    cluster = [];
  };
  for (const it of list) {
    const st = timeToHours(it.start), en = Math.max(st + 0.5, timeToHours(it.end));
    if (st >= clusterEnd && cluster.length) flush();
    const used = cluster.filter((c) => c.end > st).map((c) => c.col);
    let col = 0;
    while (used.includes(col)) col++;
    cluster.push({ it, col, end: en });
    clusterEnd = Math.max(clusterEnd, en);
  }
  if (cluster.length) flush();
  return out;
}
