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
    select: { id: true, workspaceId: true },
  });
  if (memberships.length === 0) {
    return NextResponse.json({ entries: [] });
  }
  const membershipIds = memberships.map((m) => m.id);

  const tasks = await db.task.findMany({
    where: {
      OR: [{ creatorId: { in: membershipIds } }, { assigneeId: { in: membershipIds } }],
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      title: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
      workspace: { select: { slug: true } },
      project: { select: { key: true } },
    },
  });

  const entries = tasks.map((task) => ({
    id: task.id,
    type: "task",
    title: task.title,
    status: task.completedAt ? "completed" : "open",
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    // TasksAI has no per-task detail route yet — link to the task's project board.
    href: `${base}/w/${task.workspace.slug}/projects/${task.project.key}`,
    metadata: { completedAt: task.completedAt?.toISOString() ?? null },
  }));

  return NextResponse.json({ entries });
}
