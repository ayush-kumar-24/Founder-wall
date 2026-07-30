"use client";

/**
 * The "+" — a small round paper tag resting at the base of the wall. It's the
 * entry point to leave a note: clicking opens the compose modal. Posting is
 * open to everyone with no limit, so it's always available.
 */
export default function PlusTag({ onClick }: { onClick: () => void }) {
  return (
    <button className="plus-tag" aria-label="leave a note" onClick={onClick}>
      +
    </button>
  );
}
