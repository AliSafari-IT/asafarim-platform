import { randomUUID } from "node:crypto";
import {
  buildIdempotencyKey,
  estimateCost,
  parseCostEventWrite,
  simpleTokenUsage,
  totalInputTokens,
  totalOutputTokens,
  type CostEventWriteInput,
  type Outcome,
} from "@asafarim/ai-cost-ledger";
import { getJobmatchDb } from "../db/client";
import { logError } from "../observability/logger";
import { resumatchPricing } from "./pricing";
import type { ProviderCallMeta } from "./providerMeta";

/**
 * ResuMatch's writer for the platform AI cost-event contract (issue #586).
 *
 * **Event policy (one rule, applied everywhere):** every call that goes
 * through a *metered* provider path — budget-checked, then handed to a
 * provider adapter — writes exactly one event, whichever adapter answered:
 *
 *  - a real provider (`openai` / `anthropic`) → a `registry_estimate` from
 *    lib/costs/pricing.ts, or `unknown` when a used usage bucket is unpriced;
 *  - the `fixture` adapter inside that metered path (tailoring and cover
 *    letters run it under `RESUMATCH_AI_PROVIDER=fixture`) → a `fixture`
 *    event at a genuine $0.
 *
 * Deterministic shortcuts that never enter the metered path — extraction,
 * job fetch, job metadata and summary rewrite short-circuit to their non-AI
 * implementation under `fixture`, and every degrade fallback — are a
 * documented **non-event**: no provider was called, nothing was spent.
 *
 * A response that came back but failed validation is still billed by the
 * provider, so it is recorded with `outcome: "failed"` (see
 * `settleProviderCall`). A request that never got a response spends
 * nothing and writes nothing.
 */

export type ResumatchCostOperation =
  | "tailor"
  | "extract"
  | "rewrite"
  | "fetch_job"
  | "cover_letter"
  | "categorize_skills"
  | "job_meta";

export type ResumatchSubjectType =
  | "target_job"
  | "tailor_preview"
  | "tailored_resume"
  | "candidate_document"
  | "candidate_profile";

/**
 * Where a call's cost belongs, decided by the caller at call time and
 * never re-derived later. `targetJobId` is the job subtotal key; set it on
 * every call that served a job, whatever the more specific subject is.
 */
export interface CostAttribution {
  subjectType: ResumatchSubjectType;
  subjectId: string;
  parentSubjectType?: ResumatchSubjectType | null;
  parentSubjectId?: string | null;
  targetJobId?: string | null;
  workflowId?: string | null;
  actorId?: string | null;
}

export interface RecordProviderCostInput {
  workspaceId: string;
  operation: ResumatchCostOperation;
  provider: string;
  /** The model id the call was made with (the request model). */
  model: string;
  promptVersion?: string | null;
  attribution: CostAttribution;
  inputTokens?: number;
  outputTokens?: number;
  meta?: ProviderCallMeta;
  outcome?: Outcome;
  latencyMs?: number | null;
  occurredAt?: Date;
  /** Minted once per logical call; defaults to a fresh id per invocation. */
  callId?: string;
}

/** Build (and validate) the event row without writing it — exported for tests. */
export function buildCostEvent(input: RecordProviderCostInput): CostEventWriteInput & { targetJobId: string | null } {
  const fixture = input.provider === "fixture";
  const usage = input.meta?.usage ?? simpleTokenUsage(input.inputTokens ?? 0, input.outputTokens ?? 0);
  const responseModel = input.meta?.responseModel || input.model;
  const stableId = input.meta?.providerRequestId ? `req_${input.meta.providerRequestId}` : `call_${input.callId ?? randomUUID()}`;
  const occurredAt = input.occurredAt ?? new Date();

  const base = {
    idempotencyKey: buildIdempotencyKey("resumatch", input.operation, stableId),
    app: "resumatch",
    ownerType: "workspace" as const,
    ownerId: input.workspaceId,
    actorId: input.attribution.actorId ?? null,
    operation: input.operation,
    outcome: input.outcome ?? "succeeded",
    subjectType: input.attribution.subjectType,
    subjectId: input.attribution.subjectId,
    parentSubjectType: input.attribution.parentSubjectType ?? null,
    parentSubjectId: input.attribution.parentSubjectId ?? null,
    workflowId: input.attribution.workflowId ?? null,
    provider: input.provider,
    requestModel: input.model,
    responseModel,
    providerRequestId: input.meta?.providerRequestId ?? null,
    promptVersion: input.promptVersion ?? null,
    usage,
    latencyMs: input.latencyMs ?? null,
    occurredAt,
    targetJobId: input.attribution.targetJobId ?? null,
  };

  if (fixture) {
    return {
      ...base,
      fixture: true,
      credentialSource: "none",
      costSource: "registry_estimate",
      estimatedCostMicros: 0n,
    };
  }

  // Every real provider call in ResuMatch runs on the platform's server-side
  // key; there is no BYOK path in this app (yet).
  const snapshot = resumatchPricing.lookup(input.provider, responseModel) ?? resumatchPricing.lookup(input.provider, input.model);
  const estimate = snapshot ? estimateCost(usage, snapshot) : null;
  if (!snapshot || !estimate || estimate.costMicros === null) {
    return {
      ...base,
      credentialSource: "platform",
      costSource: "unknown",
      metadata: estimate?.unpricedBuckets.length ? { unpricedBuckets: estimate.unpricedBuckets.join(",") } : {},
    };
  }
  return {
    ...base,
    credentialSource: "platform",
    costSource: "registry_estimate",
    estimatedCostMicros: estimate.costMicros,
    pricingSnapshot: snapshot,
    pricingTier: snapshot.tier,
  };
}

