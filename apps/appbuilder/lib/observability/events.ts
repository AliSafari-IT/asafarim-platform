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
