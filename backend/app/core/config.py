"""
@author: Tyler Gaines (security settings), Jon Sorey (database switch) - shared core
@description: Reads every configurable value (database address, secret keys, demo mode, limits, HTTPS
    enforcement) from environment variables or a .env file. If no PostgreSQL / Supabase address is given,
    ProjectForge automatically uses a local SQLite file so the class demo runs with zero setup. With
    DEMO_MODE=false, FORCE_HTTPS defaults to on so account and profile data only travel over TLS.
@traces: SE-FR-11, SE-NFR-06, UC-08, UC-09, UC-10
"""

from __future__ import annotations

import logging
import os
import secrets
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_DIR.parent

load_dotenv(BACKEND_DIR / ".env")

logger = logging.getLogger("projectforge.config")


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


def _list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


def _jwt_secret(environment: str) -> str:
    """Use JWT_SECRET when set; otherwise persist a random development secret next to the backend."""
    configured = os.getenv("JWT_SECRET", "").strip()
    if configured:
        if len(configured) < 32:
            raise RuntimeError("JWT_SECRET must be at least 32 characters long.")
        return configured
    if environment == "production":
        raise RuntimeError("JWT_SECRET must be set when ENVIRONMENT=production.")
    secret_file = BACKEND_DIR / ".dev_jwt_secret"
    try:
        if secret_file.exists():
            value = secret_file.read_text(encoding="utf-8").strip()
            if len(value) >= 32:
                return value
        value = secrets.token_urlsafe(48)
        secret_file.write_text(value, encoding="utf-8")
        return value
    except OSError:
        logger.warning("Could not persist a development JWT secret; tokens will reset on restart.")
        return secrets.token_urlsafe(48)


@dataclass(frozen=True)
class Settings:
    app_name: str
    environment: str
    demo_mode: bool
    database_url: str
    db_fallback_to_sqlite: bool
    sqlite_url: str
    jwt_secret: str
    access_token_minutes: int
    mfa_token_minutes: int
    reset_token_minutes: int
    unlock_token_minutes: int
    bcrypt_rounds: int
    cors_origins: list[str] = field(default_factory=list)
    rate_limit_requests: int = 5
    rate_limit_window_seconds: int = 60
    # UC-08 / UC-09 name sign-up and log-in; the other three are limited too so the 6-digit code cannot be
    # guessed in bulk and nobody's inbox can be flooded with reset links.
    rate_limited_paths: tuple[str, ...] = (
        "/api/auth/signup",
        "/api/auth/login",
        "/api/auth/verify-mfa",
        "/api/auth/reset-password/request",
        "/api/auth/reset-password/confirm",
    )
    lockout_threshold: int = 5
    lockout_minutes: int = 30
    seed_demo_data: bool = True
    demo_password: str = "ProjectForge!1"
    demo_mfa_code: str = "123456"
    frontend_url: str = "http://localhost:5173"
    frontend_dist: Path = PROJECT_ROOT / "web" / "dist"
    force_https: bool = False

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    environment = os.getenv("ENVIRONMENT", "development").strip().lower()
    sqlite_path = os.getenv("SQLITE_PATH", str(BACKEND_DIR / "projectforge.db"))
    sqlite_url = sqlite_path if sqlite_path.startswith("sqlite") else f"sqlite:///{sqlite_path}"
    database_url = (os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL") or "").strip()
    if database_url.startswith("postgres://"):
        database_url = "postgresql+psycopg://" + database_url[len("postgres://"):]
    elif database_url.startswith("postgresql://"):
        database_url = "postgresql+psycopg://" + database_url[len("postgresql://"):]
    if not database_url:
        database_url = sqlite_url

    demo_mode = _bool("DEMO_MODE", environment != "production")
    return Settings(
        app_name="ProjectForge",
        environment=environment,
        demo_mode=demo_mode,
        database_url=database_url,
        db_fallback_to_sqlite=_bool("DB_FALLBACK_TO_SQLITE", True),
        sqlite_url=sqlite_url,
        jwt_secret=_jwt_secret(environment),
        access_token_minutes=_int("ACCESS_TOKEN_MINUTES", 60 * 8),
        mfa_token_minutes=_int("MFA_TOKEN_MINUTES", 5),
        reset_token_minutes=_int("RESET_TOKEN_MINUTES", 30),
        unlock_token_minutes=_int("UNLOCK_TOKEN_MINUTES", 60 * 24),
        bcrypt_rounds=_int("BCRYPT_ROUNDS", 12),
        cors_origins=_list("CORS_ORIGINS", ["http://localhost:5173", "http://127.0.0.1:5173"]),
        rate_limit_requests=_int("RATE_LIMIT_REQUESTS", 5),
        rate_limit_window_seconds=_int("RATE_LIMIT_WINDOW_SECONDS", 60),
        lockout_threshold=_int("LOCKOUT_THRESHOLD", 5),
        lockout_minutes=_int("LOCKOUT_MINUTES", 30),
        seed_demo_data=_bool("SEED_DEMO_DATA", True),
        demo_password=os.getenv("DEMO_PASSWORD", "ProjectForge!1"),
        demo_mfa_code=os.getenv("DEMO_MFA_CODE", "123456"),
        frontend_url=os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/"),
        frontend_dist=Path(os.getenv("FRONTEND_DIST", str(PROJECT_ROOT / "web" / "dist"))),
        # SE-NFR-06: HTTPS redirect + HSTS. On by default whenever demo mode is off.
        force_https=_bool("FORCE_HTTPS", not demo_mode),
    )
