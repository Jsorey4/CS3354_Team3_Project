/**
 * @author Jon Sorey - matches charts.html
 * @description Charts for the current project and date range in the mockup's 2 x 2 grid: completion donut,
 *   progress over time, time spent per person, and estimated vs assigned vs actual hours, followed by the
 *   per-task efficiency table. Owners and managers see the whole team; members get an "Only your hours"
 *   report built from their own records alone. Undefined metrics show "N/A". If the report cannot be
 *   loaded the chosen period stays and the page offers Retry or Cancel.
 * @traces SE-FR-04, SE-FR-05, SE-NFR-01, SE-NFR-02, UC-02
 */
import { useCallback, useEffect, useState } from 'react';
import { ProjectPicker, useProjectScope } from '../features/projects/ProjectScope';
import { CompletionDonut, EstimatedVsActual, ProgressOverTime, TaskEfficiencyTable, TimeSpent } from '../features/reports/EfficiencyCharts';
import { formatEfficiency, reportController, validateRange } from '../features/reports/reportController';
import type { PerformanceReport } from '../shared/types';
import { todayIso } from '../shared/format';
import { Alert, Badge, Card, EmptyState, PageHeader, RetryBanner, Spinner } from '../shared/ui';
import type { ApiError } from '../services/apiClient';
import { toApiError } from '../shared/useSave';

export function PerformancePage() {
  const { currentProject, loading } = useProjectScope();
  const [start, setStart] = useState(todayIso(-41));
  const [end, setEnd] = useState(todayIso());
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  // UC-02 "Load failure -> retry or cancel": set when the report request got no usable answer.
  const [loadFailure, setLoadFailure] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!currentProject) return;
    const problem = validateRange(start, end);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      setReport(await reportController.performance(currentProject.id, start, end));
      setError(null);
      setLoadFailure(null);
    } catch (err) {
      const failure = toApiError(err);
      // No answer, or a server fault: offer Retry / Cancel and keep the chosen period and the last report.
      if (failure.isConnectivity || failure.status >= 500) setLoadFailure(failure);
      else setError(failure.detail);
    } finally {
      setBusy(false);
    }
  }, [currentProject, start, end]);

  useEffect(() => void load(), [currentProject?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spinner />;
  if (!currentProject) return <EmptyState title="No project selected" icon="chart" />;

  return (
    <div>
      <PageHeader
        title="Charts"
        subtitle={report ? (report.scope === 'team' ? <>Team view · <b>{currentProject.name}</b></> : <>Only your own hours · <b>{currentProject.name}</b></>) : currentProject.name}
        actions={<ProjectPicker />}
      />
      <div className="-mt-2 mb-6 flex flex-wrap items-end gap-3">
        <label><span className="label">From</span><input type="date" className="input w-auto" value={start} max={end} onChange={(e) => setStart(e.target.value)} /></label>
        <label><span className="label">To</span><input type="date" className="input w-auto" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></label>
        <button type="button" className="btn-primary" onClick={() => void load()} disabled={busy}>{busy ? 'Loading…' : 'Update'}</button>
        {report ? <span className="ml-auto"><Badge tone={report.scope === 'team' ? 'accent' : 'warn'} icon={report.scope === 'team' ? 'users' : 'lock'}>{report.scope === 'team' ? 'Team view' : 'Only your hours'}</Badge></span> : null}
      </div>
      {error ? <div className="mb-4"><Alert onClose={() => setError(null)}>{error}</Alert></div> : null}
      {loadFailure ? (
        <div className="mb-4">
          <RetryBanner
            error={loadFailure}
            busy={busy}
            title="The report could not be loaded."
            hint="Your selected period is kept - retry now or cancel."
            onRetry={() => void load()}
            onCancel={() => setLoadFailure(null)}
          />
        </div>
      ) : null}
      {!report ? (loadFailure || error ? null : <Spinner label="Building report…" />) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Progress" actions={<span>{report.completion.done}/{report.completion.total} tasks</span>}>
              <CompletionDonut report={report} />
            </Card>
            <Card title="Progress over time" actions={<span>Weekly, {report.scope === 'team' ? 'whole project' : 'your tasks'}</span>}>
              <ProgressOverTime report={report} />
            </Card>
            <Card title="Time spent" actions={<span>Hours logged</span>}>
              <TimeSpent report={report} />
            </Card>
            <Card
              title="Estimated vs actual hours"
              actions={
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-line-strong" />Estimated</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-brand" />Assigned</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-accent" />Actual</span>
                </span>
              }
            >
              <p className="text-sm text-body">
                Totals: est <b className="text-ink">{report.totals.estimated_hours.toFixed(2)}h</b> · assigned <b className="text-ink">{report.totals.assigned_hours.toFixed(2)}h</b> · actual <b className="text-ink">{report.totals.actual_hours.toFixed(2)}h</b> · efficiency <b className="text-ink">{formatEfficiency(report.totals.efficiency_pct)}</b>
              </p>
              <EstimatedVsActual report={report} />
            </Card>
          </div>
          <Card title="Task efficiency" actions={<span>Estimated ÷ actual × 100</span>}>
            <TaskEfficiencyTable report={report} />
          </Card>
        </div>
      )}
    </div>
  );
}
