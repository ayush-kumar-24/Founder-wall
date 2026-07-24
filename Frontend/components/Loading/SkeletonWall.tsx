export default function SkeletonWall() {
  return (
    <div className="skeleton-wall" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="skeleton-note" />
      ))}
    </div>
  );
}
