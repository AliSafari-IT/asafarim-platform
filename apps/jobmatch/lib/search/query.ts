import { z } from "zod";

/**
 * Search query parsing (JM-035).
 *
 * Every parameter is validated and bounded before it reaches a database
 * query. This is not only input hygiene: `pageSize` in particular is what
 * stands between "a candidate paging through results" and "a script pulling
 * the whole table one page at a time" — JM-037's bulk-extraction concern
 * starts here, not only at the rate limiter.
 */

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_SKILLS_FILTER = 10;

export const searchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  location: z.string().trim().max(120).optional(),
  remote: z.enum(["onsite", "hybrid", "remote", "any"]).optional(),
  contractType: z.string().trim().max(60).optional(),
  salaryMin: z.coerce.number().int().min(0).max(100_000_000).optional(),
  /** "Mandatory technology" as a search filter the candidate applies
   *  themselves, rather than a profile-driven exclusion — the profile has
   *  no field distinguishing a must-have skill from a nice-to-have one. */
  skills: z
    .string()
    .trim()
    .max(400)
    .transform((value) =>
      value
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean)
        .slice(0, MAX_SKILLS_FILTER),
    )
    .optional(),
  sort: z.enum(["newest", "salary"]).default("newest"),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export type SearchQueryResult =
  | { ok: true; query: SearchQuery }
  | { ok: false; reasonCode: "INVALID_QUERY" };

/** Parse and bound a search request's query parameters. */
export function parseSearchQuery(params: URLSearchParams): SearchQueryResult {
  const raw = Object.fromEntries(params.entries());
  const parsed = searchQuerySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reasonCode: "INVALID_QUERY" };
  return { ok: true, query: parsed.data };
}
