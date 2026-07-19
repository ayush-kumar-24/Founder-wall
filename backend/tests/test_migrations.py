"""Migration integrity: the migrated schema must equal the model schema.

Tests build their schema with ``create_all`` while production runs Alembic.
If those two ever disagree, the suite stays green and production breaks. This
module closes that gap by migrating a real database and diffing it against the
ORM metadata.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect

import app.models  # noqa: F401 - registers every model on Base.metadata
from app.shared.database import Base

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _migrate(db_path: Path) -> None:
    """Run ``alembic upgrade head`` against a throwaway SQLite database."""
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_ROOT,
        env={
            **os.environ,
            "DATABASE_URL": f"sqlite+aiosqlite:///{db_path.as_posix()}",
            "ENVIRONMENT": "test",
            "JWT_SECRET": "test-secret-value-please-change",
        },
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        pytest.fail(f"alembic upgrade head failed:\n{result.stdout}\n{result.stderr}")


@pytest.fixture
def migrated_db(tmp_path: Path) -> Path:
    db_path = tmp_path / "migrated.db"
    _migrate(db_path)
    return db_path


def test_migration_runs_cleanly(migrated_db: Path) -> None:
    engine = create_engine(f"sqlite:///{migrated_db}")
    try:
        tables = set(inspect(engine).get_table_names())
    finally:
        engine.dispose()
    assert {"users", "refresh_tokens", "notes", "moderation_reports"} <= tables
    assert "alembic_version" in tables


def test_migrated_schema_matches_models(migrated_db: Path) -> None:
    """Alembic head and the ORM metadata must describe the same database."""
    engine = create_engine(f"sqlite:///{migrated_db}")
    try:
        with engine.connect() as connection:
            context = MigrationContext.configure(connection)
            diff = compare_metadata(context, Base.metadata)
    finally:
        engine.dispose()
    assert diff == [], f"migration/model drift detected: {diff}"


def test_one_active_note_index_survives_migration(migrated_db: Path) -> None:
    """The invariant guarding the create race must exist in a migrated DB.

    A partial index whose predicate does not match the persisted enum value
    would be silently inert, so assert the predicate too.
    """
    engine = create_engine(f"sqlite:///{migrated_db}")
    try:
        with engine.connect() as connection:
            rows = connection.exec_driver_sql(
                "SELECT sql FROM sqlite_master "
                "WHERE type='index' AND name='uq_notes_active_per_user'"
            ).fetchall()
    finally:
        engine.dispose()

    assert rows, "uq_notes_active_per_user missing from migrated schema"
    ddl = rows[0][0].lower()
    assert "unique" in ddl
    assert "where status = 'active'" in ddl
