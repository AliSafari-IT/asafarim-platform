import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getTasksAiDb } from "@/lib/db/client";

/**
 * Read-only, superadmin console-facing activity feed for one platform
 * user's TasksAI footprint. Carries no session — authenticates its own
 * bearer token in constant time and 404s when the secret is unset, matching
 * the platform's machine-endpoint pattern used by this app's own inbound
 * email webhook. Listed in proxy.ts publicRoutes for that reason. The admin
 * console never holds TasksAI's own DB credentials — this route is the
 * only door into that data (issue #301).
 *
 * Task.creatorId/assigneeId reference Membership.id, not the platform user
 * id directly, so this route resolves the user's membership(s) first.
 */
export const dynamic = "force-dynamic";

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

  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const base = process.env.NEXT_PUBLIC_TASKSAI_URL ?? "http://localhost:3013";
  const db = getTasksAiDb();

  const memberships = await db.membership.findMany({
    where: { platformUserId: userId },
    select: { id: true, workspaceId: true, role: true, createdAt: true, updatedAt: true },
  });
  if (memberships.length === 0) {
    return NextResponse.json({ entries: [] });
  }
  const membershipIds = memberships.map((m) => m.id);
  const workspaceIds = [...new Set(memberships.map((m) => m.workspaceId))];

  const [workspaces, tasks, proposals] = await Promise.all([
    db.workspace.findMany({
      where: { id: { in: workspaceIds } },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    }),
    db.task.findMany({
      where: {
        OR: [{ creatorId: { in: membershipIds } }, { assigneeId: { in: membershipIds } }],
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        workspaceId: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    // Copilot proposals this membership requested — Proposal has no direct
    // platformUserId column, only membershipId, same indirection as Task.
    db.proposal.findMany({
      where: { membershipId: { in: membershipIds } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        workspaceId: true,
        kind: true,
        state: true,
        summary: true,
        appliedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);
  const workspaceById = new Map(workspaces.map((w) => [w.id, w]));

  const entries = [
    ...memberships.map((m) => {
      const workspace = workspaceById.get(m.workspaceId);
      return {
        id: m.id,
        type: "workspace",
        title: workspace?.name ?? "Workspace",
        status: m.role,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
        href: `${base}/workspace/${m.workspaceId}`,
        metadata: { role: m.role },
      };
    }),
    ...tasks.map((task) => ({
      id: task.id,
      type: "task",
      title: task.title,
      status: task.completedAt ? "completed" : "open",
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      href: `${base}/workspace/${task.workspaceId}/tasks/${task.id}`,
      metadata: { completedAt: task.completedAt?.toISOString() ?? null },
    })),
    ...proposals.map((p) => ({
      id: p.id,
      type: "copilot_proposal",
      title: p.summary ?? `Copilot proposal (${p.kind})`,
      status: p.state,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      href: `${base}/workspace/${p.workspaceId}`,
      metadata: { kind: p.kind, appliedAt: p.appliedAt?.toISOString() ?? null },
    })),
  ];

  return NextResponse.json({ entries });
}
