import "server-only";
import { prisma } from "../db";
import { ForbiddenError, NotFoundError, type ViewerContext } from "../authz";

function requireAdmin(viewer: ViewerContext): void {
  // Belt-and-suspenders: proxy.ts already blocks non-admins from /api/admin
  // at the edge, but every protected operation must also enforce this in
  // the service layer per spec §14 — the proxy is a coarse gate, not the
  // source of truth.
  if (!viewer.isAdmin) {
    throw new ForbiddenError("Administrator access required.");
  }
}

export interface AdminListFilters {
  ownership?: "guest" | "authenticated";
  moderationStatus?: "not_required" | "pending" | "approved" | "rejected";
  visibility?: "private" | "public" | "unlisted";
  search?: string;
  cursor?: string;
  limit?: number;
}

export async function listTimelinesForAdmin(viewer: ViewerContext, filters: AdminListFilters = {}) {
  requireAdmin(viewer);
  const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100);

  const where: Record<string, unknown> = {};
  if (filters.ownership === "guest") where.ownerUserId = null;
  if (filters.ownership === "authenticated") where.ownerUserId = { not: null };
  if (filters.moderationStatus) where.moderationStatus = filters.moderationStatus;
  if (filters.visibility) where.visibility = filters.visibility;
  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { publicId: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const items = await prisma.timeline.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    include: {
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { events: true } },
    },
  });

  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return { items: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
}

async function loadOrThrow(id: string) {
  const timeline = await prisma.timeline.findUnique({ where: { id } });
  if (!timeline) throw new NotFoundError("That timeline doesn't exist.");
  return timeline;
}

export async function approveGuestSubmission(id: string, viewer: ViewerContext) {
  requireAdmin(viewer);
  await loadOrThrow(id);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.timeline.update({
      where: { id },
      data: {
        moderationStatus: "approved",
        visibility: "public",
        editingState: "published",
        approvedAt: new Date(),
        publishedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await tx.timelineModerationEvent.create({
      data: { timelineId: id, adminUserId: viewer.userId, action: "APPROVED" },
    });
    return updated;
  });
}

export async function rejectGuestSubmission(id: string, reason: string | null, viewer: ViewerContext) {
  requireAdmin(viewer);
  await loadOrThrow(id);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.timeline.update({
      where: { id },
      data: {
        moderationStatus: "rejected",
        visibility: "private",
        moderationReason: reason,
        version: { increment: 1 },
      },
    });
    await tx.timelineModerationEvent.create({
      data: { timelineId: id, adminUserId: viewer.userId, action: "REJECTED", reason },
    });
    return updated;
  });
}

/**
 * Admin delete with a durable audit trail. Unlike an owner's own delete
 * (lib/server/services/timelines.ts#deleteTimeline), this writes to the
 * platform-wide AuditLog — not TimelineModerationEvent, which cascades
 * away with the row it's attached to — so the record of an admin removing
 * someone else's content survives the deletion itself.
 */
export async function adminDeleteTimeline(id: string, viewer: ViewerContext, reason?: string) {
  requireAdmin(viewer);
  const timeline = await loadOrThrow(id);

  await prisma.$transaction([
    prisma.auditLog.create({
      data: {
        userId: viewer.userId,
        action: "ADMIN_DELETE_TIMELINE",
        entity: "Timeline",
        entityId: id,
        changes: {
          title: timeline.title,
          publicId: timeline.publicId,
          ownerUserId: timeline.ownerUserId,
          reason: reason ?? null,
        },
      },
    }),
    prisma.timeline.delete({ where: { id } }),
  ]);
}
