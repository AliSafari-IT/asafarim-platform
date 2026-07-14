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
  Panel,
} from "@asafarim/ui";
import { CreateRoleForm } from "./_components/CreateRoleForm";

export const metadata: Metadata = { title: "Roles" };

async function getRoles(query: string) {
  try {
    return await prisma.role.findMany({
      where: query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { displayName: { contains: query, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        displayName: true,
        description: true,
        isSystem: true,
        isDefault: true,
        updatedAt: true,
        _count: { select: { userRoles: true, rolePermissions: true } },
      },
    });
  } catch {
    return null;
  }
}

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireRole([ROLES.ADMIN]);
  if (!(await hasPermission(session, "roles.list"))) {
    redirect("/denied");
  }
  const canEdit = await hasPermission(session, "roles.edit");

  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const roles = await getRoles(query);

  return (
    <>
      <PageHeader
        kicker="Access control"
        kickerIndex="ROL"
        title="Roles"
        description="Role definitions, their permission grants, and who holds them."
      />

      {roles === null ? (
        <EmptyState
          glyph="[db]"
          title="Database unreachable"
          description="Roles could not be loaded. Check the database connection and reload."
        />
      ) : (
        <>
          <form
            method="GET"
            action="/roles"
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
                defaultValue={query}
                placeholder="Search role name…"
                aria-label="Search roles"
              />
            </div>
            <Button type="submit" variant="console" size="sm">
              search
            </Button>
            {query ? (
              <a href="/roles" className="ui-btn ui-btn--ghost ui-btn--sm">
                clear
              </a>
            ) : null}
          </form>

          {roles.length === 0 ? (
            <EmptyState
              glyph="[rol]"
              title="No matching roles"
              description="Nothing in the role catalog matches this search."
            />
          ) : (
            <div className="ui-tablewrap">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Type</th>
                    <th>Users</th>
                    <th>Permissions</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr key={role.id}>
                      <td>
                        <a href={`/roles/${role.id}`} className="ui-table__link">
                          <span className="ui-table__primary">
                            {role.displayName}
                            <span className="ui-table__sub">
                              {role.name}
                              {role.description ? ` — ${role.description}` : ""}
                            </span>
                          </span>
                        </a>
                      </td>
                      <td>
                        <span className="ui-chips">
                          <Badge tone={role.isSystem ? "info" : "neutral"}>
                            {role.isSystem ? "system" : "custom"}
                          </Badge>
                          {role.isDefault ? (
                            <Badge tone="warning">default</Badge>
                          ) : null}
                        </span>
                      </td>
                      <td className="u-mono">{role._count.userRoles}</td>
                      <td className="u-mono">
                        {role.name === ROLES.SUPERADMIN
                          ? "all (bypass)"
                          : role._count.rolePermissions}
                      </td>
                      <td className="u-mono">
                        {role.updatedAt.toISOString().slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canEdit ? (
            <div style={{ marginTop: "var(--space-5)", maxWidth: "34rem" }}>
              <Panel title="create custom role · roles.edit">
                <CreateRoleForm />
              </Panel>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
