import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@asafarim/db";
import {
  PLATFORM_APPS,
  ROLES,
  canAccessApp,
  getAccessibleApps,
  getUserPermissions,
  hasPermission,
  requireRole,
} from "@asafarim/auth";
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  Timeline,
  getPlatformLinks,
  type BadgeTone,
} from "@asafarim/ui";
import { IdentityForm } from "./_components/IdentityForm";
import { StatusControls } from "./_components/StatusControls";
import { RoleControls } from "./_components/RoleControls";

export const metadata: Metadata = { title: "User detail" };

function roleTone(role: string): BadgeTone {
  if (role === ROLES.SUPERADMIN) return "danger";
  if (role === ROLES.ADMIN) return "info";
  return "neutral";
}

function formatDateTime(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 16);
}

async function getUserDetail(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      emailVerified: true,
      image: true,
      password: true,
      jobTitle: true,
      company: true,
      website: true,
      location: true,
      bio: true,
      phone: true,
      preferredLocale: true,
      timezone: true,
      isActive: true,
      deactivatedAt: true,
      createdAt: true,
      updatedAt: true,
      accounts: {
        select: { provider: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      userRoles: {
        select: {
          roleId: true,
          assignedAt: true,
          assignedBy: true,
          role: { select: { name: true } },
        },
      },
      _count: {
        select: { sessions: { where: { expires: { gt: new Date() } } } },
      },
    },
  });
}

