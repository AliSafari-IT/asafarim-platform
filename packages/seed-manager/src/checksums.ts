// Deterministic checksums.
//
// Two things get hashed: the seed *definitions* (so drift in code is visible
// as a version change) and a *plan* (so an approved plan cannot be executed
// after the underlying data has moved). Both must be stable across processes
// and across key insertion order, which is why we canonicalise first.

import { createHash } from "node:crypto";

import type { SeedPlan, SeedPlanChange } from "./contracts";

/** JSON with object keys sorted recursively — stable across runtimes. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, val]) => [key, sortDeep(val)])
    );
  }
  // Dates and other exotics are normalised to their JSON form.
  return value;
}

export function checksum(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex").slice(0, 32);
}

/**
 * Hash of everything a provider would write. Changes whenever a seed
 * definition changes, which is what makes "drift between code and database"
 * detectable without diffing every row.
 */
export function definitionChecksum(definitions: unknown): string {
  return checksum(definitions);
}

/**
 * Hash of a plan's *semantic* content. Deliberately excludes planId,
 * createdAt and expiresAt so that re-planning identical work reproduces the
 * same checksum — that equality is exactly the pre-execution safety check.
 */
export function planChecksum(input: {
  providerId: string;
  environment: string;
  operation: string;
  definitionChecksum: string;
  changes: SeedPlanChange[];
}): string {
  return checksum({
    providerId: input.providerId,
    environment: input.environment,
    operation: input.operation,
    definitionChecksum: input.definitionChecksum,
    // Sort so provider iteration order can never alter the checksum.
    changes: [...input.changes].sort((a, b) =>
      `${a.seedKey}:${a.action}` < `${b.seedKey}:${b.action}` ? -1 : 1
    ),
  });
}

/** How long an approved plan stays executable. Short by design. */
export const PLAN_TTL_MS = 5 * 60 * 1000;

export function isPlanExpired(plan: Pick<SeedPlan, "expiresAt">, now = Date.now()): boolean {
  return new Date(plan.expiresAt).getTime() <= now;
}
