"""Adversarial tests: races, constraint enforcement, and hostile input.

These exist to prove the invariants the wall depends on hold under
concurrency, not just on the happy path.
"""

from __future__ import annotations

import asyncio
import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app.shared.container import Container
from app.users.models import User
from app.wall.models import Note, NoteStatus
from tests.conftest import auth_header, authenticate


async def _seed_user(container: Container, *, sub: str) -> uuid.UUID:
    user_id = uuid.uuid4()
    async for session in container.database.session():
        session.add(
            User(
                id=user_id,
                google_sub=sub,
                email=f"{sub}@example.com",
                display_name="Founder",
                handle=f"founder-{sub}",
            )
        )
    return user_id


async def test_db_rejects_two_active_notes_for_one_founder(container: Container) -> None:
    """The partial unique index is the real guard against the create race.

    The service pre-check can always be lost by two concurrent requests; only
    the database can make "one active note per founder" an invariant.
    """
    user_id = await _seed_user(container, sub="race-sub")

    async for session in container.database.session():
        session.add(
            Note(user_id=user_id, content="first", status=NoteStatus.ACTIVE, x=0, y=0, tile_id=0)
        )

    with pytest.raises(IntegrityError):
        async for session in container.database.session():
            session.add(
                Note(
                    user_id=user_id,
                    content="second",
                    status=NoteStatus.ACTIVE,
                    x=1,
                    y=0,
                    tile_id=0,
                )
            )


async def test_removed_notes_do_not_trip_the_active_index(container: Container) -> None:
    """A founder may accumulate many removed notes — only 'active' is unique."""
    user_id = await _seed_user(container, sub="reuse-sub")

    async for session in container.database.session():
        for i in range(3):
            session.add(
                Note(
                    user_id=user_id,
                    content=f"removed {i}",
                    status=NoteStatus.REMOVED,
                    x=None,
                    y=None,
                    tile_id=None,
                )
            )
    # And an active one alongside them still inserts cleanly.
    async for session in container.database.session():
        session.add(
            Note(user_id=user_id, content="live", status=NoteStatus.ACTIVE, x=5, y=5, tile_id=0)
        )


async def test_cell_uniqueness_is_enforced(container: Container) -> None:
    """Two notes must never occupy the same cell."""
    first = await _seed_user(container, sub="cell-a")
    second = await _seed_user(container, sub="cell-b")

    async for session in container.database.session():
        session.add(Note(user_id=first, content="a", status=NoteStatus.ACTIVE, x=7, y=7, tile_id=0))

    with pytest.raises(IntegrityError):
        async for session in container.database.session():
            session.add(
                Note(user_id=second, content="b", status=NoteStatus.ACTIVE, x=7, y=7, tile_id=0)
            )


async def test_concurrent_create_yields_exactly_one_active_note(client, container) -> None:
    """Fire many creates at once; the wall must end with exactly one note."""
    tokens = await authenticate(client, sub="burst-sub", email="burst@example.com")
    headers = auth_header(tokens)

    responses = await asyncio.gather(
        *(
            client.post("/wall/notes", json={"content": f"thought {i}"}, headers=headers)
            for i in range(8)
        ),
        return_exceptions=True,
    )

    created = [r for r in responses if not isinstance(r, Exception) and r.status_code == 201]
    conflicted = [r for r in responses if not isinstance(r, Exception) and r.status_code == 409]

    assert len(created) == 1, "exactly one create may win"
    assert len(created) + len(conflicted) == 8, "losers must fail cleanly with 409, not 500"

    # And the manifest agrees: one founder, one note.
    manifest = await client.get("/wall/manifest")
    assert manifest.status_code == 200
    assert manifest.json()["total_notes"] == 1


async def test_concurrent_creates_by_different_founders_never_collide(client, container) -> None:
    """Distinct founders racing for cells must all be placed, each uniquely."""
    headers = []
    for i in range(6):
        tokens = await authenticate(client, sub=f"multi-{i}", email=f"multi{i}@example.com")
        headers.append(auth_header(tokens))

    responses = await asyncio.gather(
        *(
            client.post("/wall/notes", json={"content": f"note {i}"}, headers=h)
            for i, h in enumerate(headers)
        ),
        return_exceptions=True,
    )

    ok = [r for r in responses if not isinstance(r, Exception) and r.status_code == 201]
    assert len(ok) == 6, (
        f"all founders should be placed, got {[getattr(r, 'text', r) for r in responses]}"
    )

    cells = {(r.json()["x"], r.json()["y"]) for r in ok}
    assert len(cells) == 6, "every founder must occupy a distinct cell"


async def test_oversized_note_is_rejected_not_truncated(client) -> None:
    tokens = await authenticate(client, sub="big-sub", email="big@example.com")
    response = await client.post(
        "/wall/notes", json={"content": "x" * 5000}, headers=auth_header(tokens)
    )
    assert response.status_code == 422


async def test_blank_note_is_rejected(client) -> None:
    tokens = await authenticate(client, sub="blank-sub", email="blank@example.com")
    response = await client.post(
        "/wall/notes", json={"content": "   "}, headers=auth_header(tokens)
    )
    assert response.status_code == 422
