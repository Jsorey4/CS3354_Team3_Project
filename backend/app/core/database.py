"""
@author: Jon Sorey (data layer), shared core
@description: Opens the database connection. It connects to PostgreSQL / Supabase when DATABASE_URL is
    set and falls back to a local SQLite file when it is not (or when Postgres is unreachable), then
    hands each API request its own short-lived database session. It also defines the column types that
    keep ids, money and UTC timestamps identical on both databases.
@traces: SE-NFR-01, SE-NFR-08, SE-NFR-09
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Iterator
from datetime import datetime, timezone

from sqlalchemy import CHAR, DateTime, create_engine, event, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.types import TypeDecorator

from app.core.config import get_settings

logger = logging.getLogger("projectforge.database")


def utcnow() -> datetime:
    """Current time as a naive UTC datetime (the single time representation used internally)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def to_naive_utc(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def new_id() -> str:
    return str(uuid.uuid4())


class InvalidIdentifier(ValueError):
    """An id that is not a UUID was used in a query. It can never match a row; the API answers 404."""


class GUID(TypeDecorator):
    """UUID stored natively on PostgreSQL and as a 36-char string on SQLite; always a str in Python."""

    impl = CHAR(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=False))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        try:
            return str(uuid.UUID(str(value)))
        except (ValueError, AttributeError, TypeError):
            raise InvalidIdentifier("not a valid id") from None

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return str(value)


class UTCDateTime(TypeDecorator):
    """timestamptz on PostgreSQL; values are always naive UTC in Python on both databases."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        value = to_naive_utc(value)
        if dialect.name == "postgresql":
            return value.replace(tzinfo=timezone.utc)
        return value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return to_naive_utc(value)


class Base(DeclarativeBase):
    pass


def _make_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        kwargs: dict = {"connect_args": {"check_same_thread": False}}
        if ":memory:" in url or url in {"sqlite://", "sqlite:///"}:
            kwargs["poolclass"] = StaticPool
        eng = create_engine(url, **kwargs)

        @event.listens_for(eng, "connect")
        def _sqlite_pragmas(dbapi_connection, _record):  # pragma: no cover - driver hook
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.close()

        return eng
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
        connect_args={"connect_timeout": 5, "options": "-c timezone=utc"},
    )


def _build_engine() -> tuple[Engine, str]:
    settings = get_settings()
    url = settings.database_url
    if url.startswith("sqlite"):
        return _make_engine(url), url
    try:
        eng = _make_engine(url)
        with eng.connect() as conn:
            conn.execute(text("select 1"))
        logger.info("Connected to PostgreSQL / Supabase.")
        return eng, url
    except Exception as exc:  # pragma: no cover - depends on external database
        if not settings.db_fallback_to_sqlite:
            raise
        logger.warning("PostgreSQL unavailable (%s); falling back to local SQLite demo database.", exc)
        return _make_engine(settings.sqlite_url), settings.sqlite_url


engine, ACTIVE_DATABASE_URL = _build_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request, rolled back on error, always closed."""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# Bump when a model change is not something create_all() can add to an existing SQLite file (new columns,
# changed CHECK constraints, new unique indexes). PostgreSQL / Supabase is upgraded by supabase/migrations.
SQLITE_SCHEMA_VERSION = 3


def _refresh_outdated_sqlite_demo_db() -> None:
    """Local demo databases only: a file created by an older build is backed up, then rebuilt.

    SQLite cannot alter CHECK constraints or add NOT NULL columns in place, and the demo file only holds
    seeded sample data, so the old file is copied to "<name>.bak-v<old version>" and its tables are
    recreated. Outside demo mode nothing is dropped: startup stops with an explanation instead.
    """
    from sqlalchemy import inspect

    with engine.connect() as conn:
        version = int(conn.execute(text("PRAGMA user_version")).scalar() or 0)
        has_tables = bool(inspect(conn).get_table_names())
        if not has_tables or version == SQLITE_SCHEMA_VERSION:
            return
        if not get_settings().demo_mode:
            raise RuntimeError(
                f"The SQLite database uses schema version {version}, this build needs {SQLITE_SCHEMA_VERSION}. "
                "Back it up and delete it, or use PostgreSQL with supabase/migrations."
            )
        path = engine.url.database
        if path and path != ":memory:":
            import shutil

            conn.execute(text("PRAGMA wal_checkpoint(TRUNCATE)"))
            backup = f"{path}.bak-v{version}"
            shutil.copy2(path, backup)
            logger.warning("Demo database schema v%s is outdated (need v%s). Backed up to %s and rebuilt.", version, SQLITE_SCHEMA_VERSION, backup)
    Base.metadata.drop_all(bind=engine)


def create_all() -> None:
    from app.models import entities  # noqa: F401  (register mappers)

    sqlite = database_kind() == "sqlite"
    if sqlite:
        _refresh_outdated_sqlite_demo_db()
    Base.metadata.create_all(bind=engine)
    if sqlite:
        with engine.begin() as conn:
            conn.execute(text(f"PRAGMA user_version = {SQLITE_SCHEMA_VERSION}"))


def database_kind() -> str:
    return "postgresql" if ACTIVE_DATABASE_URL.startswith("postgresql") else "sqlite"
