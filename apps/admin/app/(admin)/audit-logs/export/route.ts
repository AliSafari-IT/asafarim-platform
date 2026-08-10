import { prisma } from "@asafarim/db";
import { ROLES, getSession, hasPermission, hasRole } from "@asafarim/auth";
import { writeAuditEvent } from "../../../../lib/audit";
import { csvResponse, toCsv } from "../../../../lib/csv";
import { buildAuditWhere, parseAuditFilters } from "../query";

/** Hard ceiling: an export is an incident report, not a log shipper. */
const MAX_ROWS = 10000;

/**
 * CSV of the current audit view — the artifact you attach to an incident
 * write-up. Re-checks the session because route handlers bypass the
 * (admin) layout's role gate.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session?.user?.id || session.user.isActive === false) {
    return new Response("Not signed in.", { status: 401 });
  }
  if (!hasRole(session, [ROLES.ADMIN]) || !(await hasPermission(session, "audit.view"))) {
    return new Response("Forbidden.", { status: 403 });
  }

  const url = new URL(request.url);
  const filters = parseAuditFilters(Object.fromEntries(url.searchParams));

  let events;
  try {
    events = await prisma.auditLog.findMany({
      where: buildAuditWhere(filters),
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        changes: true,
        ipAddress: true,
        createdAt: true,
        user: { select: { email: true } },
      },
    });
  } catch (error) {
    console.error("[admin] audit export failed:", error);
    return new Response("The export could not be generated.", { status: 503 });
  }

  await writeAuditEvent({
    userId: session.user.id,
    action: "audit.exported",
    entity: "Admin",
    entityId: null,
    changes: {
      rows: events.length,
      truncated: events.length === MAX_ROWS,
      filters: {
        q: filters.q,
        action: filters.action,
        entity: filters.entity,
        actor: filters.actor,
        from: filters.from,
        to: filters.to,
      },
    },
  });

  const body = toCsv(
    ["created_at", "actor_email", "action", "entity", "entity_id", "ip_address", "changes"],
    events.map((event) => [
      event.createdAt,
      event.user?.email ?? "system",
      event.action,
      event.entity,
      event.entityId,
      event.ipAddress,
      // Already redacted at write time — serialized flat so one event is
      // one spreadsheet row.
      event.changes ? JSON.stringify(event.changes) : "",
    ])
  );

  return csvResponse("asafarim-audit", body);
}
