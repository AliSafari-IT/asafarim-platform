/**
 * The audit stream's filter contract, shared by the page and the CSV export
 * route so an exported incident report matches the view it came from.
 */

export const PAGE_SIZE = 25;

export interface AuditFilters {
  q: string;
  action: string;
  entity: string;
  actor: string;
  from: string;
  to: string;
  page: number;
}

export function parseAuditFilters(
  params: Record<string, string | undefined>
): AuditFilters {
  return {
    q: (params.q ?? "").trim(),
    action: (params.action ?? "").trim(),
    entity: (params.entity ?? "").trim(),
    actor: (params.actor ?? "").trim(),
    from: (params.from ?? "").trim(),
    to: (params.to ?? "").trim(),
    page: Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1),
  };
}

export function buildAuditWhere(filters: AuditFilters) {
  const createdAt: { gte?: Date; lte?: Date } = {};
  if (filters.from) createdAt.gte = new Date(`${filters.from}T00:00:00Z`);
  if (filters.to) createdAt.lte = new Date(`${filters.to}T23:59:59Z`);

  return {
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entity ? { entity: filters.entity } : {}),
    ...(filters.actor
      ? { user: { email: { contains: filters.actor, mode: "insensitive" as const } } }
      : {}),
    ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    ...(filters.q
      ? {
          OR: [
            { action: { contains: filters.q, mode: "insensitive" as const } },
            { entity: { contains: filters.q, mode: "insensitive" as const } },
            { entityId: { contains: filters.q, mode: "insensitive" as const } },
            { user: { email: { contains: filters.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
}

export function auditQueryString(
  filters: AuditFilters,
  overrides: Partial<AuditFilters> = {}
): string {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.action) params.set("action", merged.action);
  if (merged.entity) params.set("entity", merged.entity);
  if (merged.actor) params.set("actor", merged.actor);
  if (merged.from) params.set("from", merged.from);
  if (merged.to) params.set("to", merged.to);
  if (merged.page > 1) params.set("page", String(merged.page));
  return params.toString();
}

export function auditHref(
  filters: AuditFilters,
  overrides: Partial<AuditFilters> = {}
): string {
  const qs = auditQueryString(filters, overrides);
  return qs ? `/audit-logs?${qs}` : "/audit-logs";
}

export function hasAuditFilters(filters: AuditFilters): boolean {
  return Boolean(
    filters.q || filters.action || filters.entity || filters.actor || filters.from || filters.to
  );
}
