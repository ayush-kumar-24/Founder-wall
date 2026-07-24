export default function EmptyState({ onShare }: { onShare: () => void }) {
  return (
    <section className="wall" aria-label="Founder notes">
      <div className="empty-state">
        <p className="empty-state__title">The wall is quiet… for now.</p>
        <p>Be the first to pin a question others are quietly wondering too.</p>
        <button className="btn btn-primary empty-state__cta" onClick={onShare}>
          Share Your Note
        </button>
      </div>
    </section>
  );
}
