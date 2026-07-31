"use client";

// Likes are a SHARED tally on the server, visible to everyone. This device
// remembers which notes it liked (localStorage) so the heart toggles and one
// browser can't trivially double-count. The displayed total comes from the
// note's own `likes` field, kept live via the store (optimistic) + WebSocket.

import { useCallback, useEffect, useState } from "react";
import { useWall } from "./store";
import { setLike } from "./api";
import type { NoteData } from "./notes";

const LIKED_KEY = "fw.liked.v1";

function load(): Record<number, boolean> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LIKED_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function persist(map: Record<number, boolean>) {
  try {
    window.localStorage.setItem(LIKED_KEY, JSON.stringify(map));
  } catch {
    /* storage disabled — the toggle is still reflected in state this session */
  }
}

export function useLikes() {
  const patchNote = useWall((s) => s.patchNote);
  const [liked, setLiked] = useState<Record<number, boolean>>({});

  // Hydrate after mount to avoid an SSR/client mismatch.
  useEffect(() => {
    setLiked(load());
  }, []);

  const isLiked = useCallback((id: number) => !!liked[id], [liked]);

  const toggle = useCallback(
    async (note: NoteData) => {
      const nowLiked = !liked[note.id];
      // Optimistic: flip the heart + nudge the count immediately.
      setLiked((prev) => {
        const next = { ...prev, [note.id]: nowLiked };
        persist(next);
        return next;
      });
      patchNote(note.id, {
        likes: Math.max(0, note.likes + (nowLiked ? 1 : -1)),
      });
      try {
        const total = await setLike(note.apiId, nowLiked);
        patchNote(note.id, { likes: total }); // reconcile with server truth
      } catch {
        // Revert on failure.
        setLiked((prev) => {
          const next = { ...prev, [note.id]: !nowLiked };
          persist(next);
          return next;
        });
        patchNote(note.id, { likes: note.likes });
      }
    },
    [liked, patchNote]
  );

  return { isLiked, toggle };
}