/** Everything the page needs, or "offline" when the database is down. */
async function loadDetail(id: string) {
  try {
    const user = await getUserDetail(id);
    if (!user) return null;

    const assignedByIds = user.userRoles
      .map((ur) => ur.assignedBy)
      .filter((v): v is string => Boolean(v));

    const [allRoles, permissions, auditEvents, assigners] = await Promise.all([
      prisma.role.findMany({
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          displayName: true,
          description: true,
          isSystem: true,
        },
      }),
      getUserPermissions(user.id),
      prisma.auditLog.findMany({
        where: { OR: [{ entityId: user.id }, { userId: user.id }] },
        orderBy: { createdAt: "desc" },
        take: 15,
        select: {
          id: true,
          action: true,
          entity: true,
          createdAt: true,
          user: { select: { email: true } },
        },
      }),
      assignedByIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: assignedByIds } },
            select: { id: true, email: true },
          })
        : Promise.resolve([]),
    ]);

    return {
      user,
      allRoles,
      permissions: permissions.sort(),
      auditEvents,
      assignerEmails: new Map(assigners.map((a) => [a.id, a.email])),
    };
  } catch {
    return "offline" as const;
  }
}

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole([ROLES.ADMIN]);
  if (!(await hasPermission(session, "users.view"))) {
    redirect("/denied");
  }

  const { id } = await params;

  const detail = await loadDetail(id);
  if (detail === "offline") {
    return (
      <>
        <PageHeader
          kicker="Access control"
          kickerIndex="USR"
          title="User detail"
          description="Account identity, status, roles, and derived access."
        />
        <EmptyState
          glyph="[db]"
          title="Database unreachable"
          description="This user record could not be loaded. Check the database connection and reload."
        />
      </>
    );
  }
  if (detail === null) notFound();
  const { user, allRoles, permissions, auditEvents, assignerEmails } = detail;

  const targetRoles = user.userRoles.map((ur) => ur.role.name);
  const isSelf = user.id === session.user.id;
  const links = getPlatformLinks();
  const allowedApps = getAccessibleApps({
    roles: targetRoles,
    authenticated: user.isActive,
  });
  const allowedKeys = new Set(allowedApps.map((app) => app.key));

  const assignedByRole = new Map(
    user.userRoles.map((ur) => [
      ur.roleId,
      {
        assignedAt: ur.assignedAt,
        assignedByEmail: ur.assignedBy
          ? assignerEmails.get(ur.assignedBy) ?? ur.assignedBy
          : null,
      },
    ])
  );

  const profileRows: [string, string | null][] = [
    ["job title", user.jobTitle],
    ["company", user.company],
    ["website", user.website],
    ["location", user.location],
    ["phone", user.phone],
    ["locale", user.preferredLocale],
    ["timezone", user.timezone],
  ];
  const filledProfileRows = profileRows.filter(([, value]) => value);

  return (
    <>
      <PageHeader
        kicker="Access control"
        kickerIndex="USR"
        title={user.name ?? user.email}
        description={`${user.email} · registered ${formatDateTime(user.createdAt)}`}
      />

      <p style={{ marginBottom: "var(--space-5)" }}>
        <a href="/users" className="ui-btn ui-btn--ghost ui-btn--sm">
          ← back to users
        </a>{" "}
        {isSelf ? <Badge tone="warning">this is your account</Badge> : null}
      </p>

      <div className="ui-grid ui-grid--wide">
        <Panel title="identity · users.edit">
          <IdentityForm
            userId={user.id}
            initialName={user.name ?? ""}
            initialUsername={user.username ?? ""}
            initialEmail={user.email}
          />
        </Panel>

        <Panel title="account status · users.deactivate">
          <StatusControls
            userId={user.id}
            isActive={user.isActive}
            isSelf={isSelf}
            deactivatedAt={
              user.deactivatedAt ? formatDateTime(user.deactivatedAt) : null
            }
          />
        </Panel>

        <Panel title="roles · roles.assign">
          <RoleControls
            userId={user.id}
            isSelf={isSelf}
            roles={allRoles.map((role) => {
              const assignment = assignedByRole.get(role.id);
              return {
                id: role.id,
                name: role.name,
                displayName: role.displayName,
                description: role.description,
                isSystem: role.isSystem,
                assigned: assignedByRole.has(role.id),
                assignedAt: assignment
                  ? formatDateTime(assignment.assignedAt)
                  : null,
                assignedByEmail: assignment?.assignedByEmail ?? null,
              };
            })}
          />
        </Panel>

        <Panel title="app access · derived from roles">
          <div className="ui-chips" style={{ marginBottom: "var(--space-3)" }}>
            {PLATFORM_APPS.map((app) => {
              const allowed = allowedKeys.has(app.key);
              const comingSoon = app.status === "coming-soon";
              const badge = (
                <Badge
                  key={app.key}
                  tone={comingSoon ? "warning" : allowed ? "success" : "neutral"}
                >
                  {app.name}
                  {comingSoon ? " · soon" : allowed ? "" : " · no access"}
                </Badge>
              );
              // Link out only when the *viewing admin* may open the app too.
              const adminCanOpen = canAccessApp(app, {
                roles: session.user.roles,
                authenticated: true,
              });
              return allowed && adminCanOpen && app.key in links ? (
                <a
                  key={app.key}
                  href={links[app.key as keyof typeof links]}
                  style={{ textDecoration: "none" }}
                >
                  {badge}
                </a>
              ) : (
                badge
              );
            })}
          </div>
          <p className="u-muted" style={{ fontSize: "var(--text-xs)", margin: 0 }}>
            Access is derived from roles and account status — deactivated users
            can only reach public apps. Change roles above to change access.
          </p>
        </Panel>

        <Panel title="derived permissions">
          {permissions.length === 0 ? (
            <span className="u-muted">No permissions via current roles.</span>
          ) : (
            <div className="ui-chips">
              {permissions.map((permission) => (
                <Badge key={permission} tone="neutral">
                  {permission}
                </Badge>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="authentication">
          <div className="ui-chips" style={{ marginBottom: "var(--space-3)" }}>
            {user.password ? <Badge tone="info">password</Badge> : null}
            {user.accounts.map((account) => (
              <Badge key={account.provider} tone="info">
                {account.provider}
              </Badge>
            ))}
            {!user.password && user.accounts.length === 0 ? (
              <Badge tone="neutral">email code only</Badge>
            ) : null}
          </div>
          <dl className="u-muted" style={{ fontSize: "var(--text-sm)", margin: 0 }}>
            <div>
              email verified:{" "}
              <span className="u-mono">
                {user.emailVerified ? formatDateTime(user.emailVerified) : "no"}
              </span>
            </div>
            <div>
              active sessions:{" "}
              <span className="u-mono">{user._count.sessions}</span>
            </div>
            <div>
              last updated:{" "}
              <span className="u-mono">{formatDateTime(user.updatedAt)}</span>
            </div>
          </dl>
        </Panel>

        {filledProfileRows.length > 0 || user.bio ? (
          <Panel title="profile summary">
            <dl style={{ margin: 0, fontSize: "var(--text-sm)" }}>
              {filledProfileRows.map(([label, value]) => (
                <div key={label} style={{ marginBottom: "var(--space-2)" }}>
                  <span className="u-mono">{label}</span>{" "}
                  <span>{value}</span>
                </div>
              ))}
              {user.bio ? <p className="u-muted">{user.bio}</p> : null}
            </dl>
          </Panel>
        ) : null}
      </div>

      <div style={{ marginTop: "var(--space-5)" }}>
        <Panel title={`audit history · last ${auditEvents.length} events`}>
          {auditEvents.length === 0 ? (
            <span className="u-muted">
              No audit events involve this user yet.
            </span>
          ) : (
            <Timeline
              items={auditEvents.map((event) => ({
                time: formatDateTime(event.createdAt),
                title: `${event.action} · ${event.entity}`,
                meta: `by ${event.user?.email ?? "system"}`,
              }))}
            />
          )}
        </Panel>
      </div>
    </>
  );
}
