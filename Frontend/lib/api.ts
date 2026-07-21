// The API layer. One typed transport, one place that knows the wire format.
// Callers receive camelCase domain objects and never see fetch, snake_case,
// or HTTP status codes.

import { API_BASE_URL, REQUEST_TIMEOUT_MS } from "./config";

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
 * Perform a JSON request against the API.
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
