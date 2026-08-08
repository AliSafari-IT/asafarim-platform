import { notFound } from "next/navigation";
import { requireUser } from "@asafarim/auth";
import { getViewerContext, NotFoundError, ForbiddenError } from "@/lib/server/authz";
import { getTimelineForEdit } from "@/lib/server/services/timelines";
import { EditTimelineClient } from "@/components/timeline/EditTimelineClient";
import { newEventKey } from "@/lib/client/editor-types";
import type { EditorState } from "@/lib/client/editor-types";
import type { ThemeSettings, TimelineInput } from "@/lib/schemas";

const hubUrl = process.env.NEXT_PUBLIC_HUB_URL || process.env.HUB_URL || "http://localhost:3001";
const appUrl = process.env.NEXT_PUBLIC_TIMELINEAI_URL || "http://localhost:3007";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditTimelinePage({ params }: PageProps) {
  const { id } = await params;
  await requireUser({ signInUrl: `${hubUrl}/sign-in`, callbackUrl: `${appUrl}/timelines/${id}/edit` });
  const viewer = await getViewerContext();

  try {
    const timeline = await getTimelineForEdit(id, viewer);
    const initial: Partial<EditorState> = {
      title: timeline.title,
      subtitle: timeline.subtitle ?? "",
      description: timeline.description ?? "",
      timelineType: timeline.timelineType as TimelineInput["timelineType"],
      layout: timeline.layout as TimelineInput["layout"],
      theme: timeline.theme as ThemeSettings | null,
      sortMode: "manual",
      events: timeline.events.map((event) => ({
        key: newEventKey(),
        id: event.id,
        startAt: event.startAt?.toISOString() ?? null,
        endAt: event.endAt?.toISOString() ?? null,
        displayDate: event.displayDate,
        title: event.title,
        description: event.description,
        imageUrl: event.imageUrl,
        imageStorageKey: event.imageStorageKey,
        icon: event.icon,
        label: event.label,
        link: event.link,
        accentColor: event.accentColor,
        sortOrder: event.sortOrder,
      })),
    };

    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="mb-6 text-2xl font-bold">Edit timeline</h1>
        <EditTimelineClient mode="edit" timelineId={timeline.id} initial={initial} version={timeline.version} />
      </div>
    );
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      notFound();
    }
    throw error;
  }
}
