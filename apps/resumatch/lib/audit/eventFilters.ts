import type { Prisma } from "../db/generated";

/**
 * The filters app/api/internal/audit-events accepts, turned into a Prisma
 * `where`. Pure, so it's unit tested on its own.
 *
 * They mirror the admin console's platform audit-log filters (apps/admin/
 * app/(admin)/audit-logs/query.ts), so the console can show ResuMatch's
 * events in the same stream, filtered the same way:
 * - `from` / `to`: inclusive UTC timestamps (ISO strings).
 * - `platformUserIds`: the console resolves an "actor email contains …"
 *   filter to platform user ids itself (ResuMatch holds no emails), so an
 *   empty list means "no user matched": no rows, not "no filter".
 * - `q`: free-text search. It matches the action name, one of the ids an
 *   event carries (paste an application id to find its history), or any
 *   user in `qPlatformUserIds` (users whose email matched the search).
 */

/** Metadata keys whose values are ids worth searching by. */
export const SEARCHABLE_ID_KEYS = ["applicationId", "targetJobId", "tailoringId", "coverLetterId"] as const;

export interface AuditEventFilters {
  workspaceId?: string | null;
  platformUserId?: string | null;
  /** Absent: no user filter. Present (even empty): only these users. */
  platformUserIds?: string[] | null;
  action?: string | null;
  from?: Date | null;
  to?: Date | null;
  q?: string | null;
  qPlatformUserIds?: string[] | null;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseIdList(value: string | null): string[] | null {
  if (value === null) return null;
  return value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function parseAuditEventFilters(params: URLSearchParams): AuditEventFilters {
  return {
    workspaceId: params.get("workspaceId"),
    platformUserId: params.get("platformUserId"),
    platformUserIds: parseIdList(params.get("platformUserIds")),
    action: params.get("action"),
    from: parseDate(params.get("from")),
    to: parseDate(params.get("to")),
    q: params.get("q")?.trim() || null,
    qPlatformUserIds: parseIdList(params.get("qPlatformUserIds")),
  };
}

export function buildAuditEventWhere(filters: AuditEventFilters): Prisma.AuditEventWhereInput {
  const and: Prisma.AuditEventWhereInput[] = [];

  if (filters.workspaceId) and.push({ workspaceId: filters.workspaceId });
  if (filters.platformUserId) and.push({ workspace: { platformUserId: filters.platformUserId } });
  if (filters.platformUserIds) and.push({ workspace: { platformUserId: { in: filters.platformUserIds } } });
  if (filters.action) and.push({ action: filters.action });
  if (filters.from || filters.to) {
    and.push({
      createdAt: {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      },
    });
  }
  if (filters.q) {
    const q = filters.q;
    and.push({
      OR: [
        { action: { contains: q, mode: "insensitive" } },
        ...SEARCHABLE_ID_KEYS.map((key) => ({ metadata: { path: [key], equals: q } })),
        ...(filters.qPlatformUserIds?.length
          ? [{ workspace: { platformUserId: { in: filters.qPlatformUserIds } } }]
          : []),
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}
