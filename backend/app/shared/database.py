"""Async SQLAlchemy engine, session factory, and declarative base."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import DateTime, Enum, MetaData, func
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.shared.config import Settings

# A consistent naming convention keeps Alembic autogenerate deterministic.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Declarative base shared by every module's models."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def value_enum(enum_cls: type[PyEnum], *, length: int = 16) -> Enum:
    """A VARCHAR-backed enum that persists member *values*, not names.

    SQLAlchemy's default is to store ``member.name`` (e.g. ``'ACTIVE'``). That
    silently diverges from the lowercase values used on the wire and, worse,
    breaks any SQL predicate written against the value — a partial index of
    ``WHERE status = 'active'`` would match nothing and enforce nothing.
    Storing values keeps the database, the API, and our indexes in agreement.
    """
    return Enum(
        enum_cls,
        native_enum=False,
        length=length,
        values_callable=lambda enum: [str(member.value) for member in enum],
    )


class TimestampMixin:
    """Adds created_at / updated_at columns maintained by the database."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


def create_engine(settings: Settings) -> AsyncEngine:
    """Build the async engine with connection pooling.

    SQLite (used in tests) does not accept pool sizing kwargs, so they are
    only applied for real network databases.
    """
    url = str(settings.database_url)
    kwargs: dict[str, object] = {"echo": settings.db_echo, "future": True}
    if not url.startswith("sqlite"):
        kwargs.update(
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_timeout=settings.db_pool_timeout,
            # Recycle before typical proxy/LB idle cutoffs so we never hand out
            # a connection the server has silently closed.
            pool_recycle=settings.db_pool_recycle_seconds,
            pool_pre_ping=True,
            connect_args={
                "timeout": settings.db_connect_timeout,
                "command_timeout": settings.db_command_timeout,
                # asyncpg caches prepared statements per connection, which
                # breaks behind transaction-pooling proxies (PgBouncer).
                "statement_cache_size": settings.db_statement_cache_size,
                "server_settings": {"application_name": "founder-wall-api"},
            },
        )
    return create_async_engine(url, **kwargs)


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Build the session factory bound to the given engine."""
    return async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )


class Database:
    """Owns the engine and session factory for the application lifetime."""

    def __init__(self, settings: Settings) -> None:
        self._engine = create_engine(settings)
        self._session_factory = create_session_factory(self._engine)

    @property
    def engine(self) -> AsyncEngine:
        return self._engine

    async def session(self) -> AsyncGenerator[AsyncSession, None]:
        """Yield a session with commit-on-success / rollback-on-error semantics."""
        async with self._session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def dispose(self) -> None:
        await self._engine.dispose()
