/**
 * @author Aashwat Singh
 * @description Comment box with @mention autocomplete: typing "@" followed by letters suggests matching
 *   project members (arrow keys + Enter / Tab to pick). Ctrl/Cmd+Enter posts the comment.
 * @traces SE-FR-29, UC-21
 */
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Member } from '../../shared/types';
import { Avatar } from '../../shared/ui';

interface Props {
  value: string;
  onChange: (value: string) => void;
  members: Member[];
  onSubmit: () => void;
  disabled?: boolean;
}

function activeQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const match = /(^|[^A-Za-z0-9_@])@([A-Za-z0-9_]{0,30})$/.exec(before);
  if (!match) return null;
  return { start: caret - match[2].length - 1, query: match[2].toLowerCase() };
}

export function MentionInput({ value, onChange, members, onSubmit, disabled }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const query = activeQuery(value, caret);
  const suggestions = useMemo(
    () =>
      query
        ? members.filter((m) => m.username.toLowerCase().startsWith(query.query) || m.display_name.toLowerCase().includes(query.query)).slice(0, 6)
        : [],
    [members, query?.query], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const pick = (member: Member) => {
    if (!query) return;
    const next = `${value.slice(0, query.start)}@${member.username} ${value.slice(caret)}`;
    onChange(next);
    const pos = query.start + member.username.length + 2;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => (h + 1) % suggestions.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(suggestions[Math.min(highlight, suggestions.length - 1)]); return; }
      if (e.key === 'Escape') { setCaret(-1); return; }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        className="input min-h-[88px]"
        value={value}
        disabled={disabled}
        placeholder="Write a comment… Use **bold**, *italic*, `code`, - lists and @username"
        aria-label="Comment"
        onChange={(e) => { onChange(e.target.value); setCaret(e.target.selectionStart); setHighlight(0); }}
        onClick={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
      />
      {suggestions.length > 0 ? (
        <ul className="card absolute bottom-full left-0 z-30 mb-1 w-72 overflow-hidden py-1 shadow-pop" role="listbox" aria-label="Mention suggestions">
          {suggestions.map((m, i) => (
            <li key={m.user_id} role="option" aria-selected={i === highlight}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(m); }} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${i === highlight ? 'bg-brand/10' : 'hover:bg-surface-2'}`}>
                <Avatar name={m.display_name} url={m.avatar_url} size="h-6 w-6" />
                <span className="font-medium">{m.display_name}</span>
                <span className="text-muted">@{m.username}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
