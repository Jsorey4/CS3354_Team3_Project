/**
 * @author Tyler Gaines - matches profile.html
 * @description "Profile & settings" in the mockup's two-column card grid. Account: avatar, name, username,
 *   avatar link and email, with Change password and Log out. Notification preferences: task assignments,
 *   mentions, deadline reminders and project updates switches, saved as soon as they are flipped.
 *   Connections: Google Calendar, Outlook and Google Sheets connect / disconnect for one-way exports.
 *   Appearance: Dark theme switch and the default
 *   project-type mode (School / Personal / Work). Color vision: None, Deuteranopia, Protanopia, Tritanopia
 *   or High contrast. Security: two-factor authentication setup (secret + authenticator link, confirm with a
 *   6-digit code) or removal. All account data travels only over HTTPS in production (SE-NFR-06).
 * @traces SE-FR-11, SE-FR-12, SE-FR-13, SE-FR-14, SE-FR-15, SE-FR-19, SE-FR-20, SE-FR-29, SE-NFR-06, UC-22
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../app/ThemeProvider';
import { useAuth } from '../features/auth/AuthProvider';
import { authController } from '../features/auth/authController';
import { MfaCodeInput } from '../features/auth/MfaCodeInput';
import { validateUsername } from '../features/auth/validation';
import { PROJECT_TYPES } from '../features/projects/model';
import { ColorBlindPicker, ThemeToggle } from '../features/settings/AccessibilityToggles';
import { ConnectedAccountsCard, NotificationPrefsCard } from '../features/settings/PreferenceCards';
import { settingsController } from '../features/settings/settingsController';
import type { MfaSetup, ProjectType } from '../shared/types';
import { Alert, Avatar, Badge, Card, Field, Icon, PageHeader, RetryBanner, Segmented } from '../shared/ui';
import { toApiError, useSave } from '../shared/useSave';

function SecurityCard() {
  const { user, setUser } = useAuth();
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage({ tone: 'danger', text: toApiError(err).detail });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Security" actions={user.mfa_enabled ? <Badge tone="ok" icon="check">2FA on</Badge> : <Badge tone="warn" icon="alert">2FA off</Badge>}>
      <div className="space-y-4">
        {message ? <Alert tone={message.tone} onClose={() => setMessage(null)}>{message.text}</Alert> : null}
        {user.mfa_enabled ? (
          <>
            <p className="text-sm text-body">Two-factor authentication protects your account. Enter a current code to turn it off.</p>
            <MfaCodeInput value={code} onChange={setCode} disabled={busy} />
            <button type="button" className="btn-danger" disabled={busy || code.length !== 6} onClick={() => void run(async () => { setUser(await authController.mfaDisable(code)); setCode(''); setMessage({ tone: 'ok', text: 'Two-factor authentication turned off.' }); })}>
              Turn off 2FA
            </button>
          </>
        ) : setup ? (
          <>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-body">
              <li>Open your authenticator app (Google Authenticator, 1Password, Authy…).</li>
              <li>Add an account with this secret key, or open the setup link on your phone.</li>
              <li>Enter the 6-digit code it shows.</li>
            </ol>
            <div className="rounded-btn border border-line-strong bg-field p-3 font-mono text-sm tracking-widest text-ink">{setup.secret.match(/.{1,4}/g)?.join(' ')}</div>
            <a href={setup.otpauth_uri} className="text-xs font-semibold text-accent">Open in authenticator app →</a>
            <MfaCodeInput value={code} onChange={setCode} disabled={busy} />
            <button type="button" className="btn-primary" disabled={busy || code.length !== 6} onClick={() => void run(async () => { setUser(await authController.mfaEnable(code)); setSetup(null); setCode(''); setMessage({ tone: 'ok', text: 'Two-factor authentication is on.' }); })}>
              <Icon name="shield" /> Confirm and turn on
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-body">Add a second step at log-in with a 6-digit code from an authenticator app.</p>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void run(async () => setSetup(await authController.mfaSetup()))}><Icon name="shield" /> Set up two-factor authentication</button>
          </>
        )}
      </div>
    </Card>
  );
}

export function SettingsPage() {
  const { user, setUser, logout } = useAuth();
  const { theme, colorBlindMode, setTheme, setColorBlindMode } = useTheme();
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [avatar, setAvatar] = useState(user?.avatar_url ?? '');
  const [projectType, setProjectType] = useState<ProjectType>(user?.default_project_type ?? 'work');
  const [saved, setSaved] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string>();
  const [appearanceError, setAppearanceError] = useState<string | null>(null);

  const save = useSave(() => settingsController.updateProfile({ display_name: displayName, username, avatar_url: avatar }), (u) => { setUser(u); setSaved('Profile saved.'); });
  const saveMode = async (mode: ProjectType) => {
    setProjectType(mode);
    try {
      setUser(await settingsController.updateProfile({ default_project_type: mode }));
      setSaved(`New projects will default to ${mode}.`);
    } catch (err) {
      setAppearanceError(toApiError(err).detail);
    }
  };
  if (!user) return null;

  const submit = () => {
    const err = validateUsername(username);
    setUsernameError(err);
    setSaved(null);
    if (!err) void save.run();
  };

  const appearance = async (fn: () => Promise<void>) => {
    try {
      setAppearanceError(null);
      await fn();
    } catch (err) {
      setAppearanceError(toApiError(err).detail);
    }
  };

  return (
    <div>
      <PageHeader title="Profile & settings" subtitle="Manage your account" />
      {saved ? <div className="mb-6"><Alert tone="ok" onClose={() => setSaved(null)}>{saved}</Alert></div> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Account">
          <div className="space-y-4">
            <RetryBanner error={save.networkError} onRetry={save.retry} onCancel={save.cancel} busy={save.saving} />
            {save.error && !Object.keys(save.fieldErrors).length ? <Alert>{save.error.detail}</Alert> : null}
            <div className="flex items-center gap-4">
              <Avatar name={displayName || username} url={avatar || null} size="h-14 w-14" text="text-lg" />
              <p className="text-[13px] text-muted">Member since {new Date(user.created_at).toLocaleDateString()}</p>
            </div>
            <Field label="Name" htmlFor="st-name" error={save.fieldErrors.display_name}><input id="st-name" className="input" value={displayName} maxLength={80} onChange={(e) => setDisplayName(e.target.value)} /></Field>
            <Field label="Username" htmlFor="st-username" error={usernameError ?? save.fieldErrors.username}><input id="st-username" className="input" value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
            <Field label="Avatar image URL" htmlFor="st-avatar" error={save.fieldErrors.avatar_url} hint="An https:// link to a square image, or leave blank for initials.">
              <input id="st-avatar" className="input" value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://…" />
            </Field>
            <Field label="Email" htmlFor="st-email"><input id="st-email" className="input" value={user.email} disabled readOnly /></Field>
            <div className="flex flex-wrap gap-3 pt-2">
              <button type="button" className="btn-primary" onClick={submit} disabled={save.saving}>{save.saving ? 'Saving…' : 'Save profile'}</button>
              <Link to="/reset-password" className="btn-secondary">Change password</Link>
              <button type="button" className="btn-secondary text-danger" onClick={logout}>Log out</button>
            </div>
          </div>
        </Card>
        <NotificationPrefsCard />
        <ConnectedAccountsCard />
        <Card title="Appearance">
          {appearanceError ? <div className="mb-3"><Alert>{appearanceError}</Alert></div> : null}
          <ThemeToggle value={theme} onChange={(t) => void appearance(() => setTheme(t))} />
          <div className="py-4">
            <p className="text-[15px] font-semibold text-ink">Project mode</p>
            <p className="mb-3 text-[13px] text-muted">The type new projects start as; it decides which features they show.</p>
            <Segmented ariaLabel="Default project type" value={projectType} onChange={(m) => void saveMode(m)} options={PROJECT_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
          </div>
        </Card>
        <Card title="Color vision">
          <ColorBlindPicker value={colorBlindMode} onChange={(m) => void appearance(() => setColorBlindMode(m))} />
        </Card>
        <SecurityCard />
      </div>
    </div>
  );
}
