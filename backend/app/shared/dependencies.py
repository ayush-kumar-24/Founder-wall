"""Request-scoped dependency providers resolving against the Container."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends, Request, WebSocket
from fastapi.params import Depends as DependsMarker
from sqlalchemy.ext.asyncio import AsyncSession

from app.realtime.pubsub import EventBus
from app.shared.config import Settings
from app.shared.container import Container
from app.shared.rate_limit import RateLimiter
from app.shared.security import TokenService


def get_container(request: Request) -> Container:
    return request.app.state.container  # type: ignore[no-any-return]


def get_container_ws(websocket: WebSocket) -> Container:
    return websocket.app.state.container  # type: ignore[no-any-return]


def get_settings(container: Annotated[Container, Depends(get_container)]) -> Settings:
    return container.settings


async def get_session(
    container: Annotated[Container, Depends(get_container)],
) -> AsyncGenerator[AsyncSession, None]:
    async for session in container.database.session():
        yield session


def get_token_service(
    container: Annotated[Container, Depends(get_container)],
) -> TokenService:
    return container.token_service


def get_event_bus(container: Annotated[Container, Depends(get_container)]) -> EventBus:
    return container.event_bus


def get_rate_limiter(
    container: Annotated[Container, Depends(get_container)],
) -> RateLimiter:
    return container.rate_limiter


SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
TokenServiceDep = Annotated[TokenService, Depends(get_token_service)]
EventBusDep = Annotated[EventBus, Depends(get_event_bus)]
RateLimiterDep = Annotated[RateLimiter, Depends(get_rate_limiter)]


def rate_limit(*, per_minute: int) -> DependsMarker:
    """Build a dependency enforcing ``per_minute`` requests per client IP."""

    async def _dependency(
        request: Request,
        limiter: RateLimiterDep,
    ) -> None:
        # request.state.client_ip is set by RequestContextMiddleware and is
        # proxy-aware; fall back to the socket peer if the middleware is absent.
        client = getattr(request.state, "client_ip", None) or (
            request.client.host if request.client else "anonymous"
        )
        route = request.scope.get("route")
        path = getattr(route, "path", request.url.path)
        await limiter.hit(f"{request.method}:{path}:{client}", limit=per_minute)

    marker: DependsMarker = Depends(_dependency)
    return marker
