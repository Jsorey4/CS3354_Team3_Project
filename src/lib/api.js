// ---------------------------------------------------------------------------
// Backend integration points.
//
// The frontend currently runs fully client-side: data lives in React state and
// is persisted to localStorage (see store.jsx). When the Node API is ready,
// replace the bodies below with real fetch() calls — the UI already awaits
// these functions and shows loading / error states.
//
//   const API = import.meta.env.VITE_API_URL;   // set in Vercel → Settings → Env
// ---------------------------------------------------------------------------

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isEmail = (v) => EMAIL_RE.test(String(v).trim());

export async function login({ email, password }) {
  // TODO: POST `${API}/auth/login`
  await wait(350);
  if (!isEmail(email)) throw new Error('Enter a valid email address.');
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');
  return { email: email.trim().toLowerCase() };
}

export async function signup({ name, email, password }) {
  // TODO: POST `${API}/auth/signup`
  await wait(350);
  if (!name.trim()) throw new Error('Please enter your name.');
  if (!isEmail(email)) throw new Error('Enter a valid email address.');
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');
  return { name: name.trim(), email: email.trim().toLowerCase() };
}

export async function requestPasswordReset({ email }) {
  // TODO: POST `${API}/auth/reset-password`
  await wait(350);
  if (!isEmail(email)) throw new Error('Enter a valid email address.');
  return { ok: true };
}

export async function changePassword({ current, next }) {
  // TODO: POST `${API}/auth/change-password`
  await wait(300);
  if (!current) throw new Error('Enter your current password.');
  if (!next || next.length < 6) throw new Error('New password must be at least 6 characters.');
  return { ok: true };
}

export async function connectProvider(provider) {
  // TODO: start the OAuth flow for 'google' | 'outlook' | 'email'
  await wait(300);
  return { provider, connected: true };
}

export async function disconnectProvider(provider) {
  // TODO: revoke the provider token on the server
  await wait(200);
  return { provider, connected: false };
}
