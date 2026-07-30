"use client";

import { useEffect, useRef, useState } from "react";
import { NOTE_MAX_LENGTH } from "@/lib/config";
import { NOTE_CATEGORIES } from "@/lib/mapping";
import { useWallActions } from "@/lib/useWallActions";

const NAME_MAX = 80;
const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

/** Keep Tab focus inside the modal. */
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
  const { post } = useWallActions();

  const [text, setText] = useState("");
  const [categoryKey, setCategoryKey] = useState(NOTE_CATEGORIES[0].key);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setText("");
    setCategoryKey(NOTE_CATEGORIES[0].key);
    setName("");
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

  const category =
    NOTE_CATEGORIES.find((c) => c.key === categoryKey) ?? NOTE_CATEGORIES[0];

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await post(text, category.value, name);
    setBusy(false);
    if (res.ok) onClose();
    else setError(res.error ?? "Something went wrong.");
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
        aria-label="Pin a note"
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="modal-compose">
          <h2>Pin your note</h2>
          <p className="hint">
            Share what you&apos;re wrestling with, advice you&apos;d give, or
            something you&apos;ve lived through. No account needed.
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

          <p className="field-label">What kind of note is this?</p>
          <div className="categories" role="radiogroup" aria-label="Note category">
            {NOTE_CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`category ${c.name}${categoryKey === c.key ? " selected" : ""}`}
                role="radio"
                aria-checked={categoryKey === c.key}
                onClick={() => setCategoryKey(c.key)}
              >
                <span className="category__dot" style={{ background: c.hex }} />
                <span className="category__label">{c.label}</span>
                <span className="category__hint">{c.hint}</span>
              </button>
            ))}
          </div>

          <label className="name-field">
            <span className="field-label">Your name (optional)</span>
            <input
              type="text"
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder="Leave blank to stay anonymous"
              aria-label="Your name (optional)"
            />
          </label>

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
      </div>
    </div>
  );
}
