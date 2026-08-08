import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { getViewerContext } from "@/lib/server/authz";
import { getTimelineForView } from "@/lib/server/services/timelines";
import { NotFoundError, ForbiddenError } from "@/lib/server/authz";
import { TimelineRenderer } from "@/components/timeline/renderers/TimelineRenderer";
import { ExportButtons } from "@/components/timeline/ExportButtons";

type PageProps = { params: Promise<{ publicId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { publicId } = await params;
  try {
    const viewer = await getViewerContext();
    const timeline = await getTimelineForView(publicId, viewer);
    return {
      title: timeline.title,
      description: timeline.subtitle ?? timeline.description ?? undefined,
      openGraph: { title: timeline.title, description: timeline.subtitle ?? undefined },
      // Guest-pending/private/rejected timelines never get indexed, even if
      // this metadata call somehow succeeds for their own owner/admin view.
      robots: timeline.visibility === "public" && timeline.moderationStatus !== "pending" ? { index: true } : { index: false },
    };
  } catch {
    return { title: "Timeline" };
  }
}

export default async function PublicTimelinePage({ params }: PageProps) {
  const { publicId } = await params;
  const viewer = await getViewerContext();
  // Puppeteer's own request during export (see lib/server/services/export.ts)
  // — hide the interactive export controls from the exported image/PDF
  // itself; app/layout.tsx uses this same header to skip the nav/footer.
  const isBareRender = (await headers()).get("x-timelineai-render") === "bare";

  try {
    const timeline = await getTimelineForView(publicId, viewer);
    const isOwnerPreviewingPending =
      timeline.moderationStatus === "pending" && !viewer.isAdmin;

    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        {isOwnerPreviewingPending ? (
          <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            This timeline is awaiting admin review. Only you can see this link until it's approved.
          </div>
        ) : null}
        {!isBareRender ? (
          <div className="mb-4">
            <ExportButtons publicId={timeline.publicId} />
          </div>
        ) : null}
        <TimelineRenderer
          layout={timeline.layout as never}
          timeline={{
            title: timeline.title,
            subtitle: timeline.subtitle,
            description: timeline.description,
            theme: timeline.theme as never,
            events: timeline.events.map((e) => ({
              id: e.id,
              startAt: e.startAt?.toISOString() ?? null,
              endAt: e.endAt?.toISOString() ?? null,
              displayDate: e.displayDate,
              title: e.title,
              description: e.description,
              imageUrl: e.imageUrl,
              imageStorageKey: e.imageStorageKey,
              icon: e.icon,
              label: e.label,
              link: e.link,
              accentColor: e.accentColor,
              sortOrder: e.sortOrder,
            })),
          }}
        />
      </div>
    );
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      notFound();
    }
    throw error;
  }
}
