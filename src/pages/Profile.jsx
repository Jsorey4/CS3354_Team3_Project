import { useState } from 'react';
import { AppLayout, PageHead } from '../components/AppLayout';
import { IconCheck } from '../components/Icons';
import { Checkbox, ConfirmModal, Field, Modal, Toggle, useToast } from '../components/ui';
import * as api from '../lib/api';
import { useNavigate } from '../lib/router';
import { getMe, useStore } from '../lib/store';
import { DASH_WIDGETS } from './Dashboard';

const NOTIF_PREFS = [
  { key: 'assignments', label: 'Task assignments' },
  { key: 'mentions', label: 'Mentions' },
  { key: 'deadlines', label: 'Deadline reminders' },
  { key: 'updates', label: 'Project updates' },
];
const CONNECTIONS = [
  { key: 'google', label: 'Google Calendar', desc: 'Sync deadlines and events' },
  { key: 'outlook', label: 'Outlook', desc: 'Sync deadlines and events' },
  { key: 'email', label: 'Email reminders', desc: 'Deadline and task digests' },
];

function PasswordModal({ onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (f.next !== f.confirm) return setErr('New passwords don’t match.');
    setBusy(true);
    try {
      await api.changePassword(f);
      toast('Password updated');
      onClose();
    } catch (ex) {
      setErr(ex.message);
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Change password"
      onClose={onClose}
      width={420}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="submit" form="pf-form" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
        </>
      }
    >
      <form id="pf-form" className="pf-form" onSubmit={submit} noValidate>
        <Field label="Current password"><input className="pf-input" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></Field>
        <Field label="New password" hint="At least 6 characters"><input className="pf-input" type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></Field>
        <Field label="Confirm new password" error={err}><input className="pf-input" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}

export default function Profile() {
  const { state, actions } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const me = getMe(state);
  const [name, setName] = useState(me?.name ?? '');
  const [email, setEmail] = useState(state.user.email);
  const [err, setErr] = useState('');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(null);
  const dirty = name !== me?.name || email !== state.user.email;

  const save = (e) => {
    e?.preventDefault();
    if (!name.trim()) return setErr('Name can’t be empty.');
    if (!api.isEmail(email)) return setErr('Enter a valid email address.');
    setErr('');
    actions.updateProfile({ name: name.trim(), email: email.trim().toLowerCase() });
    toast('Profile saved');
  };

  const toggleConnection = async (c) => {
    const on = state.user.connections[c.key];
    setBusy(c.key);
    try {
      if (on) await api.disconnectProvider(c.key);
      else await api.connectProvider(c.key);
      actions.setPref('connections', c.key, !on);
      toast(on ? `${c.label} disconnected` : `${c.label} connected`);
    } catch (ex) {
      toast(ex.message, 'error');
    }
    setBusy(null);
  };

  const logout = () => {
    actions.logout();
    navigate('/login');
  };

  return (
    <AppLayout page="profile">
      <PageHead title="Profile & settings" sub="Manage your account" />
      <div className="pf-grid">
        <form className="card pf-card pf-a" onSubmit={save} noValidate>
          <div className="card-title">Account</div>
          <div className="f-label">Name</div>
          <input className="f-input" type="text" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
          <div className="f-label">Email</div>
          <input className="f-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
          {err && <div className="f-error">{err}</div>}
          <div className="acc-btns">
            {dirty ? (
              <>
                <button className="btn btn-primary" type="submit">Save changes</button>
                <button className="btn btn-secondary" type="button" onClick={() => { setName(me.name); setEmail(state.user.email); setErr(''); }}>Cancel</button>
              </>
            ) : (
              <>
                <button className="btn btn-secondary" type="button" onClick={() => setModal('password')}>Change password</button>
                <button className="btn btn-secondary btn-logout" type="button" onClick={() => setModal('logout')}>Log out</button>
              </>
            )}
          </div>
        </form>

        <div className="card pf-card pf-a">
          <div className="card-title">Notification preferences</div>
          <div className="pr-list">
            {NOTIF_PREFS.map((p) => (
              <div key={p.key} className="pr-row">
                <div className="pr-label">{p.label}</div>
                <Toggle label={p.label} on={state.user.notifPrefs[p.key]} onChange={(v) => actions.setPref('notifPrefs', p.key, v)} />
              </div>
            ))}
          </div>
        </div>

        <div className="card pf-card pf-b">
          <div className="card-title">Connections</div>
          <div className="pr-list">
            {CONNECTIONS.map((c) => {
              const on = state.user.connections[c.key];
              return (
                <div key={c.key} className="pr-row conn-row">
                  <div><div className="pr-label">{c.label}</div><div className="pr-desc">{c.desc}</div></div>
                  <button className={`btn btn-sm ${on ? 'btn-conn' : 'btn-primary'}`} disabled={busy === c.key} onClick={() => toggleConnection(c)}>
                    {on ? (
                      <>
                        <span className="conn-on"><IconCheck size={14} color="#34D399" width={3} />Connected</span>
                        <span className="conn-off">Disconnect</span>
                      </>
                    ) : busy === c.key ? 'Connecting…' : 'Connect'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card pf-card pf-b">
          <div className="card-title">Dashboard preferences</div>
          <div className="pr-list">
            {DASH_WIDGETS.map((w) => (
              <Checkbox key={w.key} className="ck-row" label={w.label} checked={state.user.dashPrefs[w.key]} onChange={(v) => actions.setPref('dashPrefs', w.key, v)} />
            ))}
          </div>
        </div>
      </div>

      <div className="pf-foot">
        <button className="link-btn" onClick={() => setModal('reset')}>Reset demo data</button>
      </div>

      {modal === 'password' && <PasswordModal onClose={() => setModal(null)} />}
      {modal === 'logout' && <ConfirmModal title="Log out?" message="You’ll need to log in again to get back to your workspace." confirmLabel="Log out" onConfirm={logout} onClose={() => setModal(null)} />}
      {modal === 'reset' && (
        <ConfirmModal
          title="Reset demo data?"
          message="All projects, tasks, time records and settings will go back to the original sample data."
          confirmLabel="Reset"
          onConfirm={() => { actions.resetDemo(); toast('Demo data restored'); setTimeout(() => window.location.reload(), 300); }}
          onClose={() => setModal(null)}
        />
      )}
    </AppLayout>
  );
}
