/**
 * @author Preethi Seereddy (timeout & retry rule), Tyler Gaines (auth header)
 * @description The one place the app talks to the backend. Every request carries the signed-in user's JWT,
 *   is cancelled after 5 seconds, and - if it timed out or the network dropped - is retried automatically
 *   once with the same Idempotency-Key so a save can never be stored twice. Errors come back as ApiError
 *   with the HTTP status, the server's message and any per-field messages for forms.
 * @traces SE-NFR-04, UC-01, UC-05, UC-06, UC-17
 */

export const REQUEST_TIMEOUT_MS = 5000;
export const MAX_RETRIES = 1;
const TOKEN_KEY = 'pf_token';
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly errors: Record<string, string>;
  readonly body: unknown;
  readonly isNetwork: boolean;
  readonly isTimeout: boolean;

  constructor(opts: { status: number; detail: string; errors?: Record<string, string>; body?: unknown; isNetwork?: boolean; isTimeout?: boolean }) {
    super(opts.detail);
    this.name = 'ApiError';
    this.status = opts.status;
    this.detail = opts.detail;
    this.errors = opts.errors ?? {};
    this.body = opts.body;
    this.isNetwork = opts.isNetwork ?? false;
    this.isTimeout = opts.isTimeout ?? false;
  }

  /** True when the request never got a server answer (offline / timed out) - the Retry banner case. */
  get isConnectivity(): boolean {
    return this.isNetwork || this.isTimeout;
  }
}

let authToken: string | null = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
let onUnauthorized: (() => void) | null = null;

export function getToken(): string | null {
  return authToken;
}

export function setToken(token: string | null): void {
  authToken = token;
  if (typeof localStorage === 'undefined') return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

type Query = Record<string, string | number | boolean | null | undefined | string[]>;

function buildQuery(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export interface RequestOptions {
  body?: unknown;
  query?: Query;
  /** Retry once on timeout / network error (default true). */
  retry?: boolean;
  /** Return the raw Response (file downloads). */
  raw?: boolean;
  /** Override the 5 s timeout (tests). */
  timeoutMs?: number;
  /** Do not trigger the global sign-out on 401 (login forms). */
  skipAuthRedirect?: boolean;
}

/** fetch() with an AbortController deadline. Rejects with ApiError on timeout / network failure. */
export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    const timedOut = controller.signal.aborted;
    throw new ApiError({
      status: 0,
      detail: timedOut
        ? 'The server took longer than 5 seconds to respond.'
        : 'Could not reach the server. Check your connection.',
      isTimeout: timedOut,
      isNetwork: !timedOut,
      body: err,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function parseError(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const obj = (body ?? {}) as { detail?: unknown; errors?: Record<string, string> };
  const detail =
    typeof obj.detail === 'string'
      ? obj.detail
      : response.status === 429
        ? 'Try again later'
        : `Request failed (${response.status})`;
  return new ApiError({ status: response.status, detail, errors: obj.errors, body });
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['Idempotency-Key'] = newIdempotencyKey();
  const init: RequestInit = {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  };
  const url = apiUrl(path) + buildQuery(opts.query);
  const attempts = (opts.retry ?? true) ? MAX_RETRIES + 1 : 1;

  let response: Response | null = null;
  let lastError: ApiError | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      response = await fetchWithTimeout(url, init, opts.timeoutMs ?? REQUEST_TIMEOUT_MS);
      break;
    } catch (err) {
      lastError = err as ApiError;
    }
  }
  if (!response) throw lastError ?? new ApiError({ status: 0, detail: 'Network error', isNetwork: true });

  if (response.status === 401 && !opts.skipAuthRedirect && authToken) {
    onUnauthorized?.();
  }
  if (!response.ok) throw await parseError(response);
  if (opts.raw) return response as unknown as T;
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, query?: Query, opts: RequestOptions = {}) => request<T>('GET', path, { ...opts, query }),
  post: <T>(path: string, body?: unknown, opts: RequestOptions = {}) => request<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts: RequestOptions = {}) => request<T>('PUT', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts: RequestOptions = {}) => request<T>('PATCH', path, { ...opts, body }),
  del: <T>(path: string, query?: Query, opts: RequestOptions = {}) => request<T>('DELETE', path, { ...opts, query }),
};

/** POSTs and saves the response body as a file (calendar .ics / spreadsheet .xlsx). */
export async function downloadFile(path: string, body: unknown, fallbackName: string): Promise<{ filename: string; count: number }> {
  const response = await request<Response>('POST', path, { body, raw: true });
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? fallbackName;
  const count = Number(response.headers.get('X-Export-Count') ?? '0');
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  return { filename, count };
}
