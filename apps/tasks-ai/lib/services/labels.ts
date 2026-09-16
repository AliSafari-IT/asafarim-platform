import "server-only";
import { z } from "zod";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { emitActivity } from "../events/emit";
import { EVENT } from "../events/names";
import { ApiError } from "../errors";
import { getLabelOr404, listLabels as listLabelsRepo } from "../repositories/labels";
import { getTaskOr404 } from "../repositories/tasks";

export const createLabelSchema = z.object({
  name: z.string().min(1).max(60),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "hex color, e.g. #8b8b8b")
    .default("#8b8b8b"),
});

export async function listLabels(ctx: RequestContext) {
  return listLabelsRepo(ctx);
}

/**
 * Owner/admin-for-management is the same boundary `project.archive` and
 * `status.manage` use — creating/renaming the taxonomy shapes what every
 * member can pick from, so it isn't a per-task action (issue #387). Reuses
 * the existing `label.manage` action already defined in lib/authz.ts (it
 * predates any code path that actually created a Label row).
 */
export async function createLabel(ctx: RequestContext, input: unknown) {
  authorize(ctx.actor, "label.manage");
  const data = createLabelSchema.parse(input);

  return ctx.db.$transaction(async (tx) => {
    const clash = await tx.label.findUnique({
      where: { workspaceId_name: { workspaceId: ctx.workspaceId, name: data.name } },
    });
    if (clash) throw new ApiError("conflict_unique", { field: "name" });

    const label = await tx.label.create({
      data: { workspaceId: ctx.workspaceId, name: data.name, color: data.color },
    });
    await emitActivity(tx, ctx.workspaceId, ctx.correlationId, {
      name: EVENT.labelCreated,
      targetType: "label",
      targetId: label.id,
      actorId: ctx.actor.membershipId,
      data: { name: label.name, color: label.color },
    });
    return label;
  });
}

export async function archiveLabel(ctx: RequestContext, id: string) {
  authorize(ctx.actor, "label.manage");
  const current = await getLabelOr404(ctx, id);
  if (current.archivedAt) return current;

  return ctx.db.$transaction(async (tx) => {
    const archived = await tx.label.update({
      where: { id: current.id },
      data: { archivedAt: new Date() },
    });
    await emitActivity(tx, ctx.workspaceId, ctx.correlationId, {
      name: EVENT.labelArchived,
      targetType: "label",
      targetId: archived.id,
      actorId: ctx.actor.membershipId,
    });
    return archived;
  });
}

/**
 * Assigning/removing a label on a task is gated on `task.update` — the same
 * boundary every other task edit uses — not `label.manage`. A member who
 * can edit the task can tag it; only creating/archiving the taxonomy itself
 * needs owner/admin (issue #387 planning step 5).
 */
export async function assignLabel(ctx: RequestContext, taskId: string, labelId: string) {
  authorize(ctx.actor, "task.update");
  const task = await getTaskOr404(ctx, taskId);
  const label = await getLabelOr404(ctx, labelId);
  if (label.archivedAt) throw new ApiError("validation_failed", { labelId: "label is archived" });

  return ctx.db.$transaction(async (tx) => {
    await tx.taskLabel.upsert({
      where: { taskId_labelId: { taskId: task.id, labelId: label.id } },
      create: { taskId: task.id, labelId: label.id },
      update: {},
    });
    await emitActivity(tx, ctx.workspaceId, ctx.correlationId, {
      name: EVENT.labelAssigned,
      targetType: "task",
      targetId: task.id,
      actorId: ctx.actor.membershipId,
      data: { labelId: label.id },
    });
    return { taskId: task.id, labelId: label.id };
  });
}

export async function removeLabel(ctx: RequestContext, taskId: string, labelId: string) {
  authorize(ctx.actor, "task.update");
  const task = await getTaskOr404(ctx, taskId);

  return ctx.db.$transaction(async (tx) => {
    await tx.taskLabel.deleteMany({ where: { taskId: task.id, labelId } });
    await emitActivity(tx, ctx.workspaceId, ctx.correlationId, {
      name: EVENT.labelRemoved,
      targetType: "task",
      targetId: task.id,
      actorId: ctx.actor.membershipId,
      data: { labelId },
    });
    return { taskId: task.id, labelId };
  });
}
