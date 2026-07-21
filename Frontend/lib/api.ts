// The API layer. One typed transport, one place that knows the wire format.
// Callers receive camelCase domain objects and never see fetch, snake_case,
// or HTTP status codes.

import { API_BASE_URL, REQUEST_TIMEOUT_MS } from "./config";
import { authFetch } from "./auth";
import type { ApiNote, NoteColor } from "./mapping";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** The live figures behind the wall. Mirrors the backend StatsSnapshot. */
export interface WallStats {
  founders: number;
  thoughts: number;
  activeNotes: number;
  online: number;
  wallCapacity: number;
}

/** Exact shape returned by GET /stats. */
interface StatsResponse {
  founders: number;
  thoughts: number;
  active_notes: number;
  online: number;
  wall_capacity: number;
}

/**
 * Perform an unauthenticated JSON GET against the API.
 *
 * An external `signal` (component unmount) and the internal timeout are both
 * honoured, so a request can never outlive its caller or hang indefinitely.
 */
async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new ApiError(`Request failed: ${path}`, response.status);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      error instanceof Error ? error.message : `Request failed: ${path}`
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Fetch the live wall figures. */
export async function fetchWallStats(signal?: AbortSignal): Promise<WallStats> {
  const data = await request<StatsResponse>("/stats", signal);
  return {
    founders: data.founders,
    thoughts: data.thoughts,
    activeNotes: data.active_notes,
    online: data.online,
    wallCapacity: data.wall_capacity,
  };
}

// ————————————————————————————————————————————————————————————————
// WALL NOTES
// ————————————————————————————————————————————————————————————————

interface WallManifest {
  total_notes: number;
  tiles: { tile_id: number; note_count: number }[];
}

/**
 * Fetch every active note on the wall. The backend paginates by tile, so we
 * read the manifest to learn which tiles hold notes, then pull only those.
 * Empty wall → empty array (no tile fetches at all).
 */
export async function fetchAllNotes(signal?: AbortSignal): Promise<ApiNote[]> {
  const manifest = await request<WallManifest>("/wall/manifest", signal);
  const populated = manifest.tiles.filter((t) => t.note_count > 0);
  if (populated.length === 0) return [];
  const tiles = await Promise.all(
    populated.map((t) =>
      request<{ tile_id: number; notes: ApiNote[] }>(
        `/wall/tiles/${t.tile_id}`,
        signal
      )
    )
  );
  return tiles.flatMap((t) => t.notes);
}

/** Raised when the founder already has a note on the wall (HTTP 409). */
export class NoteExistsError extends ApiError {
  constructor() {
    super("You have already left a note on the wall.", 409);
    this.name = "NoteExistsError";
  }
}

/** Raised when the content screener rejects a note (HTTP 422). */
export class ContentRejectedError extends ApiError {
  constructor(message: string) {
    super(message, 422);
    this.name = "ContentRejectedError";
  }
}

/** Parse the backend error envelope, falling back to a readable default. */
async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data?.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

/** Post the signed-in founder's note. The server assigns its place on the wall. */
export async function createNote(
  content: string,
  color: NoteColor
): Promise<ApiNote> {
  const res = await authFetch("/wall/notes", {
    method: "POST",
    body: JSON.stringify({ content, color }),
  });
  if (res.status === 409) throw new NoteExistsError();
  if (res.status === 422) {
    throw new ContentRejectedError(
      await readError(res, "That note could not be accepted.")
    );
  }
  if (res.status === 401) throw new ApiError("Please sign in first.", 401);
  if (!res.ok) throw new ApiError(await readError(res, "Could not post note."), res.status);
  return (await res.json()) as ApiNote;
}

/** The signed-in founder's own note, or null if they have not posted one. */
export async function fetchMyNote(signal?: AbortSignal): Promise<ApiNote | null> {
  const res = await authFetch("/wall/notes/me", { signal });
  if (res.status === 401) return null;
  if (!res.ok) throw new ApiError("Could not load your note.", res.status);
  const data = await res.json();
  return data as ApiNote | null;
}

/** Retire the founder's note, freeing its cell so they may write again. */
export async function deleteNote(noteId: string): Promise<void> {
  const res = await authFetch(`/wall/notes/${noteId}`, { method: "DELETE" });
  if (res.status === 404) return; // already gone — treat as success
  if (!res.ok) throw new ApiError("Could not remove your note.", res.status);
}
