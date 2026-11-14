/**
 * @author Jon Sorey
 * @description Pure timer math: duration_hours = round(((ended - started) - paused) / 3600, 2), the live
 *   elapsed seconds of a running or paused timer, and per-day totals for the weekly chart.
 * @traces SE-FR-04, UC-04
 */
import type { TimeEntry } from '../../shared/types';

export function durationHours(startedIso: string, endedIso: string, pausedSeconds: number): number {
  const seconds = Math.max(0, (new Date(endedIso).getTime() - new Date(startedIso).getTime()) / 1000 - pausedSeconds);
  return Math.round((seconds / 3600) * 100 + Number.EPSILON) / 100;
}

/** Seconds counted so far, given the snapshot the server sent and how long ago it was taken. */
export function liveElapsed(entry: Pick<TimeEntry, 'elapsed_seconds' | 'is_running' | 'is_paused'>, fetchedAtMs: number, nowMs: number = Date.now()): number {
  if (!entry.is_running || entry.is_paused) return entry.elapsed_seconds;
  return entry.elapsed_seconds + Math.max(0, Math.floor((nowMs - fetchedAtMs) / 1000));
}

export function hoursByDay(entries: TimeEntry[], days: string[]): number[] {
  const totals = new Map(days.map((d) => [d, 0]));
  for (const e of entries) {
    if (e.duration_hours == null) continue;
    const d = new Date(e.started_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (totals.has(key)) totals.set(key, Math.round(((totals.get(key) ?? 0) + e.duration_hours) * 100) / 100);
  }
  return days.map((d) => totals.get(d) ?? 0);
}

export function isValidHours(value: string): boolean {
  const n = Number(value);
  return value.trim() !== '' && Number.isFinite(n) && n > 0 && n <= 24;
}
