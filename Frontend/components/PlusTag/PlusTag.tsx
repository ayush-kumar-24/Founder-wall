"use client";

import { useWall } from "@/lib/store";

/**
 * The "+" — a small round paper tag resting at the base of the wall (carried
 * over from the original design; fades in via CSS). It's the single entry point
 * to leave a note: clicking opens the modal, which gates sign-in for signed-out
 * visitors and composing for signed-in ones. Hidden once the founder has left
 * their one note.
 */
export default function PlusTag({ onClick }: { onClick: () => void }) {
  const myNote = useWall((s) => s.myNote);
  if (myNote) return null;
  return (
    <button className="plus-tag" aria-label="leave a note" onClick={onClick}>
      +
    </button>
  );
}
