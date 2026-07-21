// Authentication transport. Google Sign-In happens in the browser (Google
// Identity Services mints an ID token); we hand that token to the backend,
// which verifies it and returns its OWN short-lived access token + a long-lived
// refresh token. Every write to the wall carries the access token as a Bearer
// header; when it expires, we rotate silently with the refresh token.
//
// Tokens live in localStorage. They are bearer credentials, not secrets baked
// into the bundle — the access token is deliberately short-lived (15 min) and
// the refresh token is server-revocable and rotates on every use.

import { API_BASE_URL, REQUEST_TIMEOUT_MS } from "./config";
import { ApiError } from "./api";

const ACCESS_KEY = "fw.access";
const REFRESH_KEY = "fw.refresh";

export interface UserProfile {
  id: string;
  email: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  isModerator: boolean;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getAccessToken(): string | null {
  return isBrowser() ? window.localStorage.getItem(ACCESS_KEY) : null;
}

export function getRefreshToken(): string | null {
  return isBrowser() ? window.localStorage.getItem(REFRESH_KEY) : null;
}

function storeTokens(t: TokenResponse): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(ACCESS_KEY, t.access_token);
  window.localStorage.setItem(REFRESH_KEY, t.refresh_token);
}

export function clearTokens(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}

/** Raw JSON POST helper with a timeout, independent of the auth layer. */
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      let message = `Request failed: ${path}`;
      try {
        const data = await res.json();
        message = data?.error?.message ?? message;
      } catch {
        /* non-JSON error body — keep the default message */
      }
      throw new ApiError(message, res.status);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Exchange a Google ID token for our own session. Called with the `credential`
 * that Google Identity Services returns to the sign-in callback.
 */
export async function signInWithGoogle(credential: string): Promise<void> {
  const tokens = await postJson<TokenResponse>("/auth/google", { credential });
  storeTokens(tokens);
}

/**
 * Rotate the access token using the refresh token. Returns the new access
 * token, or null if the session can no longer be renewed (caller should treat
 * the user as signed out).
 */
export async function refreshSession(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  try {
    const tokens = await postJson<TokenResponse>("/auth/refresh", {
      refresh_token: refresh,
    });
    storeTokens(tokens);
    return tokens.access_token;
  } catch {
    clearTokens();
    return null;
  }
}

/** Best-effort server-side logout, then clear local tokens regardless. */
export async function signOut(): Promise<void> {
  const refresh = getRefreshToken();
  clearTokens();
  if (refresh) {
    try {
      await postJson("/auth/logout", { refresh_token: refresh });
    } catch {
      /* logout is idempotent; local tokens are already gone */
    }
  }
}

/**
 * Fetch an authenticated endpoint. Attaches the Bearer token, and on a 401
 * transparently rotates the session once and retries — so a founder mid-session
 * never sees an expired-token error.
 */
export async function authFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const attempt = async (token: string | null): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init.headers ?? {}),
        },
        signal: init.signal ?? controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  let res = await attempt(getAccessToken());
  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) res = await attempt(refreshed);
  }
  return res;
}

/** base64url without padding, for building a dev JWT in the browser. */
function b64url(obj: unknown): string {
  const json = JSON.stringify(obj);
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Development sign-in. Mints an UNSIGNED JWT the backend accepts only when it
 * runs with GOOGLE_ALLOW_INSECURE_TOKENS=true (local/staging). This lets the
 * full auth → post → live-note flow be exercised without a real Google client.
 * In production the backend refuses insecure tokens, so this path is inert.
 */
export async function signInDev(
  email = "founder@example.com",
  name = "Test Founder"
): Promise<void> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "https://accounts.google.com",
    sub: `dev-${email}`,
    email,
    email_verified: true,
    name,
    iat: now,
    exp: now + 3600,
  };
  const credential = `${b64url(header)}.${b64url(payload)}.devsignature`;
  await signInWithGoogle(credential);
}

/** Fetch the signed-in user's profile, or null if not authenticated. */
export async function fetchMe(): Promise<UserProfile | null> {
  if (!isAuthenticated()) return null;
  const res = await authFetch("/auth/me");
  if (res.status === 401) {
    clearTokens();
    return null;
  }
  if (!res.ok) throw new ApiError("Could not load profile", res.status);
  const data = await res.json();
  return {
    id: data.id,
    email: data.email,
    handle: data.handle,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    isModerator: data.is_moderator,
  };
}
