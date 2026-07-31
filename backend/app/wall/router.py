"""Wall HTTP routes. Posting is open — no account required."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, status

from app.wall.dependencies import WallServiceDep
from app.wall.schemas import (
    CommentCreate,
    CommentPublic,
    LikeCount,
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


# — Comments (open, unlimited, visible to everyone) —
@router.get(
    "/notes/{note_id}/comments",
    response_model=list[CommentPublic],
    summary="Comments on a note",
)
async def list_comments(note_id: uuid.UUID, service: WallServiceDep) -> list[CommentPublic]:
    return await service.list_comments(note_id)


@router.post(
    "/notes/{note_id}/comments",
    response_model=CommentPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Comment on a note",
)
async def add_comment(
    note_id: uuid.UUID, body: CommentCreate, service: WallServiceDep
) -> CommentPublic:
    return await service.add_comment(note_id, body)


# — Likes (shared tally, visible to everyone) —
@router.post("/notes/{note_id}/like", response_model=LikeCount, summary="Like a note")
async def like_note(note_id: uuid.UUID, service: WallServiceDep) -> LikeCount:
    return await service.set_like(note_id, 1)


@router.delete("/notes/{note_id}/like", response_model=LikeCount, summary="Remove a like")
async def unlike_note(note_id: uuid.UUID, service: WallServiceDep) -> LikeCount:
    return await service.set_like(note_id, -1)
