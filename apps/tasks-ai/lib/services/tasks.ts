import "server-only";
import { z } from "zod";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { emitActivity } from "../events/emit";
import { EVENT, OUTBOX_TYPE } from "../events/names";
import { ApiError } from "../errors";
import { getProjectOr404 } from "../repositories/projects";
import { getTaskOr404, lockTaskRow } from "../repositories/tasks";
import {
  CAPTURE_SOURCES,
  initialTriagedAt,
  USER_CAPTURE_SOURCES,
  type CaptureSource,
} from "../capture/inbox";
import { ensureInboxProject } from "../capture/service";
import { isUniqueViolation } from "./task-checks";

const isoDate = z.union([z.string().datetime(), z.date()]).transform((v) => new Date(v));

export const createTaskSchema = z.object({
  /**
   * Optional since issue #366: capture only requires a title. Without a
   * project the task lands in the workspace Inbox container — never in
   * "whatever project happened to be first".
   */
  projectId: z.string().optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(20000).optional(),
  parentId: z.string().optional(),
  assigneeId: z.string().optional(),
  statusId: z.string().optional(),
  estimate: z.number().nonnegative().optional(),
  startDate: isoDate.optional(),
  dueDate: isoDate.optional(),
  source: z.enum(CAPTURE_SOURCES as [CaptureSource, ...CaptureSource[]]).default("manual"),
  /** Force the new task to wait in the Inbox even though a project is set. */
  captureToInbox: z.boolean().optional(),
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

export interface CreateTaskOptions {
  /**
   * Which `source` values this caller may claim. The public route passes
   * `USER_CAPTURE_SOURCES`; trusted server paths (import, inbound email,
   * proposal apply) omit it and keep the full set.
   */
  allowedSources?: readonly CaptureSource[];
}

export async function createTask(
  ctx: RequestContext,
  input: unknown,
  opts: CreateTaskOptions = {},
) {
  authorize(ctx.actor, "task.create");
  const data = createTaskSchema.parse(input);
  // Provenance is a trust signal (it drives the Inbox rule and the source
  // badge), so a user-supplied request cannot claim a system channel.
  if (opts.allowedSources && !opts.allowedSources.includes(data.source)) {
    throw new ApiError("validation_failed", {
      source: `must be one of: ${opts.allowedSources.join(", ")}`,
    });
  }
  // A destination the caller chose, or the workspace Inbox container. The
  // one thing this must never do is silently pick somebody's first project
  // (issue #366).
  const project = data.projectId
    ? await getProjectOr404(ctx, data.projectId) // scoped existence + visibility
    : await ensureInboxProject(ctx);

  if (data.parentId) {
    const parent = await getTaskOr404(ctx, data.parentId);
    if (parent.projectId !== project.id) {
      throw new ApiError("validation_failed", { parentId: "parent is in a different project" });
    }
  }

  // The Inbox rule lives in exactly one place — see lib/capture/inbox.ts.
  const triagedAt = initialTriagedAt({
    source: data.source,
    hasProject: Boolean(data.projectId),
    intoInboxProject: project.isInbox,
    hasAssignee: Boolean(data.assigneeId),
    hasDueDate: Boolean(data.dueDate),
    forceInbox: data.captureToInbox,
  });

  return ctx.db.$transaction(async (tx) => {
    if (data.parentId) {
      // Re-check the parent under a row lock: `triageTask` takes the same
      // lock before moving a parent between projects, so the two cannot
      // interleave and leave this subtask stranded in the old project.
      await lockTaskRow(tx, data.parentId);
      const locked = await tx.task.findFirst({
        where: { id: data.parentId, workspaceId: ctx.workspaceId },
        select: { projectId: true },
      });
      if (!locked) throw new ApiError("not_found");
      if (locked.projectId !== project.id) {
        throw new ApiError("validation_failed", { parentId: "parent is in a different project" });
      }
    }

    const task = await tx.task.create({
      data: {
        workspaceId: ctx.workspaceId,
        projectId: project.id,
        triagedAt,
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
        data: {
          projectId: task.projectId,
          parentId: task.parentId,
          source: task.source,
          inbox: task.triagedAt === null,
        },
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
    let rel;
    try {
      rel = await tx.taskRelation.create({
        data: { workspaceId: ctx.workspaceId, fromTaskId: fromId, toTaskId, kind },
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ApiError("conflict_unique", { field: "toTaskId" });
      throw err;
    }
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

/**
 * Every relation touching a task, in both directions — a "blocks" row where
 * this task is `toTaskId` is a dependency ON this task, not one it created.
 * Includes just enough of the other side (title, completedAt) for "Blocked
 * by X" / "Blocks Y" to render without a second round trip per relation.
 */
export async function listTaskRelations(ctx: RequestContext, taskId: string) {
  await getTaskOr404(ctx, taskId);
  const pick = { id: true, title: true, completedAt: true, archivedAt: true } as const;
  const [outgoing, incoming] = await Promise.all([
    ctx.db.taskRelation.findMany({
      where: { workspaceId: ctx.workspaceId, fromTaskId: taskId },
      orderBy: { createdAt: "asc" },
      include: { toTask: { select: pick } },
    }),
    ctx.db.taskRelation.findMany({
      where: { workspaceId: ctx.workspaceId, toTaskId: taskId },
      orderBy: { createdAt: "asc" },
      include: { fromTask: { select: pick } },
    }),
  ]);
  return {
    outgoing: outgoing.map((r) => ({ id: r.id, kind: r.kind, task: r.toTask })),
    incoming: incoming.map((r) => ({ id: r.id, kind: r.kind, task: r.fromTask })),
  };
}

export async function unlinkTasks(ctx: RequestContext, fromId: string, relationId: string) {
  authorize(ctx.actor, "task.update");
  await getTaskOr404(ctx, fromId);
  const rel = await ctx.db.taskRelation.findFirst({
    where: { id: relationId, workspaceId: ctx.workspaceId, fromTaskId: fromId },
  });
  if (!rel) throw new ApiError("not_found");

  return ctx.db.$transaction(async (tx) => {
    await tx.taskRelation.delete({ where: { id: relationId } });
    await emitActivity(tx, ctx.workspaceId, ctx.correlationId, {
      name: EVENT.dependencyUnlinked,
      targetType: "task",
      targetId: fromId,
      actorId: ctx.actor.membershipId,
      data: { toTaskId: rel.toTaskId, kind: rel.kind },
    });
    return { ok: true };
  });
}
