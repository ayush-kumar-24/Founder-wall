"""Stats snapshot tests."""

from __future__ import annotations

from httpx import AsyncClient

from tests.conftest import auth_header, authenticate


async def test_stats_start_empty(client: AsyncClient) -> None:
    response = await client.get("/stats")
    assert response.status_code == 200
    body = response.json()
    assert body["founders"] == 0
    assert body["active_notes"] == 0
    assert body["wall_capacity"] == 40 * 25


async def test_stats_track_activity(client: AsyncClient) -> None:
    tokens = await authenticate(client)
    await client.post("/wall/notes", headers=auth_header(tokens), json={"content": "a thought"})
    response = await client.get("/stats")
    body = response.json()
    assert body["founders"] == 1
    assert body["active_notes"] == 1
    assert body["thoughts"] >= 1
