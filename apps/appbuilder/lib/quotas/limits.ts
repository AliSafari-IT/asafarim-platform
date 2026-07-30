/**
 * M12 quota metric catalogue and platform-default limits.
 *
 * These are deliberately plain constants (mirrors
 * lib/deployment/limits.ts#DEPLOYMENT_LIMITS) — every enforcement call site
 * resolves the EFFECTIVE limit through `resolveQuotaLimit`
 * (lib/quotas/overrides.ts), which checks for an active per-owner or
 * per-app override before falling back to the default here. Nothing reads
 * these constants directly for enforcement.
 *
 * Two enforcement styles are used, matched to blast radius:
 *  - HARD (throws QuotaExceededError, blocks the write): apps_per_owner,
 *    active_generation_jobs_per_app, ai_requests_per_day_per_owner,
 *    concurrent_validation_jobs_per_app, concurrent_deployment_jobs_per_app,
 *    storage_bytes_per_app, specification_versions_per_app,
 *    preview_builds_per_app.
 *  - SOFT (the record is skipped/short-circuited and a "quota.rejected"
 *    operational event is recorded, but the CALLER'S transaction is never
 *    thrown into, because the call site cannot safely abort — see
 *    lib/generated-data/workflows.ts's "never throws" contract):
 *    workflow_executions_per_day_per_app.
 */
export type QuotaMetric =
  | "apps_per_owner"
  | "active_generation_jobs_per_app"
  | "ai_requests_per_day_per_owner"
  | "specification_versions_per_app"
  | "preview_builds_per_app"
  | "storage_bytes_per_app"
  | "workflow_executions_per_day_per_app"
  | "concurrent_deployment_jobs_per_app"
  | "concurrent_validation_jobs_per_app"
  | "attachment_bytes_per_app"
  | "attachments_per_app"
  | "references_per_app"
  | "reference_fetches_per_day_per_app";

export const QUOTA_METRICS: readonly QuotaMetric[] = [
  "apps_per_owner",
  "active_generation_jobs_per_app",
  "ai_requests_per_day_per_owner",
  "specification_versions_per_app",
  "preview_builds_per_app",
  "storage_bytes_per_app",
  "workflow_executions_per_day_per_app",
  "concurrent_deployment_jobs_per_app",
  "concurrent_validation_jobs_per_app",
  "attachment_bytes_per_app",
  "attachments_per_app",
  "references_per_app",
  "reference_fetches_per_day_per_app",
];

export type QuotaScopeType = "owner" | "app";

/** Whether a metric is scoped per-owner (across all their apps) or per-app. */
export const QUOTA_METRIC_SCOPE: Record<QuotaMetric, QuotaScopeType> = {
  apps_per_owner: "owner",
  active_generation_jobs_per_app: "app",
  ai_requests_per_day_per_owner: "owner",
  specification_versions_per_app: "app",
  preview_builds_per_app: "app",
  storage_bytes_per_app: "app",
  workflow_executions_per_day_per_app: "app",
  concurrent_deployment_jobs_per_app: "app",
  concurrent_validation_jobs_per_app: "app",
  attachment_bytes_per_app: "app",
  attachments_per_app: "app",
  references_per_app: "app",
  reference_fetches_per_day_per_app: "app",
};

/**
 * Conservative MVP defaults — generous enough not to interrupt normal
 * development/demo usage, tight enough to bound worst-case AI/storage/
 * infrastructure spend from a single compromised or runaway account
 * ("denial-of-wallet" in the M12 threat model). Tune via
 * APPBUILDER_QUOTA_<METRIC_UPPER> env overrides at process start (see
 * `resolveDefaultLimit` below) or a per-owner/per-app `quota_overrides` row
 * at runtime (see lib/quotas/overrides.ts).
 */
export const QUOTA_LIMITS: Record<QuotaMetric, number> = {
  apps_per_owner: 20,
  active_generation_jobs_per_app: 1,
  ai_requests_per_day_per_owner: 200,
  specification_versions_per_app: 500,
  preview_builds_per_app: 300,
  storage_bytes_per_app: 500 * 1024 * 1024, // 500 MiB
  workflow_executions_per_day_per_app: 2000,
  concurrent_deployment_jobs_per_app: 1,
  concurrent_validation_jobs_per_app: 1,
  // M13: a separate cap from storage_bytes_per_app (M09 generated-file
  // storage) — conversation attachments are development/authoring input,
  // not the app's own generated-data storage, and are also subject to the
  // 24h unclaimed-upload retention sweep (lib/retention/sweep.ts).
  attachment_bytes_per_app: 200 * 1024 * 1024, // 200 MiB
  attachments_per_app: 500,
  // M13 slice F: two separate caps because they bound two different things —
  // how much third-party content one app accumulates (rows, refreshed in
  // place rather than appended per fetch), and how many OUTBOUND requests
  // this platform makes on a user's behalf per day. The daily fetch cap is
  // the one that matters for abuse: without it an app becomes a way to scan
  // or hammer other people's servers from our IP address.
  references_per_app: 100,
  reference_fetches_per_day_per_app: 200,
};

function envOverrideKey(metric: QuotaMetric): string {
  return `APPBUILDER_QUOTA_${metric.toUpperCase()}`;
}

/** The platform-default limit for a metric, honoring an `APPBUILDER_QUOTA_*` env override if set (process-wide, not audited — for ops tuning, distinct from the audited per-owner/per-app `quota_overrides` table). */
export function resolveDefaultLimit(metric: QuotaMetric): number {
  const raw = process.env[envOverrideKey(metric)];
  if (!raw) return QUOTA_LIMITS[metric];
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : QUOTA_LIMITS[metric];
}
