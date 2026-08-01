"use client";

// Presentation-layer glue for the open wall: post a note (no account) and
// remove one you posted (proved by the delete token this browser saved).

import { useCallback } from "react";
import { useWall } from "./store";
import { createNote, deleteNote, ContentRejectedError, ApiError } from "./api";
import { apiNoteToNoteData, numericId, type NoteColor } from "./mapping";
import { rememberNote, forgetNote, getDeviceNote } from "./deviceNotes";

export interface PostResult {
  ok: boolean;
  error?: string;
}

export function useWallActions() {
  const upsertNote = useWall((s) => s.upsertNote);
  const removeNoteById = useWall((s) => s.removeNoteById);
  const setJustPostedId = useWall((s) => s.setJustPostedId);

  const post = useCallback(
    async (
      content: string,
      color: NoteColor,
      affiliation: string,
      authorName?: string | null
    ): Promise<PostResult> => {
      const text = content.trim();
      if (!text) return { ok: false, error: "Write something first." };
      if (!affiliation.trim())
        return { ok: false, error: "Add your startup or what you're building." };
      try {
        const api = await createNote(text, color, affiliation, authorName);
        const nd = apiNoteToNoteData(api);
        // Remember it so this browser can delete it later.
        rememberNote(nd.id, api.id, api.delete_token);
        // Mark it as just-posted so the wall plays the fly-in for it.
        setJustPostedId(nd.id);
        // Also arrives via the WebSocket; upsert dedupes by id, so no double.
        upsertNote(nd);
        return { ok: true };
      } catch (e) {
        if (e instanceof ContentRejectedError) return { ok: false, error: e.message };
        if (e instanceof ApiError && e.status === 429)
          return { ok: false, error: "You're posting a lot — give it a moment." };
        return { ok: false, error: "Could not pin your note. Try again." };
      }
    },
    [upsertNote, setJustPostedId]
  );

  /** Remove a note this browser posted (numericId → saved token). */
  const remove = useCallback(
    async (noteNumericId: number): Promise<PostResult> => {
      const mine = getDeviceNote(noteNumericId);
      if (!mine) return { ok: false, error: "This note isn't yours to remove." };
      try {
        await deleteNote(mine.apiId, mine.token);
        removeNoteById(noteNumericId);
        forgetNote(noteNumericId);
        return { ok: true };
      } catch {
        return { ok: false, error: "Could not remove your note." };
      }
    },
    [removeNoteById]
  );

  return { post, remove };
}
