import "server-only";
import { z } from "zod";
import type { Prisma } from "../db/generated";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { ApiError } from "../errors";
import { emitActivity, recordAudit } from "../events/emit";
import { EVENT } from "../events/names";
import { operationSchema, type Operation } from "./types";
import { runAiJob } from "./job";

async function loadProposal(ctx: RequestContext, id: string) {
  const p = await ctx.db.proposal.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    include: { aiJob: true },
  });
  if (!p) throw new ApiError("not_found");
  return p;
}

export async function getProposal(ctx: RequestContext, id: string) {
  const p = await loadProposal(ctx, id);
  await ctx.db.proposal.updateMany({
    where: { id, state: "draft" },
    data: { state: "previewed" },
  });
  return p;
}

const applySchema = z.object({
  /** indices into operations[] to apply; omitted = all */
  accept: z.array(z.number().int().nonnegative()).optional(),
  /** the project every create_task lands in */
  projectId: z.string(),
  /** edited operations replacing the generated ones, same order */
  editedOperations: z.array(operationSchema).optional(),
});

/**
 * Apply a proposal (docs/adr/0004). Every op runs inside one transaction;
 * an inverse `undoPlan` is captured so the whole thing is reversible.
 * Elevated confirmation for high blast radius is the caller's concern (the
 * route requires an explicit `confirm=high` query when opCount is large) —
 * here we enforce the allowlist one more time.
 */
export async function applyProposal(ctx: RequestContext, id: string, input: unknown) {
  authorize(ctx.actor, "task.create");
  const { accept, projectId, editedOperations } = applySchema.parse(input);
  const p = await loadProposal(ctx, id);
  if (p.state === "applied") return p;
  if (!["draft", "previewed", "partially_applied"].includes(p.state)) {
    throw new ApiError("validation_failed", { state: p.state });
  }

  const project = await ctx.db.project.findFirst({
    where: { id: projectId, workspaceId: ctx.workspaceId, archivedAt: null },
    select: { id: true },
  });
  if (!project) throw new ApiError("not_found", { field: "projectId" });

  const allOps = (editedOperations ?? (p.operations as Operation[])) as Operation[];
  const selected = accept ? allOps.filter((_, i) => accept.includes(i)) : allOps;

  const refToTaskId = new Map<string, string>();
  const undo: Record<string, unknown>[] = [];
  let editDistance = 0;
  if (editedOperations) {
    editDistance = diffOps(p.operations as Operation[], editedOperations);
  }

  await ctx.db.$transaction(async (tx) => {
    for (const op of selected) {
      if (op.op === "create_task") {
        const parentId = op.fields.parentRef ? refToTaskId.get(op.fields.parentRef) ?? null : null;
        const task = await tx.task.create({
          data: {
            workspaceId: ctx.workspaceId,
            projectId: project.id,
            parentId,
            title: op.fields.title,
            description: op.fields.description,
            estimate: op.fields.estimate,
            source: "proposal",
            creatorId: ctx.actor.membershipId,
          },
        });
        refToTaskId.set(op.ref, task.id);
        undo.push({ op: "delete_task", taskId: task.id });
        await emitActivity(tx, ctx.workspaceId, ctx.correlationId, {
          name: EVENT.taskCreated,
          targetType: "task",
          targetId: task.id,
          actorType: "ai",
          actorId: ctx.actor.membershipId,
          data: { via: "proposal", proposalId: id, ref: op.ref },
        });
      } else if (op.op === "update_task") {
        const before = await tx.task.findFirst({
          where: { id: op.taskId, workspaceId: ctx.workspaceId },
        });
        if (!before) continue;
        await tx.task.update({
          where: { id: before.id },
          data: { ...op.fields, version: { increment: 1 } },
        });
        undo.push({
          op: "restore_task",
          taskId: before.id,
          fields: {
            title: before.title,
            description: before.description,
            estimate: before.estimate,
          },
        });
      } else if (op.op === "link_tasks") {
        const from = refToTaskId.get(op.fromRef);
        const to = refToTaskId.get(op.toRef);
        if (!from || !to) continue;
        const rel = await tx.taskRelation.create({
          data: { workspaceId: ctx.workspaceId, fromTaskId: from, toTaskId: to, kind: op.kind },
        });
        undo.push({ op: "unlink", relationId: rel.id });
      }
    }

    await tx.proposal.update({
      where: { id },
      data: {
        state: accept && accept.length < allOps.length ? "partially_applied" : "applied",
        appliedAt: new Date(),
        undoPlan: undo as Prisma.InputJsonValue,
        operations: allOps as Prisma.InputJsonValue,
      },
    });
  });

  await recordAudit(ctx.db, ctx.workspaceId, "proposal.applied", ctx.actor.membershipId, {
    proposalId: id,
    aiJobId: p.aiJobId,
    acceptedOps: selected.length,
    totalOps: allOps.length,
    editDistance,
    undoOps: undo.length,
  }, ctx.correlationId);

  return ctx.db.proposal.findUnique({ where: { id } });
}

