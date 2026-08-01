"""Add affiliation (startup / what they're building) to notes and comments.

Nullable so existing rows stay valid; the API requires it for new posts.

Revision ID: 0005_affiliation
Revises: 0004_comments_and_likes
Create Date: 2026-08-01
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_affiliation"
down_revision: str | None = "0004_comments_and_likes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("notes", sa.Column("affiliation", sa.String(length=120), nullable=True))
    op.add_column("comments", sa.Column("affiliation", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("comments", "affiliation")
    op.drop_column("notes", "affiliation")
