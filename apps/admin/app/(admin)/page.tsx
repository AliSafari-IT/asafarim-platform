import { prisma } from "@asafarim/db";
import {
  PLATFORM_APPS,
  ROLES,
  getAppAccessDecision,
  requireRole,
  type PlatformApp,
} from "@asafarim/auth";
import {
  Badge,
  DataTable,
  EmptyState,
  Metric,
  PageHeader,
  Panel,
  Section,
  getPlatformLinks,
  type BadgeTone,
  type ColumnDef,
} from "@asafarim/ui";
import { getQueueDepths, type QueueDepth } from "../../lib/server/queue-depth";

/** The board reflects live counts and a live queue probe on every load. */
export const dynamic = "force-dynamic";

interface PlatformCounts {
  users: number;
  activeUsers: number;
  roles: number;
  permissions: number;
  auditEvents: number;
  auditToday: number;
  online: boolean;
}

async function getPlatformCounts(): Promise<PlatformCounts> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  try {
    const [users, activeUsers, roles, permissions, auditEvents, auditToday] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { isActive: true } }),
        prisma.role.count(),
        prisma.permission.count(),
        prisma.auditLog.count(),
        prisma.auditLog.count({ where: { createdAt: { gte: startOfDay } } }),
      ]);
    return {
      users,
      activeUsers,
      roles,
      permissions,
      auditEvents,
      auditToday,
      online: true,
    };
  } catch {
    return {
      users: 0,
      activeUsers: 0,
      roles: 0,
      permissions: 0,
      auditEvents: 0,
      auditToday: 0,
      online: false,
    };
  }
}

async function getRecentActivity() {
  try {
    return await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        action: true,
        entity: true,
        createdAt: true,
        user: { select: { email: true } },
      },
    });
  } catch {
    return null;
  }
}

function statusTone(app: PlatformApp): BadgeTone {
  if (app.status !== "active") return "neutral";
  return "success";
}

/** Plain-language summary of the registry's access rule for an app. */
function accessSummary(app: PlatformApp): string {
  if (app.access === null) return "closed";
  if (app.access === "public") return "public";
  if (app.access === "authenticated") return "signed in";
  return app.access.join(", ");
}

