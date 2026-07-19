"""Structured, production-grade logging configuration."""

from __future__ import annotations

import logging
import sys
from typing import cast

import structlog

from app.shared.config import Settings


def configure_logging(settings: Settings) -> None:
    """Configure structlog + stdlib logging for the whole process.

    JSON output in production (machine-parseable), pretty console locally.
    """
    level = getattr(logging, settings.log_level, logging.INFO)

    timestamper = structlog.processors.TimeStamper(fmt="iso", utc=True)
    shared_processors: list[structlog.typing.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        timestamper,
    ]

    if settings.log_json:
        renderer: structlog.typing.Processor = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[*shared_processors, structlog.processors.format_exc_info, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )

    # Route stdlib logging (uvicorn, sqlalchemy) through the same sink.
    handler = logging.StreamHandler(sys.stdout)
    logging.basicConfig(handlers=[handler], level=level, force=True)

    # SQLAlchemy treats "engine logger at INFO" as echo=True and will log every
    # statement *and its bound parameters* — unbounded log volume plus user
    # content leaking into logs. Keep it quiet unless db_echo is explicitly on.
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if settings.db_echo else logging.WARNING
    )
    # RequestContextMiddleware emits structured access logs with correlation
    # ids, so uvicorn's own access log would only duplicate them.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(max(level, logging.INFO))


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """Return a bound structlog logger."""
    return cast(structlog.stdlib.BoundLogger, structlog.get_logger(name))
