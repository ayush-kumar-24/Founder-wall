// The API layer. One typed transport, one place that knows the wire format.
// Callers receive camelCase domain objects and never see fetch, snake_case,
// or HTTP status codes.

import { API_BASE_URL, REQUEST_TIMEOUT_MS } from "./config";
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

/** A public (unauthenticated) mutation — posting and deleting are open. */
async function mutate(
  path: string,
  method: "POST" | "DELETE",
  body?: unknown
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } finally {
    clearTimeout(timeout);
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

/** A freshly-created note. Carries the one-time delete token (this browser
 *  only) so the poster can remove it later without an account. */
export interface CreatedNote extends ApiNote {
  delete_token: string;
}

/** Post a note. Open to everyone — no account. The server assigns its place. */
export async function createNote(
  content: string,
  color: NoteColor,
  authorName?: string | null
): Promise<CreatedNote> {
  const res = await mutate("/wall/notes", "POST", {
    content,
    color,
    author_name: authorName || null,
  });
  if (res.status === 422) {
    throw new ContentRejectedError(
      await readError(res, "That note could not be accepted.")
    );
  }
  if (!res.ok) throw new ApiError(await readError(res, "Could not post note."), res.status);
  return (await res.json()) as CreatedNote;
}

/** Remove a note using the delete token this browser saved when it posted. */
export async function deleteNote(noteId: string, token: string): Promise<void> {
  const res = await mutate(`/wall/notes/${noteId}`, "DELETE", { token });
  if (res.status === 404) return; // already gone / not ours — treat as removed
  if (!res.ok) throw new ApiError("Could not remove the note.", res.status);
}
