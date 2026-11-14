/**
 * @author Tyler Gaines - matches signup.html
 * @description Account creation with live checks: name, username rules, email format, a password-strength
 *   meter with a checklist, and matching confirmation. Server-side problems (e.g. "That username is already
 *   taken") are shown under the exact field. On success the user is signed in and taken to the dashboard.
 * @traces SE-FR-11, SE-FR-12, UC-08
 */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../services/apiClient';
import { useAuth } from '../features/auth/AuthProvider';
import { AUTH_BUTTON, AUTH_INPUT, AuthLayout } from '../features/auth/AuthLayout';
import { authController } from '../features/auth/authController';
import { passwordRules, passwordStrength, validateSignup } from '../features/auth/validation';
import { Alert, Field, Icon } from '../shared/ui';

export function SignUpPage() {
  const { completeSession } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', display_name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const rules = passwordRules(form.password);
  const strength = passwordStrength(form.password);
  const live = validateSignup(form);

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const shown = (key: string) => (touched[key] ? errors[key] || live[key] : errors[key]);
  const touch = (key: string) => () => setTouched((t) => ({ ...t, [key]: true }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ username: true, email: true, password: true, confirm: true });
    setBanner(null);
    if (Object.keys(live).length) {
      setErrors(live);
      return;
    }
    setBusy(true);
    try {
      const response = await authController.signup({ username: form.username.trim(), email: form.email.trim(), password: form.password, display_name: form.display_name.trim() || undefined });
      completeSession(response);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
        setBanner(err.status === 429 ? 'Try again later' : Object.keys(err.errors).length ? null : err.detail);
      } else setBanner('Sign up failed');
    } finally {
      setBusy(false);
    }
  };

  const meter = ['bg-danger', 'bg-danger', 'bg-warn', 'bg-warn', 'bg-info', 'bg-ok'][strength];
  return (
    <AuthLayout title="Create account" subtitle="Set up your workspace in a few seconds." footer={<>Already have an account? <Link to="/login" className="font-semibold text-accent">Log in instead</Link></>}>
      <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
        {banner ? <Alert>{banner}</Alert> : null}
        <Field label="Name" htmlFor="su-display">
          <input id="su-display" className={AUTH_INPUT} placeholder="Your full name" autoComplete="name" value={form.display_name} onChange={(e) => set('display_name')(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Username" error={shown('username')} htmlFor="su-username" hint="3-30 letters, numbers or _">
          <input id="su-username" className={AUTH_INPUT} placeholder="jordan_diaz" autoComplete="username" value={form.username} onBlur={touch('username')} onChange={(e) => { set('username')(e.target.value); setErrors((x) => ({ ...x, username: '' })); }} />
        </Field>
        <Field label="Email" error={shown('email')} htmlFor="su-email">
          <input id="su-email" className={AUTH_INPUT} placeholder="you@example.com" type="email" autoComplete="email" value={form.email} onBlur={touch('email')} onChange={(e) => { set('email')(e.target.value); setErrors((x) => ({ ...x, email: '' })); }} />
        </Field>
        <div>
          <Field label="Password" error={touched.password ? errors.password : undefined} htmlFor="su-password">
            <input id="su-password" className={AUTH_INPUT} placeholder="Create a password" type="password" autoComplete="new-password" value={form.password} onBlur={touch('password')} onChange={(e) => set('password')(e.target.value)} />
          </Field>
          <div className="mt-3" aria-live="polite">
            <div className="flex gap-1" aria-hidden>{[1, 2, 3, 4, 5].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= strength ? meter : 'bg-line'}`} />)}</div>
            <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">
              {rules.map((r) => (
                <li key={r.id} className={`flex items-center gap-1.5 ${r.met ? 'text-ok' : 'text-muted'}`}>
                  <Icon name={r.met ? 'check' : 'x'} className="h-3 w-3" /> {r.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <Field label="Confirm password" error={shown('confirm')} htmlFor="su-confirm">
          <input id="su-confirm" className={AUTH_INPUT} placeholder="Repeat your password" type="password" autoComplete="new-password" value={form.confirm} onBlur={touch('confirm')} onChange={(e) => set('confirm')(e.target.value)} />
        </Field>
        <button type="submit" className={`${AUTH_BUTTON} mt-1`} disabled={busy}>{busy ? 'Creating account…' : 'Sign up'}</button>
      </form>
    </AuthLayout>
  );
}
