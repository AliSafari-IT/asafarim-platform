import { z } from "zod";
import { type NormalizationReason, type NormalizedPosting, normalizePosting } from "./normalize";

/**
 * The first connector: a configuration-driven JSON feed (JM-026).
 *
 * **No source ships enabled.** The business plan's launch source is gated on
 * JM-003 and JM-004 — a rights register and a chosen, agreed source — and
 * neither is a coding task. Writing a connector against a job board before
 * that work is done would be exactly the unapproved scraping the plan lists
 * as a non-goal, so what exists here is the machinery, and the machinery
 * refuses to run until a source row carries an agreement reference.
 *
 * It is generic on purpose. Employer feeds and partner APIs all publish a
 * list of objects with differently-spelled fields, so the mapping is
 * configuration rather than code, and adding an approved source becomes a
 * row plus a field map — not a deployment.
 */

/**
 * Where the postings live in the payload, and what each field is called.
 * Dotted paths so a nested envelope needs no special casing.
 */
export const feedMappingSchema = z.object({
  /** Path to the array of postings, e.g. "data.jobs". Empty means the root. */
  itemsPath: z.string().trim().max(120).default(""),
  fields: z.object({
    externalId: z.string().trim().min(1).max(120),
    url: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(120),
    employer: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(120),
    language: z.string().trim().max(120).optional(),
    location: z.string().trim().max(120).optional(),
    remote: z.string().trim().max(120).optional(),
    contractType: z.string().trim().max(120).optional(),
    salaryMin: z.string().trim().max(120).optional(),
    salaryMax: z.string().trim().max(120).optional(),
    salaryCurrency: z.string().trim().max(120).optional(),
    salaryPeriod: z.string().trim().max(120).optional(),
    skills: z.string().trim().max(120).optional(),
    requiresSponsorship: z.string().trim().max(120).optional(),
    languageRequired: z.string().trim().max(120).optional(),
    requiredCertifications: z.string().trim().max(120).optional(),
    publishedAt: z.string().trim().max(120).optional(),
    expiresAt: z.string().trim().max(120).optional(),
    updatedAt: z.string().trim().max(120).optional(),
  }),
});

export type FeedMapping = z.infer<typeof feedMappingSchema>;

export interface ParsedFeed {
  postings: NormalizedPosting[];
  /** Records the feed offered that could not be normalized, by reason. */
  failures: { reasonCode: NormalizationReason | "MISSING_FIELDS"; count: number }[];
  recordsFetched: number;
}

export type FeedParseResult =
  | { ok: true; feed: ParsedFeed }
  | { ok: false; reasonCode: "MALFORMED_JSON" | "ITEMS_NOT_FOUND" | "TOO_MANY_RECORDS" };

/** A single feed response may not carry more than this. */
export const MAX_RECORDS_PER_FETCH = 5000;

function readPath(source: unknown, path: string): unknown {
  if (path.length === 0) return source;
  let current: unknown = source;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Turn one feed response into normalized postings.
 *
 * Pure over its input — no network, no database — so a source's real payload
 * can be replayed through it from a stored snapshot, which is what makes
 * normalization reproducible after a parser fix.
 */
export function parseFeed(body: string, mapping: FeedMapping): FeedParseResult {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return { ok: false, reasonCode: "MALFORMED_JSON" };
  }

  const items = readPath(payload, mapping.itemsPath);
  if (!Array.isArray(items)) return { ok: false, reasonCode: "ITEMS_NOT_FOUND" };
  if (items.length > MAX_RECORDS_PER_FETCH) return { ok: false, reasonCode: "TOO_MANY_RECORDS" };

  const postings: NormalizedPosting[] = [];
  const failures = new Map<string, number>();
  const fail = (reason: string) => failures.set(reason, (failures.get(reason) ?? 0) + 1);

  for (const item of items) {
    const raw = {
      externalId: readPath(item, mapping.fields.externalId),
      url: readPath(item, mapping.fields.url),
      title: readPath(item, mapping.fields.title),
      employer: readPath(item, mapping.fields.employer),
      description: readPath(item, mapping.fields.description),
      language: optional(item, mapping.fields.language),
      location: optional(item, mapping.fields.location),
      remote: optional(item, mapping.fields.remote),
      contractType: optional(item, mapping.fields.contractType),
      salaryMin: optional(item, mapping.fields.salaryMin),
      salaryMax: optional(item, mapping.fields.salaryMax),
      salaryCurrency: optional(item, mapping.fields.salaryCurrency),
      salaryPeriod: optional(item, mapping.fields.salaryPeriod),
      skills: optional(item, mapping.fields.skills),
      requiresSponsorship: optional(item, mapping.fields.requiresSponsorship),
      languageRequired: optional(item, mapping.fields.languageRequired),
      requiredCertifications: optional(item, mapping.fields.requiredCertifications),
      publishedAt: optional(item, mapping.fields.publishedAt),
      expiresAt: optional(item, mapping.fields.expiresAt),
      updatedAt: optional(item, mapping.fields.updatedAt),
    };

    // A record missing a required field is counted and skipped, never
    // partially stored: a posting without an apply link or an employer is
    // worse than no posting at all.
    if (
      raw.externalId === undefined ||
      raw.url === undefined ||
      raw.title === undefined ||
      raw.employer === undefined ||
      raw.description === undefined
    ) {
      fail("MISSING_FIELDS");
      continue;
    }

    const normalized = normalizePosting(raw);
    if (!normalized.ok) {
      fail(normalized.reasonCode);
      continue;
    }
    postings.push(normalized.posting);
  }

  return {
    ok: true,
    feed: {
      postings,
      failures: [...failures.entries()].map(([reasonCode, count]) => ({
        reasonCode: reasonCode as ParsedFeed["failures"][number]["reasonCode"],
        count,
      })),
      recordsFetched: items.length,
    },
  };
}

function optional(item: unknown, path: string | undefined): unknown {
  return path ? readPath(item, path) : undefined;
}
