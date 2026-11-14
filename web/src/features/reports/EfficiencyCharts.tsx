/**
 * @author Jon Sorey
 * @description The four charts of charts.html, drawn as plain SVG / HTML so they render identically in every
 *   browser: the completion donut ("64% complete, 16 done, 9 left"), progress over time (weekly line with
 *   the latest point in gold), time spent per person, and estimated vs assigned vs actual hours per person,
 *   plus the per-task efficiency table. Every chart has a text alternative, and series are told apart by
 *   label and position as well as color. Undefined metrics show "N/A".
 * @traces SE-FR-04, SE-FR-05, SE-NFR-01, SE-NFR-02, SE-NFR-05, UC-02, SE-FR-15
 */
import type { PerformanceReport } from '../../shared/types';
import { formatDate } from '../../shared/format';
import { Badge, EmptyState } from '../../shared/ui';
import { hoursLabel } from '../dashboard/widgets';
import { formatEfficiency } from './reportController';

export function CompletionDonut({ report }: { report: PerformanceReport }) {
  const { done, total, progress_pct } = report.completion;
  const r = 84;
  const c = 2 * Math.PI * r;
  return (
    <div className="mt-4 flex flex-col items-center">
      <div className="relative h-[208px] w-[208px]">
        <svg viewBox="0 0 208 208" className="h-[208px] w-[208px]" role="img" aria-label={total ? `${progress_pct.toFixed(2)} percent complete: ${done} done, ${total - done} left` : 'No tasks yet'}>
          <circle cx="104" cy="104" r={r} fill="none" stroke="rgb(var(--c-line))" strokeWidth="20" />
          <circle cx="104" cy="104" r={r} fill="none" stroke="rgb(var(--c-accent))" strokeWidth="20" strokeDasharray={c} strokeDashoffset={c * (1 - progress_pct / 100)} transform="rotate(-90 104 104)" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[44px] font-extrabold leading-[52px] tracking-[-0.02em] text-ink">{total ? `${Math.round(progress_pct)}%` : 'N/A'}</span>
          <span className="text-[13px] text-muted">complete</span>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-6 text-sm text-body">
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-accent" /><b className="font-bold text-ink">{done}</b> done</span>
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-line" /><b className="font-bold text-ink">{total - done}</b> left</span>
      </div>
    </div>
  );
}

