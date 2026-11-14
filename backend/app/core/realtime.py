"""
@author: Saaqib Shaik (progress updates), Aashwat Singh (notification delivery)
@description: The live-update hub. Every signed-in browser keeps one WebSocket open; when a task changes
    or someone is @mentioned, the backend pushes a small JSON event to exactly the affected users so
    progress bars and the notification bell refresh within two seconds without reloading the page.
    Only signed-in users get a connection, and events for a project go only to people who are members of
    that project at that moment.
@traces: SE-FR-18, SE-FR-29, SE-NFR-10, SE-NFR-11, SE-NFR-12, UC-19, UC-21, UC-22
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from collections import defaultdict
from collections.abc import Iterable
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger("projectforge.realtime")


def _default(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat(timespec="seconds") + ("Z" if value.tzinfo is None else "")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    raise TypeError(f"Unserialisable value {type(value)!r}")


MAX_SOCKETS_PER_USER = 8
POLICY_VIOLATION = 1008
SESSION_ENDED = 4401


class ConnectionHub:
    """Per-user WebSocket registry.

    There are no client-chosen channels: a browser never names a project or user to listen to. Every event
    is addressed by the server to explicit user ids, and callers compute those ids from the *current*
    project_members rows at the moment of the event (SE-NFR-11). A member removed from a project (UC-19)
    is therefore simply absent from the next recipient list, with nothing to unsubscribe.
    A socket is registered only after its access token was verified, is dropped when that token expires or
    the password changes, and each user may hold at most MAX_SOCKETS_PER_USER sockets.
    """

    def __init__(self) -> None:
        # user id -> {socket: token expiry (Unix seconds)}; dicts keep insertion order (oldest first).
        self._connections: dict[str, dict[WebSocket, float]] = defaultdict(dict)
        self._lock = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def register(self, user_id: str, websocket: WebSocket, expires_at: float) -> None:
        """Adds an already-accepted, already-authenticated socket; evicts the user's oldest beyond the cap."""
        evicted: list[WebSocket] = []
        with self._lock:
            sockets = self._connections[user_id]
            sockets[websocket] = expires_at
            while len(sockets) > MAX_SOCKETS_PER_USER:
                oldest = next(iter(sockets))
                del sockets[oldest]
                evicted.append(oldest)
        for ws in evicted:
            await self._close(ws, POLICY_VIOLATION)

    def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        with self._lock:
            sockets = self._connections.get(user_id)
            if sockets is not None:
                sockets.pop(websocket, None)
                if not sockets:
                    self._connections.pop(user_id, None)

    def connection_count(self, user_id: str | None = None) -> int:
        with self._lock:
            if user_id is not None:
                return len(self._connections.get(user_id, ()))
            return sum(len(s) for s in self._connections.values())

    @staticmethod
    async def _close(websocket: WebSocket, code: int) -> None:
        try:
            await websocket.close(code=code)
        except Exception:  # already closed by the peer
            pass

    async def _deliver(self, user_ids: list[str], payload: str) -> None:
        now = time.time()
        expired: list[tuple[str, WebSocket]] = []
        targets: list[tuple[str, WebSocket]] = []
        with self._lock:
            for uid in user_ids:
                for ws, expires_at in self._connections.get(uid, {}).items():
                    (expired if expires_at <= now else targets).append((uid, ws))
        for uid, ws in expired:  # the session token ran out: no further events for this socket
            self.disconnect(uid, ws)
            await self._close(ws, SESSION_ENDED)
        for uid, ws in targets:
            try:
                await ws.send_text(payload)
            except Exception:  # connection already closed
                self.disconnect(uid, ws)

    async def _close_user(self, user_id: str) -> None:
        with self._lock:
            sockets = list(self._connections.pop(user_id, {}))
        for ws in sockets:
            await self._close(ws, SESSION_ENDED)

    def _submit(self, coroutine) -> None:
        if self._loop is None or self._loop.is_closed():
            coroutine.close()
            return
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is self._loop:
            self._loop.create_task(coroutine)
        else:
            asyncio.run_coroutine_threadsafe(coroutine, self._loop)

    def publish(self, user_ids: Iterable[str], event_type: str, data: dict[str, Any]) -> None:
        """Thread-safe fire-and-forget broadcast; callable from sync route handlers."""
        recipients = sorted({uid for uid in user_ids if uid})
        if not recipients or self._loop is None or self._loop.is_closed():
            return
        payload = json.dumps({"type": event_type, "data": data}, default=_default)
        self._submit(self._deliver(recipients, payload))

    def close_user(self, user_id: str) -> None:
        """Ends every live connection of one user (password changed, so their old sessions are void)."""
        self._submit(self._close_user(user_id))


hub = ConnectionHub()
