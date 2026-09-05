import "server-only";
import { z } from "zod";
import type { RequestContext } from "../context";
import { ApiError } from "../errors";
import { emitActivity } from "../events/emit";
import { EVENT } from "../events/names";
import { parseMentions } from "../mentions";
import { getTaskOr404 } from "../repositories/tasks";
import { notifyMany } from "./notifications";

export const createCommentSchema = z.object({
  body: z.string().min(1).max(20000),
});

/**
 * Add a comment. Mentions are resolved against *this workspace's* active
 * memberships only — a mention token carrying another workspace's id
 * resolves to nothing, so it cannot be used to ping across tenants. The
 * author and every mentioned member become watchers.
 */
export async function addComment(ctx: RequestContext, taskId: string, input: unknown) {
  const { body } = createCommentSchema.parse(input);
  await getTaskOr404(ctx, taskId);

  const mentionedIds = parseMentions(body);
  const validMentions = mentionedIds.length
    ? (
        await ctx.db.membership.findMany({
          where: { id: { in: mentionedIds }, workspaceId: ctx.workspaceId, archivedAt: null },
          select: { id: true },
        })
      ).map((m) => m.id)
    : [];

  return ctx.db.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: {
        workspaceId: ctx.workspaceId,
        taskId,
        authorId: ctx.actor.membershipId,
        body,
        mentions: validMentions,
      },
    });

    // Author + mentioned members watch the task from now on.
    for (const membershipId of new Set([ctx.actor.membershipId, ...validMentions])) {
      await tx.watcher.upsert({
        where: { taskId_membershipId: { taskId, membershipId } },
        create: { workspaceId: ctx.workspaceId, taskId, membershipId },
        update: {},
      });
    }

    const watchers = await tx.watcher.findMany({
      where: { taskId, workspaceId: ctx.workspaceId },
      select: { membershipId: true },
    });

    await notifyMany(tx, ctx.workspaceId, ctx.actor.membershipId, [
      ...validMentions.map((recipientId) => ({
        recipientId,
        kind: "mention" as const,
        taskId,
        data: { commentId: comment.id },
        dedupeKey: `mention:${comment.id}:${recipientId}`,
      })),
      ...watchers
        .map((w) => w.membershipId)
        .filter((id) => !validMentions.includes(id))
        .map((recipientId) => ({
          recipientId,
          kind: "comment" as const,
          taskId,
          data: { commentId: comment.id },
          dedupeKey: `comment:${comment.id}:${recipientId}`,
        })),
    ]);

    await emitActivity(tx, ctx.workspaceId, ctx.correlationId, {
      name: EVENT.taskUpdated,
      targetType: "task",
      targetId: taskId,
      actorId: ctx.actor.membershipId,
      data: { comment: comment.id, mentions: validMentions.length },
    });

    return comment;
  });
}

export async function listComments(ctx: RequestContext, taskId: string) {
  await getTaskOr404(ctx, taskId);
  return ctx.db.comment.findMany({
    where: { workspaceId: ctx.workspaceId, taskId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { reactions: true },
  });
}

export async function editComment(ctx: RequestContext, id: string, input: unknown) {
  const { body } = createCommentSchema.parse(input);
  const comment = await ctx.db.comment.findFirst({
    where: { id, workspaceId: ctx.workspaceId, deletedAt: null },
  });
  if (!comment) throw new ApiError("not_found");
  if (comment.authorId !== ctx.actor.membershipId) throw new ApiError("forbidden");
  return ctx.db.comment.update({
    where: { id },
    data: { body, mentions: parseMentions(body), editedAt: new Date() },
  });
}

export async function deleteComment(ctx: RequestContext, id: string) {
  const comment = await ctx.db.comment.findFirst({
    where: { id, workspaceId: ctx.workspaceId, deletedAt: null },
  });
  if (!comment) throw new ApiError("not_found");
  const canModerate = ctx.actor.role === "owner" || ctx.actor.role === "admin";
  if (comment.authorId !== ctx.actor.membershipId && !canModerate) throw new ApiError("forbidden");
  return ctx.db.comment.update({ where: { id }, data: { deletedAt: new Date() } });
}
