import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/server/db";
import type { ThemeSettings, TimelineInput } from "@/lib/schemas";
import { GalleryCard } from "@/components/gallery/GalleryCard";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Browse public timelines built with TimelineAI — simple to sophisticated, for inspiration.",
};

// Revalidate periodically rather than per-request — this is a showcase
// page, not something that needs to reflect a brand-new publish within
// milliseconds.
export const revalidate = 60;

/** Events shown in a card's hover preview — enough to read the layout,
 *  small enough that 60 cards stay a light page. */
const PREVIEW_EVENTS = 8;

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
      id: true,
      publicId: true,
      title: true,
      subtitle: true,
      layout: true,
      timelineType: true,
      updatedAt: true,
      theme: true,
      _count: { select: { events: true } },
      events: {
        orderBy: { sortOrder: "asc" },
        take: PREVIEW_EVENTS,
        select: {
          id: true,
          startAt: true,
          endAt: true,
          displayDate: true,
          title: true,
          description: true,
          icon: true,
          label: true,
          accentColor: true,
          sortOrder: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 60,
  });

  // The card header art and its date range describe the WHOLE timeline, not
  // just the few events the preview loads — one light query for dates only.
  const eventDates = await prisma.timelineEvent.findMany({
    where: { timelineId: { in: timelines.map((t) => t.id) } },
    select: { timelineId: true, startAt: true, endAt: true },
    orderBy: { sortOrder: "asc" },
  });
  const datesByTimeline = new Map<string, { startAt: Date | null; endAt: Date | null }[]>();
  for (const { timelineId, startAt, endAt } of eventDates) {
    const list = datesByTimeline.get(timelineId) ?? [];
    list.push({ startAt, endAt });
    datesByTimeline.set(timelineId, list);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Gallery</h1>
        <p className="mt-1 text-[var(--color-text-muted,inherit)]">
          Public timelines built with TimelineAI — hover a card to preview it, or{" "}
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
        <ul className="gl-grid">
          {timelines.map((timeline) => (
            <li key={timeline.publicId}>
              <GalleryCard
                publicId={timeline.publicId}
                title={timeline.title}
                subtitle={timeline.subtitle}
                layout={timeline.layout as TimelineInput["layout"]}
                eventCount={timeline._count.events}
                glyphEvents={datesByTimeline.get(timeline.id) ?? []}
                preview={{
                  title: timeline.title,
                  subtitle: timeline.subtitle,
                  theme: timeline.theme as ThemeSettings | null,
                  // Images and links are left out of the thumbnail: images
                  // would fetch up to 8 × 60 files for a page nobody has
                  // hovered yet, and the preview is inert anyway.
                  events: timeline.events.map((e) => ({
                    ...e,
                    startAt: e.startAt?.toISOString() ?? null,
                    endAt: e.endAt?.toISOString() ?? null,
                    imageUrl: null,
                    imageStorageKey: null,
                    link: null,
                  })),
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
