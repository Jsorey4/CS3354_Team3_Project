/**
 * @author Preethi Seereddy
 * @description Unit tests for the 5-second timeout and the single automatic retry with the same
 *   Idempotency-Key.
 * @traces SE-NFR-04, UC-05, UC-17
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, MAX_RETRIES, REQUEST_TIMEOUT_MS, request } from './apiClient';

afterEach(() => vi.unstubAllGlobals());

describe('SE-NFR-04 timeout & retry', () => {
  it('uses a 5 second timeout and one retry', () => {
    expect(REQUEST_TIMEOUT_MS).toBe(5000);
    expect(MAX_RETRIES).toBe(1);
  });

  it('retries once after a network error, reusing the idempotency key', async () => {
    const keys: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      keys.push((init.headers as Record<string, string>)['Idempotency-Key']);
      if (keys.length === 1) throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(request('POST', '/api/x', { body: { a: 1 } })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('gives up after the retry with a connectivity ApiError (Retry banner case)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    ));
    const err = await request('PUT', '/api/slow', { body: {}, timeoutMs: 20 }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).isTimeout).toBe(true);
    expect((err as ApiError).isConnectivity).toBe(true);
  });

  it('does not retry server answers and surfaces field errors', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ detail: 'Please fix the highlighted fields.', errors: { amount: 'too small' } }), { status: 422 }));
    vi.stubGlobal('fetch', fetchMock);
    const err = (await request('POST', '/api/x', { body: {} }).catch((e) => e)) as ApiError;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(err.status).toBe(422);
    expect(err.errors.amount).toBe('too small');
  });
});
