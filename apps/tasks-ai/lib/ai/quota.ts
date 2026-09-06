import "server-only";
import type { RequestContext } from "../context";
import { ApiError } from "../errors";
import { getAiSettings } from "./settings";

function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface UsageSummary {
  monthUsd: number;
  monthJobs: number;
  budgetUsd: number | null;
  jobQuota: number | null;
  enabled: boolean;
}

export async function usageSummary(ctx: RequestContext): Promise<UsageSummary> {
  const settings = await getAiSettings(ctx);
  const since = monthStart();
  const [agg, jobs] = await Promise.all([
    ctx.db.aiUsageLedger.aggregate({
      where: { workspaceId: ctx.workspaceId, createdAt: { gte: since } },
      _sum: { costUsd: true },
    }),
    ctx.db.aiJob.count({
      where: { workspaceId: ctx.workspaceId, createdAt: { gte: since }, state: { not: "failed" } },
    }),
  ]);
  return {
    monthUsd: agg._sum.costUsd ?? 0,
    monthJobs: jobs,
    budgetUsd: settings.monthlyBudgetUsd,
    jobQuota: settings.monthlyJobQuota,
    enabled: settings.enabled,
  };
}

/**
 * Called before every AI job. Throws:
 *  - `forbidden` when the workspace kill switch is off,
 *  - `rate_limited` when the month's budget or job quota is exhausted.
 * The core task manager keeps working either way — this only gates AI.
 */
export async function assertCanRunAiJob(ctx: RequestContext): Promise<void> {
  const u = await usageSummary(ctx);
  if (!u.enabled) throw new ApiError("forbidden", { reason: "AI is disabled for this workspace" });
  if (u.budgetUsd != null && u.monthUsd >= u.budgetUsd) {
    throw new ApiError("rate_limited", { reason: "monthly AI budget reached", budgetUsd: u.budgetUsd });
  }
  if (u.jobQuota != null && u.monthJobs >= u.jobQuota) {
    throw new ApiError("rate_limited", { reason: "monthly AI job quota reached", jobQuota: u.jobQuota });
  }
}
