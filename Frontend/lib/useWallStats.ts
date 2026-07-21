"use client";

import { useEffect, useRef, useState } from "react";
import { fetchWallStats, type WallStats } from "./api";
import { STATS_POLL_INTERVAL_MS } from "./config";

export type StatsStatus = "loading" | "ready" | "error";

export interface UseWallStats {
  stats: WallStats | null;
  status: StatsStatus;
}

/**
 * Subscribe to the live wall figures.
 *
 * Behaviour that matters:
 *  - Polls only while the tab is visible; a backgrounded tab costs nothing and
 *    refreshes immediately on return, so the figure is never stale on screen.
 *  - A failed refresh never discards a good value. Once a number has been
 *    shown, a network blip leaves it standing rather than blanking the hero.
 *  - Every request is aborted on unmount, so no setState lands after teardown.
 *
 * State updates are confined to the component that calls this hook — keep that
 * component a leaf so a poll never re-renders the canvas.
 */
export function useWallStats(): UseWallStats {
  const [stats, setStats] = useState<WallStats | null>(null);
  const [status, setStatus] = useState<StatsStatus>("loading");
  // Read inside the effect without making it a dependency, so the poll loop is
  // established exactly once.
  const hasDataRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let interval: ReturnType<typeof setInterval> | undefined;

    const load = async () => {
      try {
        const next = await fetchWallStats(controller.signal);
        if (controller.signal.aborted) return;
        hasDataRef.current = true;
        setStats(next);
        setStatus("ready");
      } catch {
        if (controller.signal.aborted) return;
        // Keep the last good figure; only surface an error if we never had one.
        if (!hasDataRef.current) setStatus("error");
      }
    };

    const start = () => {
      if (interval !== undefined) return;
      interval = setInterval(load, STATS_POLL_INTERVAL_MS);
    };

    const stop = () => {
      clearInterval(interval);
      interval = undefined;
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        void load();
        start();
      }
    };

    void load();
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      controller.abort();
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return { stats, status };
}
