"use client";

import { useMemo } from "react";
import { useWall } from "@/lib/store";
import { numericId } from "@/lib/mapping";
import { useLikes } from "@/lib/useLikes";
import { useWallActions } from "@/lib/useWallActions";
import StickyNote from "../StickyNote/StickyNote";
import EmptyState from "../EmptyState/EmptyState";
import SkeletonWall from "../Loading/SkeletonWall";

export default function Wall({ onShare }: { onShare: () => void }) {
  const notes = useWall((s) => s.notes);
  const notesLoaded = useWall((s) => s.notesLoaded);
  const myNote = useWall((s) => s.myNote);
  const { isLiked, count, toggle } = useLikes();
  const { remove } = useWallActions();

  // Which rendered note is the signed-in founder's own (backend id → numeric).
  const myNumericId = useMemo(
    () => (myNote ? numericId(myNote.id) : null),
    [myNote]
  );

  if (!notesLoaded && notes.length === 0) return <SkeletonWall />;
  if (notes.length === 0) return <EmptyState onShare={onShare} />;

  return (
    <section className="wall" id="wall" aria-label="Founder notes">
      {notes.map((note) => (
        <StickyNote
          key={note.id}
          note={note}
          isMine={note.id === myNumericId}
          liked={isLiked(note.id)}
          likeCount={count(note.id)}
          onLike={toggle}
          onRemove={() => myNote && remove(myNote.id)}
        />
      ))}
    </section>
  );
}
