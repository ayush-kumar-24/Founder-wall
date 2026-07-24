"use client";

import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import type { NoteData } from "@/lib/notes";

export interface StickyNoteProps {
  note: NoteData;
  isMine: boolean;
  liked: boolean;
  likeCount: number;
  onLike: (id: number) => void;
  onRemove: (id: number) => void;
}

/** Deterministic look from the note id — stable across reloads and viewers. */
function tiltFor(id: number): number {
  return (Math.abs(id) % 60) / 10 - 3; // −3°..3°
}
function tapeTiltFor(id: number): number {
  return ((Math.abs(id) >> 4) % 80) / 10 - 4; // −4°..4°
}
function hasUnderline(id: number): boolean {
  return Math.abs(id) % 3 === 0; // ~a third get the flourish
}

const MAX_TILT = 12; // degrees a card leans toward the cursor

function StickyNote({
  note,
  isMine,
  liked,
  likeCount,
  onLike,
  onRemove,
}: StickyNoteProps) {
  const ref = useRef<HTMLElement>(null);
  const raf = useRef<number | undefined>(undefined);

  // Drop-in on mount via a transition (base state is fully visible, so a note
  // can never get stuck hidden). Uses setTimeout, not rAF, so the class is
  // always removed and the note becomes visible even in a backgrounded tab
  // (where rAF is paused).
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 30);
    return () => clearTimeout(t);
  }, []);

  // Live 3D tilt toward the pointer (skipped on touch / reduced-motion).
  const handleMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    if (
      window.matchMedia("(hover: none)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5; // −0.5..0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.transform =
        `rotate(calc(var(--r) * 0.2)) translateZ(36px) translateY(-4px) ` +
        `rotateX(${(-py * MAX_TILT).toFixed(2)}deg) ` +
        `rotateY(${(px * MAX_TILT).toFixed(2)}deg)`;
    });
  };
  const handleLeave = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    if (ref.current) ref.current.style.transform = ""; // revert to CSS (smooth)
  };

  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    },
    []
  );

  const style = {
    "--r": `${tiltFor(note.id)}deg`,
    "--tape-rot": `${tapeTiltFor(note.id)}deg`,
  } as CSSProperties;

  return (
    <article
      ref={ref}
      className={`note ${note.color}${isMine ? " user-note" : ""}${
        entering ? " note--entering" : ""
      }`}
      style={style}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <span className="note__tape" aria-hidden="true" />
      <span className="note__text">{note.text}</span>
      {hasUnderline(note.id) && (
        <span className="note__underline" aria-hidden="true" />
      )}

      <button
        className={`like-btn${liked ? " liked" : ""}`}
        onClick={() => onLike(note.id)}
        aria-pressed={liked}
        aria-label={liked ? "Unlike this note" : "Like this note"}
      >
        <span className="heart" aria-hidden="true" />
        {likeCount > 0 && <span className="like-count">{likeCount}</span>}
      </button>

      {isMine && (
        <button
          className="remove-btn"
          onClick={() => onRemove(note.id)}
          aria-label="Remove your note"
        >
          ✕
        </button>
      )}
    </article>
  );
}

export default memo(StickyNote);
