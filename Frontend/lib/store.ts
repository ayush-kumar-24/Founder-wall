import { create } from "zustand";
import type { NoteData } from "./notes";
import type { ApiComment } from "./mapping";

interface WallState {
  // — the live wall —
  // `notes` is the single source of truth for what hangs on the wall. It starts
  // empty and fills from the backend (initial fetch + live WebSocket events).
  notes: NoteData[];
  notesVersion: number; // bumps when the SET changes (add/remove), for layout keys
  notesLoaded: boolean; // the initial wall fetch has settled (skeleton vs empty)
  setNotes: (notes: NoteData[]) => void;
  setNotesLoaded: (loaded: boolean) => void;
  upsertNote: (note: NoteData) => void;
  patchNote: (numericId: number, patch: Partial<NoteData>) => void;
  removeNoteById: (numericId: number) => void;

  // The just-posted note's id — StickyNote plays the fly-in animation for it,
  // then it's cleared.
  justPostedId: number | null;
  setJustPostedId: (id: number | null) => void;

  // The most recent comment pushed over the live feed — an open NoteViewer
  // watches this to append comments in real time.
  liveComment: { noteApiId: string; comment: ApiComment } | null;
  setLiveComment: (c: { noteApiId: string; comment: ApiComment } | null) => void;
}

export const useWall = create<WallState>((set) => ({
  notes: [],
  notesVersion: 0,
  notesLoaded: false,
  setNotes: (notes) => set((s) => ({ notes, notesVersion: s.notesVersion + 1 })),
  setNotesLoaded: (loaded) => set({ notesLoaded: loaded }),
  upsertNote: (note) =>
    set((s) => {
      const i = s.notes.findIndex((n) => n.id === note.id);
      if (i === -1) {
        return { notes: [...s.notes, note], notesVersion: s.notesVersion + 1 };
      }
      const next = s.notes.slice();
      next[i] = note;
      return { notes: next, notesVersion: s.notesVersion + 1 };
    }),
  patchNote: (numericId, patch) =>
    set((s) => {
      const i = s.notes.findIndex((n) => n.id === numericId);
      if (i === -1) return s;
      const next = s.notes.slice();
      next[i] = { ...next[i], ...patch };
      return { notes: next };
    }),
  removeNoteById: (numericId) =>
    set((s) => {
      if (!s.notes.some((n) => n.id === numericId)) return s;
      return {
        notes: s.notes.filter((n) => n.id !== numericId),
        notesVersion: s.notesVersion + 1,
      };
    }),

  justPostedId: null,
  setJustPostedId: (id) => set({ justPostedId: id }),

  liveComment: null,
  setLiveComment: (c) => set({ liveComment: c }),
}));

// Dev-only debug handle (stripped from production builds) — lets the wall be
// stress-tested from the console, e.g. window.__wall.getState().setNotes(...).
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __wall?: typeof useWall }).__wall = useWall;
}
