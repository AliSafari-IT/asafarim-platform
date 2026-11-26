import { APPLICATION_STATUSES, type ApplicationStatusName } from "./constants";
import { parseFollowUpDay } from "./followUp";

/**
 * The /applications list query (issue #897), shared by the page and
 * `GET /api/applications` so both accept, bound and order the same things.
 * Client-safe and framework-free: the controls build URLs with it too.
 *
 * URL parameters (all optional; defaults are omitted from built URLs):
 *
 * - `q`        search in the job title and employer (never in notes).
 *              Trimmed, inner whitespace collapsed, at most 100 characters.
 * - `status`   one of APPLICATION_STATUSES.
 * - `due`      `overdue` | `today` | `upcoming`, compared as days with the
 *              follow-up date (lib/applications/followUp.ts). Closed
 *              applications (OFFER/REJECTED) and ones without a date never
 *              match, the same rule as the due badge.
 * - `today`    the candidate's own calendar day, `YYYY-MM-DD`, sent by the
 *              browser. Required with `due`: the server never decides what
 *              day it is.
 * - `via`      how the candidate applied (application-timeline.md):
 *              `email` (an email sent from ResuMatch was accepted),
 *              `external` (any recorded external submission), or one
 *              channel: `indeed`, `linkedin`, `company`, `other`.
 * - `sort`     `newest` (created, newest first; default), `followUp`
 *              (next follow-up first; applications without a date last)
 *              or `applied` (applied date, newest first; not applied last).
 *              Both end with the id, so equal dates/timestamps still have
 *              one fixed order and pages never repeat or skip a row.
 * - `page`     1-based page number.
 * - `pageSize` rows per page, 1..MAX_PAGE_SIZE.
 *
 * Malformed values: the API answers 400 with the offending parameter names
 * (`strict`); the page falls back to the default for each one (`lenient`),
 * so a hand-edited or stale URL still shows a list.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const SEARCH_MAX_LENGTH = 100;
/** A page number this high is a typo or a probe, not a real tracker. */
export const MAX_PAGE = 10_000;

export const APPLICATION_DUE_FILTERS = ["overdue", "today", "upcoming"] as const;
export type ApplicationDueFilter = (typeof APPLICATION_DUE_FILTERS)[number];

export const APPLICATION_SORTS = ["newest", "followUp", "applied"] as const;
export type ApplicationSort = (typeof APPLICATION_SORTS)[number];

export const APPLICATION_VIA_FILTERS = ["email", "external", "indeed", "linkedin", "company", "other"] as const;
export type ApplicationViaFilter = (typeof APPLICATION_VIA_FILTERS)[number];

export interface ApplicationListQuery {
  q: string;
  status: ApplicationStatusName | null;
  via: ApplicationViaFilter | null;
  due: ApplicationDueFilter | null;
  /** Present whenever `due` is; may also be carried without it. */
  today: string | null;
  sort: ApplicationSort;
  page: number;
  pageSize: number;
}

export const DEFAULT_APPLICATION_LIST_QUERY: ApplicationListQuery = {
  q: "",
  status: null,
  via: null,
  due: null,
  today: null,
  sort: "newest",
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
};

export type ApplicationListParam = "q" | "status" | "via" | "due" | "today" | "sort" | "page" | "pageSize";

export type SearchParamsInput = URLSearchParams | Record<string, string | string[] | undefined>;

function read(params: SearchParamsInput, name: string): { value: string | null; repeated: boolean } {
  if (params instanceof URLSearchParams) {
    const all = params.getAll(name);
    return { value: all[0] ?? null, repeated: all.length > 1 };
  }
  const raw = params[name];
  if (Array.isArray(raw)) return { value: raw[0] ?? null, repeated: raw.length > 1 };
  return { value: raw ?? null, repeated: false };
}

