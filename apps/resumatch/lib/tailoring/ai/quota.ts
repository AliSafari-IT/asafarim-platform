import { getJobmatchDb } from "../../db/client";
import { recordProviderCost, type CostAttribution } from "../../costs/ledger";
import { billedUsageOf, type ProviderCallMeta } from "../../costs/providerMeta";
import type { Outcome } from "@asafarim/ai-cost-ledger";
import { getEnv } from "../../env";
import { getPlatformSetting } from "../../platform-settings";

/**
 * Per-workspace AI budget. Mirrors apps/tasks-ai/lib/ai/quota.ts almost 1:1
 * in structure and intent (`usageSummary` / `assertCanRun*`), and
 * apps/tasks-ai/lib/ai/settings.ts's `AiSettings.monthlyBudgetUsd` shape,
 * adapted to the fact that this app has no per-workspace AI settings model
 * at all yet.
 *
 * **One shared budget across provider-call kinds.** `ProviderCallKind`
 * originally covered only `"tailor"`; CV extraction (JM-005 milestone,
 * issue #415) spends against the exact same monthly ceiling under its own
 * `"extract"` kind rather than getting a separate budget. There is no
 * product reason yet for tailoring and extraction to have independent
 * ceilings — `usageSummary` sums every kind together — and splitting them
 * only becomes worth doing once there's evidence one feature needs to be
 * capped independently of the other.
 *
 * **Per-workspace vs env-default budget.** tasks-ai's budget is a
 * per-workspace override stored in `AiSettings`, seeded from nothing (null =
 * unlimited). ResuMatch has no equivalent settings model (searched: the only
 * `model Workspace { ... }` in prisma/schema.prisma carries no AI fields, and
 * there is no `AiSettings`-shaped model anywhere in this schema). Building a
 * whole per-workspace settings model, its admin UI, and its authz gate is out
 * of scope for the infrastructure this issue asks for -- the issue itself
 * says "env-default-only is acceptable if no per-workspace settings model
 * exists yet, just document that choice". So: the budget here is
 * `RESUMATCH_AI_MONTHLY_BUDGET_USD` (lib/env.ts's `aiMonthlyBudgetUsd`,
 * already used by the whole workspace/process), applied identically to every
 * workspace — unless an admin sets the platform-wide
 * `resumatch.aiMonthlyBudgetUsd` override in the admin console, which wins
 * (read via lib/platform-settings.ts, cached ~60s, env value on any failure).
 *
 * **Per-workspace override (issue #514).** `Workspace.aiMonthlyBudgetUsd`,
 * when set, wins over both: one heavy workspace can be capped (or given more
 * room) without moving every other workspace's ceiling. Null means "no
 * override" and falls through to the default above, so a workspace nobody
 * configured behaves exactly as before. Zero is a valid override and
 * freezes that workspace. Operators set it via
 * app/api/internal/workspace-ai-budget; the candidate never can.
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

export type ProviderCallKind =
  | "tailor"
  | "extract"
  | "rewrite"
  | "fetch_job"
  | "cover_letter"
  | "categorize_skills"
  | "job_meta";

function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Where the budget in effect came from: the workspace's own override, or
 * the platform default (Admin setting, else env). The default is reported
 * as one source because the settings client only returns the value, not
 * whether an admin override produced it.
 */
export type BudgetSource = "workspace" | "default";

export interface UsageSummary {
  workspaceId: string;
  monthUsd: number;
  budgetUsd: number;
  budgetSource: BudgetSource;
}

/** The platform-wide default: an Admin-console override, else env. */
export async function defaultMonthlyBudgetUsd(): Promise<number> {
  return getPlatformSetting("resumatch.aiMonthlyBudgetUsd", getEnv().aiMonthlyBudgetUsd);
}

/**
 * Resolves the budget in effect for one workspace. A non-null override
 * always wins (0 included); otherwise the default is read — and only then,
 * so an overridden workspace never waits on the settings API.
 */
export async function resolveMonthlyBudget(
  overrideUsd: number | null,
  readDefault: () => Promise<number> = defaultMonthlyBudgetUsd,
): Promise<{ budgetUsd: number; budgetSource: BudgetSource }> {
  if (overrideUsd !== null && Number.isFinite(overrideUsd) && overrideUsd >= 0) {
    return { budgetUsd: overrideUsd, budgetSource: "workspace" };
  }
  return { budgetUsd: await readDefault(), budgetSource: "default" };
}

/** The workspace's override as a number, or null when unset/unknown. */
export async function workspaceBudgetOverrideUsd(workspaceId: string): Promise<number | null> {
  const row = await getJobmatchDb().workspace.findUnique({
    where: { id: workspaceId },
    select: { aiMonthlyBudgetUsd: true },
  });
  const value = row?.aiMonthlyBudgetUsd;
  return value === null || value === undefined ? null : Number(value);
}

