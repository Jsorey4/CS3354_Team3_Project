/**
 * @author Jon Sorey
 * @description Stage costs (Requirements, Design, ...). Each row has a checkbox: un-ticking a stage
 *   recalculates the sum as a "Subtotal" (all ticked = "Total"). Managers can add, rename, re-price and
 *   delete stages inline.
 * @traces SE-FR-01, SE-NFR-01, UC-01
 */
import { useState } from 'react';
import type { CostSummary, StageCost } from '../../shared/types';
import { formatMoney } from '../../shared/format';
import { Alert, Icon, RetryBanner } from '../../shared/ui';
import { toApiError, useSave } from '../../shared/useSave';
import { costController } from './costController';
import { calculateStageCostSummary, isValidAmount, normalizeAmount } from './model';

interface Props {
  projectId: string;
  summary: CostSummary;
  selected: Set<string>;
  onToggle: (stageId: string) => void;
  onToggleAll: (all: boolean) => void;
  onChanged: () => void;
}

export function StageCostTable({ projectId, summary, selected, onToggle, onToggleAll, onChanged }: Props) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string; amount: string } | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const included = summary.stage_costs.filter((s) => selected.has(s.id));
  const preview = calculateStageCostSummary(included, included.length !== summary.stage_costs.length);

  const add = useSave(() => costController.addStage(projectId, { stage_name: name.trim(), amount: normalizeAmount(amount) }), () => {
    setName('');
    setAmount('');
    onChanged();
  });

  const saveEdit = async (stage: StageCost) => {
    if (!editing) return;
    if (!isValidAmount(editing.amount)) {
      setRowError('Enter an amount of 0 or more');
      return;
    }
    try {
      await costController.updateStage(projectId, stage.id, { stage_name: editing.name, amount: normalizeAmount(editing.amount) });
      setEditing(null);
      setRowError(null);
      onChanged();
    } catch (err) {
      setRowError(toApiError(err).detail);
    }
  };

  const remove = async (stage: StageCost) => {
    if (!window.confirm(`Delete stage "${stage.stage_name}"?`)) return;
    try {
      await costController.deleteStage(projectId, stage.id);
      onChanged();
    } catch (err) {
      setRowError(toApiError(err).detail);
    }
  };

  const allChecked = summary.stage_costs.length > 0 && included.length === summary.stage_costs.length;
  return (
    <div className="space-y-3">
      {rowError ? <Alert onClose={() => setRowError(null)}>{rowError}</Alert> : null}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-head w-10"><input type="checkbox" checked={allChecked} onChange={(e) => onToggleAll(e.target.checked)} aria-label="Include all stages" /></th>
              <th className="table-head">Stage</th>
              <th className="table-head text-right">Cost</th>
              <th className="table-head w-24" />
            </tr>
          </thead>
          <tbody className="[&>tr]:border-b [&>tr]:border-line">
            {summary.stage_costs.map((s) => (
              <tr key={s.id} className={selected.has(s.id) ? '' : 'opacity-50'}>
                <td className="table-cell"><input type="checkbox" checked={selected.has(s.id)} onChange={() => onToggle(s.id)} aria-label={`Include ${s.stage_name}`} /></td>
                {editing?.id === s.id ? (
                  <>
                    <td className="table-cell"><input className="input py-1" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Stage name" /></td>
                    <td className="table-cell"><input className="input py-1 text-right" inputMode="decimal" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} aria-label="Stage cost" /></td>
                    <td className="table-cell text-right">
                      <button type="button" className="btn-ghost p-1.5" onClick={() => void saveEdit(s)} aria-label="Save stage"><Icon name="check" /></button>
                      <button type="button" className="btn-ghost p-1.5" onClick={() => setEditing(null)} aria-label="Cancel edit"><Icon name="x" /></button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="table-cell font-semibold text-ink">{s.stage_name}</td>
                    <td className="table-cell text-right font-bold tabular-nums text-ink">{formatMoney(s.amount, summary.currency)}</td>
                    <td className="table-cell text-right">
                      <button type="button" className="btn-ghost p-1.5" onClick={() => setEditing({ id: s.id, name: s.stage_name, amount: s.amount })} aria-label={`Edit ${s.stage_name}`}><Icon name="edit" /></button>
                      <button type="button" className="btn-ghost p-1.5 hover:text-danger" onClick={() => void remove(s)} aria-label={`Delete ${s.stage_name}`}><Icon name="trash" /></button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line-strong">
            <tr>
              <td />
              <td className="table-cell font-bold text-ink">{summary.sum_label}{summary.sum_label === 'Subtotal' ? ` (${included.length} of ${summary.stage_costs.length} stages)` : ''}</td>
              <td className="table-cell text-right text-[15px] font-bold tabular-nums text-ink" aria-live="polite">{formatMoney(summary.stage_cost_sum, summary.currency)}</td>
              <td className="table-cell text-right text-xs text-muted">{preview.sum !== summary.stage_cost_sum ? 'updating…' : ''}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <RetryBanner error={add.networkError} onRetry={add.retry} onCancel={add.cancel} busy={add.saving} />
      {add.error ? <Alert onClose={add.reset}>{add.error.detail}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <input className="input max-w-xs flex-1" placeholder="New stage name" value={name} onChange={(e) => setName(e.target.value)} aria-label="New stage name" />
        <input className="input w-36" placeholder="0.00" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="New stage cost" />
        <button type="button" className="btn-secondary" disabled={!name.trim() || !isValidAmount(amount) || add.saving} onClick={() => void add.run()}>
          <Icon name="plus" /> Add stage
        </button>
      </div>
    </div>
  );
}
