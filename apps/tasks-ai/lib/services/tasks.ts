import "server-only";
import { z } from "zod";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { emitActivity } from "../events/emit";
import { EVENT, OUTBOX_TYPE } from "../events/names";
import { ApiError } from "../errors";
import { getProjectOr404 } from "../repositories/projects";
import { getTaskOr404 } from "../repositories/tasks";

const isoDate = z.union([z.string().datetime(), z.date()]).transform((v) => new Date(v));

export const createTaskSchema = z.object({
  projectId: z.string(),
  title: z.string().min(1).max(500),
  description: z.string().max(20000).optional(),
  parentId: z.string().optional(),
  assigneeId: z.string().optional(),
  statusId: z.string().optional(),
  estimate: z.number().nonnegative().optional(),
  startDate: isoDate.optional(),
  dueDate: isoDate.optional(),
  source: z.enum(["manual", "quick_capture", "import", "proposal"]).default("manual"),
});

export const updateTaskSchema = z
  .object({
    title: z.string().min(1).max(500),
    description: z.string().max(20000).nullable(),
    assigneeId: z.string().nullable(),
    statusId: z.string().nullable(),
    parentId: z.string().nullable(),
    estimate: z.number().nonnegative().nullable(),
    startDate: isoDate.nullable(),
    dueDate: isoDate.nullable(),
    position: z.number(),
  })
  .partial();

export async function createTask(ctx: RequestContext, input: unknown) {
  authorize(ctx.actor, "task.create");
  const data = createTaskSchema.parse(input);
  await getProjectOr404(ctx, data.projectId); // scoped existence + visibility

  if (data.parentId) {
    const parent = await getTaskOr404(ctx, data.parentId);
    if (parent.projectId !== data.projectId) {
      throw new ApiError("validation_failed", { parentId: "parent is in a different project" });
    }
  }

  return ctx.db.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        workspaceId: ctx.workspaceId,
        projectId: data.projectId,
        parentId: data.parentId,
        title: data.title,
        description: data.description,
        assigneeId: data.assigneeId,
        statusId: data.statusId,
        estimate: data.estimate,
        startDate: data.startDate,
        dueDate: data.dueDate,
        source: data.source,
        creatorId: ctx.actor.membershipId,
      },
    });
    await emitActivity(
      tx,
      ctx.workspaceId,
      ctx.correlationId,
      {
        name: EVENT.taskCreated,
        targetType: "task",
        targetId: task.id,
        actorId: ctx.actor.membershipId,
        data: { projectId: task.projectId, parentId: task.parentId, source: task.source },
      },
      [{ type: OUTBOX_TYPE.searchIndex, payload: { taskId: task.id } }],
    );
    return task;
  });
}

export async function updateTask(ctx: RequestContext, id: string, input: unknown) {
  authorize(ctx.actor, "task.update");
  const patch = updateTaskSchema.parse(input);
  const current = await getTaskOr404(ctx, id);

  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id: current.id },
      data: { ...patch, version: { increment: 1 } },
    });

    const extra: Parameters<typeof emitActivity>[4] = [
      { type: OUTBOX_TYPE.searchIndex, payload: { taskId: updated.id } },
    ];
    await emitActivity(
      tx,
      ctx.workspaceId,
      ctx.correlationId,
      {
        name: EVENT.taskUpdated,
        targetType: "task",
        targetId: updated.id,
        actorId: ctx.actor.membershipId,
        data: { changed: Object.keys(patch) },
      },
      extra,
    );

    if ("statusId" in patch && patch.statusId !== current.statusId) {
      await emitActivity(tx, ctx.workspaceId, ctx.correlationId, {
        name: EVENT.taskStatusChanged,
        targetType: "task",
        targetId: updated.id,
        actorId: ctx.actor.membershipId,
        data: { from: current.statusId, to: patch.statusId },
      });
    }
    if ("assigneeId" in patch && patch.assigneeId !== current.assigneeId) {
      await emitActivity(tx, ctx.workspaceId, ctx.correlationId, {
        name: EVENT.taskAssigned,
        targetType: "task",
        targetId: updated.id,
        actorId: ctx.actor.membershipId,
        data: { assigneeId: patch.assigneeId },
      });
    }
    return updated;
  });
}

export async function completeTask(ctx: RequestContext, id: string) {
  authorize(ctx.actor, "task.update");
  const current = await getTaskOr404(ctx, id);
  if (current.completedAt) return current;

  // The green-light gate (issue #265) — deterministic, no AI. Every
  // TaskCheck on this task must be satisfied (or overridden) before
  // completion is allowed.
  const blocking = await ctx.db.taskCheck.findMany({
    where: { workspaceId: ctx.workspaceId, taskId: id, state: { not: "satisfied" } },
  });
  if (blocking.length > 0) {
    throw new ApiError("blocked_by_check", {
      checks: blocking.map((c) => ({ id: c.id, source: c.source, key: c.key, state: c.state })),
    });
  }

  return ctx.db.$transaction(async (tx) => {
    const done = await tx.task.update({
      where: { id: current.id },
      data: { completedAt: new Date(), version: { increment: 1 } },
    });
    await emitActivity(tx, ctx.workspaceId, ctx.correlationId, {
      name: EVENT.taskCompleted,
      targetType: "task",
      targetId: done.id,
      actorId: ctx.actor.membershipId,
    });
    return done;
  });
}

export async function deleteTask(ctx: RequestContext, id: string) {
  authorize(ctx.actor, "task.delete");
  const current = await getTaskOr404(ctx, id);

  return ctx.db.$transaction(async (tx) => {
    const removed = await tx.task.update({
      where: { id: current.id },
      data: { archivedAt: new Date(), version: { increment: 1 } },
    });
    await emitActivity(tx, ctx.workspaceId, ctx.correlationId, {
      name: EVENT.taskDeleted,
      targetType: "task",
      targetId: removed.id,
      actorId: ctx.actor.membershipId,
    });
    return removed;
  });
}

export const linkSchema = z.object({
  toTaskId: z.string(),
  kind: z.enum(["blocks", "relates", "duplicates"]),
});

export async function linkTasks(ctx: RequestContext, fromId: string, input: unknown) {
  authorize(ctx.actor, "task.update");
  const { toTaskId, kind } = linkSchema.parse(input);
  if (toTaskId === fromId) throw new ApiError("validation_failed", { toTaskId: "cannot link to self" });
  await getTaskOr404(ctx, fromId);
  await getTaskOr404(ctx, toTaskId);

  return ctx.db.$transaction(async (tx) => {
    const rel = await tx.taskRelation.create({
      data: { workspaceId: ctx.workspaceId, fromTaskId: fromId, toTaskId, kind },
    });
    await emitActivity(tx, ctx.workspaceId, ctx.correlationId, {
      name: EVENT.dependencyLinked,
      targetType: "task",
      targetId: fromId,
      actorId: ctx.actor.membershipId,
      data: { toTaskId, kind },
    });
    return rel;
  });
}
