/**
 * @author Aashwat Singh - matches notifications.html
 * @description Every notification for the signed-in user - @mentions, assignments, role and member changes,
 *   and automatic deadline / soft-deadline reminders - newest first in one card: purple dot when unread, the
 *   message, a type pill, and the time. All / Unread filter, mark-as-read on open or with the per-row button,
 *   and "Mark all read". New notifications arrive live over the WebSocket (and pop up as a toast).
 * @traces SE-FR-29, SE-NFR-11, SE-NFR-12, UC-22
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationController } from '../features/collaboration/commentController';
import { useRealtime } from '../services/realtimeClient';
import type { Notification } from '../shared/types';
import { formatDateTime, relativeTime } from '../shared/format';
import { Alert, Badge, EmptyState, Icon, PageHeader, Segmented, Spinner, type Tone } from '../shared/ui';
import { toApiError } from '../shared/useSave';

/** Pill labels and tones from the mockup: Assignment (purple), Mention (blue), Deadline (gold), Update. */
const KIND: Record<string, { tone: Tone; label: string }> = {
  mention: { tone: 'info', label: 'Mention' },
  assignment: { tone: 'accent', label: 'Assignment' },
  deadline_reminder: { tone: 'warn', label: 'Deadline' },
  soft_deadline_reminder: { tone: 'warn', label: 'Soft deadline' },
  role_change: { tone: 'brand', label: 'Role change' },
  member_added: { tone: 'ok', label: 'Added to project' },
  member_removed: { tone: 'danger', label: 'Removed' },
  task_reassigned: { tone: 'brand', label: 'Update' },
  project_update: { tone: 'info', label: 'Update' },
  system: { tone: 'neutral', label: 'ProjectForge' },
};

export function NotificationsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [items, setItems] = useState<Notification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await notificationController.list(tab === 'unread');
      setItems(result.items);
      setUnread(result.unread_count);
    } catch (err) {
      setError(toApiError(err).detail);
    }
  }, [tab]);

  useEffect(() => void load(), [load]);
  useRealtime('notification', (n: Notification) => {
    setItems((list) => [n, ...(list ?? [])]);
    setUnread((u) => u + 1);
  });

  const markRead = async (n: Notification) => {
    if (n.is_read) return;
    try {
      await notificationController.markRead(n.id);
      setItems((list) => (tab === 'unread' ? (list ?? []).filter((x) => x.id !== n.id) : (list ?? []).map((x) => (x.id === n.id ? { ...x, is_read: true } : x))));
      setUnread((u) => Math.max(0, u - 1));
    } catch (err) {
      setError(toApiError(err).detail);
    }
  };

  const open = async (n: Notification) => {
    await markRead(n);
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    try {
      const result = await notificationController.markAllRead();
      setItems(tab === 'unread' ? [] : result.items);
      setUnread(0);
    } catch (err) {
      setError(toApiError(err).detail);
    }
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={<><b>{unread}</b> unread</>}
        actions={
          <>
            <Segmented ariaLabel="Notification filter" value={tab} onChange={setTab} options={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread' }]} />
            <button type="button" className="btn-secondary" onClick={() => void markAll()} disabled={unread === 0}>Mark all read</button>
          </>
        }
      />
      {error ? <div className="mb-4"><Alert onClose={() => setError(null)}>{error}</Alert></div> : null}
      <div className="card px-6">
        {items === null ? <Spinner /> : items.length === 0 ? (
          <EmptyState icon="bell" title={tab === 'unread' ? 'No unread notifications' : 'No notifications yet'}>Mentions, assignments and deadline reminders show up here.</EmptyState>
        ) : (
          <ul>
            {items.map((n) => {
              const meta = KIND[n.kind] ?? KIND.system;
              return (
                <li key={n.id} className="flex min-h-[88px] items-center gap-4 border-b border-line py-3 last:border-b-0">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${n.is_read ? 'border-2 border-line-strong' : 'bg-accent'}`} aria-label={n.is_read ? 'Read' : 'Unread'} />
                  <button type="button" onClick={() => void open(n)} className="min-w-0 flex-1 text-left">
                    <span className={`block text-[15px] leading-[22px] ${n.is_read ? 'text-body' : 'font-semibold text-ink'}`}>{n.message}</span>
                    <span className="mt-1.5 block"><Badge tone={meta.tone}>{meta.label}</Badge></span>
                  </button>
                  <span className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-[13px] text-muted" title={formatDateTime(n.created_at)}>{relativeTime(n.created_at)}</span>
                    {!n.is_read ? (
                      <button type="button" className="flex items-center gap-1 text-xs font-semibold text-accent hover:underline" onClick={() => void markRead(n)}>
                        <Icon name="check" className="h-3 w-3" /> Mark read
                      </button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
