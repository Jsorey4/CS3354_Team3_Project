"""
@author: eLeet Coderz (Team 3) - integration: Jon Sorey; security middleware: Tyler Gaines; live updates:
    Saaqib Shaik & Aashwat Singh
@description: Starts the ProjectForge API. It creates the database tables (and demo data) on first run,
    forces HTTPS with HSTS outside demo mode, turns on the sign-up / log-in rate limiter, lets the React
    app call the API from another port (CORS), refuses request bodies over 1 MB, makes retried saves safe
    (the same Idempotency-Key and body never save twice), formats validation errors as
    {"detail", "errors": {field: message}}, answers malformed ids with 404 instead of crashing, plugs in
    every feature router, hosts the WebSocket used for live progress and notification updates (signed-in
    users only), and - after `npm run build` - also serves the website itself.
@traces: SE-NFR-04, SE-NFR-06, SE-NFR-08, SE-NFR-10, SE-NFR-11, SE-NFR-12, UC-08, UC-09
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from collections import OrderedDict
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import DataError, IntegrityError, StatementError

from app import __version__
from app.core.config import get_settings
from app.core.database import InvalidIdentifier, SessionLocal, create_all, database_kind
from app.core.realtime import hub
from app.core.security import rate_limit_middleware, session_from_token, transport_security_headers
from app.routers import (
    auth,
    collaboration,
    costs,
    dashboard,
    exports,
    members,
    projects,
    reports,
    settings as settings_router,
    soft_deadlines,
    tasks,
    time_tracking,
)
from app.schemas.dto import FieldValidationError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("projectforge")
settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    create_all()
    if settings.seed_demo_data:
        from app.seed import seed_demo_data

        with SessionLocal() as db:
            seed_demo_data(db)
    hub.bind_loop(asyncio.get_running_loop())
    logger.info("ProjectForge API ready (database: %s, demo mode: %s)", database_kind(), settings.demo_mode)
    yield


app = FastAPI(
    title="ProjectForge API",
    version=__version__,
    description="CS 3354.001 Team 3 (eLeet Coderz) project management backend.",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Idempotent retries (SE-NFR-04): the browser retries a timed-out save once with the same key.
# ---------------------------------------------------------------------------
class IdempotencyStore:
    """Remembers finished responses for 10 minutes so a retried save is answered, not repeated.

    Bounded three ways so it cannot be used to exhaust memory: at most `max_entries` responses, at most
    `max_total_bytes` of cached bodies in total, and bodies larger than `max_body_bytes` (file exports)
    are never cached. Eviction is oldest-first, O(1) amortised.
    """

    def __init__(self, ttl_seconds: int = 600, max_entries: int = 2000, max_body_bytes: int = 256 * 1024, max_total_bytes: int = 32 * 1024 * 1024) -> None:
        self.ttl = ttl_seconds
        self.max_entries = max_entries
        self.max_body_bytes = max_body_bytes
        self.max_total_bytes = max_total_bytes
        self.total_bytes = 0
        self._done: OrderedDict[str, tuple[float, int, list[tuple[str, str]], bytes]] = OrderedDict()
        self._inflight: dict[str, asyncio.Event] = {}

    def _drop(self, key: str) -> None:
        item = self._done.pop(key, None)
        if item is not None:
            self.total_bytes -= len(item[3])

    def get(self, key: str):
        item = self._done.get(key)
        if item is None:
            return None
        if item[0] < time.monotonic():
            self._drop(key)
            return None
        return item

    def put(self, key: str, status_code: int, headers: list[tuple[str, str]], body: bytes) -> None:
        if len(body) > self.max_body_bytes:
            return
        self._drop(key)
        self._done[key] = (time.monotonic() + self.ttl, status_code, headers, body)
        self.total_bytes += len(body)
        while self._done and (len(self._done) > self.max_entries or self.total_bytes > self.max_total_bytes):
            self._drop(next(iter(self._done)))

    def clear(self) -> None:
        self._done.clear()
        self.total_bytes = 0


idempotency_store = IdempotencyStore()
# Sign-in, sign-up, 2FA, reset and unlock answers contain tokens or depend on attempt counters: they are
# never replayed from a cache.
IDEMPOTENCY_EXCLUDED_PREFIX = "/api/auth/"


@app.middleware("http")
async def idempotency_middleware(request: Request, call_next):
    raw_key = request.headers.get("idempotency-key")
    if (
        not raw_key
        or len(raw_key) > 128
        or request.method not in {"POST", "PUT", "PATCH", "DELETE"}
        or request.url.path.startswith(IDEMPOTENCY_EXCLUDED_PREFIX)
    ):
        return await call_next(request)
    # The cache key covers who is asking, what they are asking for and the exact body, so a reused key
    # with a different caller or different content is treated as a new request, never answered from cache.
    body_digest = hashlib.sha256(await request.body()).hexdigest()
    scope = f"{request.headers.get('authorization', '')}|{request.method}|{request.url.path}|{request.url.query}|{raw_key}|{body_digest}"
    key = hashlib.sha256(scope.encode("utf-8")).hexdigest()

    waiter = idempotency_store._inflight.get(key)
    if waiter is not None:
        await waiter.wait()
    cached = idempotency_store.get(key)
    if cached is not None:
        _, code, headers, body = cached
        response = Response(content=body, status_code=code)
        for name, value in headers:
            if name.lower() != "content-length":
                response.headers.append(name, value)
        response.headers["Idempotent-Replayed"] = "true"
        return response

    event = asyncio.Event()
    idempotency_store._inflight[key] = event
    try:
        response = await call_next(request)
        chunks: list[bytes] = []
        async for chunk in response.body_iterator:
            chunks.append(chunk if isinstance(chunk, bytes) else chunk.encode("utf-8"))
        body = b"".join(chunks)
        headers = [(k, v) for k, v in response.headers.items()]
        if response.status_code < 500:
            idempotency_store.put(key, response.status_code, headers, body)
        replay = Response(content=body, status_code=response.status_code)
        for name, value in headers:
            if name.lower() != "content-length":
                replay.headers.append(name, value)
        return replay
    finally:
        event.set()
        idempotency_store._inflight.pop(key, None)


# ---------------------------------------------------------------------------
# Request size limit: no endpoint accepts uploads, so anything over 1 MB is refused before it is parsed.
# ---------------------------------------------------------------------------
MAX_REQUEST_BYTES = 1024 * 1024


class BodySizeLimitMiddleware:
    """Pure ASGI middleware: 413 for a declared or streamed body larger than `max_bytes`."""

    def __init__(self, app, max_bytes: int = MAX_REQUEST_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def _reject(self, send) -> None:
        body = b'{"detail":"Request body is too large"}'
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode()), (b"connection", b"close")],
            }
        )
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        declared = dict(scope.get("headers") or []).get(b"content-length")
        if declared is not None:
            try:
                too_big = int(declared) > self.max_bytes
            except ValueError:
                too_big = True
            if too_big:
                await self._reject(send)
                return

        received = 0
        exceeded = False
        started = False

        async def limited_receive():
            nonlocal received, exceeded
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:  # chunked upload with no (or a false) Content-Length
                    exceeded = True
                    return {"type": "http.disconnect"}
            return message

        async def guarded_send(message):
            nonlocal started
            if exceeded:
                return
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, guarded_send)
        except Exception:
            if not exceeded:
                raise
        if exceeded and not started:
            await self._reject(send)


app.middleware("http")(rate_limit_middleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
    expose_headers=["Content-Disposition", "X-Export-Count", "Retry-After"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """SE-NFR-06: HSTS when HTTPS is enforced, CSP on the served web app, hardening headers everywhere."""
    response = await call_next(request)
    is_html = response.headers.get("content-type", "").startswith("text/html")
    for name, value in transport_security_headers(settings.force_https, html=is_html).items():
        response.headers.setdefault(name, value)
    return response


if settings.force_https:
    # Behind a TLS-terminating proxy run uvicorn with --proxy-headers so X-Forwarded-Proto is honoured.
    app.add_middleware(HTTPSRedirectMiddleware)

app.add_middleware(BodySizeLimitMiddleware, max_bytes=MAX_REQUEST_BYTES)


# ---------------------------------------------------------------------------
# Error formatting: field-level messages for forms (UC-08 and every create / edit form)
# ---------------------------------------------------------------------------
def _field_name(loc: tuple) -> str:
    parts = [str(p) for p in loc if p not in ("body", "query", "path")]
    return ".".join(parts) or "request"


@app.exception_handler(RequestValidationError)
async def validation_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    errors: dict[str, str] = {}
    for err in exc.errors():
        field = _field_name(tuple(err.get("loc", ())))
        message = str(err.get("msg", "Invalid value")).removeprefix("Value error, ")
        errors.setdefault(field, message)
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "Please fix the highlighted fields.", "errors": errors},
    )


@app.exception_handler(FieldValidationError)
async def field_error_handler(_request: Request, exc: FieldValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.detail, "errors": exc.errors},
    )


@app.exception_handler(StatementError)
async def statement_error_handler(_request: Request, exc: StatementError) -> JSONResponse:
    """Database-level rejections become plain 4xx answers with no SQL, table or column names in them.

    * A malformed id (not a UUID) in a URL or body can never match a row            -> 404 Not found
    * A unique / foreign-key / check constraint lost a race with another request   -> 409 Conflict
    * A value the column cannot hold (number out of range, text too long)          -> 400 Invalid value
    Anything else is a genuine server error and is re-raised (500, details only in the server log).
    """
    if isinstance(exc, IntegrityError):
        return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={"detail": "That change conflicts with another update. Refresh and try again."})
    if isinstance(exc, DataError):
        return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"detail": "Invalid value"})
    if isinstance(exc.orig, InvalidIdentifier):
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": "Not found"})
    raise exc


for module in (
    auth,
    settings_router,
    projects,
    exports,
    dashboard,
    tasks,
    members,
    collaboration,
    soft_deadlines,
    costs,
    time_tracking,
    reports,
):
    app.include_router(module.router)


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "version": __version__, "database": database_kind(), "demo_mode": settings.demo_mode}


WS_AUTH_TIMEOUT_SECONDS = 5.0
WS_MAX_MESSAGE_CHARS = 4096
WS_UNAUTHENTICATED = 4401


async def _ws_authenticate(websocket: WebSocket) -> tuple[str, float] | None:
    """First frame must be {"type": "auth", "token": "<access token>"} within 5 seconds.

    The token travels inside the (TLS-protected) socket, never in the URL, so it cannot end up in access
    logs, browser history or Referer headers (SE-NFR-06).
    """
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=WS_AUTH_TIMEOUT_SECONDS)
    except (asyncio.TimeoutError, WebSocketDisconnect, RuntimeError, KeyError):
        return None
    if len(raw) > WS_MAX_MESSAGE_CHARS:
        return None
    try:
        message = json.loads(raw)
    except ValueError:
        return None
    if not isinstance(message, dict) or message.get("type") != "auth" or not isinstance(message.get("token"), str):
        return None
    with SessionLocal() as db:
        return session_from_token(message["token"], db)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """Live updates: progress (SE-NFR-10) and notifications (SE-NFR-12), delivered in well under 2 s.

    A socket receives nothing until it has presented a valid access token; unauthenticated sockets are
    closed with code 4401 and never registered with the hub (SE-NFR-11).
    """
    await websocket.accept()
    session = await _ws_authenticate(websocket)
    if session is None:
        try:
            await websocket.close(code=WS_UNAUTHENTICATED)
        except RuntimeError:
            pass
        return
    user_id, expires_at = session
    await hub.register(user_id, websocket, expires_at)
    try:
        await websocket.send_json({"type": "connected", "data": {"user_id": user_id}})
        while True:
            message = await websocket.receive_text()
            if time.time() >= expires_at:
                await websocket.close(code=WS_UNAUTHENTICATED)
                break
            if message == "ping":
                await websocket.send_json({"type": "pong", "data": {}})
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        hub.disconnect(user_id, websocket)


# ---------------------------------------------------------------------------
# Serve the built React app (web/dist) so `uvicorn app.main:app` is a one-process demo.
# ---------------------------------------------------------------------------
_dist = settings.frontend_dist
if _dist.is_dir() and (_dist / "index.html").is_file():
    if (_dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith(("api/", "ws")):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        candidate = (_dist / full_path).resolve()
        if full_path and candidate.is_file() and _dist.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(_dist / "index.html")
