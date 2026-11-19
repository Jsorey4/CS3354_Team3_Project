import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TONES } from '../lib/theme';
import { IconCheck, IconX } from './Icons';

export const Logo = ({ className }) => <img className={className} src="/logo.png" alt="ProjectForge logo" width="253" height="404" />;

export function Pill({ tone = 'purple', children, style, ...rest }) {
  const t = TONES[tone] || TONES.purple;
  return (
    <span className="pill" style={{ background: t.bg, color: t.fg, ...style }} {...rest}>
      {children}
    </span>
  );
}

export function Avatar({ person, className = 'av', title }) {
  if (!person) return <div className={`${className} av-none`} title="Unassigned">?</div>;
  const ini = person.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <div className={`${className} ${person.av}`} title={title ?? person.name}>
      {ini}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, className = 'ck' }) {
  return (
    <div
      className={`${className} is-clickable`}
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), onChange(!checked))}
    >
      <div className={`box${checked ? ' on' : ''}`}>{checked && <IconCheck />}</div>
      {label}
    </div>
  );
}

export function Toggle({ on, onChange, label }) {
  return (
    <div
      className={`toggle${on ? ' on' : ''}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      tabIndex={0}
      onClick={() => onChange(!on)}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), onChange(!on))}
    >
      <div className="knob" />
    </div>
  );
}

// ---------------- Modal ----------------
export function Modal({ title, onClose, children, footer, width = 480 }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector('input, select, textarea');
    first?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="pf-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pf-modal" style={{ width }} ref={ref} role="dialog" aria-modal="true" aria-label={title}>
        <div className="pf-modal-head">
          <div className="pf-modal-title">{title}</div>
          <button className="pf-icon-btn" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>
        <div className="pf-modal-body">{children}</div>
        {footer && <div className="pf-modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, children, hint, error }) {
  return (
    <label className="pf-field">
      <span className="pf-label">{label}</span>
      {children}
      {hint && !error && <span className="pf-hint">{hint}</span>}
      {error && <span className="pf-error">{error}</span>}
    </label>
  );
}

// ---------------- Toasts ----------------
const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((message, kind = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {createPortal(
        <div className="pf-toasts" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`pf-toast pf-toast-${t.kind}`}>
              <span className="pf-toast-dot" />
              {t.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

// ---------------- Confirm ----------------
export function ConfirmModal({ title, message, confirmLabel = 'Delete', onConfirm, onClose }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={420}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="pf-text">{message}</p>
    </Modal>
  );
}
