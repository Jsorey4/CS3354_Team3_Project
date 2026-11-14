/**
 * @author eLeet Coderz (Team 3) - visual language from the 15 HTML mockups (dashboard.html design system)
 * @description Reusable building blocks shared by every screen: the mockups' icons, the gold-hammer logo,
 *   tinted pills (always paired with text or an icon so color-blind users never rely on color alone), the
 *   four tinted avatar tones, progress bars, cards, the segmented control, switches, modals, empty / loading /
 *   error states, and the "couldn't save - Retry / Cancel" banner.
 * @traces SE-FR-15, SE-NFR-04, SE-NFR-05, UC-01, UC-06, UC-17
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { initials } from './format';
import type { ApiError } from '../services/apiClient';

// ---------------------------------------------------------------------------
// Icons (inline SVG, 24px grid, stroke = currentColor) - paths match the mockups' sidebar icons
// ---------------------------------------------------------------------------
const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z',
  dashboard: 'M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
  tasks: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm3 9 3 3 5-6',
  board: 'M4 4h5v16H4zM10.5 4h5v10h-5zM17 4h3v7h-3z',
  chart: 'M3 3v18h18M7 16v-5M12 16V8M17 16v-3',
  dollar: 'M12 2v20m5-17H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  calendar: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm11-2v4M8 2v4M3 10h18',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9m4.3 13a1.9 1.9 0 0 0 3.4 0',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-14v4l3 3',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9',
  plus: 'M12 5v14m-7-7h14',
  x: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  'check-circle': 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm-4-10 3 3 5-6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2-4.35-4.35',
  menu: 'M3 12h18M3 6h18M3 18h18',
  grip: 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01',
  'eye-off': 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zm11 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  trash: 'M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  edit: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z',
  download: 'M12 4v12m-5-5 5 5 5-5M5 20h14',
  refresh: 'M23 4v6h-6M1 20v-6h6m14.49-5A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15',
  lock: 'M5 11h14v10H5zm3 0V7a4 4 0 0 1 8 0v4',
  alert: 'M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-6v-4m0-4h.01',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-16v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zm0 7v-7',
  comment: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  play: 'm6 3 14 9-14 9z',
  pause: 'M6 4h4v16H6zm8 0h4v16h-4z',
  stop: 'M5 5h14v14H5z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-4a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0-4a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6m4-3h6v6m-11 5L21 3',
  palette: 'M12 22a10 10 0 1 1 10-10c0 2.5-2 3-3.5 3H16a2 2 0 0 0-1.5 3.3A2 2 0 0 1 12 22zM7.5 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm5 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  layout: 'M3 3h18v18H3zM3 9h18M9 21V9',
};

export function Icon({ name, className = 'h-4 w-4', title }: { name: keyof typeof PATHS | string; className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path d={PATHS[name] ?? PATHS.info} />
    </svg>
  );
}

/** Official gold-hammer logo (web/public/logo.png) with the live gold wordmark, as in every mockup. */
export function Logo({ className = 'h-10', withName = false, nameClass = 'text-xl' }: { className?: string; withName?: boolean; nameClass?: string }) {
  return (
    <span className="inline-flex items-center gap-3">
      <img src="/logo.png" alt={withName ? '' : 'ProjectForge'} className={`block w-auto ${className}`} />
      {withName ? <span className={`font-bold tracking-[-0.02em] text-gold ${nameClass}`}>ProjectForge</span> : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Pills / badges (mockup .pill: tinted background, no border)
// ---------------------------------------------------------------------------
export type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'info' | 'accent';

export const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-line text-body',
  brand: 'bg-brand/15 text-brand',
  ok: 'bg-ok/15 text-ok',
  warn: 'bg-warn/15 text-warn',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-info/15 text-info',
  accent: 'bg-accent-deep text-accent-tint',
};

export function Badge({ tone = 'neutral', icon, children, className = '' }: { tone?: Tone; icon?: string; children: ReactNode; className?: string }) {
  return (
    <span className={`pill ${TONE_CLASS[tone]} ${className}`}>
      {icon ? <Icon name={icon} className="h-3 w-3" /> : null}
      {children}
    </span>
  );
}

/** Project mode badge exactly as the mockups: School = purple, Work = info blue, Personal = gold. */
export function ModeBadge({ mode }: { mode: string }) {
  const tone: Tone = mode === 'school' ? 'accent' : mode === 'work' ? 'info' : 'warn';
  return <Badge tone={tone}>{mode.charAt(0).toUpperCase() + mode.slice(1)}</Badge>;
}

const STATUS_META: Record<string, { tone: Tone; icon: string; label: string }> = {
  todo: { tone: 'neutral', icon: 'target', label: 'To do' },
  in_progress: { tone: 'brand', icon: 'play', label: 'In progress' },
  review: { tone: 'accent', icon: 'eye', label: 'In review' },
  done: { tone: 'ok', icon: 'check', label: 'Done' },
  planning: { tone: 'neutral', icon: 'edit', label: 'Planning' },
  active: { tone: 'ok', icon: 'play', label: 'Active' },
  on_hold: { tone: 'warn', icon: 'pause', label: 'On hold' },
  completed: { tone: 'accent', icon: 'check', label: 'Completed' },
  archived: { tone: 'neutral', icon: 'folder', label: 'Archived' },
};

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { tone: 'neutral' as Tone, icon: 'info', label: status };
  return (
    <Badge tone={meta.tone} icon={meta.icon}>
      {meta.label}
    </Badge>
  );
}

const PRIORITY_META: Record<string, { tone: Tone; label: string; bars: number }> = {
  low: { tone: 'neutral', label: 'Low', bars: 1 },
  medium: { tone: 'info', label: 'Medium', bars: 2 },
  high: { tone: 'danger', label: 'High', bars: 3 },
  urgent: { tone: 'danger', label: 'Urgent', bars: 4 },
};

export function PriorityBadge({ priority }: { priority: string }) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META.medium;
  return (
    <Badge tone={meta.tone}>
      <span className="flex items-end gap-px" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={`w-[3px] rounded-sm ${i <= meta.bars ? 'bg-current' : 'bg-current/25'}`} style={{ height: 3 + i * 2 }} />
        ))}
      </span>
      {meta.label}
    </Badge>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const tone: Tone = role === 'owner' ? 'warn' : role === 'manager' ? 'accent' : 'neutral';
  const icon = role === 'owner' ? 'shield' : role === 'manager' ? 'users' : 'target';
  return (
    <Badge tone={tone} icon={icon}>
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </Badge>
  );
}

