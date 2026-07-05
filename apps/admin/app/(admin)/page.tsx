import { prisma } from "@asafarim/db";
import { Metric, PageHeader, Panel, Section } from "@asafarim/ui";

async function getSystemCounts() {
  try {
    const [users, roles, permissions, auditEvents] = await Promise.all([
      prisma.user.count(),
      prisma.role.count(),
      prisma.permission.count(),
      prisma.auditLog.count(),
    ]);
    return { users, roles, permissions, auditEvents, online: true };
  } catch {
    return { users: "—", roles: "—", permissions: "—", auditEvents: "—", online: false };
  }
}

const sections = [
  { title: "users", body: "Accounts, activation, role assignment.", href: "/users" },
  { title: "roles", body: "Role definitions and grants.", href: "/roles" },
  { title: "permissions", body: "The permission catalog per group.", href: "/permissions" },
  { title: "audit-logs", body: "The system event stream.", href: "/audit-logs" },
  { title: "settings", body: "Platform-wide configuration.", href: "/settings" },
];

export default async function AdminOverviewPage() {
  const counts = await getSystemCounts();

  return (
    <>
      <PageHeader
        kicker="System status"
        kickerIndex="SYS"
        title="Overview"
        description="Live counts from the platform database. System access is limited to authorized roles."
      />

      <div className="ui-grid ui-grid--metrics">
        <Metric label="Users" value={counts.users} hint="registered accounts" />
        <Metric label="Roles" value={counts.roles} hint="system + custom" />
        <Metric label="Permissions" value={counts.permissions} hint="catalog entries" />
        <Metric label="Audit events" value={counts.auditEvents} hint="recorded" />
        <Metric
          label="Database"
          value={counts.online ? "Online" : "Offline"}
          hint={counts.online ? "postgresql · reachable" : "connection failed"}
        />
      </div>

      <Section kicker="Control surfaces" kickerIndex="01">
        <div className="ui-grid">
          {sections.map((section) => (
            <a key={section.href} href={section.href} style={{ textDecoration: "none" }}>
              <Panel title={section.title}>
                <span className="u-muted">{section.body}</span>
              </Panel>
            </a>
          ))}
        </div>
      </Section>
    </>
  );
}
