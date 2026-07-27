import { ConflictError } from "../errors";
import type { QuotaMetric } from "./limits";

/**
 * Thrown by `withQuota` when the caller-supplied usage count already meets
 * or exceeds the resolved limit. Carries enough structured data
 * (metric/limit/current) for the API layer to return a clear, actionable
 * user-facing limit state instead of a generic 409 — see
 * lib/http/errors.ts#errorResponse.
 */
export class QuotaExceededError extends ConflictError {
  constructor(
    public readonly metric: QuotaMetric,
    public readonly limit: number,
    public readonly current: number
  ) {
    super(`Quota exceeded for "${metric}": ${current}/${limit} already in use`);
    this.name = "QuotaExceededError";
  }
}
