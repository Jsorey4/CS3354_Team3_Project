/**
 * @author Jon Sorey - matches cost.html
 * @description The money screen for the current project, in the mockup's layout: summary cards (Bid, Budget,
 *   Stage costs with its Total / Subtotal label, Expenses - four separate buckets that are never added
 *   together), the stage-cost Breakdown table, the searchable / sortable / filterable expense table, and an
 *   Export button. Members get the server's 403 "Access denied" view and no figures at all. Bid and budget
 *   edits are validated to the cent, with a Retry banner if the save cannot reach the server.
 * @traces SE-FR-01, SE-FR-02, SE-FR-03, SE-NFR-01, SE-NFR-02, SE-NFR-04, UC-01
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ExpenseTable } from '../features/costs/ExpenseTable';
import { StageCostTable } from '../features/costs/StageCostTable';
import { costController } from '../features/costs/costController';
import { isValidAmount, normalizeAmount, subtractAmounts } from '../features/costs/model';
import { ExportModal } from '../features/export/ExportModal';
import { ProjectPicker, useProjectScope } from '../features/projects/ProjectScope';
import type { CostQuery, CostSummary } from '../shared/types';
import { formatMoney } from '../shared/format';
import { AccessDenied, Alert, Badge, Card, EmptyState, Field, Icon, ModeBadge, PageHeader, ProgressBar, RetryBanner, Spinner } from '../shared/ui';
import { toApiError, useSave } from '../shared/useSave';

/** Mockup .sum-card: name + pill, 32px figure, "of $X budget", progress bar. */
function SumCard({ name, pill, value, of, pct, color, selected }: { name: string; pill?: ReactNode; value: string; of?: string; pct?: number; color?: string; selected?: boolean }) {
  return (
    <div className={`card px-6 py-5 ${selected ? 'border-accent' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-semibold text-ink">{name}</p>
        {pill}
      </div>
      <p className="mt-2 flex flex-wrap items-baseline gap-2">
        <span className="text-[32px] font-extrabold leading-10 tracking-[-0.02em] text-ink tabular-nums">{value}</span>
        {of ? <span className="text-sm text-muted">{of}</span> : null}
      </p>
      {pct !== undefined ? <div className="mt-3"><ProgressBar value={pct} color={color} /></div> : null}
    </div>
  );
}

function FinancialsForm({ summary, projectId, onSaved }: { summary: CostSummary; projectId: string; onSaved: (s: CostSummary) => void }) {
  const [bid, setBid] = useState(summary.bid_amount);
  const [budget, setBudget] = useState(summary.budget_amount);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const save = useSave(() => costController.updateFinancials(projectId, { bid_amount: normalizeAmount(bid), budget_amount: normalizeAmount(budget) }), (s) => { onSaved(s); setSaved(true); });
  const submit = () => {
    const e: Record<string, string> = {};
    if (!isValidAmount(bid)) e.bid_amount = 'Enter 0 or more, e.g. 48500.00';
    if (!isValidAmount(budget)) e.budget_amount = 'Enter 0 or more, e.g. 42000.00';
    setErrors(e);
    setSaved(false);
    if (!Object.keys(e).length) void save.run();
  };
  return (
    <div className="space-y-3">
      <RetryBanner error={save.networkError} onRetry={save.retry} onCancel={save.cancel} busy={save.saving} />
      {save.error && !Object.keys(save.fieldErrors).length ? <Alert>{save.error.detail}</Alert> : null}
      {saved ? <Alert tone="ok" onClose={() => setSaved(false)}>Bid and budget saved.</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Bid amount" error={errors.bid_amount ?? save.fieldErrors.bid_amount} htmlFor="fin-bid">
          <input id="fin-bid" className="input text-right tabular-nums" inputMode="decimal" value={bid} onChange={(e) => setBid(e.target.value)} />
        </Field>
        <Field label="Budget amount" error={errors.budget_amount ?? save.fieldErrors.budget_amount} htmlFor="fin-budget">
          <input id="fin-budget" className="input text-right tabular-nums" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </Field>
        <button type="button" className="btn-primary" onClick={submit} disabled={save.saving}>{save.saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

export function CostsPage() {
  const { currentProject, loading } = useProjectScope();
  const projectId = currentProject?.id;
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<CostQuery>({ sort_by: 'expense_date', sort_dir: 'desc' });
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [exporting, setExporting] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async (q: CostQuery, sel: Set<string> | null) => {
    if (!projectId) return;
    try {
      const result = await costController.summary(projectId, { ...q, stage_ids: sel ? [...sel] : null });
      setSummary(result);
      setDenied(false);
      setError(null);
    } catch (err) {
      const e = toApiError(err);
      if (e.status === 403) {
        setDenied(true);
        setSummary(null);
      } else setError(e.detail);
    }
  }, [projectId]);

  useEffect(() => {
    setSummary(null);
    setSelected(null);
    setDenied(false);
    void load(query, null);
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onQuery = (q: CostQuery) => {
    setQuery(q);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => void load(q, selected), q.search !== query.search ? 250 : 0);
  };

  const effectiveSelected = selected ?? new Set(summary?.stage_costs.map((s) => s.id) ?? []);
  const toggle = (id: string) => {
    const next = new Set(effectiveSelected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const all = summary && next.size === summary.stage_costs.length;
    setSelected(all ? null : next);
    void load(query, all ? null : next);
  };
  const toggleAll = (all: boolean) => {
    const next = all ? null : new Set<string>();
    setSelected(next);
    void load(query, next);
  };

  if (loading) return <Spinner />;
  if (!currentProject) return <EmptyState title="No project selected" icon="dollar" />;

  const budgetPct = (amount: string) => (summary && Number(summary.budget_amount) > 0 ? (Number(amount) / Number(summary.budget_amount)) * 100 : 0);
  const budgetLabel = summary ? `of ${formatMoney(summary.budget_amount, summary.currency)} budget` : '';

  return (
    <div>
      <PageHeader
        title="Cost"
        subtitle={<><b>{currentProject.name}</b> · bids, budgets, stage costs and expenses</>}
        actions={
          <>
            <ProjectPicker />
            {!denied ? <button type="button" className="btn-secondary" onClick={() => setExporting(true)}><Icon name="download" /> Export</button> : null}
          </>
        }
      />
      {denied ? (
        <AccessDenied title="Financial records are restricted">
          Only project owners and managers can view or edit bids, budgets, stage costs and expenses. Your role in “{currentProject.name}” is <strong>{currentProject.my_role}</strong>.
        </AccessDenied>
      ) : error ? (
        <Alert>{error}</Alert>
      ) : !summary ? (
        <Spinner label="Loading costs…" />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <SumCard name="Bid" pill={<ModeBadge mode={currentProject.project_type} />} value={formatMoney(summary.bid_amount, summary.currency)} of="quoted" />
            <SumCard name="Budget" value={formatMoney(summary.budget_amount, summary.currency)} of={`${formatMoney(subtractAmounts(summary.budget_amount, summary.stage_cost_sum), summary.currency)} left vs stages`} />
            <SumCard name="Stage costs" selected pill={<Badge tone={summary.sum_label === 'Total' ? 'accent' : 'warn'}>{summary.sum_label}</Badge>}
              value={formatMoney(summary.stage_cost_sum, summary.currency)} of={budgetLabel} pct={budgetPct(summary.stage_cost_sum)} />
            <SumCard name="Expenses" pill={<Badge tone="neutral">{summary.expense_count} shown</Badge>}
              value={formatMoney(summary.expense_total, summary.currency)} of={budgetLabel} pct={budgetPct(summary.expense_total)} color="rgb(var(--c-ok))" />
          </div>
          <Card title="Breakdown" actions={<Badge tone="accent">{currentProject.name}</Badge>}>
            {summary.sum_label === 'Subtotal' ? (
              <div className="mb-3"><Alert tone="warn" title="Showing a subtotal">{summary.included_stage_ids.length} of {summary.stage_costs.length} stages are included. Tick every stage to see the project total.</Alert></div>
            ) : null}
            <StageCostTable projectId={currentProject.id} summary={summary} selected={effectiveSelected} onToggle={toggle} onToggleAll={toggleAll} onChanged={() => void load(query, selected)} />
          </Card>
          <Card title="Expenses" actions={<span>Search, filter and sort</span>}>
            <ExpenseTable projectId={currentProject.id} summary={summary} query={query} onQuery={onQuery} onChanged={() => void load(query, selected)} />
          </Card>
          <Card title="Bid & budget">
            <FinancialsForm key={`${summary.bid_amount}-${summary.budget_amount}`} summary={summary} projectId={currentProject.id} onSaved={setSummary} />
          </Card>
          <p className="flex items-center gap-2 text-[13px] text-muted"><Icon name="info" className="h-4 w-4" /> Bids, budgets, stage costs and expenses are tracked separately and are never added together. Amounts are exact to the cent.</p>
        </div>
      )}
      <ExportModal open={exporting} onClose={() => setExporting(false)} projectId={currentProject.id} projectName={currentProject.name} role={currentProject.my_role} initialTab="spreadsheet" />
    </div>
  );
}
