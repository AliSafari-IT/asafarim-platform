import { prisma } from "@asafarim/db";
import { ROLES, getSession, hasPermission, hasRole } from "@asafarim/auth";
import { writeAuditEvent } from "../../../../lib/audit";
import { csvResponse, toCsv } from "../../../../lib/csv";
import { buildUserWhere, parseUserFilters } from "../query";

/** Hard ceiling: an export is a report, not a database dump. */
const MAX_ROWS = 5000;

/**
 * CSV of the current user view.
 *
 * A route handler rather than a link to a page because the response is a
 * file. It re-derives the filters from the same query module the page uses,
 * so what an operator exports is exactly what they were looking at — and it
 * re-checks the session itself, since route handlers do not run through the
 * (admin) layout's role gate.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session?.user?.id || session.user.isActive === false) {
    return new Response("Not signed in.", { status: 401 });
  }
  if (!hasRole(session, [ROLES.ADMIN]) || !(await hasPermission(session, "users.list"))) {
    return new Response("Forbidden.", { status: 403 });
  }

  const url = new URL(request.url);
  const filters = parseUserFilters(Object.fromEntries(url.searchParams));

  let users;
  try {
    users = await prisma.user.findMany({
      where: buildUserWhere(filters),
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
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
    });
  } catch (error) {
    console.error("[admin] user export failed:", error);
    return new Response("The export could not be generated.", { status: 503 });
  }

  // Exporting the directory moves personal data out of the platform, so the
  // act itself is audited — including the filters that scoped it.
  await writeAuditEvent({
    userId: session.user.id,
    action: "users.exported",
    entity: "User",
    entityId: null,
    changes: {
      rows: users.length,
      truncated: users.length === MAX_ROWS,
      filters: { q: filters.q, status: filters.status, role: filters.role },
    },
  });

  const body = toCsv(
    ["id", "name", "username", "email", "status", "roles", "created_at", "updated_at"],
    users.map((user) => [
      user.id,
      user.name,
      user.username,
      user.email,
      user.isActive ? "active" : "inactive",
      user.userRoles.map((ur) => ur.role.name).join(" "),
      user.createdAt,
      user.updatedAt,
    ])
  );

  return csvResponse("asafarim-users", body);
}