/** The mockups' four avatar tones: purple, info blue, gold, green. */
const AVATAR_TONES = ['bg-accent-deep text-accent-tint', 'bg-info/20 text-info', 'bg-warn/20 text-warn', 'bg-ok/20 text-ok'];

export function avatarTone(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 9973;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function Avatar({ name, url, size = 'h-8 w-8', className = '', text = 'text-[13px]' }: { name: string; url?: string | null; size?: string; className?: string; text?: string }) {
  if (url) {
    return <img src={url} alt="" className={`${size} shrink-0 rounded-full object-cover ${className}`} referrerPolicy="no-referrer" />;
  }
  return (
    <span className={`${size} ${text} inline-flex shrink-0 items-center justify-center rounded-full font-bold ${avatarTone(name)} ${className}`} aria-label={name} title={name}>
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people, max = 4 }: { people: { name: string; url?: string | null }[]; max?: number }) {
  return (
    <span className="flex items-center">
      {people.slice(0, max).map((p, i) => (
        <Avatar key={`${p.name}-${i}`} name={p.name} url={p.url} size="h-7 w-7" text="text-[11px]" className={`border-2 border-surface ${i ? '-ml-2' : ''}`} />
      ))}
      {people.length > max ? <span className="-ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-line text-[10px] font-bold text-body">+{people.length - max}</span> : null}
    </span>
  );
}

export function ProgressBar({ value, color, label, size = 'h-2', showValue = true }: { value: number; color?: string; label?: ReactNode; size?: string; showValue?: boolean }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="w-full">
      {label ? (
        <div className="mb-2 flex items-center justify-between gap-2 text-[15px]">
          <span className="truncate font-semibold text-ink">{label}</span>
          {showValue ? <span className="text-sm font-bold text-ink">{value.toFixed(2)}%</span> : null}
        </div>
      ) : null}
      <div className={`${size} w-full overflow-hidden rounded-full bg-line`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={typeof label === 'string' ? label : 'Progress'}>
        <div className={`h-full rounded-full transition-all duration-500 ${color ? '' : 'bg-brand'}`} style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout helpers (mockup .page-head / .card)
// ---------------------------------------------------------------------------
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle ? <div className="page-sub">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, actions, children, className = '', bodyClass = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`card p-6 ${className}`}>
      {title || actions ? (
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 className="card-title">{title}</h2>
          {actions ? <div className="card-meta flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, icon, tone = 'brand', selected }: { label: string; value: ReactNode; hint?: ReactNode; icon?: string; tone?: Tone; selected?: boolean }) {
  return (
    <div className={`card px-6 py-5 ${selected ? 'border-accent' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-semibold text-ink">{label}</p>
        {icon ? (
          <span className={`rounded-lg p-1.5 ${TONE_CLASS[tone]}`}>
            <Icon name={icon} className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 truncate text-[32px] font-extrabold leading-10 tracking-[-0.02em] text-ink">{value}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-sm text-muted" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      {label}
    </div>
  );
}

export function EmptyState({ icon = 'folder', title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-3 rounded-full bg-accent-deep p-3 text-accent-tint">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <p className="font-semibold text-ink">{title}</p>
      {children ? <div className="mt-1 max-w-md text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Alert({ tone = 'danger', title, children, onClose }: { tone?: Tone; title?: string; children?: ReactNode; onClose?: () => void }) {
  const icon = tone === 'ok' ? 'check' : tone === 'info' || tone === 'brand' || tone === 'accent' ? 'info' : 'alert';
  const accent: Record<Tone, string> = {
    neutral: 'border-line text-muted', brand: 'border-brand/40 text-brand', ok: 'border-ok/40 text-ok', warn: 'border-warn/40 text-warn',
    danger: 'border-danger/40 text-danger', info: 'border-info/40 text-info', accent: 'border-accent/40 text-accent-tint',
  };
  return (
    <div className={`flex items-start gap-3 rounded-xl border bg-surface px-4 py-3 text-sm ${accent[tone]}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={icon} className="mt-0.5 h-4 w-4" />
      <div className="min-w-0 flex-1 text-ink">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? 'mt-0.5 text-body' : ''}>{children}</div> : null}
      </div>
      {onClose ? (
        <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Dismiss">
          <Icon name="x" />
        </button>
      ) : null}
    </div>
  );
}

/** SE-NFR-04: shown when a save timed out / failed twice. The form keeps everything the user typed. */
/**
 * The explicit Retry / Cancel choice after a failed save, load or export (UC-01, UC-02, UC-05, UC-06, UC-14,
 * UC-17). Whatever the user entered stays on screen; Retry repeats the same request, Cancel dismisses it.
 */
export function RetryBanner({ error, onRetry, onCancel, busy, title = 'Your changes were not saved yet.', hint = 'We tried again automatically. Your input is kept - retry now or cancel.' }: { error: ApiError | null; onRetry: () => void; onCancel: () => void; busy?: boolean; title?: string; hint?: string }) {
  if (!error) return null;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm sm:flex-row sm:items-center" role="alert">
      <Icon name="alert" className="h-5 w-5 text-warn" />
      <div className="flex-1">
        <p className="font-semibold text-ink">{title}</p>
        <p className="text-body">{error.detail} {hint}</p>
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-primary btn-sm" onClick={onRetry} disabled={busy}>
          <Icon name="refresh" /> Retry
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function AccessDenied({ title = 'Access denied', children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-3 rounded-full bg-danger/15 p-3 text-danger">
        <Icon name="lock" className="h-7 w-7" />
      </span>
      <p className="text-lg font-bold text-ink">{title}</p>
      <p className="mt-1 max-w-md text-sm text-body">{children ?? 'Your role in this project does not allow this view.'}</p>
      <p className="mt-3 font-mono text-xs text-danger">HTTP 403 · Access denied</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------
export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-danger">
          <Icon name="alert" className="h-3 w-3" /> {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** Mockup .toggle: 44 x 24 track, purple when on. */
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${checked ? 'bg-accent' : 'bg-line'}`}
    >
      <span className={`absolute top-[3px] h-[18px] w-[18px] rounded-full transition-all ${checked ? 'left-[23px] bg-ink' : 'left-[3px] bg-muted'}`} />
    </button>
  );
}

export function Modal({ open, title, onClose, children, footer, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  // Kept in a ref so the effect below runs once per open, not on every parent render (which would pull
  // focus back to the first field while the user is typing in another one).
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(panel.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== 'Tab') return;
      // Keep keyboard focus inside the dialog while it is open.
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !panel.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.current?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    // First form field of the dialog, or its first button when it has none.
    (body.current?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? focusable()[0])?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.(); // hand focus back to whatever opened the dialog
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[8vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title} className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} shadow-pop`}>
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" className="btn-ghost p-2" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>
        <div ref={body} className="max-h-[70vh] overflow-y-auto p-6">{children}</div>
        {footer ? <footer className="flex justify-end gap-3 border-t border-line px-6 py-4">{footer}</footer> : null}
      </div>
    </div>
  );
}

/** Mockup .seg / .filters: pill group, active item is deep purple with a light purple label. */
export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div className="inline-flex gap-1 rounded-xl border border-line bg-surface p-1" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-8 rounded-lg px-4 text-sm transition ${value === o.value ? 'bg-accent-deep font-semibold text-accent-tint' : 'font-medium text-nav hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
