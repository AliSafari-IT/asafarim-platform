import type { CatalogAccessFilter, CatalogQuery, CatalogSort, CatalogStatusFilter } from "../repositories/apps";

/**
 * Normalizes the `/apps` catalog's URL search params server-side. Every
 * field falls back to a safe default on missing/unknown/malformed input —
 * there is no code path where an invalid query param reaches the
 * repository layer or throws.
 */

export const CATALOG_PAGE_SIZE = 12;
const MAX_SEARCH_LENGTH = 200;

const STATUS_VALUES: readonly CatalogStatusFilter[] = ["active", "archived", "all"];
const ACCESS_VALUES: readonly CatalogAccessFilter[] = ["all", "owned", "shared"];
const SORT_VALUES: readonly CatalogSort[] = ["updated", "created", "name"];

export interface RawCatalogSearchParams {
  q?: string | string[];
  status?: string | string[];
  access?: string | string[];
  sort?: string | string[];
  page?: string | string[];
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeCatalogQuery(raw: RawCatalogSearchParams): CatalogQuery {
  const rawSearch = firstValue(raw.q) ?? "";
  const search = normalizeWhitespace(rawSearch).slice(0, MAX_SEARCH_LENGTH);

  const rawStatus = firstValue(raw.status) ?? "active";
  const status: CatalogStatusFilter = (STATUS_VALUES as readonly string[]).includes(rawStatus)
    ? (rawStatus as CatalogStatusFilter)
    : "active";

  const rawAccess = firstValue(raw.access) ?? "all";
  const access: CatalogAccessFilter = (ACCESS_VALUES as readonly string[]).includes(rawAccess)
    ? (rawAccess as CatalogAccessFilter)
    : "all";

  const rawSort = firstValue(raw.sort) ?? "updated";
  const sort: CatalogSort = (SORT_VALUES as readonly string[]).includes(rawSort)
    ? (rawSort as CatalogSort)
    : "updated";

  const rawPage = Number.parseInt(firstValue(raw.page) ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.min(rawPage, 100_000) : 1;

  return {
    search: search.length > 0 ? search : undefined,
    status,
    access,
    sort,
    page,
    pageSize: CATALOG_PAGE_SIZE,
  };
}

/** Builds the query string for a catalog link, omitting default values. */
export function catalogHref(query: Partial<CatalogQuery>, page?: number): string {
  const params = new URLSearchParams();
  if (query.search) params.set("q", query.search);
  if (query.status && query.status !== "active") params.set("status", query.status);
  if (query.access && query.access !== "all") params.set("access", query.access);
  if (query.sort && query.sort !== "updated") params.set("sort", query.sort);
  const targetPage = page ?? query.page ?? 1;
  if (targetPage > 1) params.set("page", String(targetPage));
  const qs = params.toString();
  return qs ? `/apps?${qs}` : "/apps";
}
