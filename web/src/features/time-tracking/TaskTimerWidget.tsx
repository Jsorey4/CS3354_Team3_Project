/**
 * @author Jon Sorey
 * @description Start / pause / resume / stop timer for one task with a live HH:MM:SS clock. The "hero" look
 *   matches the Timer card in time-tracking.html (big centered clock, task and project, Stop + Pause
 *   buttons); the compact look sits inside the task screen. Only one timer can run at a time per person;
 *   the server rejects a second start and the widget explains why.
 * @traces SE-FR-04, UC-04
 */
import { useCallback, useEffect, useState } from 'react';
import { useRealtime } from '../../services/realtimeClient';
import type { TimeEntry } from '../../shared/types';
import { formatDuration } from '../../shared/format';
import { Alert, Icon } from '../../shared/ui';
import { toApiError } from '../../shared/useSave';
import { liveElapsed } from './model';
import { timeController } from './timeController';

interface Props {
  taskId: string;
  taskTitle?: string;
  projectName?: string;
  canTrack: boolean;
  variant?: 'hero' | 'compact';
  onStopped?: (entry: TimeEntry) => void;
  onActiveChange?: (entry: TimeEntry | null) => void;
}

export function TaskTimerWidget({ taskId, taskTitle, projectName, canTrack, variant = 'compact', onStopped, onActiveChange }: Props) {
  const [active, setActive] = useState<TimeEntry | null>(null);
  const [fetchedAt, setFetchedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const entry = await timeController.active();
      setActive(entry);
      setFetchedAt(Date.now());
      onActiveChange?.(entry);
    } catch (err) {
      setError(toApiError(err).detail);
    }
  }, [onActiveChange]);

  useEffect(() => void refresh(), [refresh]);
  useRealtime('timer', () => void refresh());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const act = async (fn: () => Promise<TimeEntry>, after?: (e: TimeEntry) => void) => {
    setBusy(true);
    setError(null);
    try {
      const entry = await fn();
      after?.(entry);
      await refresh();
    } catch (err) {
      setError(toApiError(err).detail);
    } finally {
      setBusy(false);
    }
  };

  const onThisTask = active?.task_id === taskId;
  const elapsed = onThisTask && active ? liveElapsed(active, fetchedAt, now) : 0;

  if (!canTrack) {
    return <p className="text-sm text-muted">Only the assignee (or a manager) can track time on this task.</p>;
  }

  const buttons = !onThisTask ? (
    <button type="button" className={`btn-primary ${variant === 'hero' ? 'w-[120px]' : ''}`} disabled={busy || !!active} onClick={() => void act(() => timeController.start(taskId))}>
      <Icon name="play" /> Start
    </button>
  ) : (
    <>
      <button type="button" className={`btn-secondary ${variant === 'hero' ? 'w-[120px]' : ''}`} disabled={busy} onClick={() => void act(timeController.stop, onStopped)}>
        <Icon name="stop" /> Stop
      </button>
      {active?.is_paused ? (
        <button type="button" className={`btn-primary ${variant === 'hero' ? 'w-[120px]' : ''}`} disabled={busy} onClick={() => void act(timeController.resume)}>
          <Icon name="play" /> Resume
        </button>
      ) : (
        <button type="button" className={`btn-primary ${variant === 'hero' ? 'w-[120px]' : ''}`} disabled={busy} onClick={() => void act(timeController.pause)}>
          <Icon name="pause" /> Pause
        </button>
      )}
    </>
  );
  const status = onThisTask ? (active?.is_paused ? 'Paused' : 'Running') : active ? `Timer running on “${active.task_title}”` : 'Ready';

  if (variant === 'hero') {
    return (
      <div className="text-center">
        {error ? <div className="mb-3 text-left"><Alert onClose={() => setError(null)}>{error}</Alert></div> : null}
        <p className="font-extrabold tabular-nums tracking-[0.02em] text-ink text-[52px] leading-[60px]" aria-live="polite" aria-label="Elapsed time">{formatDuration(elapsed)}</p>
        <p className="mt-3 text-[15px] font-semibold leading-[22px] text-ink">{taskTitle}</p>
        <p className="text-sm text-muted">{projectName}{!onThisTask && active ? ` · ${status}` : ''}</p>
        <div className="mt-10 flex justify-center gap-3">{buttons}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <Alert onClose={() => setError(null)}>{error}</Alert> : null}
      <div className="flex items-center justify-between gap-4 rounded-btn border border-line bg-surface-2 px-4 py-3">
        <div>
          <p className="font-mono text-3xl font-bold tabular-nums text-ink" aria-live="polite" aria-label="Elapsed time">{formatDuration(elapsed)}</p>
          <p className="text-xs text-muted">{status}{!onThisTask && !active && taskTitle ? ` · ${taskTitle}` : ''}</p>
        </div>
        <div className="flex gap-2">{buttons}</div>
      </div>
    </div>
  );
}
