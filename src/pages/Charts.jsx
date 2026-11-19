import { useState } from 'react';
import { AppLayout, PageHead } from '../components/AppLayout';
import { addDays, fmtShort, minutesToHm, todayStr } from '../lib/date';
import { useNavigate } from '../lib/router';
import { costBreakdown, projectMinutes, taskStats, useStore } from '../lib/store';
import { PROJECT_COLORS } from '../lib/theme';

const R = 84;
const C = 2 * Math.PI * R;

function Donut({ pct }) {
  const on = (C * pct) / 100;
  return (
    <svg viewBox="0 0 208 208" xmlns="http://www.w3.org/2000/svg">
      <circle cx="104" cy="104" r={R} fill="none" stroke="#2A3358" strokeWidth="22" />
      <circle
        className="donut-arc"
        cx="104" cy="104" r={R} fill="none" stroke="#A78BFA" strokeWidth="22" strokeLinecap="butt"
        strokeDasharray={`${on.toFixed(2)} ${(C - on).toFixed(2)}`} transform="rotate(-90 104 104)"
      />
    </svg>
  );
}

// Weekly cumulative % of tasks completed, last 6 weeks ending today
function useProgressSeries(state) {
  const today = todayStr();
  const total = state.tasks.length || 1;
  return Array.from({ length: 6 }, (_, i) => {
    const date = addDays(today, -7 * (5 - i));
    const done = state.tasks.filter((t) => t.status === 'done' && t.doneDate && t.doneDate <= date).length;
    return { date, pct: Math.round((done / total) * 100) };
  });
}

function LineChart({ series }) {
  const [hover, setHover] = useState(null);
  const x0 = 44, x1 = 476, y0 = 224, y1 = 16;
  const X = (i) => x0 + ((x1 - x0) * i) / (series.length - 1);
  const Y = (p) => y0 - ((y0 - y1) * p) / 100;
  const pts = series.map((s, i) => [X(i), Y(s.pct)]);
  // smooth curve (Catmull-Rom → Bézier)
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const last = series.length - 1;
  return (
    <svg viewBox="0 0 492 256" xmlns="http://www.w3.org/2000/svg" fontFamily="Inter, Segoe UI, Helvetica Neue, Arial, sans-serif">
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={x0} y1={Y(v)} x2={x1} y2={Y(v)} stroke="#2A3358" strokeWidth="1" />
          <text x="36" y={Y(v) + 4} textAnchor="end" fontSize="11" fill="#8791B3">{v}%</text>
        </g>
      ))}
      <path d={`${d} L${x1} ${y0} L${x0} ${y0} Z`} fill="#A78BFA" fillOpacity="0.12" />
      <path d={d} fill="none" stroke="#A78BFA" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {series.map((s, i) => {
        const isLast = i === last;
        const active = hover === i;
        return (
          <g key={s.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'default' }}>
            <rect x={X(i) - 24} y={y1} width="48" height={y0 - y1 + 28} fill="transparent" />
            {active && <line x1={X(i)} y1={y1} x2={X(i)} y2={y0} stroke="#3A4570" strokeDasharray="3 3" />}
            {i > 0 && (
              <>
                <circle cx={X(i)} cy={Y(s.pct)} r={isLast || active ? 5.5 : 4} fill={isLast ? '#F5B942' : active ? '#A78BFA' : '#1C2340'} stroke={isLast ? '#F5B942' : '#A78BFA'} strokeWidth="2" />
                <text x={X(i)} y={Y(s.pct) - 12} textAnchor="middle" fontSize={active ? 12 : 11} fontWeight={isLast ? 700 : 600} fill={isLast ? '#F5B942' : active ? '#F1F4FF' : '#B4BDD9'}>{s.pct}%</text>
              </>
            )}
            <text x={X(i)} y="244" textAnchor="middle" fontSize="11" fill={active ? '#F1F4FF' : '#8791B3'}>{fmtShort(s.date)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Charts() {
  const { state } = useStore();
  const navigate = useNavigate();
  const ts = taskStats(state);
  const series = useProgressSeries(state);

  const perProject = state.projects.map((p) => {
    const minutes = projectMinutes(state, p.id);
    const est = costBreakdown(state, p).total.est;
    return { p, minutes, act: minutes / 60, est, color: PROJECT_COLORS[p.color]?.main || '#8FA8FF' };
  });
  const maxH = Math.max(1, ...perProject.map((x) => Math.max(x.act, x.est)));
  const scale = Math.max(10, Math.ceil((maxH * 1.15) / 10) * 10);
  const pct = (h) => `${Math.min(100, (h / scale) * 100)}%`;

  return (
    <AppLayout page="charts">
      <PageHead title="Charts" />
      <div className="chart-grid">
        <div className="card ccard h-top">
          <div className="card-head"><div className="card-title">Progress</div><div className="card-meta">All tasks</div></div>
          <div className="donut-wrap">
            <div className="donut">
              <Donut pct={ts.pct} />
              <div className="donut-center">
                <div className="donut-pct">{ts.pct}%</div>
                <div className="donut-lbl">complete</div>
              </div>
            </div>
            <div className="legend">
              <div className="legend-item"><span className="swatch" style={{ background: '#A78BFA' }} /><b>{ts.done}</b> done</div>
              <div className="legend-item"><span className="swatch" style={{ background: '#2A3358' }} /><b>{ts.left}</b> left</div>
            </div>
          </div>
        </div>

        <div className="card ccard h-top">
          <div className="card-head"><div className="card-title">Progress over time</div><div className="card-meta">Weekly, all projects</div></div>
          <div className="line-wrap"><LineChart series={series} /></div>
        </div>

        <div className="card ccard h-bot">
          <div className="card-head"><div className="card-title">Time spent</div><div className="card-meta">Hours logged</div></div>
          <div className="ts-list">
            {perProject.length === 0 && <div className="empty">No projects yet.</div>}
            {perProject.map(({ p, minutes, act, color }) => (
              <div key={p.id} className="ts-row is-clickable" onClick={() => navigate('/time-tracking')} title="Open time tracking">
                <div className="ts-top"><div className="ts-name"><span className="pdot" style={{ background: color }} />{p.name}</div><div className="ts-val">{minutesToHm(minutes)}</div></div>
                <div className="progress"><div className="progress-fill" style={{ width: pct(act), background: color }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="card ccard h-bot">
          <div className="card-head">
            <div className="card-title">Estimated vs actual hours</div>
            <div className="eh-legend">
              <div className="legend-item"><span className="swatch" style={{ background: '#3B4580' }} />Estimated</div>
              <div className="legend-item"><span className="swatch" style={{ background: '#A78BFA' }} />Actual</div>
            </div>
          </div>
          <div className="eh-list">
            {perProject.map(({ p, minutes, act, est, color }) => (
              <div key={p.id} className="eh-block is-clickable" onClick={() => navigate('/cost')} title="Open cost breakdown">
                <div className="eh-top">
                  <div className="eh-name"><span className="pdot" style={{ background: color }} />{p.name}</div>
                  <div className="eh-nums"><span>Est <b>{minutesToHm(est * 60)}</b></span><span>Act <b>{minutesToHm(minutes)}</b></span></div>
                </div>
                <div className="eh-bars">
                  <div className="eh-bar" style={{ width: pct(est), background: '#3B4580' }} />
                  <div className="eh-bar" style={{ width: pct(act), background: color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
