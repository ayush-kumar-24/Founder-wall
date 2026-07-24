"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useWall } from "@/lib/store";
import { numericId } from "@/lib/mapping";
import type { NoteData } from "@/lib/notes";
import { useLikes } from "@/lib/useLikes";
import { useWallActions } from "@/lib/useWallActions";
import StickyNote from "../StickyNote/StickyNote";
import NoteViewer from "../StickyNote/NoteViewer";
import EmptyState from "../EmptyState/EmptyState";
import SkeletonWall from "../Loading/SkeletonWall";

/** Notes live at a fixed, readable size on a big virtual wall. You see the
 *  whole wall zoomed out; scroll/pinch zooms toward the cursor to read. */
const NOTE_S = 200;
const DEPTH_MAX = 26; // px of translateZ — subtle parallax under perspective
const MAX_SCALE = 1.5;

/** Deterministic PRNG (mulberry32) seeded from a note's numeric id. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface NoteLayout {
  left: number;
  top: number;
  rot: number;
  z: number;
  depth: number; // translateZ for parallax
}

interface Camera {
  x: number;
  y: number;
  s: number;
}

export default function Wall({ onShare }: { onShare: () => void }) {
  const notes = useWall((s) => s.notes);
  const notesLoaded = useWall((s) => s.notesLoaded);
  const myNote = useWall((s) => s.myNote);
  const justPostedId = useWall((s) => s.justPostedId);
  const { isLiked, count, toggle } = useLikes();
  const { remove } = useWallActions();

  const viewportRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [openId, setOpenId] = useState<number | null>(null);
  const [cam, setCam] = useState<Camera>({ x: 0, y: 0, s: 1 });
  const camReady = useRef(false);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const myNumericId = useMemo(
    () => (myNote ? numericId(myNote.id) : null),
    [myNote]
  );

  // — the virtual wall: sized from the note count, always bigger than the
  //   viewport so it reads as a real wall you look INTO, not a screen. —
  const wall = useMemo(() => {
    const n = Math.max(notes.length, 1);
    const vw = dims.w || 1280;
    const vh = dims.h || 800;
    const cellW = NOTE_S * 1.42;
    const cellH = NOTE_S * 1.26;
    const cols = Math.max(
      3,
      Math.ceil(Math.sqrt((n * (vw / vh) * cellH) / cellW))
    );
    const rows = Math.max(2, Math.ceil(n / cols));
    return {
      W: Math.max(cols * cellW + cellW * 0.6, vw * 1.2),
      H: Math.max(rows * cellH + cellH * 0.6, vh * 1.2),
      cols,
      cellW,
      cellH,
      rows,
    };
  }, [notes.length, dims]);

  // The zoomed-all-the-way-out scale: the whole wall in view, with a margin.
  const minScale = useMemo(() => {
    if (dims.w <= 0 || dims.h <= 0) return 0.2;
    return Math.min(dims.w / wall.W, dims.h / wall.H) * 0.94;
  }, [dims, wall]);

  const clampCam = useCallback(
    (c: Camera): Camera => {
      const s = Math.min(Math.max(c.s, minScale), MAX_SCALE);
      const sw = wall.W * s;
      const sh = wall.H * s;
      let x = c.x;
      let y = c.y;
      if (sw <= dims.w) x = (dims.w - sw) / 2;
      else x = Math.min(0, Math.max(dims.w - sw, x));
      if (sh <= dims.h) y = (dims.h - sh) / 2;
      else y = Math.min(0, Math.max(dims.h - sh, y));
      return { x, y, s };
    },
    [minScale, wall, dims]
  );

  // Start (and re-fit on resize until the user interacts) fully zoomed out —
  // the complete wall in frame.
  useEffect(() => {
    if (dims.w <= 0 || dims.h <= 0) return;
    if (camReady.current) {
      setCam((c) => clampCam(c));
      return;
    }
    setCam(clampCam({ x: 0, y: 0, s: minScale }));
  }, [dims, minScale, clampCam]);

  // Zoom toward the cursor: the point under the pointer stays put while the
  // wall around it grows. Native listener because wheel must be non-passive.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camReady.current = true;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setCam((c) => {
        const target = Math.min(
          Math.max(c.s * Math.exp(-e.deltaY * 0.0016), minScale),
          MAX_SCALE
        );
        const k = target / c.s;
        return clampCam({
          x: mx - (mx - c.x) * k,
          y: my - (my - c.y) * k,
          s: target,
        });
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [minScale, clampCam]);

  // Drag to pan (mouse or touch). A real drag suppresses the click-to-open.
  const drag = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    camX: 0,
    camY: 0,
  });
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      camX: cam.x,
      camY: cam.y,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) > 5) {
      d.moved = true;
      camReady.current = true;
      // Capture only once a real drag starts — capturing on pointerdown would
      // retarget pointerup to the viewport and swallow note clicks.
      viewportRef.current?.setPointerCapture(e.pointerId);
    }
    if (d.moved) setCam(clampCam({ x: d.camX + dx, y: d.camY + dy, s: cam.s }));
  };
  const onPointerUp = () => {
    drag.current.active = false;
  };

  const zoomBy = (k: number) => {
    camReady.current = true;
    setCam((c) => {
      const target = Math.min(Math.max(c.s * k, minScale), MAX_SCALE);
      const f = target / c.s;
      const mx = dims.w / 2;
      const my = dims.h / 2;
      return clampCam({
        x: mx - (mx - c.x) * f,
        y: my - (my - c.y) * f,
        s: target,
      });
    });
  };

  // Scatter over the virtual wall — jittered grid, per-note rotation + depth.
  const layouts = useMemo(() => {
    const map = new Map<number, NoteLayout>();
    if (notes.length === 0) return map;
    const { W, H, cols, cellW, cellH } = wall;
    const rows = Math.ceil(notes.length / cols);
    const ox = Math.max(0, (W - cols * cellW) / 2);
    const oy = Math.max(0, (H - rows * cellH) / 2);
    notes.forEach((note, i) => {
      const rnd = seeded(note.id);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const jx = (rnd() * 2 - 1) * cellW * 0.16;
      const jy = (rnd() * 2 - 1) * cellH * 0.16;
      const rot = (rnd() * 2 - 1) * 8;
      const z = Math.floor(rnd() * 6);
      const depth = rnd() * DEPTH_MAX;
      map.set(note.id, {
        left: Math.min(Math.max(8, ox + col * cellW + cellW * 0.1 + jx), W - NOTE_S - 8),
        top: Math.min(Math.max(8, oy + row * cellH + cellH * 0.08 + jy), H - NOTE_S * 0.84 - 8),
        rot,
        z,
        depth,
      });
    });
    return map;
  }, [notes, wall]);

  const openNote = openId != null ? notes.find((n) => n.id === openId) : null;
  const zoomedOut = cam.s <= minScale * 1.02;

  return (
    <>
      <section
        ref={viewportRef}
        className={`wall wall--scatter${drag.current.active ? " wall--dragging" : ""}`}
        id="wall"
        aria-label="Founder notes"
        style={{ "--note-size": `${NOTE_S}px` } as CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {!notesLoaded && notes.length === 0 ? (
          <SkeletonWall />
        ) : notes.length === 0 ? (
          <EmptyState onShare={onShare} />
        ) : (
          <div
            className="wall-plane"
            style={{
              width: `${wall.W}px`,
              height: `${wall.H}px`,
              transform: `translate3d(${cam.x}px, ${cam.y}px, 0) scale(${cam.s})`,
            }}
          >
            {notes.map((note) => (
              <StickyNote
                key={note.id}
                note={note}
                isMine={note.id === myNumericId}
                fresh={note.id === justPostedId}
                layout={layouts.get(note.id)}
                scale={cam.s}
                onOpen={() => {
                  if (!drag.current.moved) setOpenId(note.id);
                }}
              />
            ))}
          </div>
        )}

        {notes.length > 0 && (
          <>
            <p className="wall-hint" aria-hidden="true">
              {zoomedOut ? "scroll to zoom in · drag to pan" : "drag to pan · click a note to read"}
            </p>
            <div className="zoom-ctrl" aria-label="Zoom controls">
              <button onClick={() => zoomBy(1.35)} aria-label="Zoom in">+</button>
              <button onClick={() => zoomBy(1 / 1.35)} aria-label="Zoom out">−</button>
              <button
                onClick={() => {
                  camReady.current = false;
                  setCam(clampCam({ x: 0, y: 0, s: minScale }));
                }}
                aria-label="See the whole wall"
              >
                ⤢
              </button>
            </div>
          </>
        )}
      </section>

      {openNote && (
        <NoteViewer
          note={openNote as NoteData}
          isMine={openNote.id === myNumericId}
          liked={isLiked(openNote.id)}
          likeCount={count(openNote.id)}
          onLike={() => toggle(openNote.id)}
          onRemove={async () => {
            if (myNote) await remove(myNote.id);
            setOpenId(null);
          }}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
