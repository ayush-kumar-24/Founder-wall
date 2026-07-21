// The seam between the backend's anonymous grid note and the renderer's
// hand-made paper. The backend owns TRUTH — content, colour family, and the
// cell a note occupies. Everything that makes a note look handwritten (its
// exact lean, ink pressure, tape, the jitter of its paper) is cosmetic and is
// derived DETERMINISTICALLY from the note's id here, so the wall looks varied
// and human without the backend ever carrying presentation concerns — and so
// the same note always looks identical across reloads and across visitors.

import { NoteData, WALL } from "./notes";

/** The public note shape returned by GET /wall/tiles/{id} and pushed over WS. */
export interface ApiNote {
  id: string; // uuid
  content: string;
  color: NoteColor;
  x: number; // grid column, 0 .. columns-1
  y: number; // grid row, 0 .. rows-1
  tile_id: number;
  created_at: string; // ISO 8601
}

export type NoteColor =
  | "amber"
  | "rose"
  | "sky"
  | "emerald"
  | "violet"
  | "slate";

/** The six colour families the backend enum allows, as aged-paper hexes. */
export const COLOR_HEX: Record<NoteColor, string> = {
  amber: "#e7c988",
  rose: "#e2b9ad",
  sky: "#bcd0d8",
  emerald: "#bccca6",
  violet: "#cabfd0",
  slate: "#c3c0b7",
};

/** The colours a founder may pick when posting, in display order. */
export const NOTE_COLORS: NoteColor[] = [
  "amber",
  "rose",
  "sky",
  "emerald",
  "violet",
  "slate",
];

// Grid geometry — mirrors the backend defaults (WALL_COLUMNS / WALL_ROWS).
// These are the *addressable* cells; the world mapping below spreads them
// across the lit, readable band of the physical wall.
const COLUMNS = 40;
const ROWS = 25;

// The world-space band the grid maps onto. Chosen to sit inside the region the
// demo notes occupied (x within ~±4.6, y within the ~0.7–3.9 lit band) so the
// lighting, camera framing, and readable-zone all still land correctly.
const WORLD_X_SPAN = 9.2; // full width used, centred on 0
const WORLD_Y_TOP = 3.9;
const WORLD_Y_BOTTOM = 0.7;

/** A tiny, stable string hash → uint32, for seeding per-note cosmetics. */
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic PRNG seeded from a uint32 (mulberry32). */
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

/** Grid cell → world x. */
function cellToWorldX(col: number): number {
  return ((col + 0.5) / COLUMNS - 0.5) * WORLD_X_SPAN;
}

/** Grid row → world y (row 0 sits high on the wall). */
function cellToWorldY(row: number): number {
  const t = (row + 0.5) / ROWS;
  return WORLD_Y_TOP - t * (WORLD_Y_TOP - WORLD_Y_BOTTOM);
}

/**
 * How old a note reads, 0 (fresh) → 1 (ancient). Drives paper curl and fade.
 * A note eases toward "aged" over ~180 days; brand-new notes stay crisp.
 */
function ageFromTimestamp(createdAt: string, now: number): number {
  const born = Date.parse(createdAt);
  if (!Number.isFinite(born)) return 0.15;
  const days = Math.max(0, (now - born) / 86_400_000);
  return Math.min(1, Math.pow(days / 180, 0.7));
}

// A numeric id space for the renderer, which keys textures/instances by number.
// uuids are hashed to uint32; collisions across a wall of thousands are
// astronomically unlikely and cost only a shared texture cache slot if they
// ever occur.
export function numericId(id: string): number {
  return hashId(id);
}

/**
 * Map a backend note onto the renderer's NoteData. Content, colour, and cell
 * come from the server; the hand-made cosmetics are seeded from the id so they
 * are stable and unique per note.
 */
export function apiNoteToNoteData(api: ApiNote, now: number): NoteData {
  const rnd = seeded(hashId(api.id));
  const age = ageFromTimestamp(api.created_at, now);
  return {
    id: numericId(api.id),
    text: api.content,
    who: "", // notes are anonymous by design; the wall never signs them
    slant: (rnd() * 2 - 1) * 0.09,
    inkDark: 0.72 + rnd() * 0.28,
    fontScale: 0.82 + rnd() * 0.42,
    caps: rnd() < 0.09,
    tape: rnd() < 0.15,
    underline: rnd() < 0.12,
    x: cellToWorldX(api.x),
    y: cellToWorldY(api.y),
    rot: (rnd() * 2 - 1) * 0.22 * (0.4 + age),
    scale: 0.85 + rnd() * 0.3,
    color: COLOR_HEX[api.color] ?? COLOR_HEX.amber,
    age,
    readable: true,
  };
}
