// The live feed. One WebSocket to /ws/wall carries every change on the wall:
// a note appears, a note is edited or removed, the counters tick. The socket is
// public and receive-only (a founder's writes go over HTTP); we only send an
// occasional ping so intermediaries keep the connection open.
//
// The connection self-heals: on any drop it reconnects with capped exponential
// backoff, so a visitor who leaves the tab open overnight still sees a live
// wall in the morning.

import { WS_URL } from "./config";
import type { ApiNote } from "./mapping";
import type { WallStats } from "./api";

export type WallEvent =
  | { type: "note.created"; note: ApiNote }
  | { type: "note.updated"; note: ApiNote }
  | { type: "note.deleted"; id: string }
  | { type: "counters.updated"; stats: WallStats }
  | { type: "presence.updated"; online: number };

type Listener = (event: WallEvent) => void;

const PING_INTERVAL_MS = 25_000;
const MAX_BACKOFF_MS = 15_000;

/** Map a raw server frame onto a typed WallEvent, or null if irrelevant. */
function parseFrame(raw: string): WallEvent | null {
  let msg: { type?: string; payload?: Record<string, unknown> };
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  const p = msg.payload ?? {};
  switch (msg.type) {
    case "note.created":
      return { type: "note.created", note: p as unknown as ApiNote };
    case "note.updated":
      return { type: "note.updated", note: p as unknown as ApiNote };
    case "note.deleted":
      return { type: "note.deleted", id: String(p.id) };
    case "counters.updated":
      return {
        type: "counters.updated",
        stats: {
          founders: Number(p.founders ?? 0),
          thoughts: Number(p.thoughts ?? 0),
          activeNotes: Number(p.active_notes ?? 0),
          online: Number(p.online ?? 0),
          wallCapacity: Number(p.wall_capacity ?? 0),
        },
      };
    case "presence.updated":
      return { type: "presence.updated", online: Number(p.online ?? 0) };
    default:
      return null; // moderation.updated and any future types are ignored here
  }
}

/**
 * Open the live feed. Returns a disposer that closes the socket and stops all
 * reconnection. Safe to call in a React effect cleanup.
 */
export function connectWall(onEvent: Listener): () => void {
  let socket: WebSocket | null = null;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let closed = false;

  const open = () => {
    if (closed) return;
    try {
      socket = new WebSocket(WS_URL);
    } catch {
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      attempts = 0;
      pingTimer = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
      }, PING_INTERVAL_MS);
    };

    socket.onmessage = (ev) => {
      const event = parseFrame(typeof ev.data === "string" ? ev.data : "");
      if (event) onEvent(event);
    };

    socket.onclose = () => {
      clearInterval(pingTimer);
      scheduleReconnect();
    };

    socket.onerror = () => {
      // onclose always follows; let it drive the reconnect.
      socket?.close();
    };
  };

  const scheduleReconnect = () => {
    if (closed) return;
    const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempts);
    attempts += 1;
    reconnectTimer = setTimeout(open, delay);
  };

  open();

  return () => {
    closed = true;
    clearInterval(pingTimer);
    clearTimeout(reconnectTimer);
    if (socket) {
      socket.onclose = null; // prevent reconnect on intentional close
      socket.close();
    }
  };
}
