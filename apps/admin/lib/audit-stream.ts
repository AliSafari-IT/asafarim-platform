import { describeResumatchEvent } from "./resumatch-audit";

/**
 * One row of the unified Audit Logs stream (/audit-logs): either a platform
 * `AuditLog` row or a ResuMatch audit event. ResuMatch keeps its audit
 * trail in its own isolated database (docs/architecture.md, "Database
 * Strategy"), so its events are fetched over its internal API and mapped
 * into this shape; this module holds the pure parts of that, so they're
 * unit tested on their own.
 */

export type AuditSource = "platform" | "resumatch";

export const AUDIT_SOURCES: { value: AuditSource; label: string }[] = [
  { value: "platform", label: "platform" },
  { value: "resumatch", label: "ResuMatch" },
];

/** The `entity` every ResuMatch row carries, so the "target" filter can select them. */
export const RESUMATCH_ENTITY = "ResuMatch";

export interface AuditStreamRow {
  /** Unique across sources: ResuMatch ids are prefixed. */
  id: string;
  source: AuditSource;
  action: string;
  entity: string;
  entityId: string | null;
  changes: unknown;
  ipAddress: string | null;
  createdAt: Date;
  user: { id: string; email: string } | null;
  /** A plain-English line for the Detail column, when there's one. */
  summary: string | null;
}

/** Wire shape of one event from ResuMatch's /api/internal/audit-events. */
export interface ResumatchAuditEventDto {
  id: string;
  workspaceId: string | null;
  platformUserId?: string | null;
  action: string;
  metadata: unknown;
  createdAt: string;
}

/** Metadata keys naming the thing an event is about, most specific first. */
const TARGET_KEYS = ["applicationId", "coverLetterId", "tailoringId", "targetJobId", "jobId"] as const;

export function resumatchTargetId(metadata: unknown, workspaceId: string | null): string | null {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    for (const key of TARGET_KEYS) {
      const value = (metadata as Record<string, unknown>)[key];
      if (typeof value === "string" && value) return value;
    }
  }
  return workspaceId;
}

export function resumatchRow(
  event: ResumatchAuditEventDto,
  users: Map<string, { id: string; email: string }>,
): AuditStreamRow {
  const user = event.platformUserId ? users.get(event.platformUserId) : undefined;
  return {
    id: `resumatch:${event.id}`,
    source: "resumatch",
    action: event.action,
    entity: RESUMATCH_ENTITY,
    entityId: resumatchTargetId(event.metadata, event.workspaceId),
    changes: event.metadata ?? null,
    ipAddress: null,
    createdAt: new Date(event.createdAt),
    // A platform user deleted since still has a known id; show it rather than "system".
    user: user ?? (event.platformUserId ? { id: event.platformUserId, email: event.platformUserId } : null),
    summary: describeResumatchEvent(event.action, event.metadata),
  };
}

/**
 * One page of the merged stream. Each source hands over its newest
 * `page * pageSize` matching rows (enough to fill this page whatever the
 * interleaving), and this keeps the slice for `page`. Ties on createdAt are
 * broken by id, so the order is stable across pages.
 */
export function mergeAuditPage(sources: AuditStreamRow[][], page: number, pageSize: number): AuditStreamRow[] {
  return sources
    .flat()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    .slice((page - 1) * pageSize, page * pageSize);
}

/** Which sources a set of filters can match at all. */
export function sourcesFor(filters: { source: string; entity: string }): { platform: boolean; resumatch: boolean } {
  const platform = filters.source !== "resumatch" && filters.entity !== RESUMATCH_ENTITY;
  const resumatch = filters.source !== "platform" && (!filters.entity || filters.entity === RESUMATCH_ENTITY);
  return { platform, resumatch };
}