function relativeTime(date: Date): string {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default async function AdminOverviewPage() {
  const session = await requireRole([ROLES.ADMIN]);
  const roles = session.user.roles ?? [];

  const [counts, activity, queues] = await Promise.all([
    getPlatformCounts(),
    getRecentActivity(),
    getQueueDepths(),
  ]);

  // Registry keys and link keys line up by design, but an app can be
  // registered before its URL exists — hence the lookup rather than an index.
  const links = getPlatformLinks();
  const linkFor = (key: string): string | undefined =>
    key in links ? links[key as keyof typeof links] : undefined;

  const appColumns: ColumnDef<PlatformApp>[] = [
    {
      id: "app",
      header: "App",
      render: (app) => {
        const href = linkFor(app.key);
        return (
          <span className="ui-table__primary">
            {href ? (
              <a href={href} className="ui-table__link" target="_blank" rel="noreferrer">
                {app.name}
              </a>
            ) : (
              app.name
            )}
            <span className="ui-table__sub">{app.meta}</span>
          </span>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      render: (app) => <Badge tone={statusTone(app)}>{app.status}</Badge>,
    },
    {
      id: "access",
      header: "Access rule",
      mono: true,
      render: (app) => accessSummary(app),
    },
    {
      id: "you",
      header: "Your access",
      render: (app) => {
        const decision = getAppAccessDecision(app, { roles, authenticated: true });
        return (
          <Badge tone={decision.allowed ? "success" : "neutral"}>
            {decision.reason}
          </Badge>
        );
      },
    },
    {
      id: "showcase",
      header: "Positioning",
      render: (app) =>
        app.showcase ? (
          <Badge tone="info">showcase</Badge>
        ) : (
          <span className="u-muted">—</span>
        ),
    },
  ];

  const queueColumns: ColumnDef<QueueDepth>[] = [
    {
      id: "queue",
      header: "Queue",
      render: (row) => (
        <span className="ui-table__primary">
          {row.queue}
          <span className="ui-table__sub">{row.app}</span>
        </span>
      ),
    },
    { id: "waiting", header: "Waiting", mono: true, align: "right", render: (r) => r.waiting },
    { id: "active", header: "Active", mono: true, align: "right", render: (r) => r.active },
    { id: "delayed", header: "Delayed", mono: true, align: "right", render: (r) => r.delayed },
    {
      id: "failed",
      header: "Failed",
      mono: true,
      align: "right",
      render: (row) =>
        row.failed > 0 ? <Badge tone="danger">{row.failed}</Badge> : <span>0</span>,
    },
    {
      id: "kind",
      header: "Durability",
      render: (row) =>
        row.advisory ? (
          <Badge tone="neutral">wake-up signal</Badge>
        ) : (
          <Badge tone="info">durable queue</Badge>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        kicker="Platform status"
        kickerIndex="SYS"
        title="Overview"
        description="One board for the whole platform: shared-database counts, the app registry and its access rules, background worker queues, and the newest administrative events."
      />

      <div className="ui-grid ui-grid--metrics">
        <Metric
          label="Users"
          value={counts.online ? counts.users : "—"}
          hint={counts.online ? `${counts.activeUsers} active` : "unavailable"}
        />
        <Metric label="Roles" value={counts.online ? counts.roles : "—"} hint="system + custom" />
        <Metric
          label="Permissions"
          value={counts.online ? counts.permissions : "—"}
          hint="catalog entries"
        />
        <Metric
          label="Audit events"
          value={counts.online ? counts.auditEvents : "—"}
          hint={counts.online ? `${counts.auditToday} today` : "unavailable"}
        />
        <Metric
          label="Apps"
          value={PLATFORM_APPS.length}
          hint={`${PLATFORM_APPS.filter((app) => app.status === "active").length} active`}
        />
        <Metric
          label="Database"
          value={counts.online ? "Online" : "Offline"}
          hint={counts.online ? "postgresql · reachable" : "connection failed"}
        />
      </div>

      <Section kicker="App registry" kickerIndex="01">
        <p className="u-muted" style={{ fontSize: "var(--text-sm)" }}>
          Registry state and access rules — not a liveness check. &ldquo;Your
          access&rdquo; is the deterministic reason this session would be
          allowed or refused entry to each app.
        </p>
        <DataTable
          columns={appColumns}
          rows={[...PLATFORM_APPS]}
          getRowKey={(app) => app.key}
          caption="Platform app registry"
        />
      </Section>

      <Section kicker="Worker queues" kickerIndex="02">
        {queues.state === "not_configured" ? (
          <EmptyState
            glyph="[q]"
            title="Queue probe not configured"
            description="Set REDIS_URL in apps/admin/.env to read BullMQ depths for the Vionto render pipeline and the AppBuilder generation workers. The console only reads these queues; it never enqueues, retries, or drains them."
          />
        ) : queues.state === "error" ? (
          <EmptyState
            glyph="[!]"
            title="Could not reach Redis"
            description={queues.message}
          />
        ) : (
          <>
            <p className="u-muted" style={{ fontSize: "var(--text-sm)" }}>
              AppBuilder&apos;s queues are low-latency wake-up signals —
              Postgres holds the durable job state there, so depth means
              latency rather than backlog. Vionto&apos;s render queue is the
              durable one.
            </p>
            <DataTable
              columns={queueColumns}
              rows={queues.queues}
              getRowKey={(row) => row.queue}
              caption="Background worker queue depths"
              nowrap
            />
          </>
        )}
      </Section>

      <Section kicker="Newest events" kickerIndex="03">
        {activity === null || activity.length === 0 ? (
          <EmptyState
            glyph="> _"
            title="No events yet"
            description="Administrative actions appear here as they happen."
          />
        ) : (
          <Panel
            title="recent activity"
            actions={
              <a href="/audit-logs" className="ui-btn ui-btn--ghost ui-btn--sm">
                full stream
              </a>
            }
          >
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {activity.map((event) => (
                <li
                  key={event.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "var(--space-3)",
                    padding: "var(--space-2) 0",
                    borderBottom: "1px solid var(--line)",
                    fontSize: "var(--text-sm)",
                    flexWrap: "wrap",
                  }}
                >
                  <span>
                    <span className="u-mono">{event.action}</span> · {event.entity}
                  </span>
                  <span className="u-mono">
                    {event.user?.email ?? "system"} · {relativeTime(event.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </Section>
    </>
  );
}
