import { getJobmatchDb } from "../../db/client";
import { getEnv } from "../../env";

/**
 * Per-workspace AI budget. Mirrors apps/tasks-ai/lib/ai/quota.ts almost 1:1
 * in structure and intent (`usageSummary` / `assertCanRun*`), and
 * apps/tasks-ai/lib/ai/settings.ts's `AiSettings.monthlyBudgetUsd` shape,
 * adapted to ResuMatch's single `"tailor"` provider-call kind (the old
 * matching product had two — `embed` and `evaluate` — before the pivot) and
 * to the fact that this app has no per-workspace AI settings model at all
 * yet.
 *
 * **Per-workspace vs env-default budget.** tasks-ai's budget is a
 * per-workspace override stored in `AiSettings`, seeded from nothing (null =
 * unlimited). JobMatch has no equivalent settings model (searched: the only
 * `model Workspace { ... }` in prisma/schema.prisma carries no AI fields, and
 * there is no `AiSettings`-shaped model anywhere in this schema). Building a
 * whole per-workspace settings model, its admin UI, and its authz gate is out
 * of scope for the infrastructure this issue asks for -- the issue itself
 * says "env-default-only is acceptable if no per-workspace settings model
 * exists yet, just document that choice". So: the budget here is
 * `JOBMATCH_AI_MONTHLY_BUDGET_USD` (lib/env.ts's `aiMonthlyBudgetUsd`,
 * already used by the whole workspace/process), applied identically to every
 * workspace. `usageSummary` still takes a `workspaceId` and every ledger
 * query is workspace-scoped, so switching to a per-workspace override later
 * (once such a settings model exists) only changes where `budgetUsd` comes
 * from, not this module's shape or call sites.
 */

export class QuotaExceededError extends Error {
  /** Machine-readable reason, analogous to tasks-ai's ApiError `reason`
   *  detail -- used by callers/routes to build a consistent 429 body. */
  readonly reason: string;
  readonly budgetUsd: number;
  readonly monthUsd: number;

  constructor(reason: string, budgetUsd: number, monthUsd: number) {
    super(reason);
    this.name = "QuotaExceededError";
    this.reason = reason;
    this.budgetUsd = budgetUsd;
    this.monthUsd = monthUsd;
  }
}

export type ProviderCallKind = "tailor";

function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface UsageSummary {
  workspaceId: string;
  monthUsd: number;
  budgetUsd: number;
}

/** This month's spend for a workspace against the current budget ceiling. */
export async function usageSummary(workspaceId: string): Promise<UsageSummary> {
  const db = getJobmatchDb();
  const { aiMonthlyBudgetUsd } = getEnv();
  const since = monthStart();

  const agg = await db.aiUsageLedger.aggregate({
    where: { workspaceId, createdAt: { gte: since } },
    _sum: { costUsd: true },
  });

  return {
    workspaceId,
    monthUsd: agg._sum.costUsd ?? 0,
    budgetUsd: aiMonthlyBudgetUsd,
  };
}

/**
 * Called before every tailoring provider call. Throws `QuotaExceededError`
 * (mapped to `429` by the caller/route) when the workspace's monthly budget
 * is already exhausted. `JOBMATCH_AI_MONTHLY_BUDGET_USD=0` freezes spend
 * entirely, per lib/env.ts's own doc comment on that variable.
 *
 * Never silently skips the call and never lets a caller fabricate a result
 * -- see lib/tailoring/ai/degraded.ts, which is what every provider call
 * site should wrap itself in to turn this exception into an honest
 * degraded result instead of an unhandled 500.
 */
export async function assertCanRunProviderCall(
  workspaceId: string,
  kind: ProviderCallKind,
): Promise<void> {
  const { monthUsd, budgetUsd } = await usageSummary(workspaceId);
  if (monthUsd >= budgetUsd) {
    throw new QuotaExceededError(
      `monthly AI budget of $${budgetUsd} reached for workspace (${kind})`,
      budgetUsd,
      monthUsd,
    );
  }
}

export interface RecordUsageInput {
  workspaceId: string;
  kind: ProviderCallKind;
  provider: string;
  model: string;
  /** Only meaningful for kind = "evaluate"; omit/null for "embed". */
  promptVersion?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

/** Append one ledger row for a completed provider call. Called by the
 *  provider call site itself (after a successful call), never speculatively
 *  before one -- a failed call spends nothing and should not be ledgered as
 *  if it had. */
export async function recordUsage(input: RecordUsageInput): Promise<void> {
  const db = getJobmatchDb();
  await db.aiUsageLedger.create({
    data: {
      workspaceId: input.workspaceId,
      kind: input.kind,
      provider: input.provider,
      model: input.model,
      promptVersion: input.promptVersion ?? null,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      costUsd: input.costUsd ?? 0,
    },
  });
}
