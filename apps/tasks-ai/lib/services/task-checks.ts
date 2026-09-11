import "server-only";
import { z } from "zod";
import type { Prisma, PrismaClient, TaskCheckState } from "../db/generated";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { emitActivity } from "../events/emit";
import { EVENT } from "../events/names";
import { ApiError } from "../errors";
import { getTaskOr404 } from "../repositories/tasks";

/**
 * The green-light gate (issue #265). A task cannot complete while any
 * TaskCheck on it is not `satisfied` — deterministic, no AI. Checks are
 * created here manually, or by provisioning (#266); flipped here manually
 * (override) or by the inbound Testora webhook (`lib/integrations/testora.ts`,
 * on `greenlight.reached`).
 */

export async function listChecks(ctx: RequestContext, taskId: string) {
  await getTaskOr404(ctx, taskId);
  return ctx.db.taskCheck.findMany({
    where: { workspaceId: ctx.workspaceId, taskId },
    orderBy: { createdAt: "asc" },
  });
}

export const createCheckSchema = z.object({
  source: z.string().min(1).max(60),
  key: z.string().min(1).max(200),
  /** opaque id an external system's callback matches against, e.g. Testora's
   *  provision checkRef. Must be globally unique — enforced at the DB. */
  externalRef: z.string().min(1).max(200).optional(),
  evidenceUrl: z.string().url().optional(),
});

export async function createCheck(ctx: RequestContext, taskId: string, input: unknown) {
  authorize(ctx.actor, "task.check_manage");
  await getTaskOr404(ctx, taskId);
  const data = createCheckSchema.parse(input);

  return ctx.db.$transaction(async (tx) => {
    let check;
    try {
      check = await tx.taskCheck.create({
        data: { workspaceId: ctx.workspaceId, taskId, ...data, state: "pending" },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ApiError("conflict_unique", { field: "externalRef" });
      }
      throw err;
    }
    // Scoped per check, not the bare request correlationId: provisioning
    // (#266) creates several checks on one task within a single request, and
    // emitActivity's outbox dedupe key is (type, correlationId, name,
    // targetId) — two checks on the same task in one request would otherwise
    // collide on a shared correlationId.
    await emitActivity(tx, ctx.workspaceId, `${ctx.correlationId}:${check.id}`, {
      name: EVENT.checkAdded,
      targetType: "task",
      targetId: taskId,
      actorId: ctx.actor.membershipId,
      data: { checkId: check.id, source: check.source, key: check.key },
    });
    return check;
  });
}

const overrideSchema = z.object({
  reason: z.string().min(1).max(1000),
});

/** Owner/admin override — the gate assists, it doesn't trap. Always audited. */
export async function overrideCheck(
  ctx: RequestContext,
  taskId: string,
  checkId: string,
  input: unknown,
) {
  authorize(ctx.actor, "task.check_override");
  const check = await ctx.db.taskCheck.findFirst({
    where: { id: checkId, workspaceId: ctx.workspaceId, taskId },
  });
  if (!check) throw new ApiError("not_found", { field: "checkId" });
  const { reason } = overrideSchema.parse(input);

  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.taskCheck.update({
      where: { id: checkId },
      data: {
        state: "satisfied",
        overriddenAt: new Date(),
        overriddenBy: ctx.actor.membershipId,
        overrideReason: reason,
        updatedAt: new Date(),
      },
    });
    await emitActivity(tx, ctx.workspaceId, `${ctx.correlationId}:${checkId}`, {
      name: EVENT.checkUpdated,
      targetType: "task",
      targetId: taskId,
      actorId: ctx.actor.membershipId,
      data: { checkId, state: "satisfied", overridden: true, reason },
    });
    return updated;
  });
}

/**
 * Machine entrypoint — applies an external system's verdict to one check by
 * its own id, inside the caller's transaction (the inbound webhook wraps
 * this with its own dedupe). No session, `actorType: "system"`.
 */
export async function applyCheckState(
  tx: Prisma.TransactionClient,
  args: {
    workspaceId: string;
    checkId: string;
    taskId: string;
    state: TaskCheckState;
    evidenceUrl?: string | null;
    reason?: string | null;
    /** the webhook deliveryId, or any caller-supplied correlation id */
    correlationId: string;
  },
) {
  const updated = await tx.taskCheck.update({
    where: { id: args.checkId },
    data: {
      state: args.state,
      ...(args.evidenceUrl !== undefined ? { evidenceUrl: args.evidenceUrl } : {}),
      reason: args.reason ?? null,
      updatedAt: new Date(),
    },
  });
  await emitActivity(tx, args.workspaceId, args.correlationId, {
    name: EVENT.checkUpdated,
    targetType: "task",
    targetId: args.taskId,
    actorType: "system",
    data: { checkId: args.checkId, source: updated.source, state: args.state },
  });
  return updated;
}

/** Find a check by its external ref (globally unique) — how the inbound
 *  webhook locates the workspace it belongs to before verifying the HMAC. */
export async function findCheckByExternalRef(db: PrismaClient, externalRef: string) {
  return db.taskCheck.findUnique({ where: { externalRef } });
}

/** The checks that must be `satisfied` before a task may complete. */
export async function blockingChecks(ctx: RequestContext, taskId: string) {
  return ctx.db.taskCheck.findMany({
    where: { workspaceId: ctx.workspaceId, taskId, state: { not: "satisfied" } },
  });
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}
