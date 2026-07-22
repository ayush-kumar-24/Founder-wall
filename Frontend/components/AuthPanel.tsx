"use client";

// Identity, quietly. Signed out, a small invitation rests at the base of the
// wall; signing in is one click. Signed in, it shrinks to a corner chip. The
// panel never competes with the wall — it waits at the edge of the light.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useWall } from "@/lib/store";
import { signInWithGoogle, signInDev, signOut, fetchMe } from "@/lib/auth";
import { deleteNote, fetchMyNote } from "@/lib/api";
import { numericId } from "@/lib/mapping";
import { renderGoogleButton, isGoogleConfigured } from "@/lib/google";

export default function AuthPanel() {
  const phase = useWall((s) => s.phase);
  const authReady = useWall((s) => s.authReady);
  const user = useWall((s) => s.user);
  const myNote = useWall((s) => s.myNote);
  const setUser = useWall((s) => s.setUser);
  const setMyNote = useWall((s) => s.setMyNote);
  const removeNoteById = useWall((s) => s.removeNoteById);
  const setPostError = useWall((s) => s.setPostError);

  const [busy, setBusy] = useState(false);
  const googleSlot = useRef<HTMLDivElement>(null);

  // After sign-in, adopt the session: load profile and any existing note.
  const adoptSession = async () => {
    const u = await fetchMe();
    setUser(u);
    if (u) {
      try {
        setMyNote(await fetchMyNote());
      } catch {
        /* non-fatal */
      }
    }
  };

  const onCredential = async (credential: string) => {
    setBusy(true);
    setPostError(null);
    try {
      await signInWithGoogle(credential);
      await adoptSession();
    } catch (err) {
      // Keep the real cause visible (network/CORS/backend errors) — the UI
      // message is intentionally soft, but production debugging needs the truth.
      // eslint-disable-next-line no-console
      console.error("[Founder Wall] Google sign-in failed:", err);
      setPostError("Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onDevSignIn = async () => {
    setBusy(true);
    setPostError(null);
    try {
      await signInDev();
      await adoptSession();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[Founder Wall] Dev sign-in failed:", err);
      setPostError("Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onSignOut = async () => {
    await signOut();
    setUser(null);
    setMyNote(null);
  };

  const onRemoveNote = async () => {
    if (!myNote) return;
    setBusy(true);
    try {
      await deleteNote(myNote.id);
      removeNoteById(numericId(myNote.id));
      setMyNote(null);
    } catch {
      setPostError("Could not remove your note. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Render Google's official button when a real client id is configured.
  // Depends on `phase` because the button's mount point (googleSlot) only
  // exists once the panel is visible (phase === "idle"); without it the effect
  // would run during the entrance, find no slot, and never re-run.
  useEffect(() => {
    if (!authReady || user || phase !== "idle" || !isGoogleConfigured() || !googleSlot.current) {
      return;
    }
    // Avoid stacking a second button if the effect re-runs while the slot is
    // already populated (e.g. phase cycling idle → writing → idle).
    if (googleSlot.current.childElementCount > 0) return;
    renderGoogleButton(googleSlot.current, onCredential).catch(() => {
      setPostError("Google sign-in is unavailable right now.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user, phase]);

  // The panel is present only while wandering — writing and flight are private.
  if (!authReady || phase !== "idle") return null;

  // — Signed in: a small corner chip —
  if (user) {
    return (
      <motion.div
        className="auth-chip"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 1.2 } }}
      >
        <span className="auth-chip__name">
          {user.displayName || user.email}
        </span>
        {myNote && (
          <button
            className="auth-chip__link"
            onClick={onRemoveNote}
            disabled={busy}
          >
            remove my note
          </button>
        )}
        <button className="auth-chip__link" onClick={onSignOut} disabled={busy}>
          sign out
        </button>
      </motion.div>
    );
  }

  // — Signed out: an invitation at the base of the wall —
  return (
    <AnimatePresence>
      <motion.div
        className="auth-invite"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: 2.2, duration: 2 } }}
        exit={{ opacity: 0 }}
      >
        <span className="auth-invite__line">
          sign in to leave your mark on the wall
        </span>
        {isGoogleConfigured() ? (
          <div ref={googleSlot} />
        ) : (
          <button
            className="auth-invite__dev"
            onClick={onDevSignIn}
            disabled={busy}
          >
            {busy ? "entering…" : "enter as a founder"}
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
