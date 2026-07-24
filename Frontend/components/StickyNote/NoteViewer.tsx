"use client";

import { useEffect, type CSSProperties } from "react";
import type { NoteData } from "@/lib/notes";

export interface NoteViewerProps {
  note: NoteData;
  isMine: boolean;
  liked: boolean;
  likeCount: number;
  onLike: () => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Click-to-open enlarged view of a single note — readable, with like + (if it's
 *  yours) remove. Closes on backdrop / Esc / ✕. */
export default function NoteViewer({
  note,
  isMine,
  liked,
  likeCount,
  onLike,
  onRemove,
  onClose,
}: NoteViewerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const noteStyle = {
    "--note-size": "340px",
    "--r": "-1.6deg",
    "--tape-rot": "-3deg",
  } as CSSProperties;

  return (
    <div
      className="overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="note-viewer" role="dialog" aria-modal="true" aria-label="Note">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div
          className={`note ${note.color} note-viewer__note`}
          style={noteStyle}
        >
          <span className="note__tape" aria-hidden="true" />
          <span className="note__text note-viewer__text">{note.text}</span>
        </div>

        <div className="note-viewer__actions">
          <button
            className={`like-btn like-btn--viewer${liked ? " liked" : ""}`}
            onClick={onLike}
            aria-pressed={liked}
            aria-label={liked ? "Unlike this note" : "Like this note"}
          >
            <span className="heart" aria-hidden="true" />
            <span className="like-count">{likeCount > 0 ? likeCount : "Like"}</span>
          </button>
          {isMine && (
            <button className="btn btn-secondary" onClick={onRemove}>
              Remove my note
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
