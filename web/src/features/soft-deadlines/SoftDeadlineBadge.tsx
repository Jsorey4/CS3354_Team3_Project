/**
 * @author Preethi Seereddy
 * @description Compact badge showing soft-deadline progress (e.g. "1/3 checkpoints · next in 2 days"),
 *   using an icon plus color so state is readable without color vision.
 * @traces SE-FR-07, UC-07, SE-FR-15
 */
import { relativeTime } from '../../shared/format';
import { Badge } from '../../shared/ui';

export function SoftDeadlineBadge({ total, done, nextAt }: { total: number; done: number; nextAt: string | null }) {
  const overdue = !!nextAt && new Date(nextAt).getTime() < Date.now();
  const soon = !!nextAt && !overdue && new Date(nextAt).getTime() - Date.now() < 48 * 3600 * 1000;
  const tone = done === total ? 'ok' : overdue ? 'danger' : soon ? 'warn' : 'info';
  const icon = done === total ? 'check' : overdue ? 'alert' : 'target';
  return (
    <Badge tone={tone} icon={icon}>
      {done}/{total} checkpoints{nextAt && done < total ? ` · next ${relativeTime(nextAt)}` : ''}
    </Badge>
  );
}

export function SoftDeadlineStateBadge({ state }: { state: 'upcoming' | 'due_soon' | 'overdue' | 'completed' }) {
  const meta = {
    upcoming: { tone: 'info' as const, icon: 'calendar', label: 'Upcoming' },
    due_soon: { tone: 'warn' as const, icon: 'clock', label: 'Due soon' },
    overdue: { tone: 'danger' as const, icon: 'alert', label: 'Overdue' },
    completed: { tone: 'ok' as const, icon: 'check', label: 'Done' },
  }[state];
  return <Badge tone={meta.tone} icon={meta.icon}>{meta.label}</Badge>;
}
