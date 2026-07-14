import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@asafarim/db";
import {
  PLATFORM_APPS,
  ROLES,
  canAccessApp,
  hasPermission,
  requireRole,
} from "@asafarim/auth";
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  Timeline,
} from "@asafarim/ui";
import { RoleMetaForm } from "./_components/RoleMetaForm";
import { PermissionGrantsEditor } from "./_components/PermissionGrantsEditor";
import { DeleteRoleControl } from "./_components/DeleteRoleControl";

export const metadata: Metadata = { title: "Role detail" };

function formatDateTime(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 16);
}

/** Everything the page needs, or "offline" when the database is down. */
async function loadDetail(id: string) {
  try {
    const role = await prisma.role.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        displayName: true,
        description: true,
        isSystem: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
        rolePermissions: { select: { permissionId: true } },
        userRoles: {
          take: 10,
          orderBy: { assignedAt: "desc" },
          select: { user: { select: { id: true, email: true } } },
        },
        _count: { select: { userRoles: true } },
      },
    });
    if (!role) return null;

    const [allPermissions, auditEvents] = await Promise.all([
      prisma.permission.findMany({
        orderBy: [{ group: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          displayName: true,
          description: true,
          group: true,
        },
      }),
      prisma.auditLog.findMany({
        where: { entityId: role.id, entity: "Role" },
        orderBy: { createdAt: "desc" },
        take: 15,
        select: {
          id: true,
          action: true,
          createdAt: true,
          user: { select: { email: true } },
        },
      }),
    ]);

    return { role, allPermissions, auditEvents };
  } catch {
    return "offline" as const;
  }
}

export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole([ROLES.ADMIN]);
  if (!(await hasPermission(session, "roles.view"))) {
    redirect("/denied");
  }
  const canEdit = await hasPermission(session, "roles.edit");

  const { id } = await params;
  const detail = await loadDetail(id);

  if (detail === "offline") {
    return (
      <>
        <PageHeader
          kicker="Access control"
          kickerIndex="ROL"
          title="Role detail"
          description="Role metadata, permission grants, and impact."
        />
        <EmptyState
          glyph="[db]"
          title="Database unreachable"
          description="This role could not be loaded. Check the database connection and reload."
        />
      </>
    );
  }
  if (detail === null) notFound();
  const { role, allPermissions, auditEvents } = detail;

  const grantedIds = new Set(role.rolePermissions.map((rp) => rp.permissionId));
  const isSuperadminRole = role.name === ROLES.SUPERADMIN;

  // Apps this role unlocks beyond what an authenticated roleless user gets.
  const baseline = new Set(
    PLATFORM_APPS.filter((app) =>
      canAccessApp(app, { roles: [], authenticated: true })
    ).map((app) => app.key)
  );
  const unlockedApps = PLATFORM_APPS.filter(
    (app) =>
      !baseline.has(app.key) &&
      canAccessApp(app, { roles: [role.name], authenticated: true })
  );

  return (
    <>
      <PageHeader
        kicker="Access control"
        kickerIndex="ROL"
        title={role.displayName}
        description={`${role.name} · ${role._count.userRoles} user${
          role._count.userRoles === 1 ? "" : "s"
        } · updated ${formatDateTime(role.updatedAt)}`}
      />

      <p style={{ marginBottom: "var(--space-5)" }}>
        <a href="/roles" className="ui-btn ui-btn--ghost ui-btn--sm">
          ← back to roles
        </a>{" "}
        <Badge tone={role.isSystem ? "info" : "neutral"}>
          {role.isSystem ? "system role" : "custom role"}
        </Badge>{" "}
        {role.isDefault ? <Badge tone="warning">default for new users</Badge> : null}
      </p>

      <div className="ui-grid ui-grid--wide">
        <Panel title="metadata · roles.edit">
          {role.isSystem ? (
            <p className="u-muted" style={{ fontSize: "var(--text-xs)" }}>
              System role — the machine name is referenced in code and cannot
              change. Display name and description remain editable.
            </p>
          ) : null}
          <RoleMetaForm
            roleId={role.id}
            initialDisplayName={role.displayName}
            initialDescription={role.description ?? ""}
            disabled={!canEdit}
          />
        </Panel>

        <Panel title="impact — before you change anything">
          <dl style={{ margin: 0, fontSize: "var(--text-sm)" }}>
            <div style={{ marginBottom: "var(--space-3)" }}>
              <span className="u-mono">users holding this role</span>{" "}
              <strong>{role._count.userRoles}</strong>
              {role.userRoles.length > 0 ? (
                <div className="ui-chips" style={{ marginTop: "var(--space-2)" }}>
                  {role.userRoles.map(({ user }) => (
                    <a
                      key={user.id}
                      href={`/users/${user.id}`}
                      style={{ textDecoration: "none" }}
                    >
                      <Badge tone="neutral">{user.email}</Badge>
                    </a>
                  ))}
                  {role._count.userRoles > role.userRoles.length ? (
                    <span className="u-mono">
                      +{role._count.userRoles - role.userRoles.length} more
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div>
              <span className="u-mono">apps unlocked by this role</span>{" "}
              {unlockedApps.length === 0 ? (
                <span className="u-muted">
                  none beyond public/authenticated baseline
                </span>
              ) : (
                <span className="ui-chips" style={{ marginTop: "var(--space-2)" }}>
                  {unlockedApps.map((app) => (
                    <Badge key={app.key} tone="success">
                      {app.name}
                    </Badge>
                  ))}
                </span>
              )}
            </div>
          </dl>
        </Panel>
      </div>

      <div style={{ marginTop: "var(--space-5)" }}>
        <Panel
          title={
            isSuperadminRole
              ? "permission grants · bypassed"
              : "permission grants · roles.edit"
          }
        >
          {isSuperadminRole ? (
            <p className="u-muted" style={{ margin: 0 }}>
              Superadmin bypasses permission checks in code — every permission
              is effectively granted regardless of what is stored here. Grants
              for this role are fixed by the database seed and cannot be edited.
            </p>
          ) : (
            <PermissionGrantsEditor
              roleId={role.id}
              roleName={role.name}
              affectedUsers={role._count.userRoles}
              permissions={allPermissions}
              initialGrantedIds={[...grantedIds]}
              disabled={!canEdit}
            />
          )}
        </Panel>
      </div>

      <div className="ui-grid ui-grid--wide" style={{ marginTop: "var(--space-5)" }}>
        <Panel title={`audit history · last ${auditEvents.length} events`}>
          {auditEvents.length === 0 ? (
            <span className="u-muted">No audit events for this role yet.</span>
          ) : (
            <Timeline
              items={auditEvents.map((event) => ({
                time: formatDateTime(event.createdAt),
                title: event.action,
                meta: `by ${event.user?.email ?? "system"}`,
              }))}
            />
          )}
        </Panel>

        {!role.isSystem && canEdit ? (
          <Panel title="danger zone">
            <p className="u-muted" style={{ fontSize: "var(--text-sm)" }}>
              Deleting removes the role and its {role._count.userRoles} user
              assignment{role._count.userRoles === 1 ? "" : "s"}. Permissions
              themselves are not deleted.
            </p>
            <DeleteRoleControl
              roleId={role.id}
              roleName={role.name}
              userCount={role._count.userRoles}
            />
          </Panel>
        ) : null}
      </div>
    </>
  );
}
