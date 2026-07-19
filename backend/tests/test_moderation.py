"""Moderation queue tests."""

from __future__ import annotations

from httpx import AsyncClient

from app.shared.container import Container
from tests.conftest import auth_header, authenticate, promote_to_moderator


async def test_report_and_remove_flow(client: AsyncClient, container: Container) -> None:
    # A founder posts a note.
    author = await authenticate(client, sub="author", email="author@example.com")
    note = (
        await client.post(
            "/wall/notes", headers=auth_header(author), json={"content": "spammy note"}
        )
    ).json()

    # Another founder reports it.
    reporter = await authenticate(client, sub="reporter", email="reporter@example.com")
    report = await client.post(
        f"/moderation/notes/{note['id']}/report",
        headers=auth_header(reporter),
        json={"reason": "spam", "detail": "looks like spam"},
    )
    assert report.status_code == 201
    report_id = report.json()["id"]

    # Duplicate report from the same reporter is rejected.
    dup = await client.post(
        f"/moderation/notes/{note['id']}/report",
        headers=auth_header(reporter),
        json={"reason": "spam"},
    )
    assert dup.status_code == 409

    # A non-moderator cannot see the queue.
    forbidden = await client.get("/moderation/queue", headers=auth_header(reporter))
    assert forbidden.status_code == 403

    # Promote the reporter and resolve by removing the note.
    await promote_to_moderator(container, "reporter@example.com")
    moderator = await authenticate(client, sub="reporter", email="reporter@example.com")

    queue = await client.get("/moderation/queue", headers=auth_header(moderator))
    assert queue.status_code == 200
    assert len(queue.json()) == 1

    resolve = await client.post(
        f"/moderation/reports/{report_id}/resolve",
        headers=auth_header(moderator),
        json={"action": "remove", "note": "policy violation"},
    )
    assert resolve.status_code == 200

    # The note is gone from its tile.
    tile = await client.get(f"/wall/tiles/{note['tile_id']}")
    assert all(n["id"] != note["id"] for n in tile.json()["notes"])

    # Queue is now empty.
    queue_after = await client.get("/moderation/queue", headers=auth_header(moderator))
    assert queue_after.json() == []


async def test_report_missing_note(client: AsyncClient) -> None:
    reporter = await authenticate(client)
    response = await client.post(
        "/moderation/notes/00000000-0000-0000-0000-000000000000/report",
        headers=auth_header(reporter),
        json={"reason": "abuse"},
    )
    assert response.status_code == 404