/** Trims and collapses whitespace. Search text is matched literally. */
export function normalizeSearch(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parsePositiveInt(value: string, max: number): number | null {
  if (!/^\d{1,6}$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 && n <= max ? n : null;
}

export type ParsedApplicationListQuery =
  | { ok: true; query: ApplicationListQuery; invalid: ApplicationListParam[] }
  | { ok: false; invalid: ApplicationListParam[] };

/**
 * Reads the list query from URL parameters. A repeated parameter is
 * malformed. Unknown parameters are ignored. `due` without a valid `today`
 * is malformed in strict mode; in lenient mode the query keeps `due` with
 * `today: null` and the page asks the browser for its day before listing.
 */
export function parseApplicationListQuery(
  params: SearchParamsInput,
  mode: "strict" | "lenient",
): ParsedApplicationListQuery {
  const query: ApplicationListQuery = { ...DEFAULT_APPLICATION_LIST_QUERY };
  const invalid: ApplicationListParam[] = [];

  const field = (name: ApplicationListParam, accept: (value: string) => boolean) => {
    const { value, repeated } = read(params, name);
    if (value === null || (value === "" && !repeated)) return;
    if (repeated || !accept(value)) invalid.push(name);
  };

  field("q", (value) => {
    const q = normalizeSearch(value);
    if (q.length > SEARCH_MAX_LENGTH) {
      if (mode === "strict") return false;
      query.q = q.slice(0, SEARCH_MAX_LENGTH).trim();
      return true;
    }
    query.q = q;
    return true;
  });
  field("status", (value) => {
    if (!(APPLICATION_STATUSES as readonly string[]).includes(value)) return false;
    query.status = value as ApplicationStatusName;
    return true;
  });
  field("via", (value) => {
    if (!(APPLICATION_VIA_FILTERS as readonly string[]).includes(value)) return false;
    query.via = value as ApplicationViaFilter;
    return true;
  });
  field("due", (value) => {
    if (!(APPLICATION_DUE_FILTERS as readonly string[]).includes(value)) return false;
    query.due = value as ApplicationDueFilter;
    return true;
  });
  field("today", (value) => {
    const day = parseFollowUpDay(value);
    if (!day) return false;
    query.today = day;
    return true;
  });
  field("sort", (value) => {
    if (!(APPLICATION_SORTS as readonly string[]).includes(value)) return false;
    query.sort = value as ApplicationSort;
    return true;
  });
  field("page", (value) => {
    const n = parsePositiveInt(value, MAX_PAGE);
    if (n === null) return false;
    query.page = n;
    return true;
  });
  field("pageSize", (value) => {
    const n = parsePositiveInt(value, MAX_PAGE_SIZE);
    if (n === null) return false;
    query.pageSize = n;
    return true;
  });

  if (query.due && !query.today && !invalid.includes("today")) {
    if (mode === "strict") invalid.push("today");
  }

  if (mode === "strict" && invalid.length > 0) return { ok: false, invalid };
  return { ok: true, query, invalid };
}

/** Whether any filter (not sort or paging) narrows the list. */
export function hasApplicationFilters(query: ApplicationListQuery): boolean {
  return query.q !== "" || query.status !== null || query.via !== null || query.due !== null;
}

/**
 * URL parameters for a query, defaults left out. `today` is kept only
 * alongside `due`, where it means something.
 */
export function serializeApplicationListQuery(query: ApplicationListQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  if (query.via) params.set("via", query.via);
  if (query.due) {
    params.set("due", query.due);
    if (query.today) params.set("today", query.today);
  }
  if (query.sort !== DEFAULT_APPLICATION_LIST_QUERY.sort) params.set("sort", query.sort);
  if (query.page !== 1) params.set("page", String(query.page));
  if (query.pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(query.pageSize));
  return params;
}

/** `/applications` plus the query string for `query`. */
export function applicationListHref(query: ApplicationListQuery, path = "/applications"): string {
  const search = serializeApplicationListQuery(query).toString();
  return search ? `${path}?${search}` : path;
}

/** The query after a search/filter/sort change: always back to page 1, so
 *  a narrower result never opens on a page that no longer exists. */
export function withListChange(
  query: ApplicationListQuery,
  change: Partial<Omit<ApplicationListQuery, "page">>,
): ApplicationListQuery {
  return { ...query, ...change, page: 1 };
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
