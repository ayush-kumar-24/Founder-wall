// The view model for one note on the wall. The backend owns content and colour;
// `id` is the note's uuid hashed to a stable number (see mapping.ts) — it keys
// React reconciliation and seeds the deterministic per-note look (tilt, tape
// angle) in StickyNote. `color` is a CSS class from the reference palette.
export interface NoteData {
  id: number;
  text: string;
  color: string; // yellow | pink | purple | blue | green | slate
}
