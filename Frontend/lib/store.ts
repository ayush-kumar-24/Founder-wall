import { create } from "zustand";

export type Phase =
  | "entrance" // darkness → light bloom; user cannot interact
  | "idle" // wandering — free pan, notes readable
  | "writing" // the private moment — room dark, one blank note
  | "flying" // the note travels to the wall
  | "settling"; // contact, ripple, breath — then back to idle

export interface LandedNote {
  id: number;
  text: string;
  who: string;
  x: number;
  y: number;
  rot: number;
  color: string;
  bornAt: number; // for "slightly brighter, will age"
}

interface WallState {
  phase: Phase;
  phaseStartedAt: number;
  writingText: string;
  landedNotes: LandedNote[];
  lastLanding: { x: number; y: number; time: number } | null;
  setPhase: (p: Phase) => void;
  setWritingText: (t: string) => void;
  addLandedNote: (n: LandedNote) => void;
  setLastLanding: (l: { x: number; y: number; time: number }) => void;
}

export const useWall = create<WallState>((set) => ({
  phase: "entrance",
  phaseStartedAt: performance.now(),
  writingText: "",
  landedNotes: [],
  lastLanding: null,
  setPhase: (p) => set({ phase: p, phaseStartedAt: performance.now() }),
  setWritingText: (t) => set({ writingText: t }),
  addLandedNote: (n) =>
    set((s) => ({ landedNotes: [...s.landedNotes, n] })),
  setLastLanding: (l) => set({ lastLanding: l }),
}));
