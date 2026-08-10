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
  Panel,
  type ColumnDef,
} from "@asafarim/ui";
import { CreateRoleForm } from "./_components/CreateRoleForm";

export const metadata: Metadata = { title: "Roles" };

interface RoleRow {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  isDefault: boolean;
  updatedAt: Date;
  _count: { userRoles: number; rolePermissions: number };
}

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

  const columns: ColumnDef<RoleRow>[] = [
    {
      id: "role",
      header: "Role",
      render: (role) => (
        <a href={`/roles/${role.id}`} className="ui-table__link">
          <span className="ui-table__primary">
            {role.displayName}
            <span className="ui-table__sub">
              {role.name}
              {role.description ? ` — ${role.description}` : ""}
            </span>
          </span>
        </a>
      ),
    },
    {
      id: "type",
      header: "Type",
      render: (role) => (
        <span className="ui-chips">
          <Badge tone={role.isSystem ? "info" : "neutral"}>
            {role.isSystem ? "system" : "custom"}
          </Badge>
          {role.isDefault ? <Badge tone="warning">default</Badge> : null}
        </span>
      ),
    },
    {
      id: "users",
      header: "Users",
      mono: true,
      render: (role) => role._count.userRoles,
    },
    {
      id: "permissions",
      header: "Permissions",
      mono: true,
      render: (role) =>
        role.name === ROLES.SUPERADMIN ? "all (bypass)" : role._count.rolePermissions,
    },
    {
      id: "updated",
      header: "Updated",
      mono: true,
      nowrap: true,
      render: (role) => role.updatedAt.toISOString().slice(0, 10),
    },
  ];

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
          <FilterBar
            action="/roles"
            hasFilters={Boolean(query)}
            clearHref="/roles"
            submitLabel="search"
            fields={[
              {
                kind: "search",
                name: "q",
                label: "search",
                value: query,
                placeholder: "role name or display name…",
                width: 16,
              },
            ]}
          />

          <DataTable
            columns={columns}
            rows={roles}
            getRowKey={(role) => role.id}
            caption="Role catalog"
            empty={
              <EmptyState
                glyph="[rol]"
                title="No matching roles"
                description="Nothing in the role catalog matches this search."
              />
            }
          />

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
