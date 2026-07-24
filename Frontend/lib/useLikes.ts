"use client";

// Likes are FRONTEND-ONLY (the backend has no likes concept). A like counts
// ONLY when the user actually clicks it — no seeded/fake numbers. The state is
// a per-device "liked" toggle in localStorage, so a note's count is 0, or 1
// once this user has liked it. Nothing here talks to the backend.

import { useCallback, useEffect, useState } from "react";

const LIKED_KEY = "fw.liked.v1";

function load(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LIKED_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function useLikes() {
  const [liked, setLiked] = useState<Record<string, boolean>>({});

  // Hydrate after mount to avoid an SSR/client mismatch.
  useEffect(() => {
    setLiked(load());
  }, []);

  const toggle = useCallback((id: number) => {
    setLiked((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        window.localStorage.setItem(LIKED_KEY, JSON.stringify(next));
      } catch {
        /* storage full / disabled — the toggle is still reflected in state */
      }
      return next;
    });
  }, []);

  const isLiked = useCallback((id: number) => !!liked[id], [liked]);
  const count = useCallback((id: number) => (liked[id] ? 1 : 0), [liked]);

  return { isLiked, count, toggle };
}
