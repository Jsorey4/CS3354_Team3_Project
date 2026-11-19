import { useState } from 'react';
import { Link, useNavigate } from '../lib/router';
import { useStore } from '../lib/store';
import * as api from '../lib/api';
import { Logo } from '../components/ui';

function Brand() {
  return (
    <Link className="brand" to="/">
      <Logo className="brand-logo" />
      <div className="brand-name">ProjectForge</div>
    </Link>
  );
}

export function Login() {
  const { actions } = useStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await api.login({ email, password });
      actions.login(user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="pf pg-login">
      <div className="page">
        <Brand />
        <div className="card">
          <div className="card-title">Log in</div>
          <div className="card-sub">Welcome back. Enter your details to continue.</div>
          <form className="form" onSubmit={submit} noValidate>
            <div className="field">
              <label className="label" htmlFor="email">Email</label>
              <input className="input" id="email" type="email" placeholder="you@example.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label className="label" htmlFor="password">Password</label>
              <input className="input" id="password" type="password" placeholder="Enter your password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="forgot"><Link to="/reset-password">Forgot password?</Link></div>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
          </form>
          <div className="signup">Don&apos;t have an account? <Link to="/signup">Sign up</Link></div>
        </div>
      </div>
    </div>
  );
}

export function Signup() {
  const { actions } = useStore();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await api.signup(f);
      actions.login(user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="pf pg-signup">
      <div className="page">
        <Brand />
        <div className="card">
          <div className="card-title">Create account</div>
          <div className="card-sub">Set up your workspace in a few seconds.</div>
          <form className="form" onSubmit={submit} noValidate>
            <div className="field">
              <label className="label" htmlFor="name">Name</label>
              <input className="input" id="name" name="name" type="text" placeholder="Your full name" autoComplete="name" value={f.name} onChange={set('name')} />
            </div>
            <div className="field">
              <label className="label" htmlFor="email">Email</label>
              <input className="input" id="email" name="email" type="email" placeholder="you@example.com" autoComplete="email" value={f.email} onChange={set('email')} />
            </div>
            <div className="field">
              <label className="label" htmlFor="password">Password</label>
              <input className="input" id="password" name="password" type="password" placeholder="Create a password" autoComplete="new-password" value={f.password} onChange={set('password')} />
            </div>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Sign up'}</button>
          </form>
          <div className="alt">Already have an account? <Link to="/login">Log in instead</Link></div>
        </div>
      </div>
    </div>
  );
}

export function ResetPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.requestPasswordReset({ email });
      setSent(true);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  return (
    <div className="pf pg-reset-password">
      <div className="page">
        <Brand />
        <div className="card">
          <div className="card-title">{sent ? 'Check your email' : 'Reset password'}</div>
          <div className="card-sub">
            {sent ? (
              <>If an account exists for <b className="auth-strong">{email}</b>, we&apos;ve sent a link to reset your password.</>
            ) : (
              <>Enter your email and we&apos;ll send you a reset link.</>
            )}
          </div>
          {sent ? (
            <div className="form">
              <button className="btn btn-primary" type="button" onClick={() => { setSent(false); }}>Send again</button>
            </div>
          ) : (
            <form className="form" onSubmit={submit} noValidate>
              <div className="field">
                <label className="label" htmlFor="email">Email</label>
                <input className="input" id="email" name="email" type="email" placeholder="you@example.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {error && <div className="auth-error" role="alert">{error}</div>}
              <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
            </form>
          )}
          <div className="alt"><Link to="/login">Back to login</Link></div>
        </div>
      </div>
    </div>
  );
}
