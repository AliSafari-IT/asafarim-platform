import "server-only";
import {
  estimateCost,
  normalizeAnthropicUsage,
  parseCostEventWrite,
  type CostEventWrite,
  type Outcome,
  type PricingSnapshot,
} from "@asafarim/ai-cost-ledger";
import type { LiveUsage } from "./providers/types";
import { webPricing } from "./pricing";

/**
 * Maps live tool attempts onto the platform cost-event contract
 * (@asafarim/ai-cost-ledger, ADR 0003). Anonymous public runs belong to one
 * synthetic workspace owner; no visitor identifier, input, or output is ever
 * part of an event.
 *
 * Fixture runs spend nothing and write no event (they would only add
 * anonymous noise to a table reconciliation reads).
 */
export const WEB_TOOLS_OWNER_ID = "web-public-tools";

export interface CostEventSink {
  /** Must be idempotent on `idempotencyKey`. Returns the stored event id. */
  record(event: CostEventWrite): Promise<string>;
}

export interface LiveAttempt {
  runId: string;
  slug: string;
  toolVersion: string;
  promptVersion: string;
  provider: string;
  requestModel: string;
  /** null when the provider never told us (timeout/abort). */
  responseModel: string | null;
  providerRequestId: string | null;
  /** null when usage is unknown (timeout, abort, transport failure). */
  usage: LiveUsage | null;
  outcome: Outcome;
  latencyMs: number;
  occurredAt: Date;
  fallbackUsed: boolean;
}

export function buildCostEvent(attempt: LiveAttempt): CostEventWrite {
  const usage = attempt.usage
    ? normalizeAnthropicUsage({
        input_tokens: attempt.usage.inputTokens,
        output_tokens: attempt.usage.outputTokens,
        cache_read_input_tokens: attempt.usage.cacheReadInputTokens,
        cache_creation_input_tokens: attempt.usage.cacheWriteInputTokens,
      })
    : [];
  const pricedModel = attempt.responseModel ?? attempt.requestModel;
  const snapshot = attempt.usage ? webPricing.lookup(attempt.provider, pricedModel) : null;
  const estimate = snapshot ? estimateCost(usage, snapshot).costMicros : null;
  const known = snapshot !== null && estimate !== null;

  return parseCostEventWrite({
    idempotencyKey: `web:${attempt.slug}:${attempt.runId}`,
    app: "web",
    ownerType: "workspace",
    ownerId: WEB_TOOLS_OWNER_ID,
    actorId: null,
    operation: attempt.slug,
    outcome: attempt.outcome,
    finality: "provisional",
    subjectType: "public_tool_run",
    subjectId: attempt.runId,
    provider: attempt.provider,
    requestModel: attempt.requestModel,
    responseModel: pricedModel,
    providerRequestId: attempt.providerRequestId,
    promptVersion: attempt.promptVersion,
    usage,
    estimatedCostMicros: known ? estimate : null,
    costSource: known ? "registry_estimate" : "unknown",
    credentialSource: "platform",
    pricingSnapshot: known ? snapshot : null,
    fixture: false,
    latencyMs: attempt.latencyMs,
    metadata: {
      tool_version: attempt.toolVersion,
      usage_known: attempt.usage !== null,
      fallback_used: attempt.fallbackUsed,
    },
    occurredAt: attempt.occurredAt,
  });
}

/**
 * Worst-case pre-call estimate: input tokens approximated as bytes / 3
 * (conservative for English and JSON) plus the full output-token cap.
 * Returns null when the model is unpriced — callers must treat that as
 * "refuse", never as free.
 */
export function worstCaseCostMicros(
  provider: string,
  model: string,
  promptBytes: number,
  maxOutputTokens: number,
): { micros: bigint; snapshot: PricingSnapshot } | null {
  const snapshot = webPricing.lookup(provider, model);
  if (!snapshot) return null;
  const usage = normalizeAnthropicUsage({ input_tokens: Math.ceil(promptBytes / 3), output_tokens: maxOutputTokens });
  const micros = estimateCost(usage, snapshot).costMicros;
  return micros === null ? null : { micros, snapshot };
}
