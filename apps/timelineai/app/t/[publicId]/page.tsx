import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { getViewerContext } from "@/lib/server/authz";
import { getTimelineForView, getTimelineForRenderGrant } from "@/lib/server/services/timelines";
import { NotFoundError, ForbiddenError } from "@/lib/server/authz";
import { verifyRenderGrant } from "@/lib/server/render-grant";
import { TimelineRenderer } from "@/components/timeline/renderers/TimelineRenderer";
import { ExportButtons } from "@/components/timeline/ExportButtons";
import { isWideLayout } from "@/lib/timeline-config";
import { canAccess } from "@/lib/access-rules";
import { ButtonLink } from "@asafarim/ui";

type PageProps = { params: Promise<{ publicId: string }> };

const appUrl = process.env.NEXT_PUBLIC_TIMELINEAI_URL ?? "https://tlai.asafarim.com";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { publicId } = await params;
  try {
    const viewer = await getViewerContext();
    const timeline = await getTimelineForView(publicId, viewer);
    const description = timeline.subtitle ?? timeline.description ?? undefined;
    const url = `${appUrl}/t/${timeline.publicId}`;

    // Matches canAccess()'s anonymous "view" rule exactly: only public,
    // published, and not pending/rejected content is indexable — private,
    // unlisted, pending, and rejected timelines never get indexed, even if
    // this metadata call itself succeeds for their own owner/admin view.
    const isIndexable =
      timeline.visibility === "public" &&
      timeline.editingState === "published" &&
      (timeline.moderationStatus === "not_required" || timeline.moderationStatus === "approved");

    return {
      title: timeline.title,
      description,
      alternates: { canonical: url },
      openGraph: {
        type: "website",
        siteName: "TimelineAI",
        title: timeline.title,
        description,
        url,
      },
      twitter: {
        card: "summary_large_image",
        title: timeline.title,
        description,
      },
      robots: isIndexable ? { index: true, follow: true } : { index: false, follow: false },
    };
  } catch {
    return { title: "Timeline", robots: { index: false, follow: false } };
  }
}

export default async function PublicTimelinePage({ params }: PageProps) {
  const { publicId } = await params;
  const requestHeaders = await headers();
  // Puppeteer's own request during export (see lib/server/services/export.ts)
  // — hide the interactive export controls from the exported image/PDF
  // itself; app/layout.tsx uses this same header to skip the nav/footer.
  // This header alone is never treated as authorization — see below.
  const isBareRender = requestHeaders.get("x-timelineai-render") === "bare";
  const renderGrant = requestHeaders.get("x-timelineai-render-grant");
  const hasValidRenderGrant = isBareRender && verifyRenderGrant(renderGrant, publicId);

  const viewer = await getViewerContext();

  try {
    // The internal render request carries no session/guest identity, so it
    // can never pass the normal view-authorization check below for a
    // private/pending timeline. A verified grant — minted only by the
    // export API after it authorized the real caller — stands in for that
    // check on this exact publicId instead; an invalid/missing/expired
    // grant falls through to the normal (and here, unauthenticated) check.
    const timeline = hasValidRenderGrant
      ? await getTimelineForRenderGrant(publicId)
      : await getTimelineForView(publicId, viewer);
    const isOwnerPreviewingPending =
      timeline.moderationStatus === "pending" && !viewer.isAdmin;
    // Same rule the edit route enforces: the owner or an admin. The editor
    // requires a signed-in user, so a guest owner isn't offered a link that
    // would only bounce them to sign-in.
    const canEdit = Boolean(viewer.userId) && canAccess(timeline, viewer, "edit");

    return (
      <div
        className={`mx-auto px-6 py-10 ${
          // Horizontal tracks, Gantt bars, roadmap swimlanes and month boards
          // are unreadable squeezed into a reading-width column.
          isWideLayout(timeline.layout as never) ? "max-w-6xl" : "max-w-3xl"
        }`}
      >
        {isOwnerPreviewingPending ? (
          <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            This timeline is awaiting admin review. Only you can see this link until it's approved.
          </div>
        ) : null}
        {!isBareRender ? (
          <div className="mb-4 flex flex-wrap items-start gap-2">
            {/* ButtonLink, not a Tailwind-styled <a>: base.css's unlayered
                `a { color: var(--accent) }` beats Tailwind's text-white
                (see the note in app/page.tsx's history). */}
            {canEdit ? (
              <ButtonLink href={`/timelines/${timeline.id}/edit`} variant="primary">
                Edit timeline
              </ButtonLink>
            ) : null}
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
              imageAlt: e.imageAlt,
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
