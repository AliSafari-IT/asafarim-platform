import Link from "next/link";

export default function ApiDocsPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-20">
      <span className="edu-kicker">Developer reference</span>
      <h1 className="mt-4 text-4xl font-bold tracking-tight">EduMatch API</h1>
      <p className="mt-4 max-w-2xl text-[var(--color-text-muted)]">
        The OpenAPI contract documents the inquiry, matching, quote, booking,
        notification, verification, and administration endpoints.
      </p>
      <div className="mt-8 flex gap-3">
        <a className="edu-button edu-button-primary" href="/api/docs">Open OpenAPI JSON</a>
        <Link className="edu-button edu-button-secondary" href="/">Back to EduMatch</Link>
      </div>
    </section>
  );
}
