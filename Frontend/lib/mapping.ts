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
  author_name: string | null; // optional name the poster typed
  affiliation: string | null; // startup / org / what they're building (required on post)
  likes: number; // shared like tally, visible to everyone
  comment_count: number;
  x: number; // grid column (server-assigned; unused by the 2D wall)
  y: number; // grid row
  tile_id: number;
  created_at: string; // ISO 8601
}

/** A public comment on a note. */
export interface ApiComment {
  id: string; // uuid
  content: string;
  author_name: string | null;
  affiliation: string | null;
  created_at: string;
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

/** The three note categories a founder chooses from — each maps to a fixed
 *  colour so the wall reads at a glance: green = advice, red = problem,
 *  blue = experience. */
export type NoteCategoryKey = "advice" | "problem" | "experience";

export interface NoteCategory {
  key: NoteCategoryKey;
  label: string;
  hint: string;
  value: NoteColor; // backend enum sent to the API
  name: WallColor; // CSS class on the sticky note
  hex: string; // swatch preview colour
}

export const NOTE_CATEGORIES: NoteCategory[] = [
  {
    key: "advice",
    label: "Advice",
    hint: "Something you'd tell a fellow founder",
    value: "emerald",
    name: "green",
    hex: "#9cc77e",
  },
  {
    key: "problem",
    label: "Problem",
    hint: "Something you're stuck on",
    value: "rose",
    name: "pink",
    hex: "#e8817a",
  },
  {
    key: "experience",
    label: "Experience",
    hint: "Something you've lived through",
    value: "sky",
    name: "blue",
    hex: "#8fbad6",
  },
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
    apiId: api.id,
    text: api.content,
    color: COLOR_CLASS[api.color] ?? "yellow",
    authorName: api.author_name ?? null,
    affiliation: api.affiliation ?? null,
    likes: api.likes ?? 0,
    commentCount: api.comment_count ?? 0,
  };
}
