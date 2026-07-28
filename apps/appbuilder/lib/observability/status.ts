/**
 * Honest status vocabulary shared across the M12 readiness/observability
 * surface. `"unknown"` and `"not_configured"` are first-class values, not
 * fallbacks papered over as `"healthy"` — the M12 requirement is that the
 * UI never shows an optimistic or fake healthy status when the truth is
 * "we don't know" or "this was never set up".
 */
export type ReadinessStatus =
  "healthy" | "degraded" | "unhealthy" | "unknown" | "not_configured";
