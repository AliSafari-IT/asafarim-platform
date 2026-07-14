import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@asafarim/db";
import { ROLES, hasPermission, requireRole } from "@asafarim/auth";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  PageHeader,
  type BadgeTone,
} from "@asafarim/ui";

export const metadata: Metadata = { title: "Audit Logs" };

const PAGE_SIZE = 25;

function formatDateTime(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function actionTone(action: string): BadgeTone {
  if (action.includes("denied") || action.includes("deleted")) return "danger";
  if (action.includes("deactivated") || action.includes("removed")) {
    return "warning";
  }
  return "info";
}

interface Filters {
  q: string;
  action: string;
  entity: string;
  actor: string;
  from: string;
  to: string;
  page: number;
}

function buildWhere(filters: Filters) {
  const createdAt: { gte?: Date; lte?: Date } = {};
  if (filters.from) createdAt.gte = new Date(`${filters.from}T00:00:00Z`);
  if (filters.to) createdAt.lte = new Date(`${filters.to}T23:59:59Z`);

  return {
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entity ? { entity: filters.entity } : {}),
    ...(filters.actor
      ? {
          user: {
            email: { contains: filters.actor, mode: "insensitive" as const },
          },
        }
      : {}),
    ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    ...(filters.q
      ? {
          OR: [
            { action: { contains: filters.q, mode: "insensitive" as const } },
            { entity: { contains: filters.q, mode: "insensitive" as const } },
            { entityId: { contains: filters.q, mode: "insensitive" as const } },
            {
              user: {
                email: { contains: filters.q, mode: "insensitive" as const },
              },
            },
          ],
        }
      : {}),
  };
}

async function getAuditData(filters: Filters) {
  try {
    const where = buildWhere(filters);
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

function pageHref(filters: Filters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.action) params.set("action", filters.action);
  if (filters.entity) params.set("entity", filters.entity);
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/audit-logs?${qs}` : "/audit-logs";
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
  const filters: Filters = {
    q: (params.q ?? "").trim(),
    action: (params.action ?? "").trim(),
    entity: (params.entity ?? "").trim(),
    actor: (params.actor ?? "").trim(),
    from: (params.from ?? "").trim(),
    to: (params.to ?? "").trim(),
    page: Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1),
  };
  const hasFilters = Boolean(
    filters.q || filters.action || filters.entity || filters.actor || filters.from || filters.to
  );

  const data = await getAuditData(filters);

  return (
    <>
      <PageHeader
        kicker="Event stream"
        kickerIndex="LOG"
        title="Audit Logs"
        description="Immutable administrative and security events, newest first. Sensitive values are redacted at write time; entries cannot be edited or deleted here."
      />

      {data === null ? (
        <EmptyState
          glyph="[db]"
          title="Database unreachable"
          description="The audit stream could not be loaded. Check the database connection and reload."
        />
      ) : (
        <>
          <form
            method="GET"
            action="/audit-logs"
            style={{
              display: "flex",
              gap: "var(--space-3)",
              flexWrap: "wrap",
              alignItems: "end",
              marginBottom: "var(--space-4)",
            }}
          >
            <div style={{ flex: "1 1 14rem", maxWidth: "22rem" }}>
              <label className="u-mono" htmlFor="audit-q">
                search
              </label>
              <Input
                id="audit-q"
                type="search"
                name="q"
                defaultValue={filters.q}
                placeholder="action, entity, id, actor…"
              />
            </div>
            <div>
              <label className="u-mono" htmlFor="audit-action">
                action
              </label>
              <select
                id="audit-action"
                name="action"
                defaultValue={filters.action}
                className="ui-input"
              >
                <option value="">all</option>
                {data.actions.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="u-mono" htmlFor="audit-entity">
                target
              </label>
              <select
                id="audit-entity"
                name="entity"
                defaultValue={filters.entity}
                className="ui-input"
              >
                <option value="">all</option>
                {data.entities.map((entity) => (
                  <option key={entity} value={entity}>
                    {entity}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ maxWidth: "12rem" }}>
              <label className="u-mono" htmlFor="audit-actor">
                actor
              </label>
              <Input
                id="audit-actor"
                name="actor"
                defaultValue={filters.actor}
                placeholder="email contains…"
              />
            </div>
            <div>
              <label className="u-mono" htmlFor="audit-from">
                from
              </label>
              <Input
                id="audit-from"
                type="date"
                name="from"
                defaultValue={filters.from}
              />
            </div>
            <div>
              <label className="u-mono" htmlFor="audit-to">
                to
              </label>
              <Input id="audit-to" type="date" name="to" defaultValue={filters.to} />
            </div>
            <Button type="submit" variant="console" size="sm">
              filter
            </Button>
            {hasFilters ? (
              <a href="/audit-logs" className="ui-btn ui-btn--ghost ui-btn--sm">
                clear
              </a>
            ) : null}
          </form>

          {data.events.length === 0 ? (
            <EmptyState
              glyph="> _"
              title={hasFilters ? "No matching events" : "No events recorded yet"}
              description={
                hasFilters
                  ? "Nothing in the audit stream matches these filters."
                  : "The audit stream is armed — administrative actions will appear here as they happen."
              }
            />
          ) : (
            <>
              <div className="ui-tablewrap">
                <table className="ui-table">
                  <thead>
                    <tr>
                      <th>Timestamp (UTC)</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Target</th>
                      <th>IP</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.map((event) => (
                      <tr key={event.id}>
                        <td className="u-mono">{formatDateTime(event.createdAt)}</td>
                        <td>
                          {event.user ? (
                            <a
                              href={`/users/${event.user.id}`}
                              className="ui-table__link"
                            >
                              {event.user.email}
                            </a>
                          ) : (
                            <span className="u-muted">system</span>
                          )}
                        </td>
                        <td>
                          <Badge tone={actionTone(event.action)}>
                            {event.action}
                          </Badge>
                        </td>
                        <td className="u-mono">
                          {event.entity}
                          {event.entityId ? (
                            <span className="ui-table__sub">{event.entityId}</span>
                          ) : null}
                        </td>
                        <td className="u-mono">{event.ipAddress ?? "—"}</td>
                        <td>
                          {event.changes ? (
                            <details>
                              <summary
                                className="u-mono"
                                style={{ cursor: "pointer" }}
                              >
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
                          ) : (
                            <span className="u-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--space-3)",
                  flexWrap: "wrap",
                  marginTop: "var(--space-4)",
                }}
              >
                <span className="u-mono">
                  {data.total} event{data.total === 1 ? "" : "s"} · page{" "}
                  {filters.page} of {Math.max(1, Math.ceil(data.total / PAGE_SIZE))}
                </span>
                <span className="ui-chips">
                  {filters.page > 1 ? (
                    <a
                      href={pageHref(filters, filters.page - 1)}
                      className="ui-btn ui-btn--console ui-btn--sm"
                    >
                      ← prev
                    </a>
                  ) : null}
                  {filters.page * PAGE_SIZE < data.total ? (
                    <a
                      href={pageHref(filters, filters.page + 1)}
                      className="ui-btn ui-btn--console ui-btn--sm"
                    >
                      next →
                    </a>
                  ) : null}
                </span>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
