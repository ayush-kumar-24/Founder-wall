"""Analytics overview tests."""

from __future__ import annotations

from httpx import AsyncClient

from app.shared.container import Container
from tests.conftest import auth_header, authenticate, promote_to_moderator


async def test_overview_requires_moderator(client: AsyncClient) -> None:
    tokens = await authenticate(client)
    response = await client.get("/analytics/overview", headers=auth_header(tokens))
    assert response.status_code == 403


async def test_overview_counts_events(client: AsyncClient, container: Container) -> None:
    tokens = await authenticate(client, email="mod@example.com")
    # Generate an event on the stream.
    await client.post("/wall/notes", headers=auth_header(tokens), json={"content": "an event"})
    await promote_to_moderator(container, "mod@example.com")
    tokens = await authenticate(client, email="mod@example.com")

    response = await client.get("/analytics/overview", headers=auth_header(tokens))
    assert response.status_code == 200
    body = response.json()
    assert body["stream_length"] >= 1
    assert "note.created" in body["event_counts"]
