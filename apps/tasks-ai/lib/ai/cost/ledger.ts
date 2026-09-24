import "server-only";
import {
  buildIdempotencyKey,
  createPricingRegistry,
  estimateCost,
  parseCostEventWrite,
  perMillionTokens,
  simpleTokenUsage,
  totalInputTokens,
  totalOutputTokens,
  type CostEventWriteInput,
  type Outcome,
} from "@asafarim/ai-cost-ledger";
import type { Prisma, PrismaClient } from "../../db/generated";
import type { ProviderCallMeta } from "./meta";

/**
 * TasksAI's writer for the platform AI cost-event contract (issue #590,
 * docs/adr/0003-ai-cost-event-contract.md).
 *
 * **Allocation rule (decided when the job is created, never later):**
 *  1. a task-scoped job (launched from one existing task) → attribution
 *     `task`: money on that task and its project;
 *  2. a project-scoped job (a plan / decomposition that may create or touch
 *     many tasks) → attribution `project`: money on the project once; the
 *     tasks are linked through AiJobTaskLink with no amount;
 *  3. no project → attribution `workspace`.
 *
 * **Event rules per job:**
 *  - one event for the call whose output was used (`succeeded`, or
 *    `degraded` when the fixture fallback answered at $0);
 *  - a real provider response that was billed but rejected (unparsable
 *    draft, schema failure, the safety guard) → a `failed` event with the
 *    usage it reported;
 *  - a Stop / dropped connection *during* a real provider call → one
 *    `cancelled` event with **unknown** cost: the provider may bill tokens
 *    generated before the abort but reports no usage for an aborted
 *    request, so the honest amount is "not tracked", not $0. A cancel
 *    before any real call started, or a fixture call, records nothing;
 *  - a cache hit makes no provider call and records nothing.
 */

export const TASKSAI_PRICING_VERSION = "tasks-ai-2026-09-24";

const text = (input: string, cached: string, output: string, cacheWrite?: string) => [
  perMillionTokens("input", input),
  perMillionTokens("cached_input", cached),
  perMillionTokens("output", output),
  perMillionTokens("reasoning_output", output),
  ...(cacheWrite ? [perMillionTokens("cache_write_input", cacheWrite)] : []),
];

/** Same list prices the adapters' PRICE tables carried (USD per 1M tokens),
 *  plus each provider's cache rates. Bump the version on any change. */
export const tasksAiPricing = createPricingRegistry(TASKSAI_PRICING_VERSION, [
  { provider: "anthropic", model: "claude-opus-5*", rates: text("5", "0.50", "25", "6.25") },
  { provider: "anthropic", model: "claude-sonnet-5*", rates: text("2", "0.20", "10", "2.50") },
  { provider: "anthropic", model: "claude-haiku-4-5*", rates: text("1", "0.10", "5", "1.25") },
  { provider: "openai", model: "gpt-4.1-mini*", rates: text("0.40", "0.10", "1.60") },
  { provider: "openai", model: "gpt-4.1*", rates: text("2", "0.50", "8") },
  { provider: "openai", model: "o4-mini*", rates: text("1.10", "0.275", "4.40") },
]);

export type CostAttribution =
  | { attribution: "task"; projectId: string; taskId: string }
  | { attribution: "project"; projectId: string }
  | { attribution: "workspace" };

export interface RecordAiCostInput {
  workspaceId: string;
  actorId: string | null;
  aiJobId: string;
  operation: string;
  scope: CostAttribution;
  provider: string;
  requestModel: string;
  promptVersion: string | null;
  inputTokens: number;
  outputTokens: number;
  meta?: ProviderCallMeta;
  fixture: boolean;
  outcome: Outcome;
  /** For `cancelled`: no usage came back, so the cost is unknown by rule. */
  usageUnknown?: boolean;
  latencyMs?: number | null;
  /** Distinguishes several events of one job (`final`, `attempt_2`, `cancelled`). */
  suffix: string;
  occurredAt?: Date;
}

export interface CostEventRow extends Prisma.AiCostEventCreateManyInput {}

