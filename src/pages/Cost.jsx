import { useState } from 'react';
import { AppLayout, PageHead } from '../components/AppLayout';
import { ProjectModal, StageModal } from '../components/forms';
import { IconDownload, IconInfo, IconPlus } from '../components/Icons';
import { Pill, useToast } from '../components/ui';
import { minutesToHm, todayStr } from '../lib/date';
import { download, toXLSX } from '../lib/export';
import { costBreakdown, useStore } from '../lib/store';
import { CATEGORY_TONE, PROJECT_COLORS, money } from '../lib/theme';

const hrs = (h) => (Math.round(h * 100) / 100).toString();

export function costSheetRows(state, projects) {
  const rows = [['Project', 'Stage', 'Rate ($/h)', 'Est hrs', 'Act hrs', 'Est $', 'Act $', 'Budget $']];
  projects.forEach((p) => {
    const b = costBreakdown(state, p);
    b.rows.forEach((r) => rows.push([p.name, r.name, r.rate, r.est, Math.round(r.act * 100) / 100, r.estCost, Math.round(r.actCost * 100) / 100, '']));
    if (b.unstaged) rows.push([p.name, 'No stage', '', '', Math.round(b.unstaged * 100) / 100, '', '', '']);
    rows.push([p.name, 'Total', '', b.total.est, Math.round(b.total.act * 100) / 100, b.total.estCost, Math.round(b.total.actCost * 100) / 100, p.budget]);
  });
  return rows;
}

export default function Cost() {
  const { state } = useStore();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState(state.projects[0]?.id);
  const [modal, setModal] = useState(null);
  const selected = state.projects.find((p) => p.id === selectedId) || state.projects[0];
  const b = selected && costBreakdown(state, selected);

  const exportXlsx = () => {
    download(`projectforge-costs-${todayStr()}.xlsx`, toXLSX([{ name: 'Cost summary', rows: costSheetRows(state, state.projects) }]));
    toast('Cost summary exported (.xlsx)');
  };

  return (
    <AppLayout page="cost">
      <PageHead title="Cost" sub={`${state.projects.length} ${state.projects.length === 1 ? 'project' : 'projects'}`}>
        <button className="btn btn-secondary" onClick={exportXlsx} disabled={!state.projects.length}>
          <IconDownload />
          Export
        </button>
      </PageHead>

      <div className="sum-row">
        {state.projects.map((p) => {
          const pb = costBreakdown(state, p);
          const spent = pb.total.actCost;
          const pct = p.budget ? Math.min(100, (spent / p.budget) * 100) : 0;
          const over = p.budget && spent > p.budget;
          return (
            <div
              key={p.id}
              className={`card sum-card is-clickable${selected?.id === p.id ? ' selected' : ''}`}
              onClick={() => setSelectedId(p.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setSelectedId(p.id)}
            >
              <div className="sum-top"><div className="sum-name">{p.name}</div><Pill tone={CATEGORY_TONE[p.category]}>{p.category}</Pill></div>
              <div className="sum-val">
                <div className="sum-big">{money(spent)}</div>
                <div className="sum-of">{p.budget ? `of ${money(p.budget)} budget` : 'no budget set'}</div>
              </div>
              <div className="progress"><div className="progress-fill" style={{ width: `${pct}%`, background: over ? '#F472B6' : PROJECT_COLORS[p.color]?.main }} /></div>
            </div>
          );
        })}
        {state.projects.length === 0 && <div className="card empty-card"><div className="card-title">No projects yet</div><div className="sub">Create a project to start tracking costs.</div></div>}
      </div>

      {selected && (
        <div className="card brk">
          <div className="brk-head">
            <div className="brk-title"><div className="card-title">Breakdown</div><Pill tone={CATEGORY_TONE[selected.category]}>{selected.name}</Pill></div>
            <div className="brk-actions">
              <button className="btn btn-secondary btn-xs" onClick={() => setModal({ type: 'budget' })}>Edit budget</button>
              <button className="btn btn-secondary btn-xs" onClick={() => setModal({ type: 'stage' })}>
                <IconPlus size={14} color="#F1F4FF" /> Add stage
              </button>
            </div>
          </div>
          <div className="t-head"><div className="c-stage">Stage</div><div className="c-n">Rate</div><div className="c-n">Est hrs</div><div className="c-n">Act hrs</div><div className="c-n">Est $</div><div className="c-n">Act $</div></div>
          {b.rows.map((r) => (
            <div key={r.id} className="t-row is-clickable" onClick={() => setModal({ type: 'stage', stage: r })} title="Edit stage">
              <div className="c-stage">{r.name}</div>
              <div className="c-n">${r.rate}/h</div>
              <div className="c-n">{hrs(r.est)}</div>
              <div className="c-n">{hrs(r.act)}</div>
              <div className="c-n">{money(r.estCost)}</div>
              <div className={`c-n c-act${r.actCost > r.estCost ? ' over' : ''}`}>{money(r.actCost)}</div>
            </div>
          ))}
          {b.unstaged > 0 && (
            <div className="t-row muted-row">
              <div className="c-stage">No stage</div><div className="c-n">—</div><div className="c-n">—</div><div className="c-n">{hrs(b.unstaged)}</div><div className="c-n">—</div><div className="c-n c-act">—</div>
            </div>
          )}
          {b.rows.length === 0 && !b.unstaged && <div className="t-row muted-row"><div className="c-stage">No stages yet — add one to estimate cost.</div></div>}
          <div className="t-total">
            <div className="c-stage">Total</div><div className="c-n" /><div className="c-n">{hrs(b.total.est)}</div><div className="c-n">{hrs(b.total.act)}</div><div className="c-n">{money(b.total.estCost)}</div><div className="c-n">{money(b.total.actCost)}</div>
          </div>
        </div>
      )}
      {selected && (
        <div className="note"><IconInfo />Actual hours come from the time tracker. {hrs(b.total.act)} hrs = {minutesToHm(Math.round(b.total.act * 60))}.</div>
      )}

      {modal?.type === 'stage' && <StageModal project={selected} stage={modal.stage} onClose={() => setModal(null)} />}
      {modal?.type === 'budget' && <ProjectModal project={selected} onClose={() => setModal(null)} />}
    </AppLayout>
  );
}
