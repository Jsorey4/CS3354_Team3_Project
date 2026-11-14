/**
 * @author Saaqib Shaik (progress), Aashwat Singh (notifications)
 * @description Keeps one WebSocket open to the backend while the user is signed in and hands each live
 *   event (progress changed, new notification, task moved, ...) to whichever screens are listening, so
 *   progress bars and the notification bell update within 2 seconds. Reconnects automatically with backoff.
 *   The access token is sent as the first message inside the socket, never in the URL, so it cannot end
 *   up in server logs or browser history (SE-NFR-06). The server closes sockets that do not sign in.
 * @traces SE-FR-18, SE-FR-29, SE-NFR-06, SE-NFR-10, SE-NFR-11, SE-NFR-12
 */
import { useEffect, useRef } from 'react';

export type RealtimeEventType =
  | 'connected'
  | 'progress'
  | 'notification'
  | 'task_changed'
  | 'comment_added'
  | 'soft_deadline_changed'
  | 'membership_changed'
  | 'project_created'
  | 'project_updated'
  | 'project_deleted'
  | 'timer';

type Handler = (data: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

export function socketUrl(): string {
  const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');
  if (base) return `${base.replace(/^http/, 'ws')}/ws`;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}

class RealtimeClient {
  private socket: WebSocket | null = null;
  private token: string | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private retryMs = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private statusListeners = new Set<(connected: boolean) => void>();
  connected = false;

  connect(token: string): void {
    if (this.token === token && this.socket && this.socket.readyState <= WebSocket.OPEN) return;
    this.disconnect();
    this.token = token;
    this.open();
  }

  disconnect(): void {
    this.token = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.reconnectTimer = null;
    this.pingTimer = null;
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
    }
    this.socket = null;
    this.setConnected(false);
  }

  on(type: RealtimeEventType, handler: Handler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  onStatus(listener: (connected: boolean) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.connected);
    return () => this.statusListeners.delete(listener);
  }

  private setConnected(value: boolean): void {
    this.connected = value;
    this.statusListeners.forEach((l) => l(value));
  }

  private open(): void {
    if (!this.token || typeof WebSocket === 'undefined') return;
    const token = this.token;
    const socket = new WebSocket(socketUrl());
    this.socket = socket;
    socket.onopen = () => {
      // First frame: sign in. Nothing is delivered until the server answers "connected".
      socket.send(JSON.stringify({ type: 'auth', token }));
      this.pingTimer = setInterval(() => socket.readyState === WebSocket.OPEN && socket.send('ping'), 25_000);
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as { type: string; data: unknown };
        if (message.type === 'connected') {
          this.retryMs = 1000;
          this.setConnected(true);
        }
        this.handlers.get(message.type)?.forEach((h) => h(message.data));
      } catch {
        /* ignore malformed frames */
      }
    };
    socket.onclose = (event) => {
      this.setConnected(false);
      if (this.pingTimer) clearInterval(this.pingTimer);
      if (!this.token || event.code === 4401) return; // signed out or token rejected
      this.reconnectTimer = setTimeout(() => this.open(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 15_000);
    };
  }
}

export const realtime = new RealtimeClient();

/** Subscribes a component to one live event type for as long as it is mounted. */
export function useRealtime(type: RealtimeEventType, handler: Handler): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => realtime.on(type, (data) => ref.current(data)), [type]);
}
