"use client";

import { useEffect, useRef, useState } from "react";
import { useWall } from "@/lib/store";
import { NOTE_MAX_LENGTH } from "@/lib/config";
import { WALL_COLORS } from "@/lib/mapping";
import { useWallActions } from "@/lib/useWallActions";
import GoogleSignIn from "../Auth/GoogleSignIn";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

/** Keep Tab focus inside the modal (Google's iframe button is exempt by design). */
function trapFocus(e: KeyboardEvent, container: HTMLElement | null) {
  if (!container) return;
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE)
  ).filter((el) => el.offsetParent !== null);
  if (nodes.length === 0) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export default function ShareModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const user = useWall((s) => s.user);
  const myNote = useWall((s) => s.myNote);
  const { post, remove } = useWallActions();

  const [text, setText] = useState("");
  const [color, setColor] = useState(WALL_COLORS[0].value);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // On open: reset, lock background scroll, focus in, trap Tab, and restore
  // focus to the trigger on close.
  useEffect(() => {
    if (!open) return;
    setText("");
    setColor(WALL_COLORS[0].value);
    setError(null);

    const restoreTo = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const id = setTimeout(() => {
      const el = modalRef.current;
      (
        el?.querySelector<HTMLElement>("textarea") ??
        el?.querySelector<HTMLElement>(FOCUSABLE)
      )?.focus();
    }, 60);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "Tab") trapFocus(e, modalRef.current);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      clearTimeout(id);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      restoreTo?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await post(text, color);
    setBusy(false);
    if (res.ok) onClose();
    else setError(res.error ?? "Something went wrong.");
  };

  const removeMine = async () => {
    if (!myNote) return;
    setBusy(true);
    const res = await remove(myNote.id);
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Could not remove your note.");
  };

  return (
    <div
      className="overlay open"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={modalRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Share your note"
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        {/* — Signed out: gate behind Google sign-in — */}
        {!user ? (
          <div className="modal-signin">
            <h2>Sign in to pin your note</h2>
            <p className="hint">
              Founder&apos;s Wall uses Google to keep the wall real. Sign in, then
              share what you&apos;re wrestling with.
            </p>
            <GoogleSignIn />
          </div>
        ) : myNote ? (
          /* — Already has a note (one per founder) — */
          <div className="modal-existing">
            <h2>You&apos;ve pinned your note</h2>
            <p className="hint">
              Each founder keeps one note on the wall. Remove yours to pin a new
              one.
            </p>
            <div className={`note ${WALL_COLORS[0].name} modal-existing__preview`}>
              <span className="note__text">{myNote.content}</span>
            </div>
            {error && <p className="modal-error" role="alert">{error}</p>}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose}>
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={removeMine}
                disabled={busy}
              >
                {busy ? "Removing…" : "Remove my note"}
              </button>
            </div>
          </div>
        ) : (
          /* — Compose — */
          <div className="modal-compose">
            <h2>Pin your question</h2>
            <p className="hint">
              What&apos;s the thing you&apos;re quietly wrestling with? Others are
              probably wondering it too.
            </p>
            <textarea
              ref={textareaRef}
              value={text}
              maxLength={NOTE_MAX_LENGTH}
              onChange={(e) => setText(e.target.value)}
              placeholder="How do I…?"
              aria-label="Your note"
            />
            <div className="char-count">
              {text.length}/{NOTE_MAX_LENGTH}
            </div>

            <div className="swatches" role="radiogroup" aria-label="Note colour">
              {WALL_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`swatch ${c.name}${color === c.value ? " selected" : ""}`}
                  style={{ background: c.hex }}
                  role="radio"
                  aria-checked={color === c.value}
                  aria-label={c.name}
                  onClick={() => setColor(c.value)}
                />
              ))}
            </div>

            {error && <p className="modal-error" role="alert">{error}</p>}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={submit}
                disabled={busy || text.trim().length === 0}
              >
                {busy ? "Pinning…" : "Pin it to the wall"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
