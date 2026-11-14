/**
 * @author Tyler Gaines - matches login.html (+ 2FA step)
 * @description Sign-in screen. Step 1: email/username and password, with clear messages for wrong details,
 *   a locked account (with how to unlock) and too many attempts. Step 2 (when 2FA is on): the 6-digit code,
 *   shown inline in the same card. Opening an unlock link from the lockout email unlocks the account right
 *   here. Demo mode lists the seeded accounts and the demo code below the card.
 * @traces SE-FR-11, SE-NFR-06, UC-09, UC-10
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../services/apiClient';
import { useAuth } from '../features/auth/AuthProvider';
import { AUTH_BUTTON, AUTH_INPUT, AuthLayout } from '../features/auth/AuthLayout';
import { authController } from '../features/auth/authController';
import { MfaCodeInput } from '../features/auth/MfaCodeInput';
import { isValidMfaCode } from '../features/auth/validation';
import { Alert, Field, Icon } from '../shared/ui';

export function LoginPage() {
  const { login, verifyMfa, pendingMfa, cancelMfa, demoMode } = useAuth();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ tone: 'danger' | 'warn'; title: string; text?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get('unlock_token');
    if (!token) return;
    authController
      .unlock(token)
      .then((r) => setNotice(r.message))
      .catch((e: ApiError) => setError({ tone: 'danger', title: e.detail }))
      .finally(() => {
        params.delete('unlock_token');
        setParams(params, { replace: true });
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const describe = (err: unknown) => {
    const e = err instanceof ApiError ? err : null;
    if (e?.status === 423) setError({ tone: 'warn', title: 'Account locked', text: e.detail });
    else if (e?.status === 429) setError({ tone: 'warn', title: 'Too many attempts', text: 'Try again later (limit: 5 attempts per minute).' });
    else setError({ tone: 'danger', title: e?.detail ?? 'Sign in failed' });
  };

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    if (!email.trim() || !password) {
      setError({ tone: 'danger', title: 'Enter your email (or username) and password' });
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const response = await login(email.trim(), password);
      if (!response.mfa_required) navigate(from, { replace: true });
      else setCode('');
    } catch (err) {
      describe(err);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!isValidMfaCode(code)) {
      setError({ tone: 'danger', title: 'Enter all 6 digits' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyMfa(code);
      navigate(from, { replace: true });
    } catch (err) {
      describe(err);
      setCode('');
      if (err instanceof ApiError && err.status === 401 && err.detail.includes('expired')) cancelMfa();
    } finally {
      setBusy(false);
    }
  };

  const demoPanel = demoMode ? (
    <div className="rounded-card border border-dashed border-warn/50 bg-surface-2 p-4 text-sm">
      <p className="font-semibold text-ink">Demo accounts</p>
      <p className="mt-1 text-body">Password for all: <span className="font-mono text-ink">ProjectForge!1</span> · 2FA demo code <span className="font-mono text-ink">123456</span></p>
      {!pendingMfa ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {[['jon', 'Jon · Owner'], ['tyler', 'Tyler · Manager (2FA)'], ['staff', 'Staff · Member']].map(([u, label]) => (
            <button key={u} type="button" className="btn-secondary btn-sm" onClick={() => { setEmail(u); setPassword('ProjectForge!1'); }}>
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  ) : null;

  if (pendingMfa) {
    return (
      <AuthLayout title="Two-factor verification" subtitle="Enter the 6-digit code from your authenticator app." below={demoPanel}
        footer={<button type="button" className="font-semibold text-accent" onClick={() => { cancelMfa(); setError(null); }}>Use a different account</button>}>
        <form className="flex flex-col gap-5" onSubmit={submitCode}>
          {error ? <Alert tone={error.tone} title={error.title}>{error.text}</Alert> : null}
          <MfaCodeInput value={code} onChange={setCode} disabled={busy} />
          <button type="submit" className={AUTH_BUTTON} disabled={busy || code.length !== 6}>
            <Icon name="shield" /> {busy ? 'Verifying…' : 'Verify and log in'}
          </button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Log in"
      subtitle="Welcome back. Enter your details to continue."
      footer={<>Don't have an account? <Link to="/signup" className="font-semibold text-accent">Sign up</Link></>}
      below={demoPanel}
    >
      <form className="flex flex-col gap-5" onSubmit={submitPassword} noValidate>
        {notice ? <Alert tone="ok">{notice}</Alert> : null}
        {error ? <Alert tone={error.tone} title={error.title}>{error.text}</Alert> : null}
        <Field label="Email or username" htmlFor="login-email">
          <input id="login-email" className={AUTH_INPUT} placeholder="you@example.com" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password" htmlFor="login-password">
          <div className="relative">
            <input id="login-password" className={`${AUTH_INPUT} pr-11`} placeholder="Enter your password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-ink" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
              <Icon name={show ? 'eye-off' : 'eye'} />
            </button>
          </div>
        </Field>
        <div className="-mt-1 flex justify-end">
          <Link to="/reset-password" className="text-sm font-semibold text-accent">Forgot password?</Link>
        </div>
        <button type="submit" className={AUTH_BUTTON} disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </AuthLayout>
  );
}
