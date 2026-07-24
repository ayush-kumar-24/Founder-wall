import { create } from "zustand";
import type { NoteData } from "./notes";
import type { UserProfile } from "./auth";
import type { ApiNote, NoteColor } from "./mapping";

export type Phase =
  | "entrance" // darkness → light bloom; user cannot interact
  | "idle" // wandering — free pan, notes readable
  | "writing" // the private moment — room dark, one blank note
  | "flying" // the note travels to the wall
  | "settling"; // contact, ripple, breath — then back to idle

interface WallState {
  // — the room's phase machine —
  phase: Phase;
  phaseStartedAt: number;
  lastLanding: { x: number; y: number; time: number } | null;
  setPhase: (p: Phase) => void;
  setLastLanding: (l: { x: number; y: number; time: number }) => void;

  // — the writing surface —
  writingText: string;
  writingColor: NoteColor;
  setWritingText: (t: string) => void;
  setWritingColor: (c: NoteColor) => void;

  // — the live wall —
  // `notes` is the single source of truth for what hangs on the wall. It starts
  // empty and fills from the backend (initial fetch + live WebSocket events).
  // `notesVersion` bumps whenever the SET changes, so the instanced field can
  // rebuild cleanly (its GPU buffers are sized to the note count at mount).
  notes: NoteData[];
  notesVersion: number;
  notesLoaded: boolean; // the initial wall fetch has settled (for skeleton vs empty)
  setNotes: (notes: NoteData[]) => void;
  setNotesLoaded: (loaded: boolean) => void;
  upsertNote: (note: NoteData) => void;
  removeNoteById: (numericId: number) => void;

  // — the note in flight toward the wall (its place already assigned by the
  //   server), handed to FlyingNote to animate then land. —
  pendingNote: NoteData | null;
  setPendingNote: (n: NoteData | null) => void;

  // The just-posted note's id — StickyNote plays the fly-in animation for it,
  // then it's cleared.
  justPostedId: number | null;
  setJustPostedId: (id: number | null) => void;

  // — identity —
  user: UserProfile | null;
  authReady: boolean; // the initial session check has settled
  myNote: ApiNote | null; // this founder's existing note, if any
  setUser: (u: UserProfile | null) => void;
  setAuthReady: (r: boolean) => void;
  setMyNote: (n: ApiNote | null) => void;

  // — transient feedback for the writing flow —
  postError: string | null;
  setPostError: (m: string | null) => void;
}

export const useWall = create<WallState>((set) => ({
  phase: "entrance",
  phaseStartedAt: performance.now(),
  lastLanding: null,
  setPhase: (p) => set({ phase: p, phaseStartedAt: performance.now() }),
  setLastLanding: (l) => set({ lastLanding: l }),

  writingText: "",
  writingColor: "amber",
  setWritingText: (t) => set({ writingText: t }),
  setWritingColor: (c) => set({ writingColor: c }),

  notes: [],
  notesVersion: 0,
  notesLoaded: false,
  setNotes: (notes) =>
    set((s) => ({ notes, notesVersion: s.notesVersion + 1 })),
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
  removeNoteById: (numericId) =>
    set((s) => {
      if (!s.notes.some((n) => n.id === numericId)) return s;
      return {
        notes: s.notes.filter((n) => n.id !== numericId),
        notesVersion: s.notesVersion + 1,
      };
    }),

  pendingNote: null,
  setPendingNote: (n) => set({ pendingNote: n }),

  justPostedId: null,
  setJustPostedId: (id) => set({ justPostedId: id }),

  user: null,
  authReady: false,
  myNote: null,
  setUser: (u) => set({ user: u }),
  setAuthReady: (r) => set({ authReady: r }),
  setMyNote: (n) => set({ myNote: n }),

  postError: null,
  setPostError: (m) => set({ postError: m }),
}));

// Dev-only debug handle (stripped from production builds) — lets the wall be
// stress-tested from the console, e.g. window.__wall.getState().setNotes(...).
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __wall?: typeof useWall }).__wall = useWall;
}
