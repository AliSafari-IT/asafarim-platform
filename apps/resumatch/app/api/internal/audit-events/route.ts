import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getJobmatchDb } from "@/lib/db/client";

/**
 * Read-only, superadmin console-facing view of ResuMatch's own audit trail
 * (recordAuditEvent, lib/workspace.ts). Carries no session — authenticates
 * its own bearer token in constant time and 404s when the secret is unset,
 * matching app/api/internal/{ai-spend,user-activity}/route.ts, this app's
 * only existing admin/debug route pattern. Listed in proxy.ts publicRoutes
 * for the same reason those are. The admin console never holds ResuMatch's
 * own DB credentials — this route is the only door into this table
 * (issue #301's pattern, issue #441).
 *
 * `metadata` is returned as-is: recordAuditEvent redacts it through
 * lib/observability/redact.ts before it is ever written, so nothing
 * further is stripped here.
 *
 * Each event also carries its workspace's `platformUserId` (null for the
 * rare workspace-less event), so the console can show *who* acted rather
 * than an opaque ResuMatch workspace id. It is resolved to an email there,
 * against the platform's own user table; ResuMatch holds no copy of it.
 */
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function isAuthorized(request: Request): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return false;
  const presented = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const presentedBuf = Buffer.from(presented);
  const secretBuf = Buffer.from(secret);
  if (presentedBuf.length !== secretBuf.length) return false;
  return timingSafeEqual(presentedBuf, secretBuf);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");
  const platformUserId = url.searchParams.get("platformUserId");
  const action = url.searchParams.get("action");
  const cursor = url.searchParams.get("cursor"); // an event id to page after
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT));

  const db = getJobmatchDb();

  // Distinct actions populate the admin console's filter dropdown — cheap
  // (the action column has a small, closed vocabulary) and lets the viewer
  // discover what's filterable instead of having to already know an action
  // name to type into a query param, matching the platform audit-logs
  // page's own `distinct: ["action"]` pattern.
  const [events, actionRows] = await Promise.all([
    db.auditEvent.findMany({
      where: {
        ...(workspaceId ? { workspaceId } : {}),
        ...(platformUserId ? { workspace: { platformUserId } } : {}),
        ...(action ? { action } : {}),
      },
      // `id` breaks createdAt ties. Rows written in one statement (or the
      // same millisecond) share a timestamp, and cursor pagination over a
      // non-unique sort key can repeat or drop rows at a page boundary.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        workspaceId: true,
        action: true,
        metadata: true,
        createdAt: true,
        workspace: { select: { platformUserId: true } },
      },
    }),
    db.auditEvent.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
  ]);

  const hasMore = events.length > limit;
  const page = hasMore ? events.slice(0, limit) : events;

  return NextResponse.json({
    events: page.map((event: (typeof page)[number]) => ({
      id: event.id,
      workspaceId: event.workspaceId,
      platformUserId: event.workspace?.platformUserId ?? null,
      action: event.action,
      metadata: event.metadata,
      createdAt: event.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    actions: actionRows.map((row: { action: string }) => row.action),
  });
}
