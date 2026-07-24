"use client";

import { useState } from "react";
import { useWall } from "@/lib/store";
import { useWallStats } from "@/lib/useWallStats";
import { signOut } from "@/lib/auth";
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
  const founders = ready ? stats.founders : 0;
  const online = ready ? stats.online : 0;

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
    setMyNote(null);
  };

  const identityLabel = user?.displayName || user?.email;

  return (
    <header className="site-header">
      {/* GoXL parent brand — pinned to the top-left on every device. */}
      <div className="brand-corner">
        <Logo className="brand-logo" />
      </div>

      <div className="header-corner">
        {/* Desktop actions — inline in the corner. */}
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
      <p className="wall-subtitle">GoXL&apos;s Initiative</p>

      <p className="wall-stats" aria-live="polite">
        <span className="wall-stats__group">
          <span className="wall-stats__num">{noteCount.toLocaleString()}</span>
          <span className="wall-stats__label">
            note{noteCount === 1 ? "" : "s"} pinned
          </span>
        </span>
        <span className="wall-stats__dot">·</span>
        <span className="wall-stats__group">
          <span className="wall-stats__num">{founders.toLocaleString()}</span>
          <span className="wall-stats__label">
            founder{founders === 1 ? "" : "s"}
          </span>
        </span>
        {online > 0 && (
          <>
            <span className="wall-stats__dot">·</span>
            <span className="wall-stats__group wall-stats__group--live">
              <span className="live-dot" aria-hidden="true" />
              <span className="wall-stats__label">{online} here now</span>
            </span>
          </>
        )}
      </p>
    </header>
  );
}
