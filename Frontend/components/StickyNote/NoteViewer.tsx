"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { NoteData } from "@/lib/notes";
import type { ApiComment } from "@/lib/mapping";
import { useWall } from "@/lib/store";
import { fetchComments, createComment } from "@/lib/api";

const COMMENT_MAX = 280;
const NAME_MAX = 80;

const AVATAR_COLORS = [
  "#e08a7f", "#e6b45a", "#8bbf7a", "#6fb0c9", "#a790d0", "#d98cae", "#7fb6a0",
];

function avatarColor(name: string | null): string {
  const key = (name || "?").charCodeAt(0) || 0;
  return AVATAR_COLORS[key % AVATAR_COLORS.length];
}
function initial(name: string | null): string {
  return (name?.trim()?.[0] || "?").toUpperCase();
}
function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="nv-like__heart" aria-hidden="true">
      <path
        d="M12 20.7 4.3 13a5 5 0 0 1 7.1-7l.6.6.6-.6a5 5 0 0 1 7.1 7L12 20.7Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface NoteViewerProps {
  note: NoteData;
  isMine: boolean;
  liked: boolean;
  onLike: () => void;
  onRemove: () => void;
  onClose: () => void;
}

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
    "--note-size": "300px",
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

        <div className="nv-grid">
          {/* — the note + like — */}
          <div className="nv-note-col">
            <div className={`note ${note.color} note-viewer__note`} style={noteStyle}>
              <span className="note__tape" aria-hidden="true" />
              <span className="note__text note-viewer__text">{note.text}</span>
              {note.authorName && (
                <span className="note__author note-viewer__author">
                  — {note.authorName}
                </span>
              )}
            </div>

            <div className="nv-note-col__actions">
              <button
                className={`nv-like${liked ? " is-liked" : ""}`}
                onClick={onLike}
                aria-pressed={liked}
                aria-label={liked ? "Unlike this note" : "Like this note"}
              >
                <Heart filled={liked} />
                <span className="nv-like__count">{note.likes}</span>
              </button>
              {isMine && (
                <button className="nv-remove" onClick={onRemove}>
                  Delete
                </button>
              )}
            </div>
          </div>

          {/* — the comments panel (its own scroll) — */}
          <aside className="nv-comments">
            <header className="nv-comments__head">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="nv-comments__icon">
                <path
                  d="M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H9l-4 3.5V16.5H4.5A1.5 1.5 0 0 1 3 15V7a1.5 1.5 0 0 1 1.5-1.5Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
              </svg>
              <span>
                {note.commentCount === 0
                  ? "Comments"
                  : `${note.commentCount} comment${note.commentCount === 1 ? "" : "s"}`}
              </span>
            </header>

            <div className="nv-comments__list">
              {loading ? (
                <p className="nv-comments__empty">Loading…</p>
              ) : comments.length === 0 ? (
                <p className="nv-comments__empty">
                  No comments yet — be the first to reply.
                </p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="nv-comment">
                    <span
                      className="nv-comment__avatar"
                      style={{ background: avatarColor(c.author_name) }}
                      aria-hidden="true"
                    >
                      {initial(c.author_name)}
                    </span>
                    <div className="nv-comment__body">
                      <div className="nv-comment__meta">
                        <span className="nv-comment__name">
                          {c.author_name || "Anonymous"}
                        </span>
                        <span className="nv-comment__time">{relTime(c.created_at)}</span>
                      </div>
                      <p className="nv-comment__text">{c.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="nv-composer">
              <textarea
                className="nv-composer__text"
                value={text}
                maxLength={COMMENT_MAX}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitComment();
                }}
                placeholder="Add a comment…"
                aria-label="Your comment"
                rows={2}
              />
              <div className="nv-composer__row">
                <input
                  className="nv-composer__name"
                  type="text"
                  value={name}
                  maxLength={NAME_MAX}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name (optional)"
                  aria-label="Your name (optional)"
                />
                <button
                  className="nv-composer__send"
                  onClick={submitComment}
                  disabled={posting || text.trim().length === 0}
                  aria-label="Post comment"
                >
                  {posting ? "…" : "Post"}
                </button>
              </div>
              {error && <p className="modal-error" role="alert">{error}</p>}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
