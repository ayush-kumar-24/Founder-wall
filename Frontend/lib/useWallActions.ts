"use client";

// Presentation-layer glue for the 2D wall: post and remove a note by reusing
// the EXISTING api services and store. No new endpoints, payloads, or auth —
// createNote/deleteNote and the zustand store are untouched. (This replaces the
// 3D-specific submit.ts flow, which drove the retired flying animation.)

import { useCallback } from "react";
import { useWall } from "./store";
import {
  createNote,
  deleteNote,
  fetchMyNote,
  NoteExistsError,
  ContentRejectedError,
  ApiError,
} from "./api";
import { apiNoteToNoteData, numericId, type NoteColor } from "./mapping";

export interface PostResult {
  ok: boolean;
  error?: string;
}

export function useWallActions() {
  const upsertNote = useWall((s) => s.upsertNote);
  const removeNoteById = useWall((s) => s.removeNoteById);
  const setMyNote = useWall((s) => s.setMyNote);
  const setJustPostedId = useWall((s) => s.setJustPostedId);

  const post = useCallback(
    async (content: string, color: NoteColor): Promise<PostResult> => {
      const text = content.trim();
      if (!text) return { ok: false, error: "Write something first." };
      try {
        const api = await createNote(text, color);
        setMyNote(api);
        const nd = apiNoteToNoteData(api);
        // Mark it as just-posted so the wall plays the fly-in for it.
        setJustPostedId(nd.id);
        // Also arrives via the WebSocket; upsert dedupes by id, so no double.
        upsertNote(nd);
        return { ok: true };
      } catch (e) {
        if (e instanceof NoteExistsError) {
          try {
            setMyNote(await fetchMyNote());
          } catch {
            /* non-fatal */
          }
          return { ok: false, error: "You've already pinned your note." };
        }
        if (e instanceof ContentRejectedError) return { ok: false, error: e.message };
        if (e instanceof ApiError && e.status === 401)
          return { ok: false, error: "Please sign in again." };
        return { ok: false, error: "Could not pin your note. Try again." };
      }
    },
    [setMyNote, upsertNote, setJustPostedId]
  );

  const remove = useCallback(
    async (noteId: string): Promise<PostResult> => {
      try {
        await deleteNote(noteId);
        removeNoteById(numericId(noteId));
        setMyNote(null);
        return { ok: true };
      } catch {
        return { ok: false, error: "Could not remove your note." };
      }
    },
    [removeNoteById, setMyNote]
  );

  return { post, remove };
}
