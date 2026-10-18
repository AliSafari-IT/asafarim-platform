import {
  buildIdempotencyKey,
  createPricingRegistry,
  estimateCost,
  normalizeAnthropicUsage,
  normalizeOpenAiUsage,
  parseCostEventWrite,
  perMillionTokens,
  perUnits,
  summarize,
  totalInputTokens,
  totalOutputTokens,
  type CostEventWriteInput,
  type CostSource,
  type CostTotals,
  type CredentialSource,
  type EntryType,
  type Outcome,
  type UsageLine,
} from "@asafarim/ai-cost-ledger";
import { prisma, type Prisma } from "@asafarim/db";

/**
 * EduMatch's writer for the platform AI cost-event contract
 * (`@asafarim/ai-cost-ledger`, #540).
 *
 * Every paid provider call the AI tutor makes writes exactly one idempotent
 * `EduAiCostEvent` row:
 *
 * | operation             | where                                    |
 * |-----------------------|------------------------------------------|
 * | `tutor_answer`        | queued path (`orchestrateResponse`)      |
 * | `tutor_answer_stream` | streaming `GET /api/inquiries/[id]/ai`   |
 * | `transcription`       | Whisper, on either path                  |
 *
 * The subject is always the inquiry. `workflowId` is one id per AI attempt
 * (inquiry + claim time), so an attempt's transcription and answer rows
 * group together.
 *
 * Events are written right after the provider call returns, **outside** the
 * claim-fenced persistence transaction: an attempt that is later superseded
 * or fails to save still spent the money, so its spend is still recorded.
 * A provider call that failed before returning usage spends nothing and
 * writes nothing.
 */

// ── Pricing ─────────────────────────────────────────────────────────────

/** Bump whenever a rate below changes: snapshots are compared by version. */
export const EDUMATCH_PRICING_VERSION = "edumatch-2026-10-18";

const text = (input: string, cached: string, output: string, cacheWrite?: string) => [
  perMillionTokens("input", input),
  perMillionTokens("cached_input", cached),
  perMillionTokens("output", output),
  perMillionTokens("reasoning_output", output),
  ...(cacheWrite ? [perMillionTokens("cache_write_input", cacheWrite)] : []),
];

/**
 * Each provider's published list price (USD) when this was written: a
 * `registry_estimate`, not a billed amount. OpenAI answers with dated model
 * ids (`gpt-4o-2024-08-06`), so entries are prefixes; the longest prefix
 * wins, so `gpt-4o-mini*` beats `gpt-4o*`. A model configured through env
 * that isn't listed here is recorded with an unknown cost, never as free.
 */
export const edumatchPricing = createPricingRegistry(EDUMATCH_PRICING_VERSION, [
  { provider: "openai", model: "gpt-4o-mini*", rates: text("0.15", "0.075", "0.60") },
  { provider: "openai", model: "gpt-4o*", rates: text("2.50", "1.25", "10") },
  // Whisper bills $0.006 per minute of audio.
  { provider: "openai", model: "whisper-1", rates: [perUnits("audio_input", "seconds", "0.006", 60)] },
  { provider: "anthropic", model: "claude-haiku-4-5*", rates: text("1", "0.10", "5", "1.25") },
]);

// ── Usage helpers ───────────────────────────────────────────────────────

export type OpenAiUsagePayload = Parameters<typeof normalizeOpenAiUsage>[0];
export type AnthropicUsagePayload = Parameters<typeof normalizeAnthropicUsage>[0];

/** Whisper usage: billed per second of audio, rounded up. */
export function transcriptionUsage(durationSeconds: number): UsageLine[] {
  return [{ bucket: "audio_input", unit: "seconds", quantity: Math.max(0, Math.ceil(durationSeconds)) }];
}

/** Normalise provider usage; a malformed payload yields null (cost unknown). */
export function safeOpenAiUsage(usage: OpenAiUsagePayload | null | undefined): UsageLine[] | null {
  if (!usage) return null;
  try {
    return normalizeOpenAiUsage(usage);
  } catch {
    return null;
  }
}

