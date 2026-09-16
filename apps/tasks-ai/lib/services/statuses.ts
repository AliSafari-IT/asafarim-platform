import "server-only";
import { z } from "zod";
import type { Prisma, PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { emitActivity } from "../events/emit";
import { EVENT } from "../events/names";
import { ApiError } from "../errors";
import { getStatusOr404, listStatuses as listStatusesRepo } from "../repositories/statuses";

export const STATUS_CATEGORIES = ["todo", "in_progress", "done", "canceled"] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

export const createStatusSchema = z.object({
  name: z.string().min(1).max(80),
  category: z.enum(STATUS_CATEGORIES).default("todo"),
  projectId: z.string().optional(),
});

export const reorderStatusesSchema = z.object({
  /** Full ordered list of status ids for this workspace/project scope. */
  ids: z.array(z.string()).min(1),
});

/** The default set seeded for every new workspace (issue #387). */
export const DEFAULT_STATUSES: { name: string; category: StatusCategory; position: number }[] = [
  { name: "Todo", category: "todo", position: 0 },
  { name: "In Progress", category: "in_progress", position: 1 },
  { name: "Done", category: "done", position: 2 },
];

/**
 * Insert the default status set for a brand-new workspace. Called from
 * `createWorkspace`'s transaction so a workspace never exists without at
 * least Todo / In Progress / Done — an empty picker on day one is exactly
 * what issue #387 is trying to avoid.
 */
export async function seedDefaultStatuses(
  tx: Prisma.TransactionClient | PrismaClient,
  workspaceId: string,
) {
  await tx.status.createMany({
    data: DEFAULT_STATUSES.map((s) => ({
      workspaceId,
      name: s.name,
      category: s.category,
      position: s.position,
      isDefault: true,
    })),
  });
}

export async function listStatuses(ctx: RequestContext, opts: { projectId?: string } = {}) {
  return listStatusesRepo(ctx, opts);
}

export async function createStatus(ctx: RequestContext, input: unknown) {
  authorize(ctx.actor, "status.manage");
  const data = createStatusSchema.parse(input);

  return ctx.db.$transaction(async (tx) => {
    const clash = await tx.status.findFirst({
      where: { workspaceId: ctx.workspaceId, projectId: data.projectId ?? null, name: data.name },
    });
    if (clash) throw new ApiError("conflict_unique", { field: "name" });

    const last = await tx.status.findFirst({
      where: { workspaceId: ctx.workspaceId, projectId: data.projectId ?? null },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const status = await tx.status.create({
      data: {
        workspaceId: ctx.workspaceId,
        projectId: data.projectId,
        name: data.name,
        category: data.category,
        position: (last?.position ?? -1) + 1,
      },
    });
    await emitActivity(tx, ctx.workspaceId, ctx.correlationId, {
      name: EVENT.statusCreated,
      targetType: "status",
      targetId: status.id,
      actorId: ctx.actor.membershipId,
      data: { name: status.name, category: status.category, projectId: status.projectId },
    });
    return status;
  });
}

/**
 * Persist a new ordering for a set of statuses. `ids` must be exactly the
 * set of non-archived statuses visible in the given scope — a partial or
 * mismatched list is rejected rather than silently reordering a subset,
 * since a partial write would leave `position` values ambiguous.
 */
export async function reorderStatuses(ctx: RequestContext, input: unknown) {
  authorize(ctx.actor, "status.manage");
  const { ids } = reorderStatusesSchema.parse(input);

  return ctx.db.$transaction(async (tx) => {
    const rows = await tx.status.findMany({
      where: { id: { in: ids }, workspaceId: ctx.workspaceId, archivedAt: null },
      select: { id: true, projectId: true },
    });
    if (rows.length !== ids.length) {
      throw new ApiError("validation_failed", { ids: "one or more statuses were not found" });
    }
    const scope = rows[0]?.projectId ?? null;
    if (rows.some((r) => r.projectId !== scope)) {
      throw new ApiError("validation_failed", { ids: "statuses must belong to the same scope" });
    }

    await Promise.all(
      ids.map((id, position) =>
        tx.status.update({ where: { id }, data: { position } }),
      ),
    );
    await emitActivity(tx, ctx.workspaceId, ctx.correlationId, {
      name: EVENT.statusReordered,
      targetType: "status",
      targetId: ids[0],
      actorId: ctx.actor.membershipId,
      data: { ids },
    });
    return listStatusesRepo(ctx, { projectId: scope ?? undefined });
  });
}

export async function archiveStatus(ctx: RequestContext, id: string) {
  authorize(ctx.actor, "status.manage");
  const current = await getStatusOr404(ctx, id);
  if (current.archivedAt) return current;

  return ctx.db.$transaction(async (tx) => {
    const archived = await tx.status.update({
      where: { id: current.id },
      data: { archivedAt: new Date() },
    });
    await emitActivity(tx, ctx.workspaceId, ctx.correlationId, {
      name: EVENT.statusArchived,
      targetType: "status",
      targetId: archived.id,
      actorId: ctx.actor.membershipId,
    });
    return archived;
  });
}
