"use client";

import { useEffect } from "react";

/**
 * The welcome / "what is this" overlay. Shown on a founder's first visit and
 * re-openable from the header's "about" link. Explains the wall's purpose and
 * what you can do here. Dismissible (button / backdrop / Esc).
 */
export default function IntroOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="intro-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-title"
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <h1 id="intro-title" className="intro-title">
          Founder Wall
        </h1>
        <p className="intro-sub">Your problems. Your questions. Zero judgment.</p>

        <div className="intro-body">
          <p>
            Every founder carries conversations they never say out loud — the
            doubts, the failures, the questions that feel too &ldquo;basic,&rdquo;
            the wins nobody else understands.
          </p>
          <p>
            So we built a wall. Not for likes. Not for judgment. Not for perfect
            stories. A place where founders can simply <em>be</em> founders.
          </p>
          <p>
            Write what you&rsquo;re struggling with. Ask what you&rsquo;ve been
            afraid to ask. Share what you&rsquo;re building. Celebrate a small win.
            Leave advice for someone walking the path behind you.
          </p>
          <p className="intro-body__closing">
            Because entrepreneurship was never meant to be a lonely journey.
          </p>
        </div>

        <button className="btn btn-primary intro-cta" onClick={onClose}>
          Step up to the wall
        </button>
      </div>
    </div>
  );
}
