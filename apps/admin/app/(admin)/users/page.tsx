import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@asafarim/db";
import {
  ROLES,
  getAccessibleApps,
  hasPermission,
  requireRole,
} from "@asafarim/auth";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Metric,
  PageHeader,
  type BadgeTone,
} from "@asafarim/ui";

export const metadata: Metadata = { title: "Users" };

const PAGE_SIZE = 20;

type StatusFilter = "all" | "active" | "inactive";

interface UserRow {
  id: string;
  name: string | null;
  username: string | null;
  email: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  userRoles: { role: { name: string } }[];
}

interface UsersData {
  users: UserRow[];
  filteredCount: number;
  totals: { all: number; active: number; inactive: number; admins: number };
}

async function getUsersData(
  query: string,
  status: StatusFilter,
  page: number
): Promise<UsersData | null> {
  const where = {
    ...(status === "all" ? {} : { isActive: status === "active" }),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { email: { contains: query, mode: "insensitive" as const } },
            { username: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  try {
    const [users, filteredCount, all, active, admins] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
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
          userRoles: {
            some: { role: { name: { in: [ROLES.ADMIN, ROLES.SUPERADMIN] } } },
          },
        },
      }),
    ]);
    return {
      users,
      filteredCount,
      totals: { all, active, inactive: all - active, admins },
    };
  } catch {
    return null;
  }
}

function roleTone(role: string): BadgeTone {
  if (role === ROLES.SUPERADMIN) return "danger";
  if (role === ROLES.ADMIN) return "info";
  return "neutral";
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function pageHref(query: string, status: StatusFilter, page: number): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (status !== "all") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/users?${qs}` : "/users";
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const session = await requireRole([ROLES.ADMIN]);
  if (!(await hasPermission(session, "users.list"))) {
    redirect("/denied");
  }

  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const status: StatusFilter =
    params.status === "active" || params.status === "inactive"
      ? params.status
      : "all";
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const data = await getUsersData(query, status, requestedPage);

  return (
    <>
      <PageHeader
        kicker="Access control"
        kickerIndex="USR"
        title="Users"
        description="Accounts, activation, role assignment, and derived app access."
      />

      {data === null ? (
        <EmptyState
          glyph="[db]"
          title="Database unreachable"
          description="The user directory could not be loaded. Check the database connection and reload."
        />
      ) : (
        <>
          <div className="ui-grid ui-grid--metrics" style={{ marginBottom: "var(--space-5)" }}>
            <Metric label="Total users" value={data.totals.all} hint="registered accounts" />
            <Metric label="Active" value={data.totals.active} hint="can sign in" />
            <Metric label="Inactive" value={data.totals.inactive} hint="deactivated" />
            <Metric label="Admins" value={data.totals.admins} hint="admin + superadmin" />
          </div>

          <form
            method="GET"
            action="/users"
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
                placeholder="Search name, email, or username…"
                aria-label="Search users"
              />
            </div>
            {status !== "all" ? (
              <input type="hidden" name="status" value={status} />
            ) : null}
            <Button type="submit" variant="console" size="sm">
              search
            </Button>
            <span className="ui-chips">
              {(["all", "active", "inactive"] as const).map((option) => (
                <a
                  key={option}
                  href={pageHref(query, option, 1)}
                  className={`ui-btn ui-btn--sm ${
                    status === option ? "ui-btn--console" : "ui-btn--ghost"
                  }`}
                >
                  {option}
                </a>
              ))}
            </span>
          </form>

          {data.users.length === 0 ? (
            <EmptyState
              glyph="[usr]"
              title={query || status !== "all" ? "No matching users" : "No users yet"}
              description={
                query || status !== "all"
                  ? "Nothing in the directory matches this search/filter combination."
                  : "Accounts appear here as soon as people register or are seeded."
              }
            />
          ) : (
            <>
              <div className="ui-tablewrap">
                <table className="ui-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Username</th>
                      <th>Status</th>
                      <th>Roles</th>
                      <th>Apps</th>
                      <th>Created</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((user) => {
                      const roles = user.userRoles.map((ur) => ur.role.name);
                      const apps = getAccessibleApps({
                        roles,
                        authenticated: user.isActive,
                      });
                      return (
                        <tr key={user.id}>
                          <td>
                            <a href={`/users/${user.id}`} className="ui-table__link">
                              <span className="ui-table__primary">
                                {user.name ?? "—"}
                                <span className="ui-table__sub">{user.email}</span>
                              </span>
                            </a>
                          </td>
                          <td className="u-mono">{user.username ?? "—"}</td>
                          <td>
                            <Badge tone={user.isActive ? "success" : "danger"}>
                              {user.isActive ? "active" : "inactive"}
                            </Badge>
                          </td>
                          <td>
                            <span className="ui-chips">
                              {roles.length === 0 ? (
                                <span className="u-muted">—</span>
                              ) : (
                                roles.map((role) => (
                                  <Badge key={role} tone={roleTone(role)}>
                                    {role}
                                  </Badge>
                                ))
                              )}
                            </span>
                          </td>
                          <td>
                            <span className="ui-chips">
                              {apps.length === 0 ? (
                                <span className="u-muted">—</span>
                              ) : (
                                apps.map((app) => (
                                  <Badge key={app.key} tone="neutral">
                                    {app.key}
                                  </Badge>
                                ))
                              )}
                            </span>
                          </td>
                          <td className="u-mono">{formatDate(user.createdAt)}</td>
                          <td className="u-mono">{formatDate(user.updatedAt)}</td>
                        </tr>
                      );
                    })}
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
                  {data.filteredCount} user{data.filteredCount === 1 ? "" : "s"} ·
                  page {requestedPage} of{" "}
                  {Math.max(1, Math.ceil(data.filteredCount / PAGE_SIZE))}
                </span>
                <span className="ui-chips">
                  {requestedPage > 1 ? (
                    <a
                      href={pageHref(query, status, requestedPage - 1)}
                      className="ui-btn ui-btn--console ui-btn--sm"
                    >
                      ← prev
                    </a>
                  ) : null}
                  {requestedPage * PAGE_SIZE < data.filteredCount ? (
                    <a
                      href={pageHref(query, status, requestedPage + 1)}
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