const WRITE_ATTEMPTS = 3;

/**
 * Append one cost event. Retry-safe: the unique `idempotencyKey` turns a
 * duplicate insert into a no-op, so the insert itself is retried (same key)
 * on a transient database error.
 *
 * **Never throws into the caller.** Every call site records usage inside
 * its provider retry loop; an exception here would be read as a failed
 * provider call and trigger a *second, paid* provider request. If the
 * write still fails after its own retries, the loss is logged loudly with
 * the idempotency key and amount so it can be backfilled, and the user
 * still gets the result they paid for. Returns whether a row was written.
 */
export async function recordProviderCost(input: RecordProviderCostInput): Promise<{ written: boolean }> {
  const { targetJobId, ...write } = buildCostEvent(input);
  const e = parseCostEventWrite(write);
  for (let attempt = 1; ; attempt++) {
    try {
      return await insertCostEvent(input.workspaceId, targetJobId, e);
    } catch (err) {
      if (attempt >= WRITE_ATTEMPTS) {
        logError("ai_cost.record_failed", err, {
          workspaceId: input.workspaceId,
          idempotencyKey: e.idempotencyKey,
          operation: e.operation,
          estimatedCostMicros: e.estimatedCostMicros?.toString() ?? null,
        });
        return { written: false };
      }
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }
}

async function insertCostEvent(
  workspaceId: string,
  targetJobId: string | null,
  e: ReturnType<typeof parseCostEventWrite>,
): Promise<{ written: boolean }> {
  const db = getJobmatchDb();
  const result = await db.aiCostEvent.createMany({
    skipDuplicates: true,
    data: [
      {
        idempotencyKey: e.idempotencyKey,
        schemaVersion: e.schemaVersion,
        entryType: e.entryType,
        workspaceId,
        actorId: e.actorId,
        operation: e.operation,
        outcome: e.outcome,
        finality: e.finality,
        subjectType: e.subjectType,
        subjectId: e.subjectId,
        parentSubjectType: e.parentSubjectType,
        parentSubjectId: e.parentSubjectId,
        targetJobId,
        workflowId: e.workflowId,
        traceId: e.traceId,
        provider: e.provider,
        requestModel: e.requestModel,
        responseModel: e.responseModel,
        providerRequestId: e.providerRequestId,
        promptVersion: e.promptVersion,
        pricingTier: e.pricingTier,
        usage: e.usage,
        inputTokens: totalInputTokens(e.usage),
        outputTokens: totalOutputTokens(e.usage),
        currency: e.currency,
        estimatedCostMicros: e.estimatedCostMicros,
        actualCostMicros: e.actualCostMicros,
        adjustmentDeltaMicros: e.adjustmentDeltaMicros,
        costSource: e.costSource,
        credentialSource: e.credentialSource,
        pricingSnapshot: e.pricingSnapshot ?? undefined,
        fixture: e.fixture,
        supersedesEventId: e.supersedesEventId,
        latencyMs: e.latencyMs,
        metadata: e.metadata,
        occurredAt: e.occurredAt,
        finalizedAt: e.finalizedAt,
      },
    ],
  });
  return { written: result.count === 1 };
}
