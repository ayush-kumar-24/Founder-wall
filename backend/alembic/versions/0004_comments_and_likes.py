"""Comments and shared likes.

- notes.likes and notes.comment_count: public engagement counters (default 0).
- comments table: unlimited public comments per note, open to everyone.

Revision ID: 0004_comments_and_likes
Revises: 0003_open_wall
Create Date: 2026-07-30
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_comments_and_likes"
down_revision: str | None = "0003_open_wall"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_now = sa.text("now()")


def upgrade() -> None:
    op.add_column(
        "notes",
        sa.Column("likes", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "notes",
        sa.Column("comment_count", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "comments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("note_id", sa.Uuid(), nullable=False),
        sa.Column("content", sa.String(length=280), nullable=False),
        sa.Column("author_name", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=_now, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=_now, nullable=False),
        sa.ForeignKeyConstraint(
            ["note_id"], ["notes.id"], name="fk_comments_note_id_notes", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_comments"),
    )
    op.create_index("ix_comments_note_id", "comments", ["note_id"])
    op.create_index("ix_comments_note", "comments", ["note_id"])


def downgrade() -> None:
    op.drop_index("ix_comments_note", table_name="comments")
    op.drop_index("ix_comments_note_id", table_name="comments")
    op.drop_table("comments")
    op.drop_column("notes", "comment_count")
    op.drop_column("notes", "likes")
