import { createHash } from "node:crypto";

/**
 * Canonical, deterministic JSON serialization: object keys are sorted by
 * plain (non-locale) UTF-16 code-unit comparison at every level, so the
 * same logical value always serializes identically regardless of
 * insertion order or the runtime's default locale. Arrays are NOT
 * re-sorted — array order is meaningful data (e.g. component/navigation
 * order), not incidental.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort(compareKeys)) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Plain code-unit comparison — deliberately not `localeCompare`. */
function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The documented checksum algorithm for a specification: SHA-256 over the
 * canonical serialization. Given the same base specification, the same
 * ordered operation sequence, and the same engine version, this is always
 * identical — see docs/appbuilder-schema.md#checksums.
 */
export function checksumOf(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}
