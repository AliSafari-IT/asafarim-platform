import type { Metadata } from "next";
import { redirect } from "next/navigation";
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
  Button,
  EmptyState,
  Input,
  PageHeader,
  Panel,
  Section,
} from "@asafarim/ui";

export const metadata: Metadata = { title: "Permissions" };

async function getCatalog() {
  try {
    const [permissions, roles] = await Promise.all([
      prisma.permission.findMany({
        orderBy: [{ group: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          displayName: true,
          description: true,
          group: true,
          rolePermissions: {
            select: { role: { select: { id: true, name: true } } },
          },
        },
      }),
      prisma.role.findMany({
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
        select: { id: true, name: true, displayName: true },
      }),
    ]);
    return { permissions, roles };
  } catch {
    return null;
  }
}

/** Apps a role unlocks beyond the public/authenticated baseline. */
function appsUnlockedBy(roleName: string): string[] {
  return PLATFORM_APPS.filter(
    (app) =>
      !canAccessApp(app, { roles: [], authenticated: true }) &&
      canAccessApp(app, { roles: [roleName], authenticated: true })
  ).map((app) => app.name);
}

export default async function PermissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; group?: string }>;
}) {
  const session = await requireRole([ROLES.ADMIN]);
  // The permission catalog is part of the roles domain: viewing it requires
  // roles.list, and changes happen through role grants (roles.edit).
  if (!(await hasPermission(session, "roles.list"))) {
    redirect("/denied");
  }

  const params = await searchParams;
  const query = (params.q ?? "").trim().toLowerCase();
  const groupFilter = (params.group ?? "").trim();

  const catalog = await getCatalog();

  if (catalog === null) {
    return (
      <>
        <PageHeader
          kicker="Access control"
          kickerIndex="PRM"
          title="Permissions"
          description="The permission catalog, grouped by domain."
        />
        <EmptyState
          glyph="[db]"
          title="Database unreachable"
          description="The permission catalog could not be loaded. Check the database connection and reload."
        />
      </>
    );
  }

  const groups = [...new Set(catalog.permissions.map((p) => p.group))];
  const filtered = catalog.permissions.filter((permission) => {
    if (groupFilter && permission.group !== groupFilter) return false;
    if (!query) return true;
    return (
      permission.name.toLowerCase().includes(query) ||
      permission.displayName.toLowerCase().includes(query) ||
      (permission.description ?? "").toLowerCase().includes(query)
    );
  });
  const filteredGroups = groups.filter((group) =>
    filtered.some((p) => p.group === group)
  );

  return (
    <>
      <PageHeader
        kicker="Access control"
        kickerIndex="PRM"
        title="Permissions"
        description="The permission catalog grouped by domain. Grants are managed per role; a user holds a permission when any of their roles grants it — superadmin bypasses all checks."
      />

      <form
        method="GET"
        action="/permissions"
        style={{
          display: "flex",
          gap: "var(--space-3)",
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: "var(--space-4)",
        }}
      >
        <div style={{ flex: "1 1 16rem", maxWidth: "26rem" }}>
          <Input
            type="search"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search permission key or description…"
            aria-label="Search permissions"
          />
        </div>
        <Button type="submit" variant="console" size="sm">
          search
        </Button>
        <span className="ui-chips">
          <a
            href="/permissions"
            className={`ui-btn ui-btn--sm ${
              groupFilter ? "ui-btn--ghost" : "ui-btn--console"
            }`}
          >
            all
          </a>
          {groups.map((group) => (
            <a
              key={group}
              href={`/permissions?group=${encodeURIComponent(group)}`}
              className={`ui-btn ui-btn--sm ${
                groupFilter === group ? "ui-btn--console" : "ui-btn--ghost"
              }`}
            >
              {group}
            </a>
          ))}
        </span>
      </form>

      {filtered.length === 0 ? (
        <EmptyState
          glyph="[prm]"
          title="No matching permissions"
          description="Nothing in the catalog matches this search/filter combination."
        />
      ) : (
        filteredGroups.map((group, index) => (
          <Section
            key={group}
            kicker={group}
            kickerIndex={String(index + 1).padStart(2, "0")}
          >
            <div className="ui-tablewrap">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Permission</th>
                    <th>Granted to roles</th>
                    <th>Unlocks apps</th>
                    <th>Origin</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered
                    .filter((p) => p.group === group)
                    .map((permission) => {
                      const grantedRoles = permission.rolePermissions.map(
                        (rp) => rp.role
                      );
                      const apps = [
                        ...new Set(
                          grantedRoles.flatMap((role) =>
                            appsUnlockedBy(role.name)
                          )
                        ),
                      ];
                      return (
                        <tr key={permission.id}>
                          <td>
                            <span className="ui-table__primary">
                              {permission.displayName}
                              <span className="ui-table__sub">
                                <span className="u-mono">{permission.name}</span>
                                {permission.description
                                  ? ` — ${permission.description}`
                                  : ""}
                              </span>
                            </span>
                          </td>
                          <td>
                            <span className="ui-chips">
                              {grantedRoles.length === 0 ? (
                                <span className="u-muted">—</span>
                              ) : (
                                grantedRoles.map((role) => (
                                  <a
                                    key={role.id}
                                    href={`/roles/${role.id}`}
                                    style={{ textDecoration: "none" }}
                                  >
                                    <Badge
                                      tone={
                                        role.name === ROLES.SUPERADMIN
                                          ? "danger"
                                          : role.name === ROLES.ADMIN
                                            ? "info"
                                            : "neutral"
                                      }
                                    >
                                      {role.name}
                                    </Badge>
                                  </a>
                                ))
                              )}
                            </span>
                          </td>
                          <td>
                            <span className="ui-chips">
                              {apps.length === 0 ? (
                                <span className="u-muted">baseline</span>
                              ) : (
                                apps.map((app) => (
                                  <Badge key={app} tone="success">
                                    {app}
                                  </Badge>
                                ))
                              )}
                            </span>
                          </td>
                          <td>
                            <Badge tone="info">seeded</Badge>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Section>
        ))
      )}

      <Section kicker="Role–permission matrix" kickerIndex="MX">
        <p className="u-muted" style={{ fontSize: "var(--text-sm)" }}>
          Full grant matrix (desktop). On small screens use the grouped catalog
          above — it carries the same information. The superadmin column
          reflects its code-level bypass, not stored grants.
        </p>
        <div className="ui-tablewrap u-desktop-only">
          <table className="ui-table ui-table--nowrap">
            <thead>
              <tr>
                <th>Permission</th>
                {catalog.roles.map((role) => (
                  <th key={role.id} style={{ textAlign: "center" }}>
                    {role.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {catalog.permissions.map((permission) => {
                const grantedTo = new Set(
                  permission.rolePermissions.map((rp) => rp.role.name)
                );
                return (
                  <tr key={permission.id}>
                    <td className="u-mono">{permission.name}</td>
                    {catalog.roles.map((role) => {
                      const granted =
                        role.name === ROLES.SUPERADMIN ||
                        grantedTo.has(role.name);
                      return (
                        <td
                          key={role.id}
                          style={{ textAlign: "center" }}
                          aria-label={
                            granted
                              ? `${role.name} has ${permission.name}`
                              : `${role.name} lacks ${permission.name}`
                          }
                        >
                          {granted ? (
                            <span style={{ color: "var(--accent)" }}>✓</span>
                          ) : (
                            <span className="u-muted">·</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <div style={{ marginTop: "var(--space-5)" }}>
        <Panel title="catalog policy">
          <p className="u-muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
            Permissions are seed-managed: keys are referenced in code, so
            creating or deleting them through the UI would desynchronize
            authorization checks. New permissions arrive with the app features
            that enforce them (via{" "}
            <span className="u-mono">packages/db/prisma/seed.ts</span>). Role
            grants are edited on each role&apos;s detail page.
          </p>
        </Panel>
      </div>
    </>
  );
}
