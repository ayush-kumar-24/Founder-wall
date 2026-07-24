"use client";

import { useWall } from "@/lib/store";
import { useWallStats } from "@/lib/useWallStats";

export default function Hero() {
  const notes = useWall((s) => s.notes);
  const { stats, status } = useWallStats();

  const pinned = notes.length;
  const online = status === "ready" && stats ? stats.online : 0;

  return (
    <section className="hero">
      <h1 className="hero-title">
        <span className="flourish" aria-hidden="true">
          ⇒
        </span>
        Founder&apos;s Wall
        <span className="flourish" aria-hidden="true">
          ⇐
        </span>
      </h1>
      <svg
        className="hero-swash"
        viewBox="0 0 500 12"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M4,7 C130,1 350,10 496,5"
          stroke="#2b241a"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
      <p className="hero-sub">
        One wall. Many founders.
        <br />
        Different journeys. Same questions.
      </p>
      <p className="hero-count" aria-live="polite">
        {pinned > 0 && (
          <>
            {pinned} note{pinned === 1 ? "" : "s"} pinned so far.
            {online > 0 && (
              <>
                {" · "}
                <span className="live-dot" aria-hidden="true" />
                {online} here now
              </>
            )}
          </>
        )}
      </p>
    </section>
  );
}
