import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * The connector contract and normalization (JM-025, JM-027).
 *
 * Every source produces a different shape, and every source must end up as
 * the same one. This module is that boundary: a connector's only job is to
 * hand over `RawPosting` records, and everything downstream — deduplication,
 * freshness, search, matching — sees only the normalized form.
 *
 * Two properties the rest of the milestone depends on:
 *
 * **Normalization is pure and versioned.** Given the same raw record and the
 * same `NORMALIZER_VERSION`, the output is identical. That is what makes a
 * stored snapshot replayable: a parser fix can be re-run against the
 * original payload instead of re-fetching, which an agreement may not even
 * permit.
 *
 * **Provenance is not optional.** A record without a source identifier or a
 * usable canonical URL is rejected rather than stored, because a posting
 * nobody can trace back to a source is exactly what this product promises
 * never to show.
 */

/** Bumped when normalization's *output* changes for unchanged input. */
export const NORMALIZER_VERSION = "1.0.0";

/**
 * What a connector must produce. Deliberately close to what feeds actually
 * publish, so a connector stays a thin mapping rather than a parser.
 */
export const rawPostingSchema = z.object({
  /** The source's own stable identifier for this posting. */
  externalId: z.string().trim().min(1).max(200),
  /** Where a candidate applies. Must be absolute: a relative link is
   *  unusable once the posting leaves the feed's context. */
  url: z.string().trim().url(),
  title: z.string().trim().min(1).max(300),
  employer: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(100_000),

  language: z.string().trim().max(16).nullish(),
  location: z.string().trim().max(200).nullish(),
  remote: z.boolean().nullish(),
  contractType: z.string().trim().max(60).nullish(),

  salaryMin: z.number().int().min(0).max(100_000_000).nullish(),
  salaryMax: z.number().int().min(0).max(100_000_000).nullish(),
  salaryCurrency: z.string().trim().length(3).nullish(),
  salaryPeriod: z.enum(["hour", "day", "month", "year"]).nullish(),

  skills: z.array(z.string().trim().min(1).max(80)).max(100).nullish(),

  publishedAt: z.coerce.date().nullish(),
  expiresAt: z.coerce.date().nullish(),
  updatedAt: z.coerce.date().nullish(),
});

export type RawPosting = z.infer<typeof rawPostingSchema>;

export interface NormalizedPosting {
  externalId: string;
  canonicalUrl: string;
  title: string;
  employer: string;
  description: string;
  language: string | null;
  locationRaw: string | null;
  isRemote: boolean | null;
  contractType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  skillsRaw: string[];
  publishedAt: Date | null;
  expiresAt: Date | null;
  sourceUpdatedAt: Date | null;
  contentHash: string;
  canonicalKey: string;
  normalizerVersion: string;
}

export type NormalizationReason = "INVALID_RECORD" | "UNSAFE_URL" | "SALARY_RANGE_INVERTED";

export type NormalizationResult =
  | { ok: true; posting: NormalizedPosting }
  | { ok: false; reasonCode: NormalizationReason };

/** Collapse whitespace without destroying paragraph structure. */
function tidy(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Strip the tracking parameters feeds attach to their own links.
 *
 * Two postings differing only by a campaign tag are the same job, and
 * leaving the tags on defeats URL-based deduplication entirely. The query is
 * also sorted, so parameter order cannot produce two "different" URLs for
 * one page.
 */
export function canonicalizeUrl(candidate: string): string | null {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const drop = /^(utm_|fbclid$|gclid$|mc_|ref$|referrer$|source$|campaign$|trk$)/i;
  const kept = [...url.searchParams.entries()]
    .filter(([key]) => !drop.test(key))
    .sort(([a], [b]) => a.localeCompare(b));

  url.search = "";
  for (const [key, value] of kept) url.searchParams.append(key, value);
  url.hash = "";
  // A trailing slash is not a different page.
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

/** Lowercase, strip diacritics, drop legal-form suffixes, squash punctuation. */
function foldIdentity(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Legal-form suffixes carry no identity: "Example NV" is "Example".
    .replace(/\b(nv|sa|bv|bvba|sprl|gmbh|ltd|limited|inc|plc|vzw|asbl)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * A key identifying the same job across sources (JM-028).
 *
 * Employer, title and location, aggressively folded: aggregators republish
 * the same vacancy with different casing, punctuation and legal suffixes,
 * and an exact-match key would treat every copy as a separate job. The
 * description is deliberately *not* part of it — republishers routinely
 * append their own boilerplate, which would make identical jobs look
 * different exactly when deduplication matters most.
 */
export function buildCanonicalKey(input: {
  employer: string;
  title: string;
  location?: string | null;
}): string {
  return createHash("sha256")
    .update(
      [
        foldIdentity(input.employer),
        foldIdentity(input.title),
        foldIdentity(input.location ?? ""),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 32);
}

/** Hash of the fields that define a posting, to tell an update from a re-fetch. */
export function buildContentHash(
  posting: Omit<NormalizedPosting, "contentHash" | "canonicalKey" | "normalizerVersion">,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        posting.externalId,
        posting.canonicalUrl,
        posting.title,
        posting.employer,
        posting.description,
        posting.language,
        posting.locationRaw,
        posting.isRemote,
        posting.contractType,
        posting.salaryMin,
        posting.salaryMax,
        posting.salaryCurrency,
        posting.salaryPeriod,
        posting.skillsRaw,
        posting.publishedAt?.toISOString() ?? null,
        posting.expiresAt?.toISOString() ?? null,
      ]),
    )
    .digest("hex");
}

export function normalizePosting(raw: unknown): NormalizationResult {
  const parsed = rawPostingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reasonCode: "INVALID_RECORD" };

  const record = parsed.data;
  const canonicalUrl = canonicalizeUrl(record.url);
  if (!canonicalUrl) return { ok: false, reasonCode: "UNSAFE_URL" };

  // A range that runs backwards is a source bug, and storing it would have
  // M4 exclude candidates on nonsense. Refused rather than silently swapped:
  // guessing which end was meant is not a thing to do to someone's pay.
  if (record.salaryMin != null && record.salaryMax != null && record.salaryMin > record.salaryMax) {
    return { ok: false, reasonCode: "SALARY_RANGE_INVERTED" };
  }

  const base = {
    externalId: record.externalId,
    canonicalUrl,
    title: tidy(record.title),
    employer: tidy(record.employer),
    description: tidy(record.description),
    language: record.language ? record.language.toLowerCase().slice(0, 16) : null,
    locationRaw: record.location ? tidy(record.location) : null,
    isRemote: record.remote ?? null,
    contractType: record.contractType ? record.contractType.toLowerCase() : null,
    salaryMin: record.salaryMin ?? null,
    salaryMax: record.salaryMax ?? null,
    salaryCurrency: record.salaryCurrency ? record.salaryCurrency.toUpperCase() : null,
    salaryPeriod: record.salaryPeriod ?? null,
    // Deduplicated case-insensitively while keeping the source's own wording,
    // which M4 needs and must not erase.
    skillsRaw: dedupePreservingCase(record.skills ?? []),
    publishedAt: record.publishedAt ?? null,
    expiresAt: record.expiresAt ?? null,
    sourceUpdatedAt: record.updatedAt ?? null,
  };

  return {
    ok: true,
    posting: {
      ...base,
      contentHash: buildContentHash(base),
      canonicalKey: buildCanonicalKey({
        employer: base.employer,
        title: base.title,
        location: base.locationRaw,
      }),
      normalizerVersion: NORMALIZER_VERSION,
    },
  };
}

function dedupePreservingCase(values: string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(value);
  }
  return kept;
}