export async function rejectProposal(ctx: RequestContext, id: string, reason?: string) {
  const p = await loadProposal(ctx, id);
  if (p.state === "applied") throw new ApiError("validation_failed", { state: "applied" });
  await ctx.db.proposal.update({ where: { id }, data: { state: "rejected" } });
  await recordAudit(ctx.db, ctx.workspaceId, "proposal.rejected", ctx.actor.membershipId, {
    proposalId: id,
    reason: reason?.slice(0, 300),
  }, ctx.correlationId);
  return { rejected: true };
}

export async function undoProposal(ctx: RequestContext, id: string) {
  authorize(ctx.actor, "task.delete");
  const p = await loadProposal(ctx, id);
  if (p.state !== "applied" && p.state !== "partially_applied") {
    throw new ApiError("validation_failed", { reason: "nothing to undo" });
  }
  const plan = (p.undoPlan as Record<string, unknown>[]) ?? [];

  await ctx.db.$transaction(async (tx) => {
    // reverse order
    for (const step of [...plan].reverse()) {
      if (step.op === "delete_task") {
        await tx.task.updateMany({
          where: { id: String(step.taskId), workspaceId: ctx.workspaceId },
          data: { archivedAt: new Date() },
        });
      } else if (step.op === "restore_task") {
        await tx.task.updateMany({
          where: { id: String(step.taskId), workspaceId: ctx.workspaceId },
          data: { ...(step.fields as object), version: { increment: 1 } },
        });
      } else if (step.op === "unlink") {
        await tx.taskRelation.deleteMany({
          where: { id: String(step.relationId), workspaceId: ctx.workspaceId },
        });
      }
    }
    await tx.proposal.update({ where: { id }, data: { state: "undone" } });
  });

  await recordAudit(ctx.db, ctx.workspaceId, "proposal.undone", ctx.actor.membershipId, {
    proposalId: id,
    steps: plan.length,
  }, ctx.correlationId);
  return { undone: true, steps: plan.length };
}

/** Regenerate = run a fresh job with the same kind/input recorded on the job. */
export async function regenerateProposal(ctx: RequestContext, id: string) {
  const p = await loadProposal(ctx, id);
  await ctx.db.proposal.updateMany({ where: { id }, data: { state: "regenerating" } });
  // The original input is not stored verbatim (redaction) — the client
  // re-submits it. Regenerate here just marks state; the route calls runAiJob.
  return runAiJob(ctx, { kind: p.kind, input: `regenerate:${p.aiJobId}` });
}

function diffOps(a: Operation[], b: Operation[]): number {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa === sb) return 0;
  // cheap normalized edit signal: symmetric size delta + field mismatches
  let d = Math.abs(a.length - b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) d += 1;
  }
  return d / Math.max(a.length, b.length, 1);
}
