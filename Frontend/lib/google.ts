// Google Identity Services loader. Pulls in Google's client script once and
// renders the official "Sign in with Google" button, whose callback hands us
// the ID token we exchange with the backend. Kept deliberately thin: no state,
// no React — just "load the script" and "render a button into this element".

import { GOOGLE_CLIENT_ID } from "./config";

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

interface CredentialResponse {
  credential: string;
}

// The subset of the GIS global we touch.
interface GoogleId {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (r: CredentialResponse) => void;
      }) => void;
      renderButton: (
        parent: HTMLElement,
        options: Record<string, unknown>
      ) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleId;
  }
}

let scriptPromise: Promise<void> | null = null;

/** Load the GIS client script exactly once. */
export function loadGoogleScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = SCRIPT_SRC;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Failed to load Google sign-in"));
    document.head.appendChild(el);
  });
  return scriptPromise;
}

/** True when a real Google client id is configured for this build. */
export function isGoogleConfigured(): boolean {
  return GOOGLE_CLIENT_ID.length > 0;
}

/**
 * Render Google's sign-in button into `parent`. `onCredential` fires with the
 * Google ID token when the user completes sign-in.
 */
export async function renderGoogleButton(
  parent: HTMLElement,
  onCredential: (credential: string) => void
): Promise<void> {
  if (!isGoogleConfigured()) return;
  await loadGoogleScript();
  const id = window.google?.accounts.id;
  if (!id) return;
  id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (r) => onCredential(r.credential),
  });
  id.renderButton(parent, {
    theme: "filled_black",
    size: "large",
    shape: "pill",
    text: "signin_with",
  });
}