export function safeAnthropicUsage(usage: AnthropicUsagePayload | null | undefined): UsageLine[] | null {
  if (!usage) return null;
  try {
    return normalizeAnthropicUsage(usage);
  } catch {
    return null;
  }
}

// ── Events ──────────────────────────────────────────────────────────────

export type EduCostOperation = "tutor_answer" | "tutor_answer_stream" | "transcription";

/** One AI attempt on one inquiry; the claim time makes it unique. */
export interface EduAiAttempt {
  inquiryId: string;
  studentId: string;
  claimedAt: Date;
}

export function attemptWorkflowId(attempt: EduAiAttempt): string {
  return `inquiry_${attempt.inquiryId}_${attempt.claimedAt.getTime()}`;
}

export interface EduCostInput {
  attempt: EduAiAttempt;
  operation: EduCostOperation;
  /** Distinguishes several calls of one operation in one attempt (one per audio file). */
  seq?: number;
  provider: "openai" | "anthropic";
  requestModel: string;
  /** The model the provider says answered; falls back to the requested one. */
  responseModel?: string | null;
  providerRequestId?: string | null;
  promptVersion?: string | null;
  /** null when the provider returned no usage: the cost is then unknown. */
  usage: UsageLine[] | null;
  outcome?: Outcome;
  latencyMs?: number | null;
  occurredAt?: Date;
  metadata?: Record<string, string | number | boolean | null>;
}

export function buildEduCostEvent(input: EduCostInput): CostEventWriteInput {
  const { attempt } = input;
  const responseModel = input.responseModel || input.requestModel;
  const usage = input.usage ?? [];
  const base = {
    idempotencyKey: buildIdempotencyKey(
      "edumatch",
      input.operation,
      attempt.inquiryId,
      attempt.claimedAt.getTime(),
      input.seq ?? 0,
    ),
    app: "edumatch",
    ownerType: "user" as const,
    ownerId: attempt.studentId,
    actorId: attempt.studentId,
    operation: input.operation,
    outcome: input.outcome ?? "succeeded",
    subjectType: "inquiry",
    subjectId: attempt.inquiryId,
    workflowId: attemptWorkflowId(attempt),
    provider: input.provider,
    requestModel: input.requestModel,
    responseModel,
    providerRequestId: input.providerRequestId ?? null,
    promptVersion: input.promptVersion ?? null,
    usage,
    credentialSource: "platform" as const,
    latencyMs: input.latencyMs ?? null,
    occurredAt: input.occurredAt ?? new Date(),
    metadata: { usage_known: input.usage !== null, ...(input.metadata ?? {}) },
  };

  if (input.usage === null) return { ...base, costSource: "unknown" };
  const snapshot = edumatchPricing.lookup(input.provider, responseModel);
  const estimate = snapshot ? estimateCost(usage, snapshot) : null;
  if (!snapshot || !estimate || estimate.costMicros === null) {
    return { ...base, costSource: "unknown" };
  }
  return {
    ...base,
    costSource: "registry_estimate",
    estimatedCostMicros: estimate.costMicros,
    pricingSnapshot: snapshot,
    pricingTier: snapshot.tier,
  };
}

export interface RecordedCost {
  written: boolean;
  idempotencyKey: string;
  /** The event's estimate; null when the cost is unknown. */
  estimatedCostMicros: bigint | null;
}

const WRITE_ATTEMPTS = 3;

/**
 * Append one event. Retried with the same idempotency key on a transient
 * database error. **Never throws**: a ledger hiccup must not fail (or
 * re-run) a provider call the student already paid for. A write that still
 * fails is logged with its key and amount, for backfill.
 */
