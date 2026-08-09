import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/server/db";
import { LAYOUT_LABELS } from "@/lib/labels";
import type { TimelineInput } from "@/lib/schemas";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Browse public timelines built with TimelineAI — simple to sophisticated, for inspiration.",
};

// Revalidate periodically rather than per-request — this is a showcase
// page, not something that needs to reflect a brand-new publish within
// milliseconds.
export const revalidate = 60;

export default async function GalleryPage() {
  // Exactly the same rule as canAccess()'s anonymous "view" branch and
  // sitemap.ts's query: public, published, and not pending/rejected.
  // Nothing private, unlisted, pending, or rejected ever appears here.
  const timelines = await prisma.timeline.findMany({
    where: {
      visibility: "public",
      moderationStatus: { in: ["not_required", "approved"] },
      editingState: "published",
    },
    select: {
      publicId: true,
      title: true,
      subtitle: true,
      layout: true,
      timelineType: true,
      updatedAt: true,
      _count: { select: { events: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 60,
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Gallery</h1>
        <p className="mt-1 text-[var(--color-text-muted,inherit)]">
          Public timelines built with TimelineAI — browse them for inspiration, or{" "}
          <Link href="/create" className="underline">
            create your own
          </Link>
          .
        </p>
      </header>

      {timelines.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--color-border,rgba(0,0,0,0.2))] p-10 text-center text-[var(--color-text-muted,inherit)]">
          No public timelines yet — be the first to{" "}
          <Link href="/create" className="underline">
            create and publish one
          </Link>
          .
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {timelines.map((timeline) => (
            <li key={timeline.publicId}>
              <Link
                href={`/t/${timeline.publicId}`}
                className="block h-full rounded-xl border border-[var(--color-border,rgba(0,0,0,0.12))] bg-[var(--color-surface)] p-4 transition hover:border-[var(--color-primary)]"
              >
                <span className="mb-2 inline-block rounded-full bg-[var(--tl-accent,var(--color-accent))]/15 px-2 py-0.5 text-xs font-medium text-[var(--tl-accent,var(--color-accent))]">
                  {LAYOUT_LABELS[timeline.layout as TimelineInput["layout"]] ?? timeline.layout}
                </span>
                <h2 className="font-semibold">{timeline.title}</h2>
                {timeline.subtitle ? (
                  <p className="mt-1 text-sm text-[var(--color-text-muted,inherit)]">{timeline.subtitle}</p>
                ) : null}
                <p className="mt-2 text-xs text-[var(--color-text-muted,inherit)]">
                  {timeline._count.events} event{timeline._count.events === 1 ? "" : "s"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
