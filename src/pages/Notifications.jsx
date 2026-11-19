import { useState } from 'react';
import { AppLayout, PageHead } from '../components/AppLayout';
import { IconX } from '../components/Icons';
import { Pill, useToast } from '../components/ui';
import { relativeTime } from '../lib/date';
import { useNavigate } from '../lib/router';
import { useStore } from '../lib/store';
import { NOTIF_TYPES } from '../lib/theme';

export default function Notifications() {
  const { state, actions } = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const unread = state.notifications.filter((n) => !n.read).length;
  const list = [...state.notifications]
    .sort((a, b) => b.at - a.at)
    .filter((n) => filter === 'all' || !n.read);

  const open = (n) => {
    actions.markRead(n.id);
    if (n.taskId && state.tasks.some((t) => t.id === n.taskId)) navigate(`/tasks?task=${n.taskId}`);
  };

  return (
    <AppLayout page="notifications">
      <PageHead title="Notifications" sub={<><b>{unread}</b> unread</>}>
        <div className="seg">
          <button className={`seg-item${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>All</button>
          <button className={`seg-item${filter === 'unread' ? ' active' : ''}`} onClick={() => setFilter('unread')}>Unread</button>
        </div>
        <button
          className="btn btn-secondary"
          disabled={!unread}
          onClick={() => {
            actions.markAllRead();
            toast('All notifications marked as read');
          }}
        >
          Mark all read
        </button>
      </PageHead>

      <div className="card n-card">
        {list.length === 0 && <div className="n-empty">{filter === 'unread' ? 'You’re all caught up 🎉' : 'No notifications yet.'}</div>}
        {list.map((n) => {
          const type = NOTIF_TYPES[n.type] || NOTIF_TYPES.update;
          return (
            <div
              key={n.id}
              className={`n-row is-clickable${n.read ? ' is-read' : ''}`}
              onClick={() => open(n)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && open(n)}
            >
              <button
                className={`n-dot${n.read ? ' read' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  actions.toggleRead(n.id);
                }}
                aria-label={n.read ? 'Mark as unread' : 'Mark as read'}
                title={n.read ? 'Mark as unread' : 'Mark as read'}
              />
              <div className="n-body">
                <div className="n-text">
                  {n.parts.map((p, i) => (typeof p === 'string' ? <span key={i}>{p}</span> : <b key={i}>{p.b}</b>))}
                </div>
                <div className="n-type"><Pill tone={type.tone}>{type.label}</Pill></div>
              </div>
              <div className="n-time">{relativeTime(n.at)}</div>
              <button
                className="n-del"
                onClick={(e) => {
                  e.stopPropagation();
                  actions.deleteNotification(n.id);
                }}
                aria-label="Dismiss notification"
                title="Dismiss"
              >
                <IconX size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </AppLayout>
  );
}
