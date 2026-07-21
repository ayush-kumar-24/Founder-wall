"use client";

// One effect that brings the wall to life on load: restore any existing
// session, fetch the notes already on the wall, and open the live feed so new
// notes from other founders appear in real time. Runs once, cleans up its
// socket on unmount.

import { useEffect } from "react";
import { useWall } from "./store";
import { fetchAllNotes, fetchMyNote } from "./api";
import { fetchMe } from "./auth";
import { apiNoteToNoteData, numericId } from "./mapping";
import { connectWall } from "./ws";

export function useBootstrap(): void {
  const setNotes = useWall((s) => s.setNotes);
  const upsertNote = useWall((s) => s.upsertNote);
  const removeNoteById = useWall((s) => s.removeNoteById);
  const setUser = useWall((s) => s.setUser);
  const setAuthReady = useWall((s) => s.setAuthReady);
  const setMyNote = useWall((s) => s.setMyNote);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    // — restore session —
    (async () => {
      try {
        const user = await fetchMe();
        if (cancelled) return;
        setUser(user);
        if (user) {
          const mine = await fetchMyNote(controller.signal);
          if (!cancelled) setMyNote(mine);
        }
      } catch {
        /* offline or no session — the wall is still viewable */
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();

    // — the notes already on the wall —
    (async () => {
      try {
        const notes = await fetchAllNotes(controller.signal);
        if (cancelled) return;
        const now = Date.now();
        setNotes(notes.map((n) => apiNoteToNoteData(n, now)));
      } catch {
        /* an empty or unreachable wall simply shows nothing */
      }
    })();

    // — the live feed —
    const disconnect = connectWall((event) => {
      if (cancelled) return;
      const now = Date.now();
      switch (event.type) {
        case "note.created":
        case "note.updated":
          upsertNote(apiNoteToNoteData(event.note, now));
          break;
        case "note.deleted":
          removeNoteById(numericId(event.id));
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