/**
 * This month's spend for a workspace against the current budget ceiling.
 *
 * Reads **both** ledgers during the #586 migration: legacy
 * `AiUsageLedger.costUsd` floats (every call before the cutover) plus the
 * effective known amount of this month's `AiCostEvent` rows (actual ??
 * estimated, plus any adjustment deltas). New writes only go to
 * `AiCostEvent`, so no call is ever counted twice. Unknown-cost events add
 * nothing here — they surface as "not tracked" in the cost timeline, never
 * as a fabricated amount.
 */
export async function usageSummary(workspaceId: string): Promise<UsageSummary> {
  const db = getJobmatchDb();
  // Workspace override, else the Admin-console override, else
  // RESUMATCH_AI_MONTHLY_BUDGET_USD.
  const budget = await resolveMonthlyBudget(await workspaceBudgetOverrideUsd(workspaceId));
  const since = monthStart();

  const [legacy, events] = await Promise.all([
    db.aiUsageLedger.aggregate({
      where: { workspaceId, createdAt: { gte: since } },
      _sum: { costUsd: true },
    }),
    db.$queryRaw<{ micros: bigint | null }[]>`
      SELECT SUM(COALESCE("actualCostMicros", "estimatedCostMicros", "adjustmentDeltaMicros", 0))::bigint AS micros
      FROM "ai_cost_events"
      WHERE "workspaceId" = ${workspaceId} AND "occurredAt" >= ${since}
    `,
  ]);
  const eventMicros = events[0]?.micros ?? 0n;

  return {
    workspaceId,
    monthUsd: (legacy._sum.costUsd ?? 0) + Number(eventMicros) / 1_000_000,
    budgetUsd: budget.budgetUsd,
    budgetSource: budget.budgetSource,
  };
}

/**
 * Called before every tailoring provider call. Throws `QuotaExceededError`
 * (mapped to `429` by the caller/route) when the workspace's monthly budget
 * is already exhausted. `RESUMATCH_AI_MONTHLY_BUDGET_USD=0` freezes spend
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
  /** The versioned prompt that produced this call, e.g. `TAILOR_PROMPT_VERSION`
   *  or `EXTRACT_PROMPT_VERSION`. Recorded per kind so a ledger row's
   *  provenance never depends on which feature happened to call it. */
  promptVersion?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  /** Where this call's cost belongs (job / preview / document / profile). */
  attribution: CostAttribution;
  /** Normalized usage, response model and request id from the adapter. */
  meta?: ProviderCallMeta;
  outcome?: Outcome;
  latencyMs?: number | null;
}

/** Append one cost event for a provider call that returned. Called by the
 *  provider call site itself (after the provider answered), never
 *  speculatively before one -- a call that never reached the provider
 *  spends nothing and is not recorded. Price, cost source and the
 *  idempotency key are all resolved in lib/costs/ledger.ts; the adapter's
 *  own float `costUsd` is no longer the spend of record. */
export async function recordUsage(input: RecordUsageInput): Promise<void> {
  await recordProviderCost({
    workspaceId: input.workspaceId,
    operation: input.kind,
    provider: input.provider,
    model: input.model,
    promptVersion: input.promptVersion,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    attribution: input.attribution,
    meta: input.meta,
    outcome: input.outcome,
    latencyMs: input.latencyMs,
  });
}

/**
 * Record a provider response, then validate it. The provider bills for a
 * response whether or not it passes our schema, so a validation failure is
 * recorded with `outcome: "failed"` before the error propagates to the
 * caller's retry/degrade logic — never silently dropped.
 */
export async function settleProviderCall<T>(usage: Omit<RecordUsageInput, "outcome">, validate: () => T): Promise<T> {
  let result: T;
  try {
    result = validate();
  } catch (err) {
    await recordUsage({ ...usage, outcome: "failed" });
    throw err;
  }
  await recordUsage({ ...usage, outcome: "succeeded" });
  return result;
}

/**
 * Called from a provider call site's retry/degrade `catch`: if the error
 * was thrown after the provider had already answered (an adapter tagged it
 * with `withBilledUsage`), record that billed response as a `failed`
 * event. A request that never got a response carries no tag and records
 * nothing.
 */
export async function recordBilledFailure(
  err: unknown,
  base: Omit<RecordUsageInput, "meta" | "outcome" | "inputTokens" | "outputTokens">,
): Promise<void> {
  const billed = billedUsageOf(err);
  if (!billed) return;
  await recordUsage({ ...base, meta: billed, outcome: "failed" });
}
