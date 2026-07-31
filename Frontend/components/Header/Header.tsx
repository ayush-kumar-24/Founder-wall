"use client";

import { useState } from "react";
import { useWall } from "@/lib/store";
import { useWallStats } from "@/lib/useWallStats";
import { GOXL_URL, GOXL_WHATSAPP_URL } from "@/lib/config";
import Logo from "../Logo/Logo";
import WhatsAppIcon from "../WhatsAppIcon";

export default function Header({ onAbout }: { onAbout: () => void }) {
  const notes = useWall((s) => s.notes);
  const { stats, status } = useWallStats();

  const [menuOpen, setMenuOpen] = useState(false);

  const ready = status === "ready" && stats !== null;
  // Notes on the wall now (falls back to the live count while it loads).
  const noteCount = notes.length || (ready ? stats.activeNotes : 0);
  const whatsapp = GOXL_WHATSAPP_URL;

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
            <WhatsAppIcon className="wa-icon" />
            community
          </a>
        )}
        <button className="btn btn-ghost header-corner__action" onClick={onAbout}>
          about
        </button>

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
            {whatsapp && (
              <a
                className="nav-menu__item wa-link"
                role="menuitem"
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
              >
                <WhatsAppIcon className="wa-icon" />
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
