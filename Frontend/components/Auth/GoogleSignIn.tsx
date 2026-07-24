"use client";

// Thin presentation wrapper around the EXISTING Google Identity Services flow.
// It renders Google's official button (or the dev fallback when no client id is
// configured) and, on success, adopts the session via the existing auth + store
// APIs. No authentication logic is added or changed here.

import { useEffect, useRef, useState } from "react";
import { useWall } from "@/lib/store";
import { signInWithGoogle, signInDev, fetchMe } from "@/lib/auth";
import { fetchMyNote } from "@/lib/api";
import { renderGoogleButton, isGoogleConfigured } from "@/lib/google";

export default function GoogleSignIn({
  onSignedIn,
}: {
  onSignedIn?: () => void;
}) {
  const setUser = useWall((s) => s.setUser);
  const setMyNote = useWall((s) => s.setMyNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slot = useRef<HTMLDivElement>(null);

  const adopt = async () => {
    const u = await fetchMe();
    setUser(u);
    if (u) {
      try {
        setMyNote(await fetchMyNote());
      } catch {
        /* non-fatal */
      }
    }
    onSignedIn?.();
  };

  const onCredential = async (credential: string) => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle(credential);
      await adopt();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[Founder Wall] Google sign-in failed:", err);
      setError("Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onDev = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInDev();
      await adopt();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[Founder Wall] Dev sign-in failed:", err);
      setError("Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!isGoogleConfigured() || !slot.current) return;
    renderGoogleButton(slot.current, onCredential).catch(() =>
      setError("Google sign-in is unavailable right now.")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="google-signin">
      {isGoogleConfigured() ? (
        <div ref={slot} aria-busy={busy} />
      ) : (
        <button className="btn btn-primary" onClick={onDev} disabled={busy}>
          {busy ? "Entering…" : "Enter as a founder"}
        </button>
      )}
      {error && (
        <p className="google-signin__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
