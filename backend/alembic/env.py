"""Alembic environment — async engine driven by application settings."""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from app.models import Base  # noqa: F401 - ensures all models are registered
from app.shared.config import get_settings

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata
settings = get_settings()
DATABASE_URL = str(settings.database_url)


def run_migrations_offline() -> None:
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


# Arbitrary but stable key identifying "the Founder Wall schema migration".
_MIGRATION_LOCK_KEY = 8_421_337


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        render_as_batch=connection.dialect.name == "sqlite",
    )
    is_postgres = connection.dialect.name == "postgresql"
    if is_postgres:
        # Every replica runs `alembic upgrade head` on boot, so a rollout can
        # start N migrations at once. A session-level advisory lock serialises
        # them: the first proceeds, the rest block and then find no work to do.
        connection.exec_driver_sql(f"SELECT pg_advisory_lock({_MIGRATION_LOCK_KEY})")
    try:
        with context.begin_transaction():
            context.run_migrations()
    finally:
        if is_postgres:
            connection.exec_driver_sql(f"SELECT pg_advisory_unlock({_MIGRATION_LOCK_KEY})")


async def run_migrations_online() -> None:
    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
