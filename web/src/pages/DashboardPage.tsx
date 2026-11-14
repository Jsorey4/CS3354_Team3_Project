/**
 * @author Myoram Langwang - matches dashboard.html
 * @description The personal dashboard: "Good morning, <name>" with the number of tasks due today, the
 *   Customize and New task buttons, then the widget grid (Upcoming deadlines, Task progress, Projects, Time
 *   tracked, Cost summary by default). Customize turns on dragging, hiding and removing widgets, the Add
 *   widget menu and Restore default. Moves are checked for overlap in the browser first and then by the
 *   server; a rejected move snaps back with a red outline. Widget data refreshes live.
 * @traces SE-FR-21, SE-FR-22, SE-FR-23, SE-FR-24, SE-FR-25, SE-NFR-07, SE-NFR-08, UC-16, UC-17
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { dashboardController } from '../features/dashboard/dashboardController';
import { WidgetGrid } from '../features/dashboard/WidgetGrid';
import { WidgetBody } from '../features/dashboard/widgets';
import { ApiError } from '../services/apiClient';
import { useRealtime } from '../services/realtimeClient';
import type { DashboardPayload, Widget } from '../shared/types';
import { Alert, Icon, PageHeader, RetryBanner, Spinner } from '../shared/ui';
import { toApiError } from '../shared/useSave';

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{ widget: Widget; x: number; y: number; error: ApiError } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [loadMs, setLoadMs] = useState<number | null>(null);

  const load = useCallback(async () => {
    const started = performance.now();
    try {
      setPayload(await dashboardController.load());
      setLoadMs(Math.round(performance.now() - started));
      setError(null);
    } catch (err) {
      setError(toApiError(err).detail);
    }
  }, []);

  useEffect(() => void load(), [load]);
  const softRefresh = useCallback(() => { if (!editing) void load(); }, [editing, load]);
  useRealtime('progress', softRefresh);
  useRealtime('notification', softRefresh);
  useRealtime('task_changed', softRefresh);

  const apply = async (fn: () => Promise<DashboardPayload>, success?: string) => {
    try {
      setPayload(await fn());
      setNotice(success ?? null);
      setError(null);
    } catch (err) {
      setError(toApiError(err).detail);
    }
  };

  const move = async (widget: Widget, x: number, y: number): Promise<boolean> => {
    if (!payload) return false;
    const before = payload;
    setPayload({ ...payload, widgets: payload.widgets.map((w) => (w.id === widget.id ? { ...w, grid_x: x, grid_y: y } : w)) });
    try {
      await dashboardController.move(widget.id, x, y);
      setPendingMove(null);
      return true;
    } catch (err) {
      setPayload(before); // snap back
      const apiErr = toApiError(err);
      if (apiErr.isConnectivity) setPendingMove({ widget, x, y, error: apiErr });
      else setError(apiErr.status === 409 ? 'That spot overlaps another widget - moved back.' : apiErr.detail);
      return false;
    }
  };

  if (!payload) return error ? <Alert>{error}</Alert> : <Spinner label="Loading your dashboard…" />;
  const present = new Set(payload.widgets.filter((w) => !w.is_hidden).map((w) => w.widget_type));
  const addable = payload.available_types.filter((t) => !present.has(t.widget_type));
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const dueToday = (payload.data.task_progress as { due_today?: number } | undefined)?.due_today;

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${user?.display_name.split(' ')[0] ?? ''}`}
        subtitle={
          <>
            {dueToday !== undefined ? <><b>{dueToday} task{dueToday === 1 ? '' : 's'}</b> due today</> : 'Here is your overview'}
            {loadMs != null ? <span className="ml-2 text-xs text-muted">· loaded in {loadMs} ms</span> : null}
          </>
        }
        actions={
          editing ? (
            <>
              <div className="relative">
                <button type="button" className="btn-secondary" onClick={() => setAddOpen((v) => !v)} aria-expanded={addOpen}><Icon name="plus" /> Add widget</button>
                {addOpen ? (
                  <div className="card absolute right-0 z-40 mt-2 w-72 p-2 shadow-pop">
                    {addable.length === 0 ? <p className="p-2 text-sm text-muted">Every widget is already on your dashboard.</p> : addable.map((t) => (
                      <button key={t.widget_type} type="button" className="block w-full rounded-btn px-3 py-2 text-left hover:bg-surface-2"
                        onClick={() => { setAddOpen(false); void apply(() => dashboardController.add(t.widget_type), `${t.title} added`); }}>
                        <span className="block text-sm font-semibold text-ink">{t.title}</span>
                        <span className="block text-xs text-muted">{t.description}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button type="button" className="btn-secondary" onClick={() => { if (window.confirm('Reset your dashboard to the default layout?')) void apply(dashboardController.restoreDefault, 'Default layout restored'); }}>
                <Icon name="refresh" /> Restore default
              </button>
              <button type="button" className="btn-primary" onClick={() => setEditing(false)}><Icon name="check" /> Done</button>
            </>
          ) : (
            <>
              <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>Customize</button>
              <button type="button" className="btn-primary" onClick={() => navigate('/board?new=1')}><Icon name="plus" /> New task</button>
            </>
          )
        }
      />
      <div className="mb-6 space-y-3 empty:hidden">
        {error ? <Alert onClose={() => setError(null)}>{error}</Alert> : null}
        {notice ? <Alert tone="ok" onClose={() => setNotice(null)}>{notice}</Alert> : null}
        <RetryBanner error={pendingMove?.error ?? null} onRetry={() => pendingMove && void move(pendingMove.widget, pendingMove.x, pendingMove.y)} onCancel={() => setPendingMove(null)} />
        {editing ? <Alert tone="accent">Drag a widget by its handle (or focus the handle and use the arrow keys). Green outline = free spot, red = overlap.</Alert> : null}
      </div>
      <WidgetGrid
        widgets={payload.widgets}
        columns={payload.grid_columns}
        editing={editing}
        onMove={move}
        onHide={(w) => void apply(() => dashboardController.hide(w.id), `${w.title} hidden - add it back any time`)}
        onRemove={(w) => void apply(() => dashboardController.remove(w.id), `${w.title} removed`)}
        renderBody={(w) => <WidgetBody type={w.widget_type} data={payload.data} />}
      />
    </div>
  );
}
