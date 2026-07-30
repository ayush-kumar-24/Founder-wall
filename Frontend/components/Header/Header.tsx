"use client";

import { useState } from "react";
import { useWall } from "@/lib/store";
import { useWallStats } from "@/lib/useWallStats";
import { signOut } from "@/lib/auth";
import { GOXL_URL, GOXL_WHATSAPP_URL } from "@/lib/config";
import Logo from "../Logo/Logo";

export default function Header({ onAbout }: { onAbout: () => void }) {
  const user = useWall((s) => s.user);
  const notes = useWall((s) => s.notes);
  const setUser = useWall((s) => s.setUser);
  const setMyNote = useWall((s) => s.setMyNote);
  const { stats, status } = useWallStats();

  const [menuOpen, setMenuOpen] = useState(false);

  const ready = status === "ready" && stats !== null;
  // Notes on the wall now (falls back to the live count while it loads).
  const noteCount = notes.length || (ready ? stats.activeNotes : 0);
  const whatsapp = GOXL_WHATSAPP_URL;

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
    setMyNote(null);
  };

  const identityLabel = user?.displayName || user?.email;

  return (
    <header className="site-header">
      {/* GoXL parent brand — pinned to the top-left on every device; links to
          the GoXL website. */}
      <div className="brand-corner">
        <a
          href={GOXL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="brand-link"
          aria-label="GoXL — visit the GoXL website"
        >
          <Logo className="brand-logo" />
        </a>
      </div>

      <div className="header-corner">
        {/* Desktop actions — inline in the corner. */}
        {whatsapp && (
          <a
            className="btn btn-ghost header-corner__action wa-link"
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
          >
            <WhatsAppIcon />
            community
          </a>
        )}
        <button className="btn btn-ghost header-corner__action" onClick={onAbout}>
          about
        </button>
        {user && (
          <span className="identity header-corner__action">
            <span className="identity__name">{identityLabel}</span>
            <button className="btn btn-ghost" onClick={handleSignOut}>
              sign out
            </button>
          </span>
        )}

        {/* Mobile — collapse the same actions into a hamburger menu. */}
        <button
          className="nav-toggle"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span className="nav-toggle__bars" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </button>
      </div>

      {menuOpen && (
        <>
          <div className="nav-scrim" onClick={() => setMenuOpen(false)} />
          <div className="nav-menu" role="menu">
            {user && <span className="nav-menu__name">{identityLabel}</span>}
            {whatsapp && (
              <a
                className="nav-menu__item wa-link"
                role="menuitem"
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
              >
                <WhatsAppIcon />
                WhatsApp community
              </a>
            )}
            <button
              className="nav-menu__item"
              role="menuitem"
              onClick={() => {
                onAbout();
                setMenuOpen(false);
              }}
            >
              About
            </button>
            {user && (
              <button
                className="nav-menu__item"
                role="menuitem"
                onClick={() => {
                  handleSignOut();
                  setMenuOpen(false);
                }}
              >
                Sign out
              </button>
            )}
          </div>
        </>
      )}

      <h1 className="wall-title">Founder&apos;s Wall</h1>
      <p className="wall-subtitle">An Initiative by GoXL</p>

      <p className="wall-stats" aria-live="polite">
        <span className="wall-stats__group">
          <span className="wall-stats__num">{noteCount.toLocaleString()}</span>
          <span className="wall-stats__label">
            note{noteCount === 1 ? "" : "s"} pinned
          </span>
        </span>
      </p>
    </header>
  );
}

function WhatsAppIcon() {
  return (
    <svg
      className="wa-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.16c-.24.68-1.42 1.32-1.95 1.36-.5.04-.5.4-3.15-.66-2.66-1.06-4.32-3.79-4.45-3.97-.13-.18-1.06-1.42-1.06-2.71 0-1.29.68-1.92.92-2.18.24-.26.53-.33.71-.33.18 0 .36 0 .51.01.16.01.39-.06.6.46.24.58.82 2 .89 2.14.07.14.12.31.02.49-.09.18-.14.29-.27.45-.13.16-.28.35-.4.47-.13.13-.27.28-.12.54.15.26.66 1.09 1.42 1.76.98.87 1.8 1.14 2.06 1.27.26.13.41.11.56-.07.15-.18.65-.76.82-1.02.17-.26.35-.22.59-.13.24.09 1.52.72 1.78.85.26.13.43.19.5.3.07.11.07.66-.17 1.34Z" />
    </svg>
  );
}
