import "server-only";
import { prisma } from "@asafarim/db";
import {
  mergeAuditPage,
  resumatchRow,
  sourcesFor,
  type AuditStreamRow,
  type ResumatchAuditEventDto,
} from "../audit-stream";
import { buildAuditWhere, type AuditFilters } from "../../app/(admin)/audit-logs/query";

/**
 * Loads the unified Audit Logs stream: platform `AuditLog` rows plus
 * ResuMatch's own audit events (read over its bearer-gated internal API;
 * the console never holds ResuMatch's database credentials, issue #301),
 * merged newest first. Shared by the page and the CSV export, so an export
 * matches the view it came from.
 *
 * ResuMatch being unreachable never blanks the page: its part comes back
 * as `resumatchUnavailable: true` and the platform rows still show.
 */

/** ResuMatch's route caps one request at 200 rows; deeper pages loop on its cursor. */
const RESUMATCH_BATCH = 200;
/** Users an email search can expand to before being cut off. */
const MAX_MATCHED_USERS = 500;

const PLATFORM_SELECT = {
  id: true,
  action: true,
  entity: true,
  entityId: true,
  changes: true,
  ipAddress: true,
  createdAt: true,
  user: { select: { id: true, email: true } },
} as const;

async function userIdsWithEmailContaining(fragment: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { email: { contains: fragment, mode: "insensitive" } },
    select: { id: true },
    take: MAX_MATCHED_USERS,
  });
  return users.map((user) => user.id);
}

interface ResumatchResult {
  rows: AuditStreamRow[];
  total: number;
  actions: string[];
}

async function fetchResumatch(filters: AuditFilters, need: number): Promise<ResumatchResult | null> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return null;
  const base = process.env.NEXT_PUBLIC_RESUMATCH_URL ?? "http://localhost:3012";

  const params = new URLSearchParams();
  if (filters.action) params.set("action", filters.action);
  if (filters.from) params.set("from", `${filters.from}T00:00:00.000Z`);
  if (filters.to) params.set("to", `${filters.to}T23:59:59.999Z`);
  if (filters.actor) {
    // ResuMatch holds no emails: resolve "actor email contains …" here. An
    // empty list is sent as-is and means "nobody matched".
    params.set("platformUserIds", (await userIdsWithEmailContaining(filters.actor)).join(","));
  }
  if (filters.q) {
    params.set("q", filters.q);
    params.set("qPlatformUserIds", (await userIdsWithEmailContaining(filters.q)).join(","));
  }

  const events: ResumatchAuditEventDto[] = [];
  let total = 0;
  let actions: string[] = [];
  let cursor: string | null = null;
  try {
    do {
      const url = new URL("/api/internal/audit-events", base);
      for (const [key, value] of params) url.searchParams.set(key, value);
      url.searchParams.set("limit", String(Math.min(RESUMATCH_BATCH, Math.max(1, need - events.length))));
      if (cursor) url.searchParams.set("cursor", cursor);

      const response = await fetch(url, {
        headers: { authorization: `Bearer ${secret}` },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as {
        events?: ResumatchAuditEventDto[];
        nextCursor?: string | null;
        actions?: string[];
        total?: number;
      };
      events.push(...(body.events ?? []));
      actions = body.actions ?? actions;
      // A ResuMatch deploy older than `total` still pages correctly; the
      // count then only covers what was fetched.
      total = body.total ?? events.length;
      cursor = body.nextCursor ?? null;
    } while (cursor && events.length < need);
  } catch {
    return null;
  }

  const userIds = [...new Set(events.map((e) => e.platformUserId).filter((id): id is string => Boolean(id)))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })
    : [];
  const userById = new Map(users.map((user) => [user.id, user]));

  return { rows: events.slice(0, need).map((event) => resumatchRow(event, userById)), total, actions };
}

export interface AuditStreamPage {
  rows: AuditStreamRow[];
  total: number;
  actions: string[];
  entities: string[];
  resumatchUnavailable: boolean;
}

/**
 * The rows for one page (or, with `limit`, the newest `limit` rows for an
 * export), plus the filter-dropdown options from both sources. Throws only
 * if the platform database itself fails.
 */
export async function loadAuditStream(
  filters: AuditFilters,
  options: { pageSize: number } | { limit: number },
): Promise<AuditStreamPage> {
  const page = "limit" in options ? 1 : filters.page;
  const pageSize = "limit" in options ? options.limit : options.pageSize;
  const need = page * pageSize;
  const want = sourcesFor(filters);
  const where = buildAuditWhere(filters);

  const [platformRows, platformTotal, platformActions, platformEntities, resumatch] = await Promise.all([
    want.platform
      ? prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: need, select: PLATFORM_SELECT })
      : Promise.resolve([]),
    want.platform ? prisma.auditLog.count({ where }) : Promise.resolve(0),
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }),
    // The actions dropdown needs ResuMatch's action names even when its rows
    // are filtered out, so it's always asked (for no rows, when excluded).
    fetchResumatch(filters, want.resumatch ? need : 1),
  ]);

  const platform: AuditStreamRow[] = platformRows.map((row) => ({
    ...row,
    source: "platform",
    summary: null,
  }));
  const resumatchRows = want.resumatch && resumatch ? resumatch.rows : [];

  return {
    rows: mergeAuditPage([platform, resumatchRows], page, pageSize),
    total: platformTotal + (want.resumatch && resumatch ? resumatch.total : 0),
    actions: [...new Set([...platformActions.map((a) => a.action), ...(resumatch?.actions ?? [])])].sort(),
    entities: [...new Set([...platformEntities.map((e) => e.entity), "ResuMatch"])].sort(),
    resumatchUnavailable: want.resumatch && resumatch === null,
  };
}
