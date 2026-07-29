import type { ReferenceAdapter } from "./limits";
import { REFERENCE_LIMITS } from "./limits";
import type { ReferenceFailureCode } from "./errors";

/**
 * M13 slice F — provenance and freshness. The slice's exit criterion is that
 * imported data is never presented as something it is not: "Stamp source
 * URL/fetch time; never call unavailable or stale data 'live'"
 * (docs/appbuilder-m13-multimodal-contextual-assistant.md, slice F).
 *
 * `live` is the narrow case and it is computed in exactly one place: a fetch
 * that SUCCEEDED IN THE CURRENT REQUEST. It is never derived from a stored
 * row, because a stored row is by definition a past fetch. That is why
 * `freshnessOfRow` cannot return `live` at all — the type says so — and the
 * import API's response is the only surface that ever carries it.
 *
 * The other rule worth stating plainly: **a failed refresh downgrades
 * freshness even when the cached copy is still inside its TTL.** Serving
 * six-minute-old content is fine; describing it as `cached` right after the
 * source refused to answer would tell the user the pipeline is healthy when
 * it is not. Once `failureCode` is set on a row, the best it can be is
 * `stale`.
 */

/** Freshness as reported for stored content. Deliberately excludes `live` — see the module docstring. */
export type StoredReferenceFreshness = "cached" | "stale" | "unavailable";

/** Freshness as reported by the import API, which alone can observe a just-completed fetch. */
export type ReportedReferenceFreshness = "live" | StoredReferenceFreshness;

export interface ReferenceFreshnessInput {
  /** When the currently-stored content was fetched. Null when no fetch has ever succeeded. */
  fetchedAt: Date | null;
  /** `fetchedAt + CACHE_TTL_SECONDS`, persisted so a TTL change never silently re-validates old rows. */
  cacheExpiresAt: Date | null;
  /** Set when the most recent fetch ATTEMPT failed, even if older content is still stored. */
  failureCode: ReferenceFailureCode | null;
  /** Whether any usable content is stored at all. */
  hasContent: boolean;
}

export function freshnessOfRow(row: ReferenceFreshnessInput, now: Date = new Date()): StoredReferenceFreshness {
  if (!row.hasContent || !row.fetchedAt) return "unavailable";
  if (row.failureCode) return "stale";
  if (row.cacheExpiresAt && row.cacheExpiresAt.getTime() > now.getTime()) return "cached";
  return "stale";
}

/** True when a stored row may be reused without re-fetching: content present, last attempt succeeded, still inside its TTL. */
export function isCacheUsable(row: ReferenceFreshnessInput, now: Date = new Date()): boolean {
  return freshnessOfRow(row, now) === "cached";
}

export function cacheExpiryFor(fetchedAt: Date, ttlSeconds: number = REFERENCE_LIMITS.CACHE_TTL_SECONDS): Date {
  return new Date(fetchedAt.getTime() + ttlSeconds * 1000);
}

export interface ReferenceProvenance {
  sourceUrl: string;
  /** Where the fetch ended up after redirects — null when it never redirected or never succeeded. */
  finalUrl: string | null;
  host: string;
  adapter: ReferenceAdapter;
  adapterVersion: string;
  fetchedAt: string | null;
  cacheExpiresAt: string | null;
  cacheTtlSeconds: number;
  /** SHA-256 of the extracted text — lets a refresh report "unchanged" without diffing content. */
  contentHash: string | null;
  freshness: ReportedReferenceFreshness;
  /** How many times this reference has been re-fetched since it was first imported. */
  refreshCount: number;
}

/** Plain-language freshness for the UI and for message text — never the word "live" for anything but a just-completed fetch. */
export function describeFreshness(freshness: ReportedReferenceFreshness, fetchedAt: Date | null): string {
  switch (freshness) {
    case "live":
      return "Just fetched from the source.";
    case "cached":
      return fetchedAt
        ? `From a cached copy fetched ${fetchedAt.toISOString()} — not re-checked just now.`
        : "From a cached copy — not re-checked just now.";
    case "stale":
      return fetchedAt
        ? `Out of date: this copy was fetched ${fetchedAt.toISOString()} and the source has not been re-read successfully since.`
        : "Out of date: the source has not been read successfully.";
    case "unavailable":
    default:
      return "Unavailable: no readable copy of this reference exists.";
  }
}