export function buildAiCostEvent(input: RecordAiCostInput): { write: CostEventWriteInput; row: CostEventRow; estimatedCostMicros: bigint | null } {
  const usage = input.usageUnknown ? [] : (input.meta?.usage ?? simpleTokenUsage(input.inputTokens, input.outputTokens));
  const responseModel = input.meta?.responseModel || input.requestModel;
  const subject =
    input.scope.attribution === "task"
      ? { subjectType: "task", subjectId: input.scope.taskId, parentSubjectType: "project", parentSubjectId: input.scope.projectId }
      : input.scope.attribution === "project"
        ? { subjectType: "project", subjectId: input.scope.projectId, parentSubjectType: null, parentSubjectId: null }
        : { subjectType: "workspace", subjectId: input.workspaceId, parentSubjectType: null, parentSubjectId: null };

  const base = {
    idempotencyKey: buildIdempotencyKey("tasks-ai", input.operation, `job_${input.aiJobId}`, input.suffix),
    app: "tasks-ai",
    ownerType: "workspace" as const,
    ownerId: input.workspaceId,
    actorId: input.actorId,
    operation: input.operation,
    outcome: input.outcome,
    ...subject,
    workflowId: input.aiJobId,
    provider: input.provider,
    requestModel: input.requestModel,
    responseModel,
    providerRequestId: input.meta?.providerRequestId ?? null,
    promptVersion: input.promptVersion,
    usage,
    latencyMs: input.latencyMs ?? null,
    occurredAt: input.occurredAt ?? new Date(),
  };

  let write: CostEventWriteInput;
  if (input.fixture) {
    write = { ...base, fixture: true, credentialSource: "none", costSource: "registry_estimate", estimatedCostMicros: BigInt(0) };
  } else {
    // TasksAI calls providers with the platform's server-side keys only.
    const snapshot = input.usageUnknown ? null : tasksAiPricing.lookup(input.provider, responseModel) ?? tasksAiPricing.lookup(input.provider, input.requestModel);
    const estimate = snapshot ? estimateCost(usage, snapshot) : null;
    write =
      snapshot && estimate && estimate.costMicros !== null
        ? { ...base, credentialSource: "platform", costSource: "registry_estimate", estimatedCostMicros: estimate.costMicros, pricingSnapshot: snapshot, pricingTier: snapshot.tier }
        : { ...base, credentialSource: "platform", costSource: "unknown" };
  }

  const e = parseCostEventWrite(write);
  const row: CostEventRow = {
    idempotencyKey: e.idempotencyKey,
    schemaVersion: e.schemaVersion,
    entryType: e.entryType,
    workspaceId: input.workspaceId,
    actorId: e.actorId,
    operation: e.operation,
    outcome: e.outcome,
    finality: e.finality,
    attribution: input.scope.attribution,
    subjectType: e.subjectType,
    subjectId: e.subjectId,
    parentSubjectType: e.parentSubjectType,
    parentSubjectId: e.parentSubjectId,
    projectId: input.scope.attribution === "workspace" ? null : input.scope.projectId,
    taskId: input.scope.attribution === "task" ? input.scope.taskId : null,
    aiJobId: input.aiJobId,
    workflowId: e.workflowId,
    provider: e.provider,
    requestModel: e.requestModel,
    responseModel: e.responseModel,
    providerRequestId: e.providerRequestId,
    promptVersion: e.promptVersion,
    pricingTier: e.pricingTier,
    usage: e.usage as unknown as Prisma.InputJsonValue,
    inputTokens: totalInputTokens(e.usage),
    outputTokens: totalOutputTokens(e.usage),
    currency: e.currency,
    estimatedCostMicros: e.estimatedCostMicros,
    actualCostMicros: e.actualCostMicros,
    costSource: e.costSource,
    credentialSource: e.credentialSource,
    pricingSnapshot: (e.pricingSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
    fixture: e.fixture,
    latencyMs: e.latencyMs,
    metadata: e.metadata as Prisma.InputJsonValue,
    occurredAt: e.occurredAt,
  };
  return { write, row, estimatedCostMicros: e.fixture ? BigInt(0) : e.estimatedCostMicros };
}

/** Float USD for the legacy AiUsageLedger/AiJob.costUsd columns (budget reads). */
export function legacyUsd(micros: bigint | null): number {
  return micros === null ? 0 : Number(micros) / 1_000_000;
}

/**
 * Record a billed-but-unused call outside the main job transaction: the
 * cost event plus a legacy ledger row so the monthly budget sees it too.
 * Idempotent; never throws (a ledger hiccup must not mask the real error
 * the caller is about to raise).
 */
export async function recordStandaloneAiCost(db: PrismaClient, input: RecordAiCostInput): Promise<void> {
  try {
    const { row, estimatedCostMicros } = buildAiCostEvent(input);
    const inserted = await db.aiCostEvent.createMany({ data: [row], skipDuplicates: true });
    if (inserted.count === 1 && !input.fixture) {
      await db.aiUsageLedger.create({
        data: {
          workspaceId: input.workspaceId,
          aiJobId: input.aiJobId,
          provider: input.provider,
          model: row.responseModel,
          inputTokens: row.inputTokens ?? 0,
          outputTokens: row.outputTokens ?? 0,
          costUsd: legacyUsd(estimatedCostMicros),
          fixture: false,
        },
      });
    }
  } catch (err) {
    console.error("[ai-cost] record_failed", { aiJobId: input.aiJobId, suffix: input.suffix, error: err instanceof Error ? err.message : String(err) });
  }
}
