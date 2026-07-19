"""Security regression tests: token handling, config guards, error leakage."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.shared.config import Settings
from tests.conftest import auth_header, authenticate


async def test_refresh_rotates_and_old_token_is_rejected(client) -> None:
    tokens = await authenticate(client, sub="rot-sub", email="rot@example.com")

    first = await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert first.status_code == 200
    rotated = first.json()
    assert rotated["refresh_token"] != tokens["refresh_token"]

    # The original token is now rotated out and must not work again.
    replay = await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert replay.status_code == 401


async def test_replaying_a_rotated_token_kills_the_whole_family(client) -> None:
    """Replay is treated as theft: every session for the account is revoked."""
    tokens = await authenticate(client, sub="theft-sub", email="theft@example.com")

    stolen = tokens["refresh_token"]
    legitimate = (await client.post("/auth/refresh", json={"refresh_token": stolen})).json()[
        "refresh_token"
    ]

    # Attacker replays the stolen (already rotated) token.
    replay = await client.post("/auth/refresh", json={"refresh_token": stolen})
    assert replay.status_code == 401

    # The victim's still-current token must ALSO be dead — otherwise an
    # attacker who replays could keep a live session alongside the owner.
    victim = await client.post("/auth/refresh", json={"refresh_token": legitimate})
    assert victim.status_code == 401


async def test_access_token_is_not_accepted_as_refresh_token(client) -> None:
    tokens = await authenticate(client, sub="mix-sub", email="mix@example.com")
    response = await client.post("/auth/refresh", json={"refresh_token": tokens["access_token"]})
    assert response.status_code == 401


async def test_refresh_token_is_not_accepted_as_access_token(client) -> None:
    tokens = await authenticate(client, sub="mix2-sub", email="mix2@example.com")
    response = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {tokens['refresh_token']}"}
    )
    assert response.status_code == 401


async def test_token_signed_with_another_secret_is_rejected(client) -> None:
    from jose import jwt

    forged = jwt.encode(
        {"sub": "00000000-0000-0000-0000-000000000001", "type": "access", "exp": 9999999999},
        "attacker-secret",
        algorithm="HS256",
    )
    response = await client.get("/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert response.status_code == 401


async def test_unauthenticated_write_is_rejected(client) -> None:
    response = await client.post("/wall/notes", json={"content": "anonymous"})
    assert response.status_code in (401, 403)


async def test_founder_cannot_delete_another_founders_note(client) -> None:
    owner = await authenticate(client, sub="owner-sub", email="owner@example.com")
    created = await client.post("/wall/notes", json={"content": "mine"}, headers=auth_header(owner))
    assert created.status_code == 201
    note_id = created.json()["id"]

    intruder = await authenticate(client, sub="intruder-sub", email="intruder@example.com")
    response = await client.delete(f"/wall/notes/{note_id}", headers=auth_header(intruder))
    assert response.status_code in (403, 404)


async def test_non_moderator_cannot_read_moderation_queue(client) -> None:
    tokens = await authenticate(client, sub="plain-sub", email="plain@example.com")
    response = await client.get("/moderation/queue", headers=auth_header(tokens))
    assert response.status_code == 403


async def test_moderation_queue_requires_authentication(client) -> None:
    response = await client.get("/moderation/queue")
    assert response.status_code in (401, 403)


def test_production_rejects_default_jwt_secret() -> None:
    """A weak secret must crash the process, not silently ship."""
    with pytest.raises(ValidationError, match="JWT_SECRET"):
        Settings(
            environment="production",
            jwt_secret="change-me-in-production-please-use-a-long-random-string",
        )


def test_production_rejects_short_jwt_secret() -> None:
    with pytest.raises(ValidationError, match="JWT_SECRET"):
        Settings(environment="production", jwt_secret="tooshort")


def test_production_rejects_every_secret_shipped_in_the_repo() -> None:
    """A long secret is not a safe secret if the repo published it.

    Length checks alone would wave through any value copied out of
    .env.example — which every reader of the repository already has.
    """
    from app.shared.config import _INSECURE_JWT_SECRETS

    for burned in _INSECURE_JWT_SECRETS:
        with pytest.raises(ValidationError, match="JWT_SECRET"):
            Settings(environment="production", jwt_secret=burned)


def test_env_example_contains_no_usable_secret() -> None:
    """.env.example is committed, so its JWT_SECRET must be a dead placeholder.

    This deliberately fails rather than skips when the file is missing: the
    README instructs `cp .env.example .env`, so a missing template breaks the
    documented setup path — and a skipped security test is false confidence.
    """
    from pathlib import Path

    from app.shared.config import _INSECURE_JWT_SECRETS

    example = Path(__file__).resolve().parents[1] / ".env.example"
    assert example.exists(), ".env.example is missing, but README documents `cp .env.example .env`."

    for line in example.read_text(encoding="utf-8").splitlines():
        if line.startswith("JWT_SECRET="):
            value = line.split("=", 1)[1].strip()
            assert value in _INSECURE_JWT_SECRETS, (
                "'.env.example' ships a JWT_SECRET that production would accept. "
                "A committed secret is a public secret; use a placeholder."
            )
            break
    else:  # pragma: no cover
        pytest.fail("JWT_SECRET missing from .env.example")


def test_production_rejects_insecure_google_tokens() -> None:
    with pytest.raises(ValidationError, match="GOOGLE_ALLOW_INSECURE_TOKENS"):
        Settings(
            environment="production",
            jwt_secret="a" * 48,
            google_allow_insecure_tokens=True,
        )


def test_production_accepts_a_sound_configuration() -> None:
    settings = Settings(
        environment="production",
        jwt_secret="x" * 48,
        cors_origins="https://founderwall.example",
    )
    assert settings.is_production
    assert settings.cors_allow_credentials is True


def test_wildcard_origin_disables_credentials() -> None:
    """Wildcard + credentials is rejected by browsers and unsafe; never emit it."""
    assert Settings(cors_origins="*").cors_allow_credentials is False


def _request(headers: dict[str, str], peer: str = "10.0.0.1"):
    from starlette.requests import Request

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": (peer, 1234),
        "scheme": "http",
        "server": ("test", 80),
        "query_string": b"",
    }
    return Request(scope)


def test_client_ip_uses_forwarded_header_behind_a_proxy() -> None:
    """Behind Nginx the socket peer is the proxy; XFF is the real client."""
    from app.shared.middleware import resolve_client_ip

    request = _request({"X-Forwarded-For": "203.0.113.9"})
    assert resolve_client_ip(request, trust_proxy=True) == "203.0.113.9"


def test_client_ip_ignores_forwarded_header_when_not_behind_a_proxy() -> None:
    """Exposed directly, a client could forge XFF to evade rate limiting.

    Nginx is configured to *replace* X-Forwarded-For with $remote_addr, so the
    left-most entry is authoritative there. This setting is the second line of
    defence for any deployment that is not behind that proxy.
    """
    from app.shared.middleware import resolve_client_ip

    request = _request({"X-Forwarded-For": "1.2.3.4"}, peer="10.0.0.1")
    assert resolve_client_ip(request, trust_proxy=False) == "10.0.0.1"


def test_client_ip_falls_back_to_socket_peer() -> None:
    from app.shared.middleware import resolve_client_ip

    assert resolve_client_ip(_request({}), trust_proxy=True) == "10.0.0.1"


async def test_rate_limiter_blocks_a_flood(container) -> None:
    """The limiter must actually stop a client, and always set a TTL."""
    from app.shared.exceptions import RateLimitError
    from app.shared.rate_limit import RateLimiter

    limiter = RateLimiter(container.redis.client, enabled=True)
    for _ in range(5):
        await limiter.hit("flood-key", limit=5, window_seconds=60)
    with pytest.raises(RateLimitError):
        await limiter.hit("flood-key", limit=5, window_seconds=60)

    # A counter without an expiry would lock the client out permanently.
    ttl = await container.redis.client.ttl("ratelimit:flood-key:60")
    assert 0 < ttl <= 60


async def test_rate_limiter_isolates_clients(container) -> None:
    from app.shared.rate_limit import RateLimiter

    limiter = RateLimiter(container.redis.client, enabled=True)
    await limiter.hit("client-a", limit=1, window_seconds=60)
    # A different key must have its own budget.
    assert await limiter.hit("client-b", limit=1, window_seconds=60) == 1


async def test_unhandled_errors_do_not_leak_internals(settings, container, monkeypatch) -> None:
    """A crash must return a correlated, opaque 500 — never a stack trace."""
    from httpx import ASGITransport, AsyncClient

    from app.main import create_app
    from app.stats import service as stats_service

    async def boom(self) -> None:
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr(stats_service.StatsService, "snapshot", boom)

    application = create_app(settings)
    application.state.container = container
    # raise_app_exceptions=False so we observe the response a real client gets
    # rather than the re-raise Starlette performs for server-side logging.
    transport = ASGITransport(app=application, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        response = await http.get("/stats")

    assert response.status_code == 500
    body = response.json()
    assert body["error"]["code"] == "internal_error"
    assert "secret internal detail" not in response.text
    assert "Traceback" not in response.text
    assert body["error"]["request_id"]
