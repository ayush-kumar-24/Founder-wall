// Runtime configuration. Every tunable lives here so no component carries a
// magic number, and so deployment can change behaviour without a code edit.

/**
 * Base URL of the Founder Wall API.
 * Set NEXT_PUBLIC_API_URL at build time; the localhost default only serves
 * local development against `make run`.
 */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

/**
 * WebSocket origin for the live wall feed. Derived from API_BASE_URL by
 * default (http→ws, https→wss), overridable for split deployments.
 */
export const WS_URL = (() => {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) return explicit.replace(/\/+$/, "") + "/ws/wall";
  return API_BASE_URL.replace(/^http/, "ws") + "/ws/wall";
})();

/**
 * Google OAuth client id (public — safe to inline). Google Identity Services
 * needs it in the browser to mint the ID token the backend verifies. Without
 * it, the sign-in button explains that login is not yet configured.
 */
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

/** How often the live figures are refreshed while the tab is visible. */
export const STATS_POLL_INTERVAL_MS = 45_000;

/** Abort a request that the network never answers. */
export const REQUEST_TIMEOUT_MS = 8_000;

/** Duration of the count-up when a new figure arrives. */
export const COUNT_UP_DURATION_MS = 1_800;

/** The most a note may hold — mirrors the backend NoteCreate schema. */
export const NOTE_MAX_LENGTH = 280;
