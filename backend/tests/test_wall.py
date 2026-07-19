"""Wall note CRUD, placement, and tile tests."""

from __future__ import annotations

from httpx import AsyncClient

from tests.conftest import auth_header, authenticate


async def test_manifest_shape(client: AsyncClient) -> None:
    response = await client.get("/wall/manifest")
    assert response.status_code == 200
    body = response.json()
    assert body["columns"] == 40
    assert body["rows"] == 25
    assert body["total_tiles"] == len(body["tiles"])
    assert body["total_notes"] == 0


async def test_create_note_places_it(client: AsyncClient) -> None:
    tokens = await authenticate(client)
    response = await client.post(
        "/wall/notes",
        headers=auth_header(tokens),
        json={"content": "Build in public.", "color": "sky"},
    )
    assert response.status_code == 201, response.text
    note = response.json()
    assert 0 <= note["x"] < 40
    assert 0 <= note["y"] < 25
    assert note["tile_id"] >= 0
    assert note["content"] == "Build in public."


async def test_one_active_note_per_founder(client: AsyncClient) -> None:
    tokens = await authenticate(client)
    first = await client.post("/wall/notes", headers=auth_header(tokens), json={"content": "First"})
    assert first.status_code == 201
    second = await client.post(
        "/wall/notes", headers=auth_header(tokens), json={"content": "Second"}
    )
    assert second.status_code == 409


async def test_note_appears_in_tile(client: AsyncClient) -> None:
    tokens = await authenticate(client)
    created = (
        await client.post(
            "/wall/notes", headers=auth_header(tokens), json={"content": "hello wall"}
        )
    ).json()
    tile = await client.get(f"/wall/tiles/{created['tile_id']}")
    assert tile.status_code == 200
    contents = [n["content"] for n in tile.json()["notes"]]
    assert "hello wall" in contents


async def test_update_and_delete_note(client: AsyncClient) -> None:
    tokens = await authenticate(client)
    note = (
        await client.post("/wall/notes", headers=auth_header(tokens), json={"content": "draft"})
    ).json()

    updated = await client.patch(
        f"/wall/notes/{note['id']}",
        headers=auth_header(tokens),
        json={"content": "final", "color": "rose"},
    )
    assert updated.status_code == 200
    assert updated.json()["content"] == "final"
    assert updated.json()["color"] == "rose"

    deleted = await client.delete(f"/wall/notes/{note['id']}", headers=auth_header(tokens))
    assert deleted.status_code == 200
    assert deleted.json() == {"success": True}

    # After deletion the founder can place a fresh note.
    again = await client.post(
        "/wall/notes", headers=auth_header(tokens), json={"content": "reborn"}
    )
    assert again.status_code == 201


async def test_cannot_edit_someone_elses_note(client: AsyncClient) -> None:
    owner = await authenticate(client, sub="owner", email="owner@example.com")
    note = (
        await client.post("/wall/notes", headers=auth_header(owner), json={"content": "mine"})
    ).json()

    intruder = await authenticate(client, sub="intruder", email="intruder@example.com")
    response = await client.patch(
        f"/wall/notes/{note['id']}",
        headers=auth_header(intruder),
        json={"content": "hacked"},
    )
    assert response.status_code == 404


async def test_content_policy_rejects_banned_terms(client: AsyncClient) -> None:
    tokens = await authenticate(client)
    response = await client.post(
        "/wall/notes", headers=auth_header(tokens), json={"content": "please kys"}
    )
    assert response.status_code == 422


async def test_blank_note_rejected(client: AsyncClient) -> None:
    tokens = await authenticate(client)
    response = await client.post(
        "/wall/notes", headers=auth_header(tokens), json={"content": "   "}
    )
    assert response.status_code == 422


async def test_tile_out_of_range(client: AsyncClient) -> None:
    response = await client.get("/wall/tiles/99999")
    assert response.status_code == 409


async def test_create_requires_auth(client: AsyncClient) -> None:
    response = await client.post("/wall/notes", json={"content": "anon"})
    assert response.status_code == 401
