import { isValidRecipient, normalizeEmail } from "./normalize";

/**
 * The /applications/sent list query. Client-safe: the page parses it and
 * every filter link is built with it, so a filtered view is a plain URL
 * that can be bookmarked, shared with yourself, and restored.
 *
 * URL parameters (all optional; defaults are left out of built URLs):
 * - `company`      a company key (normalize.ts companyKey), as stored on
 *                  each sent email: "everything sent to this company".
 * - `contact`      a normalized recipient address: "everything sent to
 *                  them". Works with or without a contact name.
 * - `application`  one application's history (the card's link).
 * - `sort`         `newest` (default) or `oldest`, by send attempt time,
 *                  ending with the id so pages never repeat a row.
 * - `page`         1-based.
 *
 * Malformed values fall back to their default, so a stale URL still shows
 * a list.
 */

export const SENT_PAGE_SIZE = 20;
const MAX_PAGE = 10_000;

export const SENT_SORTS = ["newest", "oldest"] as const;
export type SentSort = (typeof SENT_SORTS)[number];

export interface SentListQuery {
  company: string | null;
  contact: string | null;
  application: string | null;
  sort: SentSort;
  page: number;
}

export const DEFAULT_SENT_QUERY: SentListQuery = { company: null, contact: null, application: null, sort: "newest", page: 1 };

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

function first(params: Params, name: string): string | null {
  if (params instanceof URLSearchParams) return params.get(name);
  const raw = params[name];
  return (Array.isArray(raw) ? raw[0] : raw) ?? null;
}

const COMPANY_KEY = /^[\p{Ll}\p{N}]+(?:-[\p{Ll}\p{N}]+)*$/u;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function parseSentQuery(params: Params): SentListQuery {
  const company = first(params, "company")?.trim() ?? "";
  const contact = first(params, "contact")?.trim() ?? "";
  const application = first(params, "application")?.trim() ?? "";
  const sort = first(params, "sort");
  const page = Number(first(params, "page"));
  return {
    company: company.length <= 200 && COMPANY_KEY.test(company) ? company : null,
    contact: contact && isValidRecipient(contact) ? normalizeEmail(contact) : null,
    application: ID.test(application) ? application : null,
    sort: sort === "oldest" ? "oldest" : "newest",
    page: Number.isInteger(page) && page >= 1 && page <= MAX_PAGE ? page : 1,
  };
}

export function hasSentFilters(query: SentListQuery): boolean {
  return Boolean(query.company || query.contact || query.application);
}

/** The list URL for a query. Any filter change starts again at page 1
 *  unless the caller sets the page explicitly. */
export function sentListHref(query: SentListQuery): string {
  const params = new URLSearchParams();
  if (query.company) params.set("company", query.company);
  if (query.contact) params.set("contact", query.contact);
  if (query.application) params.set("application", query.application);
  if (query.sort !== "newest") params.set("sort", query.sort);
  if (query.page > 1) params.set("page", String(query.page));
  const search = params.toString();
  return `/applications/sent${search ? `?${search}` : ""}`;
}

/** The query with one filter added (or replaced), back on page 1. */
export function withSentFilter(query: SentListQuery, filter: Partial<Pick<SentListQuery, "company" | "contact" | "application">>): SentListQuery {
  return { ...query, ...filter, page: 1 };
}
