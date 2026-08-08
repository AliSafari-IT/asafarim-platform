import Link from "next/link";

export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">TimelineAI</h1>
      <p className="text-lg text-[var(--color-text-muted,inherit)]">
        Build polished, visual timelines — for projects, history, roadmaps, and more.
        No account required to try it out.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/create"
          className="rounded-lg bg-[var(--color-primary)] px-6 py-3 font-medium text-white hover:opacity-90"
        >
          Create a timeline
        </Link>
        <Link
          href="/dashboard"
          className="rounded-lg border border-[var(--color-border,currentColor)] px-6 py-3 font-medium"
        >
          Sign in for your dashboard
        </Link>
      </div>
    </div>
  );
}
