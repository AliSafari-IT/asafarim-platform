import type { Db } from "../db/client";
import { operationalEvents } from "../db/schema";
import { generateId } from "../db/ids";
import { QuotaExceededError } from "../quotas/errors";

export type OperationalEventCategory =
  | "generation"
  | "modification"
  | "repair"
  | "validation"
  | "preview"
  | "deployment"
  | "rollback"
  | "runtime"
  | "storage"
  | "workflow"
  | "quota"
  | "backup"
  | "restore"
  | "security";

export type OperationalEventSeverity = "info" | "warning" | "error";

/**
 * M13 slice G — the operational-event kinds this milestone emits, named in
 * one place so lib/observability/metrics.ts aggregates over a closed set
 * rather than over string literals scattered across a dozen call sites, and
 * so a reviewer can see the whole M13 telemetry surface at once.
 *
 * What is deliberately NOT here is as load-bearing as what is: no event kind
 * exists for prompt text, conversation content, extracted attachment text,
 * imported reference bodies, resolved IP addresses, or URL paths. M13's
 * telemetry rule is "redacted scores and case ids, not prompts or attachment
 * content" — a `detail` payload on any of these kinds carries counts, codes,
 * durations, hosts, and stable ids only.
 */
export const M13_EVENT_KINDS = {
  attachment: [
    "attachment.initiated",
    "attachment.committed",
    "attachment.extraction_completed",
    "attachment.extraction_skipped",
    "attachment.quarantined",
    "attachment.scan_not_configured",
    "attachment.deleted",
    "attachment.swept_unclaimed",
    "attachment.rejected",
  ],
  context: [
    "context.assembled",
    "context.truncated",
    "context.vision_unavailable",
  ],
  resolver: ["resolver.resolved", "resolver.ambiguous", "resolver.unresolved"],
  clarification: [
    "clarification.asked",
    "clarification.answered",
    "clarification.exhausted",
  ],
  plan: [
    "plan.created",
    "plan.step_applied",
    "plan.completed",
    "plan.stopped",
    "plan.suppressed_by_flag",
  ],
  reference: [
    "reference.imported",
    "reference.blocked",
    "reference.fetch_failed",
    "reference.rate_limited",
    "reference.disabled_by_flag",
  ],
  model: ["model.call_completed", "model.call_failed"],
  retention: ["retention.swept", "retention.sweep_failed"],
  shadow: ["shadow.evaluated", "shadow.failed"],
} as const;

export type M13EventGroup = keyof typeof M13_EVENT_KINDS;

/** Flat list of every M13 event kind — the aggregation surface for metrics.ts. */
export const ALL_M13_EVENT_KINDS: readonly string[] = Object.values(
  M13_EVENT_KINDS
).flat();

export interface RecordOperationalEventInput {
  appId?: string | null;
  correlationId?: string | null;
  category: OperationalEventCategory;
  kind: string;
  severity?: OperationalEventSeverity;
  actorPrincipalId?: string | null;
  detail?: Record<string, unknown>;
}

/**
 * The one write path for the M12 durable operational-event stream. Always
 * called with the PLAIN `db` handle (never a transaction that might still
 * roll back) when recording something that must survive independently of
 * whatever it's reporting on — most importantly a quota rejection, which by
 * definition means the transaction that hit the quota is about to roll
 * back, so an event recorded on that same `tx` would vanish with it (see
 * `withQuotaRejectionLogging` below).
 */
export async function recordOperationalEvent(
  db: Db,
  input: RecordOperationalEventInput
): Promise<void> {
  await db.insert(operationalEvents).values({
    id: generateId(),
    appId: input.appId ?? null,
    correlationId: input.correlationId ?? null,
    category: input.category,
    kind: input.kind,
    severity: input.severity ?? "info",
    actorPrincipalId: input.actorPrincipalId ?? null,
    detail: input.detail ?? {},
  });
}

/**
 * Wraps a quota-guarded repository call so a `QuotaExceededError` is always
 * durably recorded — using the outer `db`, not the (by-then-rolled-back)
 * transaction the quota check ran inside — before being re-thrown
 * unchanged. This is what makes "quota rejections" a real, queryable
 * observability signal (see lib/observability/metrics.ts#countQuotaRejections)
 * instead of only ever being visible as a one-off 429 response the caller
 * may or may not have logged.
 */
export async function withQuotaRejectionLogging<T>(
  db: Db,
  params: {
    category: OperationalEventCategory;
    appId: string | null;
    actorPrincipalId: string;
  },
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      await recordOperationalEvent(db, {
        appId: params.appId,
        category: params.category,
        kind: "quota.rejected",
        severity: "warning",
        actorPrincipalId: params.actorPrincipalId,
        detail: { metric: err.metric, limit: err.limit, current: err.current },
      });
    }
    throw err;
  }
}
