export default function SkeletonWall() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="skeleton-note" aria-hidden="true" />
      ))}
    </>
  );
}
