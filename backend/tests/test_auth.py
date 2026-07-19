"""Authentication flow tests."""

from __future__ import annotations

from httpx import AsyncClient

from tests.conftest import auth_header, authenticate


async def test_google_login_issues_tokens(client: AsyncClient) -> None:
    tokens = await authenticate(client)
    assert tokens["access_token"]
    assert tokens["refresh_token"]
    assert tokens["token_type"] == "bearer"
    assert tokens["expires_in"] > 0


async def test_login_is_idempotent_per_founder(client: AsyncClient) -> None:
    first = await authenticate(client, sub="s1", email="a@example.com")
    second = await authenticate(client, sub="s1", email="a@example.com")
    me1 = await client.get("/auth/me", headers=auth_header(first))
    me2 = await client.get("/auth/me", headers=auth_header(second))
    assert me1.json()["id"] == me2.json()["id"]


async def test_me_requires_auth(client: AsyncClient) -> None:
    assert (await client.get("/auth/me")).status_code == 401


async def test_me_returns_profile(client: AsyncClient) -> None:
    tokens = await authenticate(client, email="ada@example.com")
    response = await client.get("/auth/me", headers=auth_header(tokens))
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "ada@example.com"
    assert body["handle"].startswith("founder-")
    assert body["is_moderator"] is False


async def test_refresh_rotates_and_revokes_old(client: AsyncClient) -> None:
    tokens = await authenticate(client)
    refreshed = await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 200
    new_tokens = refreshed.json()
    assert new_tokens["refresh_token"] != tokens["refresh_token"]

    # The original refresh token must no longer be usable (rotation).
    reused = await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert reused.status_code == 401


async def test_logout_revokes_refresh(client: AsyncClient) -> None:
    tokens = await authenticate(client)
    logout = await client.post("/auth/logout", json={"refresh_token": tokens["refresh_token"]})
    assert logout.status_code == 200
    assert logout.json() == {"success": True}
    reused = await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert reused.status_code == 401


async def test_invalid_credential_rejected(client: AsyncClient) -> None:
    response = await client.post("/auth/google", json={"credential": "not-a-jwt"})
    assert response.status_code == 401


async def test_bad_bearer_rejected(client: AsyncClient) -> None:
    response = await client.get("/auth/me", headers={"Authorization": "Bearer garbage"})
    assert response.status_code == 401
