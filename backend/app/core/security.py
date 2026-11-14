"""
@author: Tyler Gaines
@description: Everything that keeps accounts safe: bcrypt password hashing, password-strength rules,
    signed JWT session / 2FA / reset / unlock tokens carried only in the Authorization: Bearer header,
    6-digit TOTP two-factor codes, the per-IP rate limiter that blocks brute-force signups and logins,
    the HTTPS transport headers (HSTS, CSP), and a development "outbox" that stands in for real email so
    the reset and unlock links can be demonstrated without an email server.
    Tokens are signed with HS256 only ("alg: none" and every other algorithm are rejected), carry a
    256-bit random id so reset / unlock links work exactly once, and a session stops working the moment
    its owner's password changes.
@traces: SE-FR-11, SE-NFR-06, UC-08, UC-09, UC-10, UC-11
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import re
import secrets
import threading
import time
from collections import OrderedDict, deque
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import jwt
import pyotp
from fastapi import Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db, utcnow

logger = logging.getLogger("projectforge.security")
settings = get_settings()

# ---------------------------------------------------------------------------
# Password hashing (bcrypt via passlib) - SE-FR-11, UC-08
# ---------------------------------------------------------------------------
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=settings.bcrypt_rounds)
# Used to spend the same time verifying when the user does not exist (prevents timing enumeration).
_DUMMY_HASH = pwd_context.hash(secrets.token_urlsafe(16))

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,30}$")
SPECIAL_RE = re.compile(r"[^A-Za-z0-9]")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        pwd_context.verify(password, _DUMMY_HASH)
        return False
    try:
        return pwd_context.verify(password, password_hash)
    except ValueError:
        return False


def password_problems(password: str) -> list[str]:
    """Returns every unmet password rule (UC-08: >= 8 chars, upper, lower, digit, special)."""
    problems: list[str] = []
    if len(password) < 8:
        problems.append("at least 8 characters")
    if len(password.encode("utf-8")) > 72:
        problems.append("at most 72 bytes")
    if not re.search(r"[A-Z]", password):
        problems.append("one uppercase letter")
    if not re.search(r"[a-z]", password):
        problems.append("one lowercase letter")
    if not re.search(r"\d", password):
        problems.append("one digit")
    if not SPECIAL_RE.search(password):
        problems.append("one special character")
    return problems


def password_error_message(password: str) -> str | None:
    problems = password_problems(password)
    if not problems:
        return None
    return "Password must contain " + ", ".join(problems) + "."


# ---------------------------------------------------------------------------
# Signed tokens (JWT, HS256)
# ---------------------------------------------------------------------------
# Pinned in code, never read from configuration or from the token header: a token that names any other
# algorithm (including "none") fails verification.
JWT_ALGORITHM = "HS256"
TOKEN_ACCESS = "access"
TOKEN_MFA = "mfa"
TOKEN_RESET = "reset"
TOKEN_UNLOCK = "unlock"


def create_token(subject: str, token_type: str, minutes: int, extra: dict[str, Any] | None = None) -> tuple[str, str]:
    """Returns (token, jti). The jti lets single-use tokens be revoked after one use."""
    issued = int(time.time())
    jti = secrets.token_urlsafe(32)  # 256 bits from the OS CSPRNG; stored server-side for single-use links
    payload: dict[str, Any] = {
        "sub": subject,
        "typ": token_type,
        "jti": jti,
        "iat": issued,
        "exp": issued + minutes * 60,
    }
    if extra:
        payload.update(extra)
    token = jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM)
    return token, jti


def decode_token(token: str, expected_type: str) -> dict[str, Any] | None:
    if not isinstance(token, str) or len(token) > MAX_TOKEN_LENGTH:
        return None
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["exp", "iat", "sub", "typ", "jti"], "verify_signature": True, "verify_exp": True},
        )
    except jwt.PyJWTError:
        return None
    if payload.get("typ") != expected_type or not isinstance(payload.get("sub"), str):
        return None
    return payload


MAX_TOKEN_LENGTH = 2048


def credential_version(password_hash: str | None) -> str:
    """Short keyed fingerprint of the current password hash.

    It is stored in every session token ("cv" claim). Changing the password changes the fingerprint, so
    every session issued before a password reset stops working immediately (no server-side session table).
    """
    digest = hmac.new(settings.jwt_secret.encode("utf-8"), (password_hash or "").encode("utf-8"), hashlib.sha256)
    return digest.hexdigest()[:16]


def create_access_token(user_id: str, password_hash: str | None = None) -> str:
    token, _ = create_token(user_id, TOKEN_ACCESS, settings.access_token_minutes, {"cv": credential_version(password_hash)})
    return token


def _session_user(payload: dict[str, Any] | None, db: Session):
    """Loads the token's user and rejects sessions issued before the last password change."""
    from app.models.entities import UserProfile

    if payload is None:
        return None
    try:
        user = db.get(UserProfile, payload["sub"])
    except Exception:  # malformed id inside a (validly signed) token
        return None
    if user is None or not hmac.compare_digest(str(payload.get("cv", "")), credential_version(user.password_hash)):
        return None
    return user


def jti_matches(stored: str | None, presented: str | None) -> bool:
    if not stored or not presented:
        return False
    return hmac.compare_digest(stored, presented)


def hash_identifier(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# TOTP two-factor authentication - SE-FR-11
# ---------------------------------------------------------------------------
def generate_mfa_secret() -> str:
    return pyotp.random_base32()


def mfa_provisioning_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=settings.app_name)


