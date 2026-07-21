"use client";

import { AnimatePresence, motion } from "framer-motion";
import CountUp from "./CountUp";
import { useWallStats } from "@/lib/useWallStats";

/**
 * "● 1,098 founders have shared their thoughts"
 *
 * States, all deliberately quiet:
 *  - loading — the dot alone. It signals a live connection while the figure is
 *    still in flight, and reserves no space it will not use.
 *  - ready   — the sentence fades in and the number counts up.
 *  - error   — nothing. The wall is the product; a failed counter must not put
 *    an error message in front of it. The next poll simply tries again.
 */
export default function LiveCounter() {
  const { stats, status } = useWallStats();
  const ready = status === "ready" && stats !== null;

  // The wall never went quiet — say nothing rather than "0 founders".
  const hasFounders = ready && stats.founders > 0;

  return (
    <div className="hero-live" aria-live="polite">
      <span className="hero-live-dot" aria-hidden="true" />
      <AnimatePresence>
        {hasFounders && (
          <motion.span
            key="figure"
            className="hero-live-text"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 1.6, ease: [0.4, 0, 0.2, 1] } }}
            exit={{ opacity: 0, transition: { duration: 0.6 } }}
          >
            <CountUp value={stats.founders} className="hero-live-number" />
            {stats.founders === 1
              ? " founder has shared a thought"
              : " founders have shared their thoughts"}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
