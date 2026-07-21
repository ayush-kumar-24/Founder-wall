"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { sunrise } from "@/lib/easings";
import { COUNT_UP_DURATION_MS } from "@/lib/config";

interface CountUpProps {
  value: number;
  durationMs?: number;
  className?: string;
}

const format = (n: number) => n.toLocaleString("en-US");

/**
 * Animates a number toward `value`.
 *
 * The tween writes `textContent` straight to the node on each frame instead of
 * setting state. React renders this component once; the canvas beside it is
 * never touched. A 60fps setState here would reconcile on every frame next to
 * a live WebGL scene, which is exactly what we cannot afford.
 *
 * Uses `sunrise` — the house easing for light — rather than inventing another.
 */
export default function CountUp({
  value,
  durationMs = COUNT_UP_DURATION_MS,
  className,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  // Where the next tween starts: the figure currently on screen.
  const displayedRef = useRef(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const from = displayedRef.current;
    const to = value;

    if (from === to) {
      el.textContent = format(to);
      return;
    }

    // Counting up is decoration; respect a reader who asked for stillness.
    if (reduceMotion) {
      displayedRef.current = to;
      el.textContent = format(to);
      return;
    }

    let frame = 0;
    let start: number | null = null;

    const tick = (now: number) => {
      start ??= now;
      const t = Math.min((now - start) / durationMs, 1);
      const current = Math.round(from + (to - from) * sunrise(t));
      el.textContent = format(current);
      displayedRef.current = current;
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        displayedRef.current = to;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, reduceMotion]);

  // Server and first client paint agree on "0"; the tween takes over after.
  return (
    <span ref={ref} className={className}>
      0
    </span>
  );
}
