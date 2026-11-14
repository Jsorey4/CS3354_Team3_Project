/**
 * @author Aashwat Singh
 * @description The comment thread on a task: lists comments (rendered as safe Markdown), lets members post
 *   with @mention autocomplete, shows the server's warnings for @names that are not on the project, and
 *   refreshes live when anyone else comments.
 * @traces SE-FR-28, SE-FR-29, SE-NFR-12, UC-21
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Comment, Member } from '../../shared/types';
import { relativeTime } from '../../shared/format';
import { useRealtime } from '../../services/realtimeClient';
import { Alert, Avatar, EmptyState, Icon, RetryBanner, Spinner } from '../../shared/ui';
import { toApiError, useSave } from '../../shared/useSave';
import { commentController } from './commentController';
import { MentionInput } from './MentionInput';
import { SafeMarkdown } from './SafeMarkdown';

export function CommentThread({ taskId, members }: { taskId: string; members: Member[] }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [notified, setNotified] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const memberNames = useMemo(() => new Set(members.map((m) => m.username.toLowerCase())), [members]);

  const load = useCallback(async () => {
    try {
      setComments(await commentController.list(taskId));
      setLoadError(null);
    } catch (err) {
      setLoadError(toApiError(err).detail);
    }
  }, [taskId]);

  useEffect(() => void load(), [load]);
  useRealtime('comment_added', (data: { task_id: string }) => data.task_id === taskId && void load());

  const save = useSave(() => commentController.create(taskId, draft), (result) => {
    setComments((list) => [...(list ?? []), result.comment]);
    setWarnings(result.warnings);
    setNotified(result.notified);
    setDraft('');
  });

  const submit = () => {
    if (!draft.trim()) return;
    void save.run();
  };

  const remove = async (id: string) => {
    await commentController.remove(id);
    setComments((list) => (list ?? []).filter((c) => c.id !== id));
  };

  return (
    <div className="space-y-4">
      {loadError ? <Alert>{loadError}</Alert> : null}
      {comments === null ? <Spinner label="Loading comments…" /> : comments.length === 0 ? (
        <EmptyState icon="comment" title="No comments yet">Start the conversation - mention a teammate with @username.</EmptyState>
      ) : (
        <ol className="space-y-4">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <Avatar name={c.author?.display_name ?? 'Former member'} url={c.author?.avatar_url} />
              <div className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2/50 px-4 py-3">
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span><span className="font-semibold text-ink">{c.author?.display_name ?? 'Former member'}</span> <span className="text-muted">@{c.author?.username ?? 'unknown'} · {relativeTime(c.created_at)}</span></span>
                  {c.can_delete ? (
                    <button type="button" className="text-muted hover:text-danger" onClick={() => void remove(c.id)} aria-label="Delete comment">
                      <Icon name="trash" className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                <SafeMarkdown source={c.body} memberNames={memberNames} />
              </div>
            </li>
          ))}
        </ol>
      )}
      {warnings.length > 0 ? (
        <Alert tone="warn" title="Comment posted with a warning" onClose={() => setWarnings([])}>
          <ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </Alert>
      ) : null}
      {notified.length > 0 && warnings.length === 0 ? (
        <Alert tone="ok" onClose={() => setNotified([])}>Notified {notified.map((n) => `@${n}`).join(', ')}.</Alert>
      ) : null}
      <RetryBanner error={save.networkError} onRetry={save.retry} onCancel={save.cancel} busy={save.saving} />
      {save.error ? <Alert onClose={save.reset}>{save.error.detail}</Alert> : null}
      <div className="space-y-2">
        <MentionInput value={draft} onChange={setDraft} members={members} onSubmit={submit} disabled={save.saving} />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">Markdown supported · Ctrl+Enter to post</span>
          <button type="button" className="btn-primary" onClick={submit} disabled={save.saving || !draft.trim()}>
            <Icon name="comment" /> {save.saving ? 'Posting…' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  );
}
