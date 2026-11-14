/**
 * @author Jon Sorey
 * @description Expense list for cost.html: search box, category filter, sortable Date / Amount / Category
 *   headers, an add-expense row with validation, and inline edit / delete. Its total is shown separately
 *   and is never combined with bids, budgets or stage costs.
 * @traces SE-FR-02, SE-FR-03, SE-NFR-01, SE-NFR-04, UC-01
 */
import { useState } from 'react';
import type { CostQuery, CostSummary, Expense, ExpenseCategory } from '../../shared/types';
import { formatDate, formatMoney, titleCase, todayIso } from '../../shared/format';
import { Alert, Badge, Icon, RetryBanner } from '../../shared/ui';
import { toApiError, useSave } from '../../shared/useSave';
import { costController, type ExpenseInput } from './costController';
import { EXPENSE_CATEGORIES, normalizeAmount, validateExpense } from './model';

interface Props {
  projectId: string;
  summary: CostSummary;
  query: CostQuery;
  onQuery: (q: CostQuery) => void;
  onChanged: () => void;
}

const EMPTY = (): ExpenseInput => ({ category: 'other', description: '', amount: '', expense_date: todayIso(), stage_cost_id: null });

function SortHeader({ label, field, query, onQuery, align = 'left' }: { label: string; field: NonNullable<CostQuery['sort_by']>; query: CostQuery; onQuery: (q: CostQuery) => void; align?: 'left' | 'right' }) {
  const active = query.sort_by === field;
  const dir = active && query.sort_dir === 'asc' ? 'desc' : 'asc';
  return (
    <th className={`table-head ${align === 'right' ? 'text-right' : ''}`} aria-sort={active ? (query.sort_dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-ink" onClick={() => onQuery({ ...query, sort_by: field, sort_dir: dir })}>
        {label}
        <Icon name={active ? (query.sort_dir === 'asc' ? 'chevron-up' : 'chevron-down') : 'chevron-down'} className={`h-3 w-3 ${active ? '' : 'opacity-30'}`} />
      </button>
    </th>
  );
}

export function ExpenseTable({ projectId, summary, query, onQuery, onChanged }: Props) {
  const [form, setForm] = useState<ExpenseInput>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<(ExpenseInput & { id: string }) | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const add = useSave(() => costController.addExpense(projectId, { ...form, amount: normalizeAmount(form.amount) }), () => {
    setForm(EMPTY());
    onChanged();
  });

  const submit = () => {
    const e = validateExpense(form);
    setErrors(e);
    if (Object.keys(e).length === 0) void add.run();
  };

  const startEdit = (e: Expense) =>
    setEditing({ id: e.id, category: e.category, description: e.description, amount: e.amount, expense_date: e.expense_date, stage_cost_id: e.stage_cost_id });

  const saveEdit = async () => {
    if (!editing) return;
    const e = validateExpense(editing);
    if (Object.keys(e).length) {
      setRowError(Object.values(e)[0]);
      return;
    }
    try {
      const { id, ...rest } = editing;
      await costController.updateExpense(projectId, id, { ...rest, amount: normalizeAmount(rest.amount) });
      setEditing(null);
      setRowError(null);
      onChanged();
    } catch (err) {
      setRowError(toApiError(err).detail);
    }
  };

  const remove = async (e: Expense) => {
    if (!window.confirm(`Delete expense "${e.description}"?`)) return;
    try {
      await costController.deleteExpense(projectId, e.id);
      onChanged();
    } catch (err) {
      setRowError(toApiError(err).detail);
    }
  };

  const stageName = (id: string | null) => summary.stage_costs.find((s) => s.id === id)?.stage_name;
  const fieldErrors = { ...add.fieldErrors, ...errors };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-10" placeholder="Search expenses" value={query.search ?? ''} onChange={(e) => onQuery({ ...query, search: e.target.value })} aria-label="Search expenses" />
        </div>
        <select className="input w-auto" value={query.category ?? ''} onChange={(e) => onQuery({ ...query, category: e.target.value || undefined })} aria-label="Filter by category">
          <option value="">All categories</option>
          {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      {rowError ? <Alert onClose={() => setRowError(null)}>{rowError}</Alert> : null}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <SortHeader label="Date" field="expense_date" query={query} onQuery={onQuery} />
              <SortHeader label="Category" field="category" query={query} onQuery={onQuery} />
              <th className="table-head">Description</th>
              <th className="table-head">Stage</th>
              <SortHeader label="Amount" field="amount" query={query} onQuery={onQuery} align="right" />
              <th className="table-head w-24" />
            </tr>
          </thead>
          <tbody className="[&>tr]:border-b [&>tr]:border-line">
            {summary.expenses.length === 0 ? (
              <tr><td className="table-cell py-8 text-center text-muted" colSpan={6}>No expenses match.</td></tr>
            ) : null}
            {summary.expenses.map((e) =>
              editing?.id === e.id ? (
                <tr key={e.id} className="bg-brand/5">
                  <td className="table-cell"><input type="date" className="input py-1" value={editing.expense_date} onChange={(ev) => setEditing({ ...editing, expense_date: ev.target.value })} aria-label="Expense date" /></td>
                  <td className="table-cell">
                    <select className="input py-1" value={editing.category} onChange={(ev) => setEditing({ ...editing, category: ev.target.value as ExpenseCategory })} aria-label="Expense category">
                      {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </td>
                  <td className="table-cell"><input className="input py-1" value={editing.description} onChange={(ev) => setEditing({ ...editing, description: ev.target.value })} aria-label="Expense description" /></td>
                  <td className="table-cell">
                    <select className="input py-1" value={editing.stage_cost_id ?? ''} onChange={(ev) => setEditing({ ...editing, stage_cost_id: ev.target.value || null })} aria-label="Expense stage">
                      <option value="">—</option>
                      {summary.stage_costs.map((s) => <option key={s.id} value={s.id}>{s.stage_name}</option>)}
                    </select>
                  </td>
                  <td className="table-cell"><input className="input py-1 text-right" inputMode="decimal" value={editing.amount} onChange={(ev) => setEditing({ ...editing, amount: ev.target.value })} aria-label="Expense amount" /></td>
                  <td className="table-cell text-right">
                    <button type="button" className="btn-ghost p-1.5" onClick={() => void saveEdit()} aria-label="Save expense"><Icon name="check" /></button>
                    <button type="button" className="btn-ghost p-1.5" onClick={() => setEditing(null)} aria-label="Cancel edit"><Icon name="x" /></button>
                  </td>
                </tr>
              ) : (
                <tr key={e.id}>
                  <td className="table-cell whitespace-nowrap">{formatDate(e.expense_date + 'T12:00:00')}</td>
                  <td className="table-cell"><Badge tone="neutral">{titleCase(e.category)}</Badge></td>
                  <td className="table-cell">{e.description}</td>
                  <td className="table-cell text-muted">{stageName(e.stage_cost_id) ?? '—'}</td>
                  <td className="table-cell text-right font-bold tabular-nums text-ink">{formatMoney(e.amount, summary.currency)}</td>
                  <td className="table-cell text-right">
                    <button type="button" className="btn-ghost p-1.5" onClick={() => startEdit(e)} aria-label={`Edit ${e.description}`}><Icon name="edit" /></button>
                    <button type="button" className="btn-ghost p-1.5 hover:text-danger" onClick={() => void remove(e)} aria-label={`Delete ${e.description}`}><Icon name="trash" /></button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
          <tfoot className="border-t border-line-strong">
            <tr>
              <td className="table-cell font-bold" colSpan={4}>Expenses total ({summary.expense_count})</td>
              <td className="table-cell text-right text-[15px] font-bold tabular-nums text-ink">{formatMoney(summary.expense_total, summary.currency)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="rounded-btn border border-dashed border-line-strong p-4">
        <p className="label">Add expense</p>
        <RetryBanner error={add.networkError} onRetry={add.retry} onCancel={add.cancel} busy={add.saving} />
        {add.error && !Object.keys(add.fieldErrors).length ? <Alert onClose={add.reset}>{add.error.detail}</Alert> : null}
        <div className="mt-2 grid gap-2 md:grid-cols-[9rem_9rem_1fr_9rem_8rem_auto]">
          <input type="date" className="input" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} aria-label="Date" />
          <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })} aria-label="Category">
            {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <input className="input" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} aria-label="Description" maxLength={300} />
          <select className="input" value={form.stage_cost_id ?? ''} onChange={(e) => setForm({ ...form, stage_cost_id: e.target.value || null })} aria-label="Stage">
            <option value="">No stage</option>
            {summary.stage_costs.map((s) => <option key={s.id} value={s.id}>{s.stage_name}</option>)}
          </select>
          <input className="input text-right" placeholder="0.00" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} aria-label="Amount" />
          <button type="button" className="btn-primary" onClick={submit} disabled={add.saving}><Icon name="plus" /> Add</button>
        </div>
        {Object.keys(fieldErrors).length ? (
          <ul className="mt-2 space-y-0.5 text-xs text-danger">
            {Object.entries(fieldErrors).map(([k, v]) => <li key={k}>{titleCase(k)}: {v}</li>)}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