export function ProgressOverTime({ report }: { report: PerformanceReport }) {
  const points = report.progress_over_time;
  if (points.length === 0) return <EmptyState icon="chart" title="No weeks in this range" />;
  const width = 492;
  const height = 256;
  const left = 36;
  const bottom = 24;
  const plotW = width - left - 16;
  const plotH = height - bottom - 16;
  const x = (i: number) => left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (pct: number) => 8 + plotH - (pct / 100) * plotH;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.completion_pct)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const step = Math.max(1, Math.ceil(points.length / 6));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-auto w-full" role="img"
      aria-label={`Completion by week: ${points.map((p) => `${formatDate(p.week_start + 'T12:00:00', { year: undefined })} ${p.completion_pct}%`).join(', ')}`}>
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line x1={left} x2={width - 8} y1={y(g)} y2={y(g)} stroke="rgb(var(--c-line))" />
          <text x={left - 8} y={y(g) + 4} fontSize="11" textAnchor="end" fill="rgb(var(--c-muted))">{g}%</text>
        </g>
      ))}
      <path d={area} fill="rgb(var(--c-accent) / 0.18)" />
      <path d={line} fill="none" stroke="rgb(var(--c-accent))" strokeWidth={2.5} strokeLinejoin="round" />
      {points.map((p, i) => {
        const last = i === points.length - 1;
        return (
          <g key={p.week_start}>
            <circle cx={x(i)} cy={y(p.completion_pct)} r={last ? 6 : 4.5} fill={last ? 'rgb(var(--c-gold))' : 'rgb(var(--c-surface))'} stroke={last ? 'rgb(var(--c-gold))' : 'rgb(var(--c-accent))'} strokeWidth={2} />
            {i % step === 0 || last ? (
              <>
                <text x={x(i)} y={y(p.completion_pct) - 12} fontSize="11" fontWeight="600" textAnchor="middle" fill={last ? 'rgb(var(--c-gold))' : 'rgb(var(--c-body))'}>{Math.round(p.completion_pct)}%</text>
                <text x={x(i)} y={height - 6} fontSize="11" textAnchor="middle" fill="rgb(var(--c-muted))">{formatDate(p.week_start + 'T12:00:00', { year: undefined })}</text>
              </>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

const DOTS = ['bg-accent', 'bg-brand', 'bg-ok', 'bg-warn', 'bg-info', 'bg-danger'];

export function TimeSpent({ report }: { report: PerformanceReport }) {
  const rows = report.members.filter((m) => m.actual_hours > 0 || report.scope === 'self');
  if (rows.length === 0) return <EmptyState icon="clock" title="No hours logged in this range" />;
  const max = Math.max(1, ...rows.map((r) => r.actual_hours));
  return (
    <ul className="mt-7 flex flex-col gap-8">
      {rows.map((r, i) => (
        <li key={r.user_id}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[15px] font-semibold text-ink"><span className={`h-2.5 w-2.5 rounded-full ${DOTS[i % DOTS.length]}`} />{r.display_name}</span>
            <span className="text-[15px] font-bold text-ink">{hoursLabel(r.actual_hours)}</span>
          </div>
          <div className="mt-2.5 h-3 rounded-full bg-line"><div className={`h-3 rounded-full ${i % 2 ? 'bg-brand' : 'bg-accent'}`} style={{ width: `${(r.actual_hours / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function EstimatedVsActual({ report }: { report: PerformanceReport }) {
  const rows = report.members.filter((m) => m.estimated_hours > 0 || m.assigned_hours > 0 || m.actual_hours > 0);
  if (rows.length === 0) return <EmptyState icon="chart" title="No hours to compare yet" />;
  const max = Math.max(1, ...rows.flatMap((r) => [r.estimated_hours, r.assigned_hours, r.actual_hours]));
  const pct = (v: number) => `${(v / max) * 100}%`;
  return (
    <ul className="mt-5 flex flex-col gap-7">
      {rows.map((r, i) => (
        <li key={r.user_id} aria-label={`${r.display_name}: estimated ${r.estimated_hours} hours, assigned ${r.assigned_hours} hours, actual ${r.actual_hours} hours, efficiency ${formatEfficiency(r.efficiency_pct)}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[15px] font-semibold text-ink"><span className={`h-2.5 w-2.5 rounded-full ${DOTS[i % DOTS.length]}`} />{r.display_name}</span>
            <span className="flex items-center gap-4 text-sm text-muted">
              <span>Est <b className="font-bold text-ink">{r.estimated_hours}h</b></span>
              <span>Asg <b className="font-bold text-ink">{r.assigned_hours}h</b></span>
              <span>Act <b className="font-bold text-ink">{hoursLabel(r.actual_hours)}</b></span>
            </span>
          </div>
          <div className="mt-2.5 flex flex-col gap-1.5">
            <div className="h-2.5 rounded-full bg-line-strong" style={{ width: pct(r.estimated_hours) }} title={`Estimated ${r.estimated_hours} h`} />
            <div className="h-2.5 rounded-full bg-brand" style={{ width: pct(r.assigned_hours) }} title={`Assigned ${r.assigned_hours} h`} />
            <div className="h-2.5 rounded-full bg-accent" style={{ width: pct(r.actual_hours) }} title={`Actual ${r.actual_hours} h`} />
          </div>
          <p className="mt-1.5 text-xs text-muted">Efficiency {formatEfficiency(r.efficiency_pct)}</p>
        </li>
      ))}
    </ul>
  );
}

export function TaskEfficiencyTable({ report }: { report: PerformanceReport }) {
  if (report.tasks.length === 0) return <p className="py-6 text-center text-sm text-muted">No tasks with estimates or logged hours in this range.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="table-head">Task</th>
            <th className="table-head">Assignee</th>
            <th className="table-head text-right">Estimated</th>
            <th className="table-head text-right">Actual</th>
            <th className="table-head text-right">Efficiency</th>
          </tr>
        </thead>
        <tbody>
          {report.tasks.map((t) => {
            const eff = t.efficiency_pct;
            const tone = eff === 'N/A' ? 'neutral' : eff >= 100 ? 'ok' : eff >= 75 ? 'warn' : 'danger';
            return (
              <tr key={t.task_id} className="border-b border-line last:border-b-0">
                <td className="table-cell font-semibold text-ink">{t.title}</td>
                <td className="table-cell">{t.assignee_username ? `@${t.assignee_username}` : '—'}</td>
                <td className="table-cell text-right tabular-nums">{t.estimated_hours == null ? 'N/A' : t.estimated_hours.toFixed(2)}</td>
                <td className="table-cell text-right tabular-nums">{t.actual_hours.toFixed(2)}</td>
                <td className="table-cell text-right"><Badge tone={tone} icon={eff === 'N/A' ? 'info' : eff >= 100 ? 'check' : 'alert'}>{formatEfficiency(eff)}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
