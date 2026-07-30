// Notes this browser has posted. With no accounts, the delete token returned at
// creation is the only proof of authorship — we keep it here so the poster can
// remove their own notes from the same device. Keyed by the note's stable
// numeric id (see mapping.ts) → { apiId (uuid), token }.

const KEY = "fw.mynotes.v1";

interface Entry {
  apiId: string;
  token: string;
}
type Store = Record<string, Entry>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Store;
  } catch {
    return {};
  }
}

function write(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* private mode / quota — deletion just won't persist */
  }
}

export function rememberNote(numericId: number, apiId: string, token: string): void {
  const store = read();
  store[numericId] = { apiId, token };
  write(store);
}

export function forgetNote(numericId: number): void {
  const store = read();
  delete store[numericId];
  write(store);
}

export function getDeviceNote(numericId: number): Entry | null {
  return read()[numericId] ?? null;
}

/** The numeric ids of every note this browser posted (for "this is mine"). */
export function deviceNoteIds(): Set<number> {
  return new Set(Object.keys(read()).map(Number));
}
