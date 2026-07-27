import type { generatedEnvironmentEnum } from "../db/schema";

/**
 * M11: the hard data boundary between a generated app's PREVIEW data (demo
 * rows a builder seeds and resets freely) and its PRODUCTION data (real
 * records belonging to real end users of a deployed release).
 *
 * ## Why this exists
 *
 * Before M11 every M09 generated-data table was scoped by `appId` alone.
 * That meant, had production simply started writing to the same tables:
 *
 * - `resetGeneratedData` (the builder's "reset demo data" button) issued
 *   `DELETE … WHERE app_id = $1` with no further predicate — it would have
 *   deleted every production record for the app.
 * - A preview record's unique value (say a demo team member's email) would
 *   have permanently occupied `generated_uniqueness_claims`, making it
 *   impossible for a real production user to ever use that value.
 * - A preview workflow execution would have occupied the
 *   `(appId, idempotencyKey)` slot and silently suppressed the equivalent
 *   production workflow run — no notification, no activity entry.
 * - A client could have replayed a preview response into production by
 *   reusing its own `generated_data_idempotency` key.
 *
 * Every one of those is now structurally impossible: `environment` is part
 * of the row, part of every uniqueness/idempotency index, and part of every
 * repository predicate.
 *
 * ## Fail-closed by construction
 *
 * The column defaults to `"preview"` at the database level. That direction
 * is deliberate: a code path that FORGETS to specify an environment writes
 * preview data, never production data. The dangerous direction (preview
 * data silently becoming production data) requires an explicit, deliberate
 * `"production"`.
 *
 * ## Never client-supplied
 *
 * `environment` is derived from HOW a request arrived, never from a query
 * parameter, header, cookie, or body field a caller controls:
 *
 * - a request whose (already normalized and validated) Host matches a
 *   persisted ACTIVE `app_domains` row → `production`
 * - the builder's own `/apps/{appId}/preview` route → `preview`
 * - anything else → `preview` (fail closed)
 *
 * See lib/routing/resolveAppHost.ts and
 * lib/generated-data/routeHelpers.ts#resolveContextForRequest.
 */
export type GeneratedEnvironment = (typeof generatedEnvironmentEnum.enumValues)[number];

export const PREVIEW: GeneratedEnvironment = "preview";
export const PRODUCTION: GeneratedEnvironment = "production";

/**
 * Narrows an untrusted value to a legal environment, defaulting to
 * `preview`. Used only at trust boundaries where a value has already been
 * server-derived but is typed loosely (e.g. read back out of JSONB); never
 * used to accept an environment from a request.
 */
export function coerceEnvironment(value: unknown): GeneratedEnvironment {
  return value === PRODUCTION ? PRODUCTION : PREVIEW;
}

export function isProduction(environment: GeneratedEnvironment): boolean {
  return environment === PRODUCTION;
}

/**
 * Guard for operations that must NEVER touch production data — most
 * importantly the demo seed/reset path. Throwing here (rather than
 * filtering) makes a mistaken call a loud failure instead of a silent
 * partial delete.
 */
export class ProductionEnvironmentForbiddenError extends Error {
  constructor(operation: string) {
    super(`"${operation}" is a preview-only operation and can never run against production data.`);
    this.name = "ProductionEnvironmentForbiddenError";
  }
}

export function assertPreviewOnly(environment: GeneratedEnvironment, operation: string): void {
  if (environment !== PREVIEW) {
    throw new ProductionEnvironmentForbiddenError(operation);
  }
}
