// Runtime configuration. Every tunable lives here so no component carries a
// magic number, and so deployment can change behaviour without a code edit.

/**
 * Base URL of the Founder Wall API. Set NEXT_PUBLIC_API_URL at BUILD time to
 * your backend's public https URL (e.g. https://api.example.com). Two special
 * cases:
 *   - "" (empty) → same origin: the browser calls /auth, /stats, /ws/wall on
 *     the host that served the page. Correct for the single-origin docker +
 *     nginx deploy, where nginx proxies those paths to the backend.
 *   - unset → only in a `next dev` (development) build does this fall back to
 *     localhost. A PRODUCTION build never assumes localhost — it falls back to
 *     same-origin, so a missing var can never silently target the visitor's
 *     own machine or trigger mixed-content on an https page.
 * On a split deploy (frontend on Vercel, backend elsewhere) this MUST be set.
 */
const RAW_API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");

/**
 * Normalise an API base to an ABSOLUTE origin, or "" for same-origin.
 * A bare host like "api.example.com" (no scheme) must never be used directly:
 * fetch()/WebSocket() would treat it as a path relative to the current page,
 * producing URLs like https://my-app.vercel.app/api.example.com/auth/google.
 * A schemeless value is assumed to be https (the only sane default in prod).
 */
function toAbsoluteOrigin(raw: string): string {
  const s = raw.trim().replace(/\/+$/, "");
  if (s === "") return ""; // same-origin (docker + nginx single-origin deploy)
  if (/^https?:\/\//i.test(s)) return s; // already absolute
  return `https://${s}`; // bare host → default to https
}

export const API_BASE_URL = toAbsoluteOrigin(RAW_API_URL);

// Loud, actionable diagnostic for the most common production misconfiguration:
// a localhost backend URL served from a real domain is always wrong (mixed
// content + no server at the visitor's host). Logged once, client-side only.
if (typeof window !== "undefined") {
  const host = window.location.hostname;
  const servedLocally = host === "localhost" || host === "127.0.0.1";
  if (!servedLocally && /localhost|127\.0\.0\.1/.test(API_BASE_URL)) {
    // eslint-disable-next-line no-console
    console.error(
      `[Founder Wall] NEXT_PUBLIC_API_URL resolves to "${API_BASE_URL}" but the ` +
        `app is served from "${host}". Set NEXT_PUBLIC_API_URL to your backend's ` +
        `public https URL in the deployment environment and rebuild.`
    );
  }
}

/**
 * WebSocket URL for the live wall feed. Derived from API_BASE_URL by default
 * (https→wss, http→ws), overridable via NEXT_PUBLIC_WS_URL for split hosts.
 * Guarantees a ws/wss scheme so `new WebSocket()` never resolves it relative to
 * the page (which would prepend the frontend origin, as with API_BASE_URL).
 */
export const WS_URL = (() => {
  const explicit = process.env.NEXT_PUBLIC_WS_URL?.trim().replace(/\/+$/, "");
  if (explicit) {
    if (/^wss?:\/\//i.test(explicit)) return `${explicit}/ws/wall`;
    if (/^https?:\/\//i.test(explicit))
      return `${explicit.replace(/^http/i, "ws")}/ws/wall`;
    return `wss://${explicit}/ws/wall`; // bare host → default to wss
  }
  if (API_BASE_URL === "") return "/ws/wall"; // same-origin: relative is correct
  // API_BASE_URL is guaranteed absolute here (http/https), so this yields ws/wss.
  return `${API_BASE_URL.replace(/^http/i, "ws")}/ws/wall`;
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
