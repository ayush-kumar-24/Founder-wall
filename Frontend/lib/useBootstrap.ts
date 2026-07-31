"use client";

// One effect that brings the wall to life on load: fetch the notes already on
// the wall and open the live feed so new notes appear in real time. Posting is
// open — there's no session to restore. Runs once, cleans up its socket on
// unmount.

import { useEffect } from "react";
import { useWall } from "./store";
import { fetchAllNotes } from "./api";
import { apiNoteToNoteData, numericId } from "./mapping";
import { connectWall } from "./ws";

export function useBootstrap(): void {
  const setNotes = useWall((s) => s.setNotes);
  const setNotesLoaded = useWall((s) => s.setNotesLoaded);
  const upsertNote = useWall((s) => s.upsertNote);
  const patchNote = useWall((s) => s.patchNote);
  const removeNoteById = useWall((s) => s.removeNoteById);
  const setLiveComment = useWall((s) => s.setLiveComment);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    // — the notes already on the wall —
    (async () => {
      try {
        const notes = await fetchAllNotes(controller.signal);
        if (cancelled) return;
        setNotes(notes.map((n) => apiNoteToNoteData(n)));
      } catch {
        /* an empty or unreachable wall simply shows nothing */
      } finally {
        if (!cancelled) setNotesLoaded(true);
      }
    })();

    // — the live feed —
    const disconnect = connectWall((event) => {
      if (cancelled) return;
      switch (event.type) {
        case "note.created":
        case "note.updated":
          upsertNote(apiNoteToNoteData(event.note));
          break;
        case "note.deleted":
          removeNoteById(numericId(event.id));
          break;
        case "note.liked":
          patchNote(numericId(event.id), { likes: event.likes });
          break;
        case "comment.created":
          patchNote(numericId(event.noteId), { commentCount: event.commentCount });
          setLiveComment({ noteApiId: event.noteId, comment: event.comment });
          break;
        default:
          break; // counters/presence are served by the stats poll
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
