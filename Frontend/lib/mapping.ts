// The seam between the backend's anonymous note and the wall's view model.
// The backend owns content and colour; the note's uuid is hashed to a stable
// number for React keys and the deterministic per-note look. Colours map to the
// reference palette — presentation only; the enum sent to the API is unchanged.

import type { NoteData } from "./notes";

/** The public note shape returned by GET /wall/tiles/{id} and pushed over WS. */
export interface ApiNote {
  id: string; // uuid
  content: string;
  color: NoteColor;
  x: number; // grid column (server-assigned; unused by the 2D wall)
  y: number; // grid row
  tile_id: number;
  created_at: string; // ISO 8601
}

/** The colour enum the backend accepts. */
export type NoteColor =
  | "amber"
  | "rose"
  | "sky"
  | "emerald"
  | "violet"
  | "slate";

/** The CSS classes / swatch names the wall renders with. */
export type WallColor =
  | "yellow"
  | "pink"
  | "purple"
  | "blue"
  | "green"
  | "slate";

/** Backend enum → CSS class on a sticky note. */
export const COLOR_CLASS: Record<NoteColor, WallColor> = {
  amber: "yellow",
  rose: "pink",
  violet: "purple",
  sky: "blue",
  emerald: "green",
  slate: "slate",
};

/** The five swatches in the share modal: class name, backend enum, swatch hex. */
export const WALL_COLORS: { name: WallColor; value: NoteColor; hex: string }[] =
  [
    { name: "yellow", value: "amber", hex: "#f3d15e" },
    { name: "pink", value: "rose", hex: "#f0a49d" },
    { name: "purple", value: "violet", hex: "#c8b4e3" },
    { name: "blue", value: "sky", hex: "#a9cbe0" },
    { name: "green", value: "emerald", hex: "#b6ce9c" },
  ];

/** A stable FNV-1a hash of a string → uint32. */
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A note's uuid as a stable number, for React keys and the per-note look.
 * Collisions across a realistic wall are astronomically unlikely.
 */
export function numericId(id: string): number {
  return hashId(id);
}

/** Map a backend note onto the wall's view model. */
export function apiNoteToNoteData(api: ApiNote): NoteData {
  return {
    id: numericId(api.id),
    text: api.content,
    color: COLOR_CLASS[api.color] ?? "yellow",
  };
}
