/**
 * Dedicated, paginated Vionto job/export history for one user (issue #349
 * slice 3 — the generic cross-app User 360 timeline at ../page.tsx loads
 * every Vionto row unconditionally, which doesn't scale for a prolific
 * user; this page queries one type at a time with real skip/take
 * pagination instead of paginating an already-fetched array in memory.
 */

export const PAGE_SIZE = 25;

export const VIONTO_ENTRY_TYPES = [
  "project",
  "video_version",
  "render_job",
  "export",
  "album",
] as const;

export type VionteEntryType = (typeof VIONTO_ENTRY_TYPES)[number];

export function isVionteEntryType(value: string): value is VionteEntryType {
  return (VIONTO_ENTRY_TYPES as readonly string[]).includes(value);
}

/** The Prisma column each type's "state" filter maps to — export has none (every row is a completed export). */
export const VIONTO_STATE_FIELD: Record<VionteEntryType, string | null> = {
  project: "status",
  video_version: "mode",
  render_job: "state",
  export: null,
  album: "lifecycleStage",
};

export interface VionteFilters {
  type: VionteEntryType;
  state: string;
  from: string;
  to: string;
  page: number;
}

export function parseVionteFilters(params: Record<string, string | undefined>): VionteFilters {
  const rawType = (params.type ?? "").trim();
  return {
    type: isVionteEntryType(rawType) ? rawType : "render_job",
    state: (params.state ?? "").trim(),
    from: (params.from ?? "").trim(),
    to: (params.to ?? "").trim(),
    page: Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1),
  };
}

/** Prisma `where` fragment for the createdAt/state filters, shared across every type's query. */
export function buildVionteWhere(filters: VionteFilters, userId: string) {
  const createdAt: { gte?: Date; lte?: Date } = {};
  if (filters.from) createdAt.gte = new Date(`${filters.from}T00:00:00Z`);
  if (filters.to) createdAt.lte = new Date(`${filters.to}T23:59:59Z`);

  const stateField = VIONTO_STATE_FIELD[filters.type];

  return {
    userId,
    ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    ...(filters.state && stateField ? { [stateField]: filters.state } : {}),
  };
}

export function vionteQueryString(
  filters: VionteFilters,
  overrides: Partial<VionteFilters> = {}
): string {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.type !== "render_job") params.set("type", merged.type);
  if (merged.state) params.set("state", merged.state);
  if (merged.from) params.set("from", merged.from);
  if (merged.to) params.set("to", merged.to);
  if (merged.page > 1) params.set("page", String(merged.page));
  return params.toString();
}

export function vionteHref(
  userId: string,
  filters: VionteFilters,
  overrides: Partial<VionteFilters> = {}
): string {
  const qs = vionteQueryString(filters, overrides);
  const base = `/users/${userId}/vionto`;
  return qs ? `${base}?${qs}` : base;
}

export function hasVionteFilters(filters: VionteFilters): boolean {
  return Boolean(filters.state || filters.from || filters.to);
}