export async function recordEduAiCost(input: EduCostInput): Promise<RecordedCost> {
  let e: ReturnType<typeof parseCostEventWrite>;
  try {
    e = parseCostEventWrite(buildEduCostEvent(input));
  } catch (err) {
    console.error("[ai-cost] invalid_event", {
      operation: input.operation,
      inquiryId: input.attempt.inquiryId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { written: false, idempotencyKey: "", estimatedCostMicros: null };
  }
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await prisma.eduAiCostEvent.createMany({
        skipDuplicates: true,
        data: [
          {
            idempotencyKey: e.idempotencyKey,
            schemaVersion: e.schemaVersion,
            entryType: e.entryType,
            userId: input.attempt.studentId,
            actorId: e.actorId,
            operation: e.operation,
            outcome: e.outcome,
            finality: e.finality,
            subjectType: e.subjectType,
            subjectId: e.subjectId,
            parentSubjectType: e.parentSubjectType,
            parentSubjectId: e.parentSubjectId,
            workflowId: e.workflowId,
            traceId: e.traceId,
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
            adjustmentDeltaMicros: e.adjustmentDeltaMicros,
            costSource: e.costSource,
            credentialSource: e.credentialSource,
            pricingSnapshot: (e.pricingSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
            fixture: e.fixture,
            supersedesEventId: e.supersedesEventId,
            latencyMs: e.latencyMs,
            metadata: e.metadata as Prisma.InputJsonValue,
            occurredAt: e.occurredAt,
            finalizedAt: e.finalizedAt,
          },
        ],
      });
      return {
        written: result.count === 1,
        idempotencyKey: e.idempotencyKey,
        estimatedCostMicros: e.estimatedCostMicros,
      };
    } catch (err) {
      if (attempt >= WRITE_ATTEMPTS) {
        console.error("[ai-cost] record_failed", {
          idempotencyKey: e.idempotencyKey,
          operation: e.operation,
          estimatedCostMicros: e.estimatedCostMicros?.toString() ?? null,
          error: err instanceof Error ? err.message : String(err),
        });
        return { written: false, idempotencyKey: e.idempotencyKey, estimatedCostMicros: e.estimatedCostMicros };
      }
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }
}

/**
 * Total of an attempt's recorded costs, for `EduAiResponse.tokenCostMicros`.
 * Unknown is not zero: if any part is unknown, the total is null.
 */
export function attemptCostMicros(parts: readonly (bigint | null)[]): number | null {
  if (parts.length === 0) return null;
  let total = BigInt(0);
  for (const part of parts) {
    if (part === null) return null;
    total += part;
  }
  // The column is an Int; a single tutor answer is many orders of magnitude
  // below 2^31 micros ($2,147). Treat anything larger as unknown, not wrapped.
  return total <= BigInt(2_147_483_647) ? Number(total) : null;
}

// ── Spend query ─────────────────────────────────────────────────────────

/**
 * EduMatch AI spend in `[from, to)`, e.g. "total AI spend this month".
 * `effectiveKnownMicros` is the known total (estimates plus any
 * adjustments); `unknownCount` says how many calls it could not price, so a
 * total is never presented as complete when it isn't.
 */
export async function getEduAiSpend(range: { from: Date; to: Date }): Promise<CostTotals> {
  const rows = await prisma.eduAiCostEvent.findMany({
    where: { occurredAt: { gte: range.from, lt: range.to } },
    select: {
      entryType: true,
      estimatedCostMicros: true,
      actualCostMicros: true,
      adjustmentDeltaMicros: true,
      costSource: true,
      credentialSource: true,
      fixture: true,
      inputTokens: true,
      outputTokens: true,
    },
  });
  return summarize(
    rows.map((r) => ({
      ...r,
      entryType: r.entryType as EntryType,
      costSource: r.costSource as CostSource,
      credentialSource: r.credentialSource as CredentialSource,
    })),
  );
}

/** `[start of month, start of next month)` in UTC for the given instant. */
export function utcMonthRange(at: Date): { from: Date; to: Date } {
  const from = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  const to = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
  return { from, to };
}
