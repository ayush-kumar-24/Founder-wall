"""Application configuration, loaded once from the environment."""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, PostgresDsn, RedisDsn, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# Any secret that has appeared in this repository — as a committed default, in
# .env.example, or in docs — is public knowledge and must never sign real
# tokens, however long it looks. Length is not evidence of secrecy.
_INSECURE_JWT_SECRETS = frozenset(
    {
        # Shipped defaults / templates.
        "change-me-in-production-please-use-a-long-random-string",
        "change-me-please-use-a-long-random-string",
        "generate-your-own-do-not-use-this-value",
        "secret",
        "changeme",
        # Was briefly committed to .env.example: burned, permanently rejected.
        "V8J64w9eBPKevoctlancTEgnRdBTcTpcL_5yNWps-uTsQp0q5IC8IofnXhLtLwYvEiw0S54viB0Ws0PT9cvvxw",
    }
)


class Settings(BaseSettings):
    """Strongly-typed application settings sourced from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Runtime ---------------------------------------------------------
    environment: Literal["local", "test", "staging", "production"] = "local"
    debug: bool = False
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    log_json: bool = True

    # --- HTTP ------------------------------------------------------------
    project_name: str = "Founder Wall"
    api_prefix: str = ""
    # NoDecode: pydantic-settings JSON-decodes complex fields inside the env
    # source, which rejects a plain "*" or "a.com,b.com" before any validator
    # runs. Opt out of that and parse both forms ourselves below.
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["*"])
    # Expose interactive API docs. Disabled in production by default.
    enable_docs: bool = False
    # Trust X-Forwarded-For (only true when running behind a known proxy/LB).
    trust_proxy_headers: bool = True

    # --- Database --------------------------------------------------------
    database_url: PostgresDsn | str = "postgresql+asyncpg://founder:founder@db:5432/founderwall"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_timeout: int = 30
    db_pool_recycle_seconds: int = 1800
    db_connect_timeout: float = 5.0
    # Hard ceiling on any single statement; prevents a pathological query from
    # pinning a pooled connection indefinitely.
    db_command_timeout: float = 10.0
    # Set to 0 when running behind PgBouncer in transaction pooling mode.
    db_statement_cache_size: int = 100
    db_echo: bool = False

    # --- Redis -----------------------------------------------------------
    redis_url: RedisDsn | str = "redis://redis:6379/0"
    redis_socket_timeout: float = 2.0
    redis_connect_timeout: float = 2.0
    redis_max_connections: int = 50

    # --- Security / JWT --------------------------------------------------
    jwt_secret: str = "change-me-in-production-please-use-a-long-random-string"
    jwt_algorithm: str = "HS256"
    access_token_ttl_seconds: int = 60 * 15  # 15 minutes
    refresh_token_ttl_seconds: int = 60 * 60 * 24 * 30  # 30 days

    # --- Google OAuth ----------------------------------------------------
    google_client_id: str = ""
    google_client_secret: str = ""
    # When true, Google ID-token signature verification is skipped and tokens are
    # decoded without validation. ONLY for local/test where no real Google is wired.
    google_allow_insecure_tokens: bool = False

    # --- Wall geometry ---------------------------------------------------
    wall_columns: int = 40
    wall_rows: int = 25
    tile_size: int = 10  # cells per tile edge
    note_max_length: int = 280

    # --- Rate limiting ---------------------------------------------------
    rate_limit_enabled: bool = True
    rate_limit_default_per_minute: int = 120
    rate_limit_write_per_minute: int = 20

    # --- Realtime --------------------------------------------------------
    wall_events_channel: str = "founderwall:events"
    wall_events_stream: str = "founderwall:stream"
    wall_events_stream_maxlen: int = 10_000
    online_ttl_seconds: int = 30
    # Presence is re-broadcast at most once per this interval (coalesced).
    presence_broadcast_interval_seconds: int = 5
    # Per-process cap on simultaneous WebSocket connections (back-pressure guard).
    ws_max_connections: int = 10_000
    # Drop a WebSocket client if a single frame cannot be sent within this budget.
    ws_send_timeout_seconds: float = 5.0

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        """Accept a JSON array, a comma-separated list, or a bare origin."""
        if isinstance(value, str):
            raw = value.strip()
            if raw.startswith("["):
                parsed: object = json.loads(raw)
                return parsed
            return [item.strip() for item in raw.split(",") if item.strip()]
        return value

    @model_validator(mode="after")
    def _enforce_production_safety(self) -> Settings:
        """Fail fast on unsafe configuration in production.

        These guards convert silent misconfiguration into a loud startup crash,
        which is exactly what we want before serving real founders.
        """
        if self.environment != "production":
            return self

        problems: list[str] = []
        if self.jwt_secret in _INSECURE_JWT_SECRETS or len(self.jwt_secret) < 32:
            problems.append("JWT_SECRET must be a unique random value of >=32 chars")
        if self.google_allow_insecure_tokens:
            problems.append("GOOGLE_ALLOW_INSECURE_TOKENS must be false in production")
        if self.debug:
            problems.append("DEBUG must be false in production")
        if problems:
            raise ValueError(
                "Refusing to start in production with unsafe config: " + "; ".join(problems)
            )
        return self

    @property
    def cors_allow_credentials(self) -> bool:
        """Credentials cannot be combined with a wildcard origin (CORS spec)."""
        return "*" not in self.cors_origins

    @property
    def wall_total_cells(self) -> int:
        return self.wall_columns * self.wall_rows

    @property
    def tiles_across(self) -> int:
        return (self.wall_columns + self.tile_size - 1) // self.tile_size

    @property
    def tiles_down(self) -> int:
        return (self.wall_rows + self.tile_size - 1) // self.tile_size

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings singleton."""
    return Settings()