def verify_mfa_code(secret: str | None, code: str) -> bool:
    code = (code or "").strip().replace(" ", "")
    if not re.fullmatch(r"\d{6}", code):
        return False
    if settings.demo_mode and hmac.compare_digest(code, settings.demo_mfa_code):
        return True
    if not secret:
        return False
    return pyotp.TOTP(secret).verify(code, valid_window=1)


# ---------------------------------------------------------------------------
# Current user dependency
# ---------------------------------------------------------------------------
bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized
    user = _session_user(decode_token(credentials.credentials, TOKEN_ACCESS), db)
    if user is None:
        raise unauthorized
    return user


def user_from_token(token: str, db: Session):
    """Resolves a user from a raw access token (used by the WebSocket endpoint)."""
    return _session_user(decode_token(token, TOKEN_ACCESS), db)


def session_from_token(token: str, db: Session) -> tuple[str, float] | None:
    """(user id, expiry as a Unix timestamp) for a valid access token, else None (WebSocket sign-in)."""
    payload = decode_token(token, TOKEN_ACCESS)
    user = _session_user(payload, db)
    if user is None or payload is None:
        return None
    return user.id, float(payload["exp"])


# ---------------------------------------------------------------------------
# Sliding-window IP rate limiter - CWE-307, UC-08, UC-09
# ---------------------------------------------------------------------------
class SlidingWindowRateLimiter:
    """At most `limit` hits per `window` seconds per key.

    Time: O(1) amortised per hit. Memory: at most `max_keys` keys of at most `limit` timestamps each, and
    in practice far fewer, because every hit also evicts keys whose whole window has expired. Keys are kept
    in least-recently-hit order, so expired keys are always at the front and eviction never scans.
    """

    def __init__(self, limit: int, window_seconds: int, max_keys: int = 10_000) -> None:
        self.limit = limit
        self.window = window_seconds
        self.max_keys = max_keys
        self._hits: OrderedDict[str, deque[float]] = OrderedDict()
        self._lock = threading.Lock()

    def hit(self, key: str, now: float | None = None) -> bool:
        """Records a request. Returns False when the request must be rejected."""
        now = time.monotonic() if now is None else now
        with self._lock:
            bucket = self._hits.get(key)
            cutoff = now - self.window
            # Evict idle keys from the least-recently-hit end. Each key is evicted at most once per insert,
            # so the cost is O(1) amortised, and spoofed one-off addresses cannot accumulate.
            while self._hits:
                oldest_key, oldest = next(iter(self._hits.items()))
                if oldest_key == key or (oldest and oldest[-1] > cutoff):
                    break
                self._hits.popitem(last=False)
            if bucket is None:
                bucket = deque()
                self._hits[key] = bucket
                if len(self._hits) > self.max_keys:
                    self._hits.popitem(last=False)
            else:
                self._hits.move_to_end(key)
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= self.limit:
                return False
            bucket.append(now)
            return True

    def retry_after(self, key: str, now: float | None = None) -> int:
        now = time.monotonic() if now is None else now
        with self._lock:
            bucket = self._hits.get(key)
            if not bucket:
                return 0
            return max(1, int(bucket[0] + self.window - now) + 1)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def key_count(self) -> int:
        with self._lock:
            return len(self._hits)


auth_rate_limiter = SlidingWindowRateLimiter(settings.rate_limit_requests, settings.rate_limit_window_seconds)


def client_ip(request: Request) -> str:
    # X-Forwarded-For is intentionally NOT trusted: it is attacker-controlled without a trusted proxy.
    return request.client.host if request.client else "unknown"


async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path.rstrip("/")
    if request.method == "POST" and path in settings.rate_limited_paths:
        key = f"{client_ip(request)}|{path}"
        if not auth_rate_limiter.hit(key):
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "Try again later"},
                headers={"Retry-After": str(auth_rate_limiter.retry_after(key))},
            )
    return await call_next(request)


# ---------------------------------------------------------------------------
# Development email outbox (stands in for an SMTP provider)
# ---------------------------------------------------------------------------
@dataclass
class OutboxMessage:
    to: str
    subject: str
    body: str
    link: str
    sent_at: str


DEV_OUTBOX: deque[OutboxMessage] = deque(maxlen=50)
_outbox_lock = threading.Lock()


def send_email(to: str, subject: str, body: str, link: str = "") -> None:
    """Delivers a transactional email. In demo mode the message is kept in an in-memory outbox."""
    logger.info("Email to %s: %s", hash_identifier(to)[:12], subject)
    if settings.demo_mode:
        with _outbox_lock:
            DEV_OUTBOX.appendleft(
                OutboxMessage(to=to, subject=subject, body=body, link=link, sent_at=utcnow().isoformat() + "Z")
            )


# ---------------------------------------------------------------------------
# Transport security headers - SE-NFR-06
# ---------------------------------------------------------------------------
HSTS_VALUE = "max-age=63072000; includeSubDomains"
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; "
    "connect-src 'self' ws: wss:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
)


def transport_security_headers(secure: bool, html: bool = False) -> dict[str, str]:
    """Headers added to every response. HSTS is only sent when the deployment enforces HTTPS."""
    headers = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    }
    if secure:
        headers["Strict-Transport-Security"] = HSTS_VALUE
    if html:
        headers["Content-Security-Policy"] = CONTENT_SECURITY_POLICY
    return headers


def lockout_expiry():
    return utcnow() + timedelta(minutes=settings.lockout_minutes)
