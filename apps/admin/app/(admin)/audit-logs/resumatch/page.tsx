import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@asafarim/db";
import { ROLES, hasPermission, requireRole } from "@asafarim/auth";
import {
  Badge,
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  type ColumnDef,
} from "@asafarim/ui";
import { describeResumatchEvent, resumatchActionTone } from "../../../../lib/resumatch-audit";

export const metadata: Metadata = { title: "ResuMatch Audit Events" };

/**
 * ResuMatch's own audit trail (recordAuditEvent, apps/resumatch/lib/
 * workspace.ts), read through its bearer-gated internal API rather than a
 * direct DB connection — ResuMatch runs on its own isolated Postgres
 * instance, and the admin console never holds a second app's DB
 * credentials (issue #301's "adapters, not mega-joins" principle, applied
 * here to ResuMatch's raw audit stream rather than its user-activity feed).
 *
 * ResuMatch only knows an opaque platform user id per workspace; it's
 * resolved to an email here against the platform's own user table, the
 * same way packages/activity's remote adapter resolves owners.
 */

interface AuditEventDto {
  id: string;
  workspaceId: string | null;
  /** Absent from a ResuMatch deploy older than this page. */
  platformUserId?: string | null;
  action: string;
  metadata: unknown;
  createdAt: string;
}

interface AuditEventsResponse {
  events: AuditEventDto[];
  nextCursor: string | null;
  actions: string[];
}

function formatDateTime(iso: string): string {
  return iso.replace("T", " ").slice(0, 19);
}

async function getAuditEvents(params: {
  workspaceId?: string;
  userId?: string;
  action?: string;
  cursor?: string;
}): Promise<AuditEventsResponse | null> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return null;

  const base = process.env.NEXT_PUBLIC_RESUMATCH_URL ?? "http://localhost:3012";
  const url = new URL("/api/internal/audit-events", base);
  if (params.workspaceId) url.searchParams.set("workspaceId", params.workspaceId);
  if (params.userId) url.searchParams.set("platformUserId", params.userId);
  if (params.action) url.searchParams.set("action", params.action);
  if (params.cursor) url.searchParams.set("cursor", params.cursor);
  url.searchParams.set("limit", "50");

  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<AuditEventsResponse>;
    // Defensive against a rolling deploy where this route ships before
    // ResuMatch's own (the `actions` field is new) — never crash the page
    // on it, just show an empty filter dropdown for that one request.
    return {
      events: body.events ?? [],
      nextCursor: body.nextCursor ?? null,
      actions: body.actions ?? [],
    };
  } catch {
    return null;
  }
}

export default async function ResuMatchAuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireRole([ROLES.ADMIN]);
  if (!(await hasPermission(session, "audit.view"))) {
    redirect("/denied");
  }

  const params = await searchParams;
  const data = await getAuditEvents({
    workspaceId: params.workspaceId,
    userId: params.userId,
    action: params.action,
    cursor: params.cursor,
  });
  const hasFilters = Boolean(params.workspaceId || params.userId || params.action);

  const userIds = [
    ...new Set((data?.events ?? []).map((event) => event.platformUserId).filter((id): id is string => Boolean(id))),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true } })
    : [];
  const userById = new Map(users.map((user) => [user.id, user]));

  const columns: ColumnDef<AuditEventDto>[] = [
    {
      id: "timestamp",
      header: "Timestamp (UTC)",
      mono: true,
      nowrap: true,
      render: (event) => formatDateTime(event.createdAt),
    },
    {
      id: "user",
      header: "User",
      render: (event) => {
        const user = event.platformUserId ? userById.get(event.platformUserId) : undefined;
        if (event.platformUserId) {
          return (
            <a href={`/users/${event.platformUserId}`} className="ui-table__link" title={`Workspace ${event.workspaceId ?? "—"}`}>
              {user?.email ?? user?.name ?? event.platformUserId}
            </a>
          );
        }
        return event.workspaceId ? (
          <span className="u-mono u-muted">{event.workspaceId}</span>
        ) : (
          <span className="u-muted">—</span>
        );
      },
    },
    {
      id: "action",
      header: "Action",
      render: (event) => (
        <Badge tone={resumatchActionTone(event.action, event.metadata)}>{event.action}</Badge>
      ),
    },
    {
      id: "summary",
      header: "What happened",
      render: (event) => describeResumatchEvent(event.action, event.metadata) ?? <span className="u-muted">—</span>,
    },
    {
      id: "detail",
      header: "Detail",
      render: (event) =>
        event.metadata && Object.keys(event.metadata as object).length > 0 ? (
          <details>
            <summary className="u-mono" style={{ cursor: "pointer" }}>
              metadata
            </summary>
            <pre
              style={{
                margin: "var(--space-2) 0 0",
                padding: "var(--space-2)",
                background: "var(--surface-2)",
                borderRadius: "var(--radius-xs)",
                fontSize: "var(--text-xs)",
                maxWidth: "24rem",
                overflowX: "auto",
              }}
            >
              {JSON.stringify(event.metadata, null, 2)}
            </pre>
          </details>
        ) : (
          <span className="u-muted">—</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        kicker="Event stream"
        kickerIndex="RESUMATCH"
        title="ResuMatch Audit Events"
        description="ResuMatch's own audit trail — uploads, scans, profile changes, tailored CVs and cover letters, applications and their status changes (applied, interviewing, offer, rejected), and deletions — read live from its isolated database through its internal API. Newest first."
      />

      {data === null ? (
        <EmptyState
          glyph="[api]"
          title="ResuMatch audit feed unreachable"
          description="Could not reach ResuMatch's internal API. Check INTERNAL_API_SECRET and NEXT_PUBLIC_RESUMATCH_URL are set the same way in both apps, and that ResuMatch is reachable from this deployment."
        />
      ) : (
        <>
          <FilterBar
            action="/audit-logs/resumatch"
            hasFilters={hasFilters}
            clearHref="/audit-logs/resumatch"
            fields={[
              {
                kind: "text",
                name: "userId",
                label: "user",
                value: params.userId ?? "",
                placeholder: "platform user id…",
                width: 14,
              },
              {
                kind: "text",
                name: "workspaceId",
                label: "workspace",
                value: params.workspaceId ?? "",
                placeholder: "workspace id…",
                width: 14,
              },
              {
                kind: "select",
                name: "action",
                label: "action",
                value: params.action ?? "",
                options: [
                  { value: "", label: "all" },
                  ...data.actions.map((action) => ({ value: action, label: action })),
                ],
              },
            ]}
          />

          <DataTable
            columns={columns}
            rows={data.events}
            getRowKey={(event) => event.id}
            caption="ResuMatch audit event stream"
            empty={
              <EmptyState
                glyph="> _"
                title="No events recorded yet"
                description="ResuMatch's audit stream is armed — candidate actions will appear here as they happen."
              />
            }
          />

          {data.nextCursor ? (
            <p style={{ marginTop: "var(--space-3)" }}>
              <a
                href={`/audit-logs/resumatch?${new URLSearchParams({
                  ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
                  ...(params.userId ? { userId: params.userId } : {}),
                  ...(params.action ? { action: params.action } : {}),
                  cursor: data.nextCursor,
                }).toString()}`}
              >
                Older events →
              </a>
            </p>
          ) : null}
        </>
      )}
    </>
  );
}
