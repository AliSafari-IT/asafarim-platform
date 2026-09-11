import { prisma } from "@asafarim/db";
import type {
  ActivityEntry,
  ActivityLookup,
  ActivitySection,
  ListAllOptions,
  ListAllResult,
  UserActivityAdapter,
} from "../types";

function timelineaiUrl(): string {
  return process.env.NEXT_PUBLIC_TIMELINEAI_URL ?? "http://localhost:3010";
}

/**
 * TimelineAI adapter: timelines owned by the user, plus their publish /
 * moderation history. There is no dedicated export-job model yet (unlike
 * Vionto) — per the "graceful degradation" principle this adapter simply
 * omits that section rather than failing.
 */
export const timelineaiActivityAdapter: UserActivityAdapter = {
  app: "timelineai",

  async getActivity({ userId }: ActivityLookup): Promise<ActivitySection> {
    const base = timelineaiUrl();

    const timelines = await prisma.timeline.findMany({
      where: { ownerUserId: userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        publicId: true,
        title: true,
        visibility: true,
        moderationStatus: true,
        editingState: true,
        createdAt: true,
        updatedAt: true,
        submittedAt: true,
        approvedAt: true,
        publishedAt: true,
        moderationEvents: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            action: true,
            reason: true,
            createdAt: true,
          },
        },
      },
    });

    const entries: ActivityEntry[] = timelines.flatMap((t): ActivityEntry[] => {
      const timelineEntry: ActivityEntry = {
        id: t.id,
        app: "timelineai",
        type: "timeline",
        title: t.title,
        status: t.editingState,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        href: `${base}/t/${t.publicId}`,
        metadata: {
          visibility: t.visibility,
          moderationStatus: t.moderationStatus,
          submittedAt: t.submittedAt,
          approvedAt: t.approvedAt,
          publishedAt: t.publishedAt,
        },
      };

      const moderationEntries: ActivityEntry[] = t.moderationEvents.map((m) => ({
        id: m.id,
        app: "timelineai",
        type: "moderation_event",
        title: `${t.title}: ${m.action}`,
        status: m.action,
        createdAt: m.createdAt,
        updatedAt: m.createdAt,
        href: `${base}/t/${t.publicId}`,
        metadata: { reason: m.reason, timelineId: t.id },
      }));

      return [timelineEntry, ...moderationEntries];
    });

    return {
      app: "timelineai",
      supported: true,
      available: true,
      entries,
    };
  },

  /**
   * TimelineAI's flagship content for the platform-wide browse view is the
   * timelines themselves — the "generated timelines" a superadmin would
   * want to browse across every user. Guest-submitted timelines
   * (ownerUserId null, keyed instead by guestIdHash) are excluded: this is
   * a per-USER activity browse, and a guest submission has no user to
   * attribute it to.
   */
  async listAll({ limit, cursor }: ListAllOptions): Promise<ListAllResult> {
    const base = timelineaiUrl();
    const timelines = await prisma.timeline.findMany({
      where: {
        ownerUserId: { not: null },
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      select: {
        id: true,
        publicId: true,
        title: true,
        visibility: true,
        editingState: true,
        createdAt: true,
        updatedAt: true,
        ownerUserId: true,
        owner: { select: { email: true, name: true } },
      },
    });

    const hasMore = timelines.length > limit;
    const page = hasMore ? timelines.slice(0, limit) : timelines;

    return {
      entries: page.map((t) => ({
        id: t.id,
        app: "timelineai",
        type: "timeline",
        title: t.title,
        status: t.editingState,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        href: `${base}/t/${t.publicId}`,
        metadata: { visibility: t.visibility },
        owner: {
          // ownerUserId is guaranteed non-null by the where clause above.
          userId: t.ownerUserId!,
          email: t.owner?.email ?? null,
          name: t.owner?.name ?? null,
        },
      })),
      nextCursor: hasMore ? page[page.length - 1]!.createdAt.toISOString() : null,
    };
  },
};
