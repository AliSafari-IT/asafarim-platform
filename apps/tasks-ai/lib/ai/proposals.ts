import "server-only";
import { z } from "zod";
import type { Prisma } from "../db/generated";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { ApiError } from "../errors";
import { emitActivity, recordAudit } from "../events/emit";
import { EVENT } from "../events/names";
import { CANDIDATE_REF_PREFIX, TARGET_TASK_REF, isCandidateRef, operationSchema, type Operation } from "./types";
import { initialTriagedAt } from "../capture/inbox";
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
    select: { id: true, isInbox: true },
  });
  if (!project) throw new ApiError("not_found", { field: "projectId" });

  const allOps = (editedOperations ?? (p.operations as Operation[])) as Operation[];
  const selected = accept ? allOps.filter((_, i) => accept.includes(i)) : allOps;

  const refToTaskId = new Map<string, string>();
  // A task-scoped draft may address exactly one existing task: the one the
  // job recorded. Resolving it here — from the proposal row, never from the
  // operations the client sent back — is what lets decomposition parent real
  // subtasks and acceptance criteria actually edit the task (PR #377 review).
  if (p.targetTaskId) {
    const target = await ctx.db.task.findFirst({
      where: { id: p.targetTaskId, workspaceId: ctx.workspaceId, archivedAt: null },
      select: { id: true },
    });
    if (!target) {
      throw new ApiError("validation_failed", {
        reason: "the task this proposal was drafted for no longer exists",
      });
    }
    refToTaskId.set(TARGET_TASK_REF, target.id);
  }
  // A retrieved candidate ref (issue #234, e.g. a dedup match) names a real
  // task by id rather than one this proposal creates. Resolve it only when
  // it was actually part of the retrieval set the *generation* step
  // computed and stored on the job — never anything an edited operation
  // merely claims — the same trust boundary guardDraft enforces, re-checked
  // here because editedOperations only goes through schema validation, not
  // guardDraft, before reaching this function.
  const allowedCandidateIds = new Set(p.aiJob.retrievedIds);
  const candidateRefs = new Set<string>();
  for (const op of selected) {
    if (op.op !== "link_tasks") continue;
    if (isCandidateRef(op.fromRef) && allowedCandidateIds.has(op.fromRef)) candidateRefs.add(op.fromRef);
    if (isCandidateRef(op.toRef) && allowedCandidateIds.has(op.toRef)) candidateRefs.add(op.toRef);
  }
  if (candidateRefs.size) {
    const rawIds = [...candidateRefs].map((ref) => ref.slice(CANDIDATE_REF_PREFIX.length));
    const rows = await ctx.db.task.findMany({
      where: { id: { in: rawIds }, workspaceId: ctx.workspaceId, archivedAt: null },
      select: { id: true },
    });
    for (const row of rows) refToTaskId.set(`${CANDIDATE_REF_PREFIX}${row.id}`, row.id);
  }
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
            // Nothing enters the work graph until a human applies the
            // proposal — that is the AI boundary (docs/adr/0004). Applying
            // it is not the same as planning it: an applied task that still
            // has no owner and no date lands in the Inbox so a person
            // resolves those, instead of quietly posing as planned work
            // (issue #366, lib/capture/inbox.ts).
            triagedAt: initialTriagedAt({
              source: "proposal",
              hasProject: true,
              intoInboxProject: project.isInbox,
              hasAssignee: false,
              hasDueDate: false,
            }),
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
        // The target task is the only existing task a proposal may edit. An
        // op naming anything else — a model's guess, or an id slipped into
        // `editedOperations` — resolves to nothing and is skipped.
        const taskId = op.taskId === TARGET_TASK_REF ? p.targetTaskId : op.taskId;
        if (!taskId || taskId !== p.targetTaskId) continue;
        const before = await tx.task.findFirst({
          where: { id: taskId, workspaceId: ctx.workspaceId },
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
      } else if (op.op === "set_dependency") {
        // issue #235: a superset of link_tasks that also accepts the
        // inverse direction. "blocked_by" means fromRef is blocked by
        // toRef, i.e. toRef blocks fromRef — stored as that direction's
        // "blocks" edge so TaskRelation only ever has one kind to reason
        // about for a dependency, not two spellings of it.
        const from = refToTaskId.get(op.fromRef);
        const to = refToTaskId.get(op.toRef);
        if (!from || !to) continue;
        const [fromTaskId, toTaskId] = op.kind === "blocked_by" ? [to, from] : [from, to];
        const rel = await tx.taskRelation.create({
          data: { workspaceId: ctx.workspaceId, fromTaskId, toTaskId, kind: "blocks" },
        });
        undo.push({ op: "unlink", relationId: rel.id });
      } else if (op.op === "set_labels") {
        // Confirmed by review the same way update_task's fields are — this
        // is not a "suggested" field, applying it IS the action.
        const taskId = op.taskId === TARGET_TASK_REF ? p.targetTaskId : op.taskId;
        if (!taskId || taskId !== p.targetTaskId) continue;
        const task = await tx.task.findFirst({
          where: { id: taskId, workspaceId: ctx.workspaceId },
          select: { id: true },
        });
        if (!task) continue;
        const candidateIds = [...new Set([...op.fields.add, ...op.fields.remove])];
        const existing = candidateIds.length
          ? await tx.taskLabel.findMany({
              where: { taskId, labelId: { in: candidateIds } },
              select: { labelId: true },
            })
          : [];
        const existingSet = new Set(existing.map((e) => e.labelId));
        // Skip a re-add/re-remove that would be a no-op: the undo plan must
        // record exactly what this op changed, or undoing it would remove a
        // label the task already had before this proposal touched it.
        const toAdd = op.fields.add.filter((l) => !existingSet.has(l));
        const toRemove = op.fields.remove.filter((l) => existingSet.has(l));
        // An invented label id must not silently create a dangling row —
        // skip it rather than let the FK fail the whole transaction.
        const validAdd = toAdd.length
          ? await tx.label.findMany({
              where: { id: { in: toAdd }, workspaceId: ctx.workspaceId, archivedAt: null },
              select: { id: true },
            })
          : [];
        const finalAdd = toAdd.filter((l) => validAdd.some((v) => v.id === l));
        if (finalAdd.length) {
          await tx.taskLabel.createMany({
            data: finalAdd.map((labelId) => ({ taskId, labelId })),
            skipDuplicates: true,
          });
        }
        if (toRemove.length) {
          await tx.taskLabel.deleteMany({ where: { taskId, labelId: { in: toRemove } } });
        }
        if (finalAdd.length || toRemove.length) {
          undo.push({ op: "restore_labels", taskId, added: finalAdd, removed: toRemove });
        }
      } else if (op.op === "suggest_status") {
        // Never Task.statusId — the separate, non-committed column (issue
        // #235). Promoting a suggestion to the committed status is a
        // distinct human action outside proposal apply.
        const taskId = op.taskId === TARGET_TASK_REF ? p.targetTaskId : op.taskId;
        if (!taskId || taskId !== p.targetTaskId) continue;
        const before = await tx.task.findFirst({
          where: { id: taskId, workspaceId: ctx.workspaceId },
          select: { id: true, suggestedStatusId: true },
        });
        if (!before) continue;
        const status = await tx.status.findFirst({
          where: { id: op.statusId, workspaceId: ctx.workspaceId, archivedAt: null },
          select: { id: true },
        });
        // An invented/foreign status id resolves to nothing — applied as a
        // no-op rather than failing the whole apply.
        if (!status) continue;
        await tx.task.update({ where: { id: before.id }, data: { suggestedStatusId: status.id } });
        undo.push({
          op: "restore_suggested_status",
          taskId: before.id,
          suggestedStatusId: before.suggestedStatusId,
        });
      } else if (op.op === "suggest_due_date") {
        // Never Task.dueDate — same non-commit boundary as suggest_status.
        const taskId = op.taskId === TARGET_TASK_REF ? p.targetTaskId : op.taskId;
        if (!taskId || taskId !== p.targetTaskId) continue;
        const before = await tx.task.findFirst({
          where: { id: taskId, workspaceId: ctx.workspaceId },
          select: { id: true, suggestedDueDate: true },
        });
        if (!before) continue;
        await tx.task.update({
          where: { id: before.id },
          data: { suggestedDueDate: new Date(op.dueDate) },
        });
        undo.push({
          op: "restore_suggested_due_date",
          taskId: before.id,
          suggestedDueDate: before.suggestedDueDate,
        });
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
      } else if (step.op === "restore_labels") {
        const added = (step.added as string[] | undefined) ?? [];
        const removed = (step.removed as string[] | undefined) ?? [];
        if (added.length) {
          await tx.taskLabel.deleteMany({
            where: { taskId: String(step.taskId), labelId: { in: added } },
          });
        }
        if (removed.length) {
          await tx.taskLabel.createMany({
            data: removed.map((labelId) => ({ taskId: String(step.taskId), labelId })),
            skipDuplicates: true,
          });
        }
      } else if (step.op === "restore_suggested_status") {
        await tx.task.updateMany({
          where: { id: String(step.taskId), workspaceId: ctx.workspaceId },
          data: { suggestedStatusId: (step.suggestedStatusId as string | null) ?? null },
        });
      } else if (step.op === "restore_suggested_due_date") {
        await tx.task.updateMany({
          where: { id: String(step.taskId), workspaceId: ctx.workspaceId },
          data: {
            suggestedDueDate: step.suggestedDueDate ? new Date(step.suggestedDueDate as string) : null,
          },
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
