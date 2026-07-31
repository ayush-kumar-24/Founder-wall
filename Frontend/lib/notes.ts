// The view model for one note on the wall. The backend owns content and colour;
// `id` is the note's uuid hashed to a stable number (see mapping.ts) — it keys
// React reconciliation and seeds the deterministic per-note look. `apiId` is the
// real uuid, used for like/comment/delete calls. `color` is a CSS class.
export interface NoteData {
  id: number;
  apiId: string; // the note's uuid (for like / comment / delete APIs)
  text: string;
  color: string; // yellow | pink | purple | blue | green | slate
  authorName?: string | null; // shown on the note only if the founder revealed it
  likes: number; // shared like tally, visible to everyone
  commentCount: number;
}
