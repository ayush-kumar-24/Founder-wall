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

/** How often the live figures are refreshed while the tab is visible. */
export const STATS_POLL_INTERVAL_MS = 45_000;

/** Abort a request that the network never answers. */
export const REQUEST_TIMEOUT_MS = 8_000;

/** Duration of the count-up when a new figure arrives. */
export const COUNT_UP_DURATION_MS = 1_800;
