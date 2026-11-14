/**
 * @author Saaqib Shaik (progress), Aashwat Singh (notifications)
 * @description Unit tests for the live-update client: the access token is sent as the first message inside
 *   the socket and never appears in the URL, and the client only reports "connected" after the server has
 *   accepted that token. Also checks the helper that keeps demo-inbox links inside the app.
 * @traces SE-NFR-06, SE-NFR-11, SE-NFR-12, UC-11
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sameSitePath } from '../shared/format';

class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

describe('SE-NFR-06 realtime client', () => {
  beforeEach(() => {
    FakeSocket.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('window', { location: { protocol: 'https:', host: 'app.example.com', origin: 'https://app.example.com' } });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('SE-NFR-06: sends the token inside the socket, never in the URL (SE-NFR-11)', async () => {
    const { realtime, socketUrl } = await import('./realtimeClient');
    const token = 'header.payload.signature';
    realtime.connect(token);
    const socket = FakeSocket.instances[0];
    expect(socket.url).toBe('wss://app.example.com/ws');
    expect(socketUrl()).not.toContain('token');
    expect(socket.url).not.toContain(token);
    expect(socket.sent).toEqual([]); // nothing before the socket is open
    socket.open();
    expect(JSON.parse(socket.sent[0])).toEqual({ type: 'auth', token });
    expect(realtime.connected).toBe(false); // not "live" until the server accepts the token
    const seen: unknown[] = [];
    realtime.on('notification', (n) => seen.push(n));
    socket.receive({ type: 'connected', data: { user_id: 'u1' } });
    expect(realtime.connected).toBe(true);
    socket.receive({ type: 'notification', data: { id: 'n1' } });
    expect(seen).toEqual([{ id: 'n1' }]);
    realtime.disconnect();
    expect(realtime.connected).toBe(false);
  });

  it('SE-NFR-11: does not reconnect after the server rejects the token (close code 4401)', async () => {
    const { realtime } = await import('./realtimeClient');
    realtime.connect('bad-token');
    const socket = FakeSocket.instances[0];
    socket.open();
    socket.onclose?.({ code: 4401 });
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    realtime.disconnect();
  });

  it('UC-11: demo inbox links can only navigate inside the app', () => {
    const origin = 'https://app.example.com';
    expect(sameSitePath('http://localhost:5173/reset-password?token=abc', origin)).toBe('/reset-password?token=abc');
    expect(sameSitePath('https://evil.example/login?unlock_token=x', origin)).toBe('/login?unlock_token=x'); // host is dropped
    expect(sameSitePath('/login?unlock_token=x', origin)).toBe('/login?unlock_token=x');
    for (const hostile of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', 'mailto:a@b.co']) {
      expect(sameSitePath(hostile, origin), hostile).toBeNull();
    }
  });
});
