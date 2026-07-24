"use client";

import { useWall } from "@/lib/store";
import { signOut } from "@/lib/auth";

export default function Header({ onShare }: { onShare: () => void }) {
  const user = useWall((s) => s.user);
  const setUser = useWall((s) => s.setUser);
  const setMyNote = useWall((s) => s.setMyNote);

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
    setMyNote(null);
  };

  return (
    <header className="site-header">
      <div className="logo">Founder&apos;s Wall</div>
      <div className="header-actions">
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
        <button className="btn btn-primary" onClick={onShare}>
          Share Your Note
        </button>
      </div>
    </header>
  );
}
