"""Add notes.author_name for opt-in identity reveal.

Nullable snapshot of the author's display name, set only when the founder
chooses to reveal their identity on a note. NULL means anonymous (the default),
so existing rows need no backfill.

Revision ID: 0002_note_author_name
Revises: 0001_initial
Create Date: 2026-07-26
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_note_author_name"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "notes",
        sa.Column("author_name", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("notes", "author_name")
