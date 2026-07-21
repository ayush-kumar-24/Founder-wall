"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useWall } from "@/lib/store";
import LiveCounter from "./LiveCounter";

// The room's own timing: darkness holds, then the wall reveals itself. The
// words arrive after the room does — never on top of the entrance.
const REVEAL_EASE = [0.4, 0, 0.2, 1] as const;

const fade = (delay: number, duration = 2.2) => ({
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { delay, duration, ease: REVEAL_EASE } },
  exit: { opacity: 0, transition: { duration: 0.7, ease: REVEAL_EASE } },
});

/**
 * The hero. Fixed, top-centre, and entirely inert.
 *
 * Two rules hold this together:
 *
 *  1. `pointer-events: none` on every node. The scene binds pointermove /
 *     pointerdown / pointerup to `window`, so nothing here can swallow a drag,
 *     a hover, or a note selection — the overlay is not in the input path.
 *
 *  2. It speaks only while the room is idle. During `writing` the wall dims for
 *     the private moment; leaving a headline over someone composing a thought
 *     they have never said aloud would undo the whole design. It withdraws, and
 *     returns when they do.
 */
export default function HeroOverlay() {
  const phase = useWall((s) => s.phase);
  const visible = phase === "idle";

  return (
    <AnimatePresence>
      {visible && [
        // Siblings, not nested: `.hero` is transformed, and a transformed
        // ancestor becomes the containing block for `position: fixed`
        // descendants — nesting would trap the scrim at the hero's 600px
        // instead of letting it span the frame.
        /* Weighting the top of the frame so light type holds against a bright
           wall. It rises with the words and leaves with them. */
        <motion.div
          key="hero-scrim"
          className="hero-scrim"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.3, duration: 2.8, ease: REVEAL_EASE } }}
          exit={{ opacity: 0, transition: { duration: 0.7, ease: REVEAL_EASE } }}
        />,
        <motion.header
          key="hero"
          className="hero"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.01 } }}
          exit={{ opacity: 0, transition: { duration: 0.7, ease: REVEAL_EASE } }}
        >
          <motion.h1 className="hero-title" {...fade(0.5, 2.6)}>
            The Founder&rsquo;s Mind
          </motion.h1>
          <motion.p className="hero-subtitle" {...fade(1.1)}>
            A place where founders leave the thoughts they usually keep to
            themselves.
          </motion.p>
          <motion.div {...fade(1.7)}>
            <LiveCounter />
          </motion.div>
        </motion.header>,
      ]}
    </AnimatePresence>
  );
}
