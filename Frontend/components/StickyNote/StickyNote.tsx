"use client";

import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import { useWall } from "@/lib/store";
import type { NoteData } from "@/lib/notes";
import type { NoteLayout } from "../Wall/Wall";

export interface StickyNoteProps {
  note: NoteData;
  isMine: boolean;
  fresh: boolean; // the just-posted note → plays the fly-in
  layout?: NoteLayout;
  scale?: number; // current wall zoom — fly-in deltas are in screen px
  onOpen: () => void;
}

function tapeTiltFor(id: number): number {
  return ((Math.abs(id) >> 4) % 80) / 10 - 4;
}
function hasUnderline(id: number): boolean {
  return Math.abs(id) % 3 === 0;
}

function StickyNote({ note, isMine, fresh, layout, scale = 1, onOpen }: StickyNoteProps) {
  const ref = useRef<HTMLElement>(null);
  const setJustPostedId = useWall((s) => s.setJustPostedId);

  const [entering, setEntering] = useState(!fresh);
  useEffect(() => {
    if (fresh) return;
    const t = setTimeout(() => setEntering(false), 30);
    return () => clearTimeout(t);
  }, [fresh]);

  // Fly-in: the just-posted note flies up from the bottom onto its spot.
  useEffect(() => {
    if (!fresh || !ref.current) return;
    const el = ref.current;
    const r = el.getBoundingClientRect();
    // Screen-space launch offset → local plane coords (the wall is scaled).
    const dx = (window.innerWidth / 2 - (r.left + r.width / 2)) / scale;
    const dy = (window.innerHeight * 0.9 - (r.top + r.height / 2)) / scale;
    const rot = layout?.rot ?? 0;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.animate(
        [
          { transform: `translate(${dx}px,${dy}px) scale(2.2) rotate(-2deg)`, opacity: 0, offset: 0 },
          { transform: `translate(${dx}px,${dy}px) scale(2.2) rotate(-2deg)`, opacity: 1, offset: 0.14 },
          { transform: `translate(${dx * 0.42}px,${dy * 0.42 - 34}px) scale(1.5) rotate(${(rot * 0.5).toFixed(2)}deg)`, opacity: 1, offset: 0.6 },
          { transform: `translate(0,0) scale(1.06) rotate(${(rot * 1.1).toFixed(2)}deg)`, offset: 0.88 },
          { transform: `translate(0,0) scale(1) rotate(${rot}deg)`, opacity: 1, offset: 1 },
        ],
        { duration: 1900, easing: "cubic-bezier(0.34,1.2,0.4,1)", fill: "none" }
      );
    }
    const t = setTimeout(() => setJustPostedId(null), 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, layout, setJustPostedId]);

  const style = {
    "--r": `${layout?.rot ?? 0}deg`,
    "--tz": `${layout?.depth ?? 0}px`,
    "--tape-rot": `${tapeTiltFor(note.id)}deg`,
    left: layout ? `${layout.left}px` : undefined,
    top: layout ? `${layout.top}px` : undefined,
    zIndex: layout?.z ?? 0,
  } as CSSProperties;

  return (
    <article
      ref={ref}
      className={`note ${note.color}${isMine ? " user-note" : ""}${
        entering ? " note--entering" : ""
      }`}
      style={style}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open note: ${note.text.slice(0, 60)}`}
    >
      <span className="note__tape" aria-hidden="true" />
      <span className="note__text">{note.text}</span>
      {hasUnderline(note.id) && (
        <span className="note__underline" aria-hidden="true" />
      )}
      {isMine && <span className="note__mine" aria-hidden="true" />}
    </article>
  );
}

export default memo(StickyNote);
