import "server-only";
import { customAlphabet } from "nanoid";
import { prisma } from "../db";
import type { Prisma } from "../db";
import { assertAccess, ForbiddenError, NotFoundError, type ViewerContext } from "../authz";
import type { TimelineInput } from "../../schemas";

// Unambiguous alphabet (no 0/O/1/l/I) for share URLs people might read aloud
// or transcribe. 12 chars ≈ 62 bits of entropy — unguessable enough for an
// "unlisted-by-obscurity" style public id without looking like a UUID.
const nanoid = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 12);

async function generateUniquePublicId(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = nanoid();
    const existing = await prisma.timeline.findUnique({
      where: { publicId: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique share id — please try again.");
}

export interface CreateTimelineOwnership {
  ownerUserId: string | null;
  guestIdHash: string | null;
}

/**
 * Create a timeline + its events in one transaction. Ownership is entirely
 * server-derived (see ViewerContext) — never taken from the request body.
 * Guests are created as moderationStatus="pending"; authenticated owners
 * as "not_required" (they may self-publish without review).
 */
export async function createTimeline(input: TimelineInput, ownership: CreateTimelineOwnership) {
  if (!ownership.ownerUserId && !ownership.guestIdHash) {
    throw new ForbiddenError(
      "We couldn't identify you as a visitor — please refresh and try again."
    );
  }

  const publicId = await generateUniquePublicId();
  const isGuest = !ownership.ownerUserId;

  return prisma.timeline.create({
    data: {
      publicId,
      ownerUserId: ownership.ownerUserId,
      guestIdHash: ownership.guestIdHash,
      title: input.title,
      subtitle: input.subtitle ?? null,
      description: input.description ?? null,
      timelineType: input.timelineType,
      layout: input.layout,
      theme: (input.theme ?? undefined) as Prisma.InputJsonValue | undefined,
      moderationStatus: isGuest ? "pending" : "not_required",
      submittedAt: isGuest ? new Date() : null,
      events: {
        create: input.events.map((event, index) => ({
          startAt: event.startAt ? new Date(event.startAt) : null,
          endAt: event.endAt ? new Date(event.endAt) : null,
          displayDate: event.displayDate ?? null,
          title: event.title,
          description: event.description ?? null,
          imageUrl: event.imageUrl ?? null,
          imageStorageKey: event.imageStorageKey ?? null,
          icon: event.icon ?? null,
          label: event.label ?? null,
          link: event.link ?? null,
          accentColor: event.accentColor ?? null,
          sortOrder: event.sortOrder ?? index,
        })),
      },
      moderationEvents: {
        create: {
          adminUserId: null,
          action: isGuest ? "SUBMITTED" : "CREATED",
        },
      },
    },
    include: { events: { orderBy: { sortOrder: "asc" } } },
  });
}

async function loadForAccessCheck(id: string) {
  const timeline = await prisma.timeline.findUnique({ where: { id } });
  if (!timeline) throw new NotFoundError("That timeline doesn't exist.");
  return timeline;
}

export async function getTimelineForEdit(id: string, viewer: ViewerContext) {
  const timeline = await loadForAccessCheck(id);
  assertAccess(timeline, viewer, "edit");
  return prisma.timeline.findUniqueOrThrow({
    where: { id },
    include: { events: { orderBy: { sortOrder: "asc" } } },
  });
}

/** Public/shared view lookup by publicId — used by /t/[publicId] and export. */
export async function getTimelineForView(publicId: string, viewer: ViewerContext) {
  const timeline = await prisma.timeline.findUnique({
    where: { publicId },
    include: { events: { orderBy: { sortOrder: "asc" } } },
  });
  if (!timeline) throw new NotFoundError("That timeline doesn't exist.");
  assertAccess(timeline, viewer, "view");
  return timeline;
}

export class VersionConflictError extends Error {
  readonly status = 409;
  constructor() {
    super("This timeline was changed elsewhere. Reload to see the latest version before saving.");
    this.name = "VersionConflictError";
  }
}

/**
 * Replace a timeline's content in one transaction: update scalar fields and
 * fully replace its event set (delete-then-recreate keeps sortOrder simple
 * and correct — event ids are ephemeral from the client's perspective).
 * Guards against lost updates with an optimistic-concurrency version check.
 */
export async function updateTimelineContent(
  id: string,
  input: TimelineInput,
  viewer: ViewerContext,
  expectedVersion: number
) {
  const existing = await loadForAccessCheck(id);
  assertAccess(existing, viewer, "edit");

  return prisma.$transaction(async (tx) => {
    const result = await tx.timeline.updateMany({
      where: { id, version: expectedVersion },
      data: {
        title: input.title,
        subtitle: input.subtitle ?? null,
        description: input.description ?? null,
        timelineType: input.timelineType,
        layout: input.layout,
        theme: (input.theme ?? undefined) as Prisma.InputJsonValue | undefined,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) throw new VersionConflictError();

    await tx.timelineEvent.deleteMany({ where: { timelineId: id } });
    await tx.timelineEvent.createMany({
      data: input.events.map((event, index) => ({
        timelineId: id,
        startAt: event.startAt ? new Date(event.startAt) : null,
        endAt: event.endAt ? new Date(event.endAt) : null,
        displayDate: event.displayDate ?? null,
        title: event.title,
        description: event.description ?? null,
        imageUrl: event.imageUrl ?? null,
        imageStorageKey: event.imageStorageKey ?? null,
        icon: event.icon ?? null,
        label: event.label ?? null,
        link: event.link ?? null,
        accentColor: event.accentColor ?? null,
        sortOrder: event.sortOrder ?? index,
      })),
    });

    return tx.timeline.findUniqueOrThrow({
      where: { id },
      include: { events: { orderBy: { sortOrder: "asc" } } },
    });
  });
}

/** Switch layout only — content (events) is untouched, per spec §6. */
export async function setLayout(id: string, layout: string, viewer: ViewerContext) {
  const existing = await loadForAccessCheck(id);
  assertAccess(existing, viewer, "edit");
  return prisma.timeline.update({
    where: { id },
    data: { layout, version: { increment: 1 } },
  });
}

export async function renameTimeline(id: string, title: string, viewer: ViewerContext) {
  const existing = await loadForAccessCheck(id);
  assertAccess(existing, viewer, "edit");
  return prisma.timeline.update({
    where: { id },
    data: { title, version: { increment: 1 } },
  });
}

export async function setVisibility(
  id: string,
  visibility: "private" | "public" | "unlisted",
  viewer: ViewerContext
) {
  const existing = await loadForAccessCheck(id);
  assertAccess(existing, viewer, "edit");

  // Guests cannot self-publish — their content stays gated behind
  // moderationStatus regardless of the visibility flag (enforced in
  // canAccess too; this just stops a confusing UI promise).
  if (!existing.ownerUserId && visibility !== "private") {
    throw new ForbiddenError(
      "Guest submissions need admin approval before they can be shared publicly."
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.timeline.update({
      where: { id },
      data: { visibility, version: { increment: 1 } },
    });
    await tx.timelineModerationEvent.create({
      data: {
        timelineId: id,
        adminUserId: viewer.isAdmin ? viewer.userId : null,
        action: "VISIBILITY_CHANGED",
        metadata: { visibility },
      },
    });
    return updated;
  });
}

/** Authenticated owners may self-publish without moderation (spec §3, §8). */
export async function publishTimeline(id: string, viewer: ViewerContext) {
  const existing = await loadForAccessCheck(id);
  assertAccess(existing, viewer, "edit");
  if (!existing.ownerUserId) {
    throw new ForbiddenError("Guest submissions are published by an administrator after review.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.timeline.update({
      where: { id },
      data: {
        editingState: "published",
        visibility: existing.visibility === "private" ? "public" : existing.visibility,
        publishedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await tx.timelineModerationEvent.create({
      data: { timelineId: id, adminUserId: null, action: "PUBLISHED" },
    });
    return updated;
  });
}

export async function unpublishTimeline(id: string, viewer: ViewerContext) {
  const existing = await loadForAccessCheck(id);
  assertAccess(existing, viewer, "edit");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.timeline.update({
      where: { id },
      data: { editingState: "draft", visibility: "private", version: { increment: 1 } },
    });
    await tx.timelineModerationEvent.create({
      data: {
        timelineId: id,
        adminUserId: viewer.isAdmin ? viewer.userId : null,
        action: "UNPUBLISHED",
      },
    });
    return updated;
  });
}

export async function deleteTimeline(id: string, viewer: ViewerContext) {
  const existing = await loadForAccessCheck(id);
  assertAccess(existing, viewer, "delete");
  await prisma.timeline.delete({ where: { id } });
}

export async function duplicateTimeline(id: string, viewer: ViewerContext) {
  const source = await prisma.timeline.findUnique({
    where: { id },
    include: { events: { orderBy: { sortOrder: "asc" } } },
  });
  if (!source) throw new NotFoundError("That timeline doesn't exist.");
  assertAccess(source, viewer, "view");
  if (!viewer.userId) {
    throw new ForbiddenError("Sign in to duplicate a timeline into your own workspace.");
  }

  const publicId = await generateUniquePublicId();
  return prisma.timeline.create({
    data: {
      publicId,
      ownerUserId: viewer.userId,
      title: `${source.title} (copy)`,
      subtitle: source.subtitle,
      description: source.description,
      timelineType: source.timelineType,
      layout: source.layout,
      theme: source.theme as Prisma.InputJsonValue | undefined,
      moderationStatus: "not_required",
      events: {
        create: source.events.map((event) => ({
          startAt: event.startAt,
          endAt: event.endAt,
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
      },
    },
    include: { events: { orderBy: { sortOrder: "asc" } } },
  });
}

export interface ListMyTimelinesOptions {
  cursor?: string;
  limit?: number;
}

/** Paginated dashboard listing — owner's own timelines only. */
export async function listMyTimelines(viewer: ViewerContext, options: ListMyTimelinesOptions = {}) {
  if (!viewer.userId) throw new ForbiddenError("Sign in to view your dashboard.");
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);

  const items = await prisma.timeline.findMany({
    where: { ownerUserId: viewer.userId },
    orderBy: { updatedAt: "desc" },
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    include: { _count: { select: { events: true } } },
  });

  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return { items: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
}
