"use client";

import { useEffect } from "react";
import { GOXL_WHATSAPP_URL } from "@/lib/config";
import WhatsAppIcon from "../WhatsAppIcon";

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

        <h2 id="intro-title" className="intro-title">
          Founder&apos;s Wall
        </h2>
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

        {GOXL_WHATSAPP_URL && (
          <a
            className="wa-card"
            href={GOXL_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="wa-card__badge" aria-hidden="true">
              <WhatsAppIcon size={26} />
            </span>
            <span className="wa-card__text">
              <span className="wa-card__title">Join the founder community</span>
              <span className="wa-card__sub">
                A private WhatsApp group by GoXL — real founders, honest
                conversations, zero spam.
              </span>
            </span>
            <span className="wa-card__cta">
              Join
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  d="M5 12h13m-5-5 5 5-5 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="wa-card__trust">
              Official WhatsApp invite · Free to join · Powered by GoXL
            </span>
          </a>
        )}
      </div>
    </div>
  );
}
