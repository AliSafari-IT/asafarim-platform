import "server-only";
import { z } from "zod";
import type { RequestContext } from "../context";
import { ApiError } from "../errors";
import { recordAudit } from "../events/emit";

export const feedbackSchema = z.object({
  outcome: z.enum(["accepted", "partially_accepted", "rejected", "regenerated"]),
  editDistance: z.number().min(0).max(1).optional(),
  timeSavedMin: z.number().int().min(0).max(600).optional(),
  correctionReason: z.string().max(1000).optional(),
  trust: z.number().int().min(1).max(5).optional(),
});

export async function recordProposalFeedback(ctx: RequestContext, proposalId: string, input: unknown) {
  const data = feedbackSchema.parse(input);
  const proposal = await ctx.db.proposal.findFirst({
    where: { id: proposalId, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!proposal) throw new ApiError("not_found");

  const row = await ctx.db.proposalFeedback.create({
    data: {
      workspaceId: ctx.workspaceId,
      proposalId,
      membershipId: ctx.actor.membershipId,
      ...data,
    },
  });
  await recordAudit(ctx.db, ctx.workspaceId, "proposal.feedback", ctx.actor.membershipId, {
    proposalId,
    outcome: data.outcome,
    editDistance: data.editDistance,
    trust: data.trust,
  }, ctx.correlationId);
  return row;
}

/** Aggregate copilot KPIs for the workspace (docs/research/kpi-dictionary.md). */
export async function copilotMetrics(ctx: RequestContext) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [proposals, applied, feedback, spend] = await Promise.all([
    ctx.db.proposal.count({ where: { workspaceId: ctx.workspaceId, createdAt: { gte: since } } }),
    ctx.db.proposal.count({
      where: {
        workspaceId: ctx.workspaceId,
        createdAt: { gte: since },
        state: { in: ["applied", "partially_applied"] },
      },
    }),
    ctx.db.proposalFeedback.findMany({
      where: { workspaceId: ctx.workspaceId, createdAt: { gte: since } },
      select: { editDistance: true, timeSavedMin: true, trust: true, correctionReason: true, outcome: true },
    }),
    ctx.db.aiUsageLedger.aggregate({
      where: { workspaceId: ctx.workspaceId, createdAt: { gte: since } },
      _sum: { costUsd: true },
    }),
  ]);

  const nums = (xs: (number | null)[]) => xs.filter((x): x is number => x != null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  return {
    windowDays: 30,
    proposalsGenerated: proposals,
    proposalsApplied: applied,
    acceptanceRate: proposals ? applied / proposals : null,
    avgEditDistance: avg(nums(feedback.map((f) => f.editDistance))),
    avgTimeSavedMin: avg(nums(feedback.map((f) => f.timeSavedMin))),
    avgTrust: avg(nums(feedback.map((f) => f.trust))),
    costUsd: spend._sum.costUsd ?? 0,
    correctionReasons: feedback
      .map((f) => f.correctionReason)
      .filter((r): r is string => Boolean(r))
      .slice(0, 50),
  };
}
