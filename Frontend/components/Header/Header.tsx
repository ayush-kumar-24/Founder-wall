"use client";

import { useWall } from "@/lib/store";
import { useWallStats } from "@/lib/useWallStats";
import { signOut } from "@/lib/auth";

export default function Header({ onAbout }: { onAbout: () => void }) {
  const user = useWall((s) => s.user);
  const notes = useWall((s) => s.notes);
  const setUser = useWall((s) => s.setUser);
  const setMyNote = useWall((s) => s.setMyNote);
  const { stats, status } = useWallStats();

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

  return (
    <header className="site-header">
      <div className="header-corner">
        <button className="btn btn-ghost" onClick={onAbout}>
          about
        </button>
        {user && (
          <span className="identity">
            <span className="identity__name">
              {user.displayName || user.email}
            </span>
            <button className="btn btn-ghost" onClick={handleSignOut}>
              sign out
            </button>
          </span>
        )}
      </div>

      <h1 className="wall-title">Founder&apos;s Wall</h1>

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
