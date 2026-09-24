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
  Pagination,
  type BadgeTone,
  type ColumnDef,
} from "@asafarim/ui";
import {
  PAGE_SIZE,
  auditHref,
  auditQueryString,
  buildAuditWhere,
  hasAuditFilters,
  parseAuditFilters,
  type AuditFilters,
} from "./query";

export const metadata: Metadata = { title: "Audit Logs" };

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  changes: unknown;
  ipAddress: string | null;
  createdAt: Date;
  user: { id: string; email: string } | null;
}

function formatDateTime(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Detects the masked `{ from, to }` shape `updatePlatformSetting` /
 * `resetPlatformSetting` write for a `secret`-typed setting (see
 * apps/admin/app/(admin)/settings/actions.ts) so the viewer can show a
 * plain "secret changed" line instead of expanding a two-key JSON blob
 * that would otherwise read as a broken/truncated diff.
 */
const SECRET_CHANGE_VALUES = new Set(["(secret set)", "(unset)"]);
function secretChangeSummary(changes: unknown): string | null {
  if (typeof changes !== "object" || changes === null) return null;
  const { from, to } = changes as { from?: unknown; to?: unknown };
  if (!SECRET_CHANGE_VALUES.has(from as string) || !SECRET_CHANGE_VALUES.has(to as string)) {
    return null;
  }
  if (from === "(unset)" && to === "(secret set)") return "secret set";
  if (from === "(secret set)" && to === "(unset)") return "secret cleared";
  return "secret changed";
}

function actionTone(action: string): BadgeTone {
  if (action.includes("denied") || action.includes("deleted")) return "danger";
  if (action.includes("deactivated") || action.includes("removed")) return "warning";
  return "info";
}

async function getAuditData(filters: AuditFilters) {
  try {
    const where = buildAuditWhere(filters);
    const [events, total, actions, entities] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          changes: true,
          ipAddress: true,
          createdAt: true,
          user: { select: { id: true, email: true } },
        },
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        distinct: ["action"],
        select: { action: true },
        orderBy: { action: "asc" },
      }),
      prisma.auditLog.findMany({
        distinct: ["entity"],
        select: { entity: true },
        orderBy: { entity: "asc" },
      }),
    ]);
    return {
      events,
      total,
      actions: actions.map((a) => a.action),
      entities: entities.map((e) => e.entity),
    };
  } catch {
    return null;
  }
}

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireRole([ROLES.ADMIN]);
  if (!(await hasPermission(session, "audit.view"))) {
    redirect("/denied");
  }

  const params = await searchParams;
  const filters = parseAuditFilters(params);
  const hasFilters = hasAuditFilters(filters);
  const data = await getAuditData(filters);

  const columns: ColumnDef<AuditRow>[] = [
    {
      id: "timestamp",
      header: "Timestamp (UTC)",
      mono: true,
      nowrap: true,
      render: (event) => formatDateTime(event.createdAt),
    },
    {
      id: "actor",
      header: "Actor",
      render: (event) =>
        event.user ? (
          <a href={`/users/${event.user.id}`} className="ui-table__link">
            {event.user.email}
          </a>
        ) : (
          <span className="u-muted">system</span>
        ),
    },
    {
      id: "action",
      header: "Action",
      render: (event) => <Badge tone={actionTone(event.action)}>{event.action}</Badge>,
    },
    {
      id: "target",
      header: "Target",
      mono: true,
      render: (event) => (
        <>
          {event.entity}
          {event.entityId ? <span className="ui-table__sub">{event.entityId}</span> : null}
        </>
      ),
    },
    {
      id: "ip",
      header: "IP",
      mono: true,
      nowrap: true,
      render: (event) => event.ipAddress ?? "—",
    },
    {
      id: "detail",
      header: "Detail",
      render: (event) => {
        if (!event.changes) return <span className="u-muted">—</span>;

        const secretSummary = secretChangeSummary(event.changes);
        if (secretSummary) {
          // The actual before/after is masked at the source (never even the
          // encrypted envelope — see actions.ts) — there is nothing more
          // specific to reveal, so this renders as a plain line rather than
          // an expandable two-key JSON blob that would look like a
          // truncated/broken diff.
          return <span className="u-mono">{secretSummary}</span>;
        }

        return (
          <details>
            <summary className="u-mono" style={{ cursor: "pointer" }}>
              changes
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
              {JSON.stringify(event.changes, null, 2)}
            </pre>
          </details>
        );
      },
    },
  ];

  const exportQs = auditQueryString(filters, { page: 1 });

  return (
    <>
      <PageHeader
        kicker="Event stream"
        kickerIndex="LOG"
        title="Audit Logs"
        description="Immutable administrative and security events, newest first. Sensitive values are redacted at write time; entries cannot be edited or deleted here."
      />

      <p style={{ margin: "0 0 var(--space-4)" }}>
        Looking for candidate activity instead?{" "}
        <a href="/audit-logs/resumatch">ResuMatch audit events →</a>
      </p>

      {data === null ? (
        <EmptyState
          glyph="[db]"
          title="Database unreachable"
          description="The audit stream could not be loaded. Check the database connection and reload."
        />
      ) : (
        <>
          <FilterBar
            action="/audit-logs"
            hasFilters={hasFilters}
            clearHref="/audit-logs"
            fields={[
              {
                kind: "search",
                name: "q",
                label: "search",
                value: filters.q,
                placeholder: "action, entity, id, actor…",
                width: 14,
              },
              {
                kind: "select",
                name: "action",
                label: "action",
                value: filters.action,
                options: [
                  { value: "", label: "all" },
                  ...data.actions.map((action) => ({ value: action, label: action })),
                ],
              },
              {
                kind: "select",
                name: "entity",
                label: "target",
                value: filters.entity,
                options: [
                  { value: "", label: "all" },
                  ...data.entities.map((entity) => ({ value: entity, label: entity })),
                ],
              },
              {
                kind: "text",
                name: "actor",
                label: "actor",
                value: filters.actor,
                placeholder: "email contains…",
                width: 8,
              },
              { kind: "date", name: "from", label: "from", value: filters.from },
              { kind: "date", name: "to", label: "to", value: filters.to },
            ]}
          />

          <DataTable
            columns={columns}
            rows={data.events}
            getRowKey={(event) => event.id}
            caption="Audit event stream"
            empty={
              <EmptyState
                glyph="> _"
                title={hasFilters ? "No matching events" : "No events recorded yet"}
                description={
                  hasFilters
                    ? "Nothing in the audit stream matches these filters."
                    : "The audit stream is armed — administrative actions will appear here as they happen."
                }
              />
            }
          />

          {data.events.length > 0 ? (
            <Pagination
              page={filters.page}
              pageSize={PAGE_SIZE}
              total={data.total}
              noun="event"
              hrefFor={(page) => auditHref(filters, { page })}
              actions={
                <a href={exportQs ? `/audit-logs/export?${exportQs}` : "/audit-logs/export"}>
                  export csv
                </a>
              }
            />
          ) : null}
        </>
      )}
    </>
  );
}
