"""Central import of every ORM model.

Importing this module ensures ``Base.metadata`` is fully populated, which
Alembic autogenerate and ``create_all`` (in tests) both rely on.
"""

from __future__ import annotations

from app.auth.models import RefreshToken
from app.moderation.models import ModerationReport
from app.shared.database import Base
from app.users.models import User
from app.wall.models import Note

__all__ = ["Base", "RefreshToken", "ModerationReport", "User", "Note"]
