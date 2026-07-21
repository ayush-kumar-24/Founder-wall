"use client";

// The moment a founder commits their note. We post it to the backend, which
// assigns its place on the wall, then hand the assigned note to the flight
// animation. The persisted note reaches the wall two ways — the flight's
// landing and the live WebSocket echo — which converge on the same id, so it
// never doubles.

import { useWall } from "./store";
import {
  createNote,
  fetchMyNote,
  NoteExistsError,
  ContentRejectedError,
  ApiError,
} from "./api";
import { apiNoteToNoteData } from "./mapping";

export async function submitNote(): Promise<void> {
  const s = useWall.getState();
  const content = s.writingText.trim();
  if (!content) return;

  if (!s.user) {
    s.setPostError("Sign in with Google to leave your note.");
    return;
  }

  s.setPostError(null);
  try {
    const api = await createNote(content, s.writingColor);
    s.setMyNote(api);
    s.setPendingNote(apiNoteToNoteData(api, Date.now()));
    s.setPhase("flying");
    // Safety net: the flight-to-idle transition runs inside the render loop.
    // If that loop stalls (a lost GPU context, a throttled background tab), the
    // note still reaches the wall over the live feed — so force the room back to
    // idle regardless, rather than leaving the founder stranded mid-flight.
    setTimeout(() => {
      const cur = useWall.getState();
      if (cur.phase === "flying" || cur.phase === "settling") {
        cur.setPendingNote(null);
        cur.setWritingText("");
        cur.setPhase("idle");
      }
    }, 7000);
  } catch (e) {
    if (e instanceof NoteExistsError) {
      // They already have a note — surface it and step back to the wall.
      try {
        const mine = await fetchMyNote();
        s.setMyNote(mine);
      } catch {
        /* non-fatal */
      }
      s.setPostError("You have already left your note on the wall.");
      s.setWritingText("");
      s.setPhase("idle");
    } else if (e instanceof ContentRejectedError) {
      s.setPostError(e.message); // stay in writing so they can revise
    } else if (e instanceof ApiError && e.status === 401) {
      s.setPostError("Your session expired — please sign in again.");
      s.setPhase("idle");
    } else {
      s.setPostError("Could not place your note. Please try again.");
    }
  }
}
