import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@asafarim/db";
import { hasPermission, requireRole, ROLES } from "@asafarim/auth";
import {
  Alert,
  BulkActionBar,
  Button,
  DataTable,
  EmptyState,
  FilterBar,
  Metric,
  PageHeader,
  Pagination,
} from "@asafarim/ui";
import { bulkActivateUsers, bulkDeactivateUsers } from "./actions";
import {
  ADMIN_ROLE_NAMES,
  PAGE_SIZE,
  buildUserWhere,
  hasUserFilters,
  parseUserFilters,
  userHref,
  userQueryString,
  type UserFilters,
} from "./query";
import { userColumns, type UserRow } from "./columns";

export const metadata: Metadata = { title: "Users" };

interface UsersData {
  users: UserRow[];
  filteredCount: number;
  roleNames: string[];
  totals: { all: number; active: number; inactive: number; admins: number };
}

async function getUsersData(filters: UserFilters): Promise<UsersData | null> {
  const where = buildUserWhere(filters);

  try {
    const [users, filteredCount, all, active, admins, roles] =
      await Promise.all([
        prisma.user.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (filters.page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
            userRoles: { select: { role: { select: { name: true } } } },
          },
        }),
        prisma.user.count({ where }),
        prisma.user.count(),
        prisma.user.count({ where: { isActive: true } }),
        prisma.user.count({
          where: {
            userRoles: { some: { role: { name: { in: ADMIN_ROLE_NAMES } } } },
          },
        }),
        prisma.role.findMany({
          select: { name: true },
          orderBy: { name: "asc" },
        }),
      ]);
    return {
      users,
      filteredCount,
      roleNames: roles.map((role) => role.name),
      totals: { all, active, inactive: all - active, admins },
    };
  } catch {
    return null;
  }
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireRole([ROLES.ADMIN]);
  if (!(await hasPermission(session, "users.list"))) {
    redirect("/denied");
  }
  const canDeactivate = await hasPermission(session, "users.deactivate");

  const params = await searchParams;
  const filters = parseUserFilters(params);
  const notice = (params.notice ?? "").trim();

  const data = await getUsersData(filters);

  const columns = userColumns();

  const exportQs = userQueryString(filters, { page: 1 });

  return (
    <>
      <PageHeader
        kicker="Access control"
        kickerIndex="USR"
        title="Users"
        description="Accounts, activation, role assignment, and derived app access."
      />

      {notice ? <Alert tone="info">{notice}</Alert> : null}

      {data === null ? (
        <EmptyState
          glyph="[db]"
          title="Database unreachable"
          description="The user directory could not be loaded. Check the database connection and reload."
        />
      ) : (
        <>
          <div
            className="ui-grid ui-grid--metrics"
            style={{ marginBottom: "var(--space-5)" }}
          >
            <Metric
              label="Total users"
              value={data.totals.all}
              hint="registered accounts"
            />
            <Metric
              label="Active"
              value={data.totals.active}
              hint="can sign in"
            />
            <Metric
              label="Inactive"
              value={data.totals.inactive}
              hint="deactivated"
            />
            <Metric
              label="Admins"
              value={data.totals.admins}
              hint="admin + superadmin"
            />
          </div>

          <FilterBar
            action="/users"
            hasFilters={hasUserFilters(filters)}
            clearHref="/users"
            fields={[
              {
                kind: "search",
                name: "q",
                label: "search",
                value: filters.q,
                placeholder: "name, email, or username…",
                width: 16,
              },
              {
                kind: "select",
                name: "role",
                label: "role",
                value: filters.role,
                options: [
                  { value: "", label: "all roles" },
                  ...data.roleNames.map((name) => ({
                    value: name,
                    label: name,
                  })),
                ],
              },
            ]}
            chips={{
              label: "status",
              options: (["all", "active", "inactive"] as const).map(
                (option) => ({
                  label: option,
                  href: userHref(filters, { status: option, page: 1 }),
                  active: filters.status === option,
                })
              ),
            }}
          />

          {data.users.length === 0 ? (
            <EmptyState
              glyph="[usr]"
              title={
                hasUserFilters(filters) ? "No matching users" : "No users yet"
              }
              description={
                hasUserFilters(filters)
                  ? "Nothing in the directory matches this search/filter combination."
                  : "Accounts appear here as soon as people register or are seeded."
              }
            />
          ) : (
            <form>
              <input type="hidden" name="returnTo" value={userHref(filters)} />

              {canDeactivate ? (
                <BulkActionBar
                  name="userIds"
                  noun="user"
                  hint="Guardrails still apply per user: the last active superadmin and your own account are refused."
                >
                  <Button
                    type="submit"
                    variant="console"
                    size="sm"
                    formAction={bulkActivateUsers}
                  >
                    activate selected
                  </Button>
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    formAction={bulkDeactivateUsers}
                  >
                    deactivate selected
                  </Button>
                </BulkActionBar>
              ) : null}

              <DataTable
                columns={columns}
                rows={data.users}
                getRowKey={(user) => user.id}
                caption="User directory"
                stack="wide"
                selection={
                  canDeactivate
                    ? {
                        name: "userIds",
                        label: "Select all users on this page",
                      }
                    : undefined
                }
              />

              <Pagination
                page={filters.page}
                pageSize={PAGE_SIZE}
                total={data.filteredCount}
                noun="user"
                hrefFor={(page) => userHref(filters, { page })}
                actions={
                  <a
                    href={
                      exportQs ? `/users/export?${exportQs}` : "/users/export"
                    }
                  >
                    export csv
                  </a>
                }
              />
            </form>
          )}
        </>
      )}
    </>
  );
}
