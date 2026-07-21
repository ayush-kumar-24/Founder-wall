"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { AnimatePresence, motion } from "framer-motion";
import { useWall } from "@/lib/store";
import Scene from "./Scene";
import HeroOverlay from "./hero/HeroOverlay";

// ————————————————————————————————————————————————————————————
// THE ENTRANCE — not black. Darkness with one distant lit note:
// the ember. A lit window across a valley at night. It proves the
// room exists before the room appears.
// ————————————————————————————————————————————————————————————
function Entrance() {
  const phase = useWall((s) => s.phase);
  return (
    <AnimatePresence>
      {phase === "entrance" && (
        <motion.div
          key="entrance"
          initial={{ opacity: 1 }}
          animate={{
            opacity: 0,
            transition: { delay: 1.7, duration: 2.9, ease: [0.4, 0, 0.2, 1] },
          }}
          exit={{ opacity: 0, transition: { duration: 0.01 } }}
          style={{
            position: "fixed",
            inset: 0,
            background: "#0e0b09",
            zIndex: 40,
            pointerEvents: "none",
          }}
        >
          {/* the ember */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.85, 0.7, 0.85] }}
            transition={{ duration: 2.6, times: [0, 0.35, 0.7, 1] }}
            style={{
              position: "absolute",
              left: "61%",
              top: "42%",
              width: 7,
              height: 7,
              borderRadius: 1,
              background: "#e8c98d",
              boxShadow: "0 0 18px 6px rgba(232,201,141,0.28)",
              transform: "rotate(6deg)",
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ————————————————————————————————————————————————————————————
// THE "+" — a small round paper tag resting quietly at the edge
// of the light. No label. No tooltip. No pulse. The ones who find
// it will mean it.
// ————————————————————————————————————————————————————————————
function PlusTag() {
  const phase = useWall((s) => s.phase);
  const setPhase = useWall((s) => s.setPhase);
  if (phase !== "idle") return null;
  return (
    <motion.button
      className="plus-tag"
      aria-label="leave a note"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: 2.2, duration: 2.4 } }}
      onClick={() => setPhase("writing")}
    >
      +
    </motion.button>
  );
}

// ————————————————————————————————————————————————————————————
// THE GHOST INPUT — invisible. Keystrokes become graphite on the
// paper in the scene. The note's surface IS the interface.
// ————————————————————————————————————————————————————————————
function GhostInput() {
  const phase = useWall((s) => s.phase);
  const text = useWall((s) => s.writingText);
  const setWritingText = useWall((s) => s.setWritingText);
  const setPhase = useWall((s) => s.setPhase);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (phase === "writing") {
      const id = setTimeout(() => ref.current?.focus(), 350);
      return () => clearTimeout(id);
    }
  }, [phase]);

  if (phase !== "writing") return null;
  return (
    <>
      <textarea
        ref={ref}
        className="ghost-input"
        value={text}
        maxLength={120} // the note is only so big. Paper doesn't have counters.
        onChange={(e) => setWritingText(e.target.value.replace(/\n/g, " "))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (text.trim().length > 0) setPhase("flying");
          }
          if (e.key === "Escape") {
            setWritingText("");
            setPhase("idle");
          }
        }}
        onBlur={() => ref.current?.focus()}
      />
      <AnimatePresence>
        {text.trim().length > 0 && (
          <motion.div
            className="whisper"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 1.2, duration: 1.4 } }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
          >
            press enter to place it on the wall
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ————————————————————————————————————————————————————————————
// THE HINT — the room speaks once, softly, only if the visitor
// seems unsure. It never speaks again after the first gesture.
// ————————————————————————————————————————————————————————————
function ExploreHint() {
  const phase = useWall((s) => s.phase);
  const [show, setShow] = useState(false);
  const [dead, setDead] = useState(false);

  useEffect(() => {
    if (dead) return;
    const kill = () => {
      setDead(true);
      setShow(false);
    };
    const id = setTimeout(() => setShow(true), 9000);
    window.addEventListener("pointerdown", kill, { once: true });
    window.addEventListener("wheel", kill, { once: true });
    return () => {
      clearTimeout(id);
      window.removeEventListener("pointerdown", kill);
      window.removeEventListener("wheel", kill);
    };
  }, [dead]);

  if (dead || phase !== "idle") return null;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="whisper"
          style={{ bottom: "calc(5vh + var(--safe-bottom))" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 2 } }}
          exit={{ opacity: 0, transition: { duration: 0.6 } }}
        >
          drag to wander
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ————————————————————————————————————————————————————————————
export default function Experience() {
  const setPhase = useWall((s) => s.setPhase);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // the darkness holds — then the room reveals itself
    const id = setTimeout(() => setPhase("idle"), 4900);
    return () => clearTimeout(id);
  }, [setPhase]);

  return (
    <main style={{ position: "fixed", inset: 0 }}>
      {mounted && (
        <Canvas
          shadows="soft"
          dpr={[1, 1.75]}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          camera={{ fov: 36, near: 0.1, far: 60, position: [-0.1, 1.7, 4.6] }}
        >
          <Scene />
        </Canvas>
      )}
      {/* the frame — a breath of darkness at the edges. Architectural
          photography, not a filter. It composes every screenshot. */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 30,
          background:
            "radial-gradient(ellipse 135% 100% at 50% 44%, rgba(0,0,0,0) 64%, rgba(10,8,6,0.2) 100%)",
        }}
      />
      {/* Sibling of the Canvas, never a parent: the stats poll re-renders only
          this subtree, so the scene is untouched by it. */}
      <HeroOverlay />
      <Entrance />
      <PlusTag />
      <GhostInput />
      <ExploreHint />
    </main>
  );
}
