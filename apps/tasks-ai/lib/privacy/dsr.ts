import "server-only";
import { z } from "zod";
import type { Prisma } from "../db/generated";
import type { RequestContext } from "../context";
import { ApiError } from "../errors";
import { recordAudit } from "../events/emit";

function requireOwner(ctx: RequestContext) {
  if (ctx.actor.role !== "owner") throw new ApiError("forbidden");
}

const dsrSchema = z.object({
  subjectUserId: z.string().min(1),
  kind: z.enum(["export", "delete"]),
});

/** Everything TasksAI holds that references a platform user id, per table. */
async function collect(db: RequestContext["db"], workspaceId: string, subjectUserId: string) {
  const membership = await db.membership.findFirst({
    where: { workspaceId, platformUserId: subjectUserId },
    select: { id: true },
  });
  const membershipId = membership?.id;
  const [comments, timeEntries, feedback, signalFeedback, tokens, savedViews, searches, notifications] = await Promise.all([
    membershipId ? db.comment.count({ where: { workspaceId, authorId: membershipId } }) : 0,
    membershipId ? db.timeEntry.count({ where: { workspaceId, membershipId } }) : 0,
    membershipId ? db.proposalFeedback.count({ where: { workspaceId, membershipId } }) : 0,
    membershipId ? db.signalFeedback.count({ where: { workspaceId, membershipId } }) : 0,
    membershipId ? db.apiToken.count({ where: { workspaceId, membershipId } }) : 0,
    membershipId ? db.savedView.count({ where: { workspaceId, ownerId: membershipId } }) : 0,
    membershipId ? db.searchHistory.count({ where: { workspaceId, membershipId } }) : 0,
    membershipId ? db.notification.count({ where: { workspaceId, recipientId: membershipId } }) : 0,
  ]);
  return {
    membershipId,
    counts: { comments, timeEntries, feedback, signalFeedback, tokens, savedViews, searches, notifications },
  };
}

export async function createDsr(ctx: RequestContext, input: unknown) {
  requireOwner(ctx);
  const d = dsrSchema.parse(input);
  const found = await collect(ctx.db, ctx.workspaceId, d.subjectUserId);
  const row = await ctx.db.dataSubjectRequest.create({
    data: {
      workspaceId: ctx.workspaceId,
      subjectUserId: d.subjectUserId,
      requestedBy: ctx.actor.membershipId,
      kind: d.kind,
      state: "requested",
      manifest: { found: found.counts, hasMembership: Boolean(found.membershipId) } as Prisma.InputJsonValue,
    },
  });
  await recordAudit(ctx.db, ctx.workspaceId, "dsr.created", ctx.actor.membershipId, {
    dsrId: row.id,
    kind: d.kind,
    subjectUserId: d.subjectUserId,
  }, ctx.correlationId);
  return row;
}

/** Run the DSR. Export builds a bundle; delete removes and then re-counts
 *  to prove zero remain (verified deletion). */
export async function processDsr(ctx: RequestContext, id: string) {
  requireOwner(ctx);
  const dsr = await ctx.db.dataSubjectRequest.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!dsr) throw new ApiError("not_found");
  if (dsr.state === "completed") return dsr;

  await ctx.db.dataSubjectRequest.update({ where: { id }, data: { state: "processing" } });
  const { membershipId } = await collect(ctx.db, ctx.workspaceId, dsr.subjectUserId);

  if (dsr.kind === "export") {
    const bundle = membershipId
      ? {
          comments: await ctx.db.comment.findMany({ where: { workspaceId: ctx.workspaceId, authorId: membershipId }, select: { id: true, taskId: true, body: true, createdAt: true } }),
          timeEntries: await ctx.db.timeEntry.findMany({ where: { workspaceId: ctx.workspaceId, membershipId } }),
          savedViews: await ctx.db.savedView.findMany({ where: { workspaceId: ctx.workspaceId, ownerId: membershipId } }),
          searchHistory: await ctx.db.searchHistory.findMany({ where: { workspaceId: ctx.workspaceId, membershipId } }),
        }
      : {};
    const done = await ctx.db.dataSubjectRequest.update({
      where: { id },
      data: {
        state: "completed",
        completedAt: new Date(),
        manifest: { export: bundle } as Prisma.InputJsonValue,
        verification: { entities: Object.keys(bundle).length } as Prisma.InputJsonValue,
      },
    });
    await recordAudit(ctx.db, ctx.workspaceId, "dsr.export_completed", ctx.actor.membershipId, { dsrId: id }, ctx.correlationId);
    return done;
  }

  // delete
  if (membershipId) {
    await ctx.db.$transaction([
      ctx.db.searchHistory.deleteMany({ where: { workspaceId: ctx.workspaceId, membershipId } }),
      ctx.db.notification.deleteMany({ where: { workspaceId: ctx.workspaceId, recipientId: membershipId } }),
      ctx.db.savedView.deleteMany({ where: { workspaceId: ctx.workspaceId, ownerId: membershipId } }),
      ctx.db.proposalFeedback.deleteMany({ where: { workspaceId: ctx.workspaceId, membershipId } }),
      ctx.db.signalFeedback.deleteMany({ where: { workspaceId: ctx.workspaceId, membershipId } }),
      ctx.db.timeEntry.deleteMany({ where: { workspaceId: ctx.workspaceId, membershipId } }),
      ctx.db.apiToken.updateMany({ where: { workspaceId: ctx.workspaceId, membershipId, revokedAt: null }, data: { revokedAt: new Date() } }),
      // comments are redacted, not deleted, to preserve thread integrity
      ctx.db.comment.updateMany({ where: { workspaceId: ctx.workspaceId, authorId: membershipId, deletedAt: null }, data: { body: "[removed at the author's request]", mentions: [], deletedAt: new Date() } }),
      ctx.db.membership.update({ where: { id: membershipId }, data: { archivedAt: new Date() } }),
    ]);
  }

  const after = await collect(ctx.db, ctx.workspaceId, dsr.subjectUserId);
  // Comments are redacted in place (thread integrity), so their count stays
  // > 0; every other category must be 0 for the deletion to be verified.
  const nonComment = Object.entries(after.counts).filter(([k, n]) => k !== "comments" && n > 0);
  const done = await ctx.db.dataSubjectRequest.update({
    where: { id },
    data: {
      state: nonComment.length === 0 ? "completed" : "failed",
      completedAt: new Date(),
      verification: { afterCounts: after.counts, residualNonComment: nonComment } as Prisma.InputJsonValue,
    },
  });
  await recordAudit(ctx.db, ctx.workspaceId, "dsr.delete_completed", ctx.actor.membershipId, {
    dsrId: id,
    verified: nonComment.length === 0,
    afterCounts: after.counts,
  }, ctx.correlationId);
  return done;
}

export async function listDsr(ctx: RequestContext) {
  requireOwner(ctx);
  return ctx.db.dataSubjectRequest.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
  });
}
