import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page notfound">
      <div className="note yellow notfound__note">
        <span className="note__tape" aria-hidden="true" />
        <span className="note__text">This page fell off the wall.</span>
      </div>
      <h1 className="notfound__code">404</h1>
      <p className="notfound__sub">Nothing is pinned here.</p>
      <Link href="/" className="btn btn-primary">
        Back to the wall
      </Link>
    </main>
  );
}
