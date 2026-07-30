"""Open the wall: anonymous posting, unlimited notes, token deletion.

- notes.user_id becomes nullable (posting needs no account).
- Drop the "one active note per user" partial unique index (unlimited notes).
- Add notes.delete_token (secret returned once to the creator so their browser
  can remove its own note without an account).

Revision ID: 0003_open_wall
Revises: 0002_note_author_name
Create Date: 2026-07-26
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_open_wall"
down_revision: str | None = "0002_note_author_name"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "notes",
        sa.Column("delete_token", sa.String(length=64), nullable=True),
    )
    op.drop_index("uq_notes_active_per_user", table_name="notes")
    op.alter_column("notes", "user_id", existing_type=sa.Uuid(), nullable=True)


def downgrade() -> None:
    op.alter_column("notes", "user_id", existing_type=sa.Uuid(), nullable=False)
    op.create_index(
        "uq_notes_active_per_user",
        "notes",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )
    op.drop_column("notes", "delete_token")
