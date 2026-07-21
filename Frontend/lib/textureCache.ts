import * as THREE from "three";
import { NoteData } from "./notes";
import { makeNoteTexture } from "./paperTexture";

// Every note keeps its own texture — never one giant rasterized wall.
// Two tiers: MID (legible as you approach) and CLOSE (reading distance:
// fibers, fold, pencil grain). Textures are generated a few per frame
// so approaching the wall never stutters, and evicted LRU-style when
// the visitor has wandered elsewhere.

export const TIER_MID = 224;
export const TIER_CLOSE = 512;
export const TIER_FOCUS = 1024; // the note in the visitor's hand

interface Entry {
  tex: THREE.CanvasTexture;
  lastTouch: number;
}

const cache = new Map<string, Entry>();
const pending = new Set<string>();
const queue: { key: string; note: NoteData; tier: number }[] = [];

const CAPS: Record<number, number> = {
  [TIER_MID]: 240, // ~12MB
  [TIER_CLOSE]: 56, // ~56MB worst case, evicted aggressively
  [TIER_FOCUS]: 6, // only ever a handful in hand
};

function key(note: NoteData, tier: number) {
  return `${note.id}:${tier}`;
}

// Ask for a texture. Returns the best already-available tier immediately
// (may be lower than requested, may be null) and queues the requested one.
export function getNoteTexture(
  note: NoteData,
  tier: number
): THREE.CanvasTexture | null {
  const k = key(note, tier);
  const hit = cache.get(k);
  const now = performance.now();
  if (hit) {
    hit.lastTouch = now;
    return hit.tex;
  }
  if (!pending.has(k)) {
    pending.add(k);
    queue.push({ key: k, note, tier });
  }
  // fall back to the nearest available tier — same content, softer.
  // The swap to sharp reads as focus arriving, never as popping.
  const order =
    tier === TIER_FOCUS
      ? [TIER_CLOSE, TIER_MID]
      : tier === TIER_CLOSE
        ? [TIER_FOCUS, TIER_MID]
        : [TIER_CLOSE, TIER_FOCUS];
  for (const alt of order) {
    const altHit = cache.get(key(note, alt));
    if (altHit) {
      altHit.lastTouch = now;
      return altHit.tex;
    }
  }
  return null;
}

// Generate a few textures per frame. Call once per frame from the scene.
export function pumpTextureQueue(budget = 3) {
  let made = 0;
  while (made < budget && queue.length) {
    const job = queue.shift()!;
    pending.delete(job.key);
    if (cache.has(job.key)) continue;
    const tex = makeNoteTexture(
      job.note.text,
      job.note.color,
      job.tier,
      job.note.age,
      job.note.id + 7,
      job.tier >= TIER_CLOSE ? 1 : 0,
      job.note.who,
      job.note
    );
    cache.set(job.key, { tex, lastTouch: performance.now() });
    made++;
    evict(job.tier);
  }
}

function evict(tier: number) {
  const cap = CAPS[tier] ?? 200;
  const suffix = `:${tier}`;
  const entries: [string, Entry][] = [];
  for (const [k, e] of cache) if (k.endsWith(suffix)) entries.push([k, e]);
  if (entries.length <= cap) return;
  entries.sort((a, b) => a[1].lastTouch - b[1].lastTouch);
  const now = performance.now();
  for (let i = 0; i < entries.length - cap; i++) {
    const [k, e] = entries[i];
    if (now - e.lastTouch < 2500) break; // never dispose what's on screen
    e.tex.dispose();
    cache.delete(k);
  }
}
