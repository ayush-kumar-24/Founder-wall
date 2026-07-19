"""Wall HTTP routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, status

from app.auth.dependencies import CurrentUser
from app.shared.dependencies import rate_limit
from app.wall.dependencies import WallServiceDep
from app.wall.schemas import (
    NoteCreate,
    NoteOwned,
    NotePublic,
    NoteUpdate,
    TileDetail,
    WallManifest,
)

router = APIRouter(prefix="/wall", tags=["wall"])


@router.get("/manifest", response_model=WallManifest, summary="Wall + tile layout")
async def manifest(service: WallServiceDep) -> WallManifest:
    return await service.get_manifest()


@router.get("/tiles/{tile_id}", response_model=TileDetail, summary="Notes within a tile")
async def tile(tile_id: int, service: WallServiceDep) -> TileDetail:
    return await service.get_tile(tile_id)


@router.get("/notes/me", response_model=NoteOwned | None, summary="Your active note")
async def my_note(user: CurrentUser, service: WallServiceDep) -> NoteOwned | None:
    return await service.get_my_note(user.id)


@router.post(
    "/notes",
    response_model=NotePublic,
    status_code=status.HTTP_201_CREATED,
    summary="Place your sticky note on the wall",
    dependencies=[rate_limit(per_minute=20)],
)
async def create_note(body: NoteCreate, user: CurrentUser, service: WallServiceDep) -> NotePublic:
    return await service.create_note(user.id, body)


@router.patch(
    "/notes/{note_id}",
    response_model=NoteOwned,
    summary="Edit your active note",
    dependencies=[rate_limit(per_minute=30)],
)
async def update_note(
    note_id: uuid.UUID,
    body: NoteUpdate,
    user: CurrentUser,
    service: WallServiceDep,
) -> NoteOwned:
    return await service.update_note(user.id, note_id, body)


@router.delete(
    "/notes/{note_id}",
    status_code=status.HTTP_200_OK,
    summary="Remove your active note",
)
async def delete_note(
    note_id: uuid.UUID,
    user: CurrentUser,
    service: WallServiceDep,
) -> dict[str, bool]:
    await service.delete_note(user.id, note_id)
    return {"success": True}
