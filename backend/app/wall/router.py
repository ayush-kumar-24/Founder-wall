"""Wall HTTP routes. Posting is open — no account required."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, status

from app.wall.dependencies import WallServiceDep
from app.wall.schemas import (
    NoteCreate,
    NoteCreated,
    NoteDelete,
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


@router.post(
    "/notes",
    response_model=NoteCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Pin a sticky note on the wall",
)
async def create_note(body: NoteCreate, service: WallServiceDep) -> NoteCreated:
    return await service.create_note(body)


@router.delete(
    "/notes/{note_id}",
    status_code=status.HTTP_200_OK,
    summary="Remove a note you posted (using its delete token)",
)
async def delete_note(
    note_id: uuid.UUID,
    body: NoteDelete,
    service: WallServiceDep,
) -> dict[str, bool]:
    await service.delete_note_by_token(note_id, body.token)
    return {"success": True}
