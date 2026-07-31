"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { NoteData } from "@/lib/notes";
import type { ApiComment } from "@/lib/mapping";
import { useWall } from "@/lib/store";
import { fetchComments, createComment } from "@/lib/api";

const COMMENT_MAX = 280;
const NAME_MAX = 80;

export interface NoteViewerProps {
  note: NoteData;
  isMine: boolean;
  liked: boolean;
  onLike: () => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Click-to-open enlarged view of a note: read it, like it (shared count), and
 *  comment (open, unlimited). Comments load on open and update live. */
export default function NoteViewer({
  note,
  isMine,
  liked,
  onLike,
  onRemove,
  onClose,
}: NoteViewerProps) {
  const liveComment = useWall((s) => s.liveComment);

  const [comments, setComments] = useState<ApiComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Load this note's comments on open.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchComments(note.apiId)
      .then((cs) => !cancelled && setComments(cs))
      .catch(() => !cancelled && setComments([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [note.apiId]);

  // Live: a comment posted by anyone on this note appears immediately.
  useEffect(() => {
    if (!liveComment || liveComment.noteApiId !== note.apiId) return;
    setComments((prev) =>
      prev.some((c) => c.id === liveComment.comment.id)
        ? prev
        : [...prev, liveComment.comment]
    );
  }, [liveComment, note.apiId]);

  const submitComment = async () => {
    const body = text.trim();
    if (!body) return;
    setPosting(true);
    setError(null);
    try {
      const created = await createComment(note.apiId, body, name);
      setComments((prev) =>
        prev.some((c) => c.id === created.id) ? prev : [...prev, created]
      );
      setText("");
    } catch {
      setError("Couldn't post that comment. Try again.");
    } finally {
      setPosting(false);
    }
  };

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

        <div className={`note ${note.color} note-viewer__note`} style={noteStyle}>
          <span className="note__tape" aria-hidden="true" />
          <span className="note__text note-viewer__text">{note.text}</span>
          {note.authorName && (
            <span className="note__author note-viewer__author">
              — {note.authorName}
            </span>
          )}
        </div>

        <div className="note-viewer__actions">
          <button
            className={`like-btn like-btn--viewer${liked ? " liked" : ""}`}
            onClick={onLike}
            aria-pressed={liked}
            aria-label={liked ? "Unlike this note" : "Like this note"}
          >
            <span className="heart" aria-hidden="true" />
            <span className="like-count">{note.likes}</span>
          </button>
          {isMine && (
            <button className="btn btn-secondary" onClick={onRemove}>
              Remove my note
            </button>
          )}
        </div>

        {/* — Comments — */}
        <section className="comments" aria-label="Comments">
          <h3 className="comments__title">
            {note.commentCount === 0
              ? "No comments yet"
              : `${note.commentCount} comment${note.commentCount === 1 ? "" : "s"}`}
          </h3>

          <div className="comments__list">
            {loading ? (
              <p className="comments__empty">Loading…</p>
            ) : comments.length === 0 ? (
              <p className="comments__empty">Be the first to reply.</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="comment">
                  <p className="comment__body">{c.content}</p>
                  <span className="comment__author">
                    — {c.author_name || "Anonymous"}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="comment-form">
            <textarea
              className="comment-form__text"
              value={text}
              maxLength={COMMENT_MAX}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add a comment…"
              aria-label="Your comment"
              rows={2}
            />
            <div className="comment-form__row">
              <input
                className="comment-form__name"
                type="text"
                value={name}
                maxLength={NAME_MAX}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name (optional)"
                aria-label="Your name (optional)"
              />
              <button
                className="btn btn-primary comment-form__send"
                onClick={submitComment}
                disabled={posting || text.trim().length === 0}
              >
                {posting ? "Posting…" : "Comment"}
              </button>
            </div>
            {error && <p className="modal-error" role="alert">{error}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
