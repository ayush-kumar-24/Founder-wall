"""Founder Wall application factory and ASGI entrypoint."""

from __future__ import annotations

import contextlib
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.analytics.router import router as analytics_router
from app.auth.router import router as auth_router
from app.moderation.router import router as moderation_router
from app.realtime.router import router as realtime_router
from app.shared.config import Settings, get_settings
from app.shared.container import Container
from app.shared.exceptions import (
    AppError,
    app_error_handler,
    unhandled_error_handler,
)
from app.shared.health import router as health_router
from app.shared.logging import configure_logging, get_logger
from app.shared.middleware import RequestContextMiddleware
from app.stats.router import router as stats_router
from app.wall.router import router as wall_router

logger = get_logger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build and configure the FastAPI application."""
    settings = settings or get_settings()
    configure_logging(settings)

    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # A container may be preset (e.g. by tests injecting fakes); if so we
        # neither recreate nor tear it down here.
        preset = getattr(app.state, "container", None)
        container = preset or Container(settings)
        app.state.container = container
        await container.event_bus.start()
        logger.info(
            "application_started",
            environment=settings.environment,
            version=__version__,
        )
        try:
            yield
        finally:
            if preset is None:
                await container.shutdown()
            logger.info("application_stopped")

    docs_enabled = settings.enable_docs and not settings.is_production
    app = FastAPI(
        title=settings.project_name,
        version=__version__,
        lifespan=lifespan,
        docs_url="/docs" if docs_enabled else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )

    # Order matters: CORS is added last so it wraps outermost (runs first).
    app.add_middleware(RequestContextMiddleware, trust_proxy=settings.trust_proxy_headers)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )

    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_error_handler)

    api = settings.api_prefix
    app.include_router(health_router, prefix=api)
    app.include_router(auth_router, prefix=api)
    app.include_router(wall_router, prefix=api)
    app.include_router(moderation_router, prefix=api)
    app.include_router(stats_router, prefix=api)
    app.include_router(analytics_router, prefix=api)
    app.include_router(realtime_router, prefix=api)

    return app


app = create_app()
