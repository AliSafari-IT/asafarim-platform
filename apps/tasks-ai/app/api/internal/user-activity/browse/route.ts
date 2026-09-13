import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getTasksAiDb } from "@/lib/db/client";

/**
 * Read-only, superadmin console-facing "browse everyone's TasksAI tasks"
 * feed for the Platform Activity view (issue #349) — cross-user, unlike the
 * per-user ../route.ts. Same bearer-gated machine-endpoint pattern; listed
 * in proxy.ts publicRoutes as a "/api/internal/user-activity" prefix match.
 *
 * Tasks, not workspaces or copilot proposals, are the flagship content here
 * (closest analog to Vionto's exports / TimelineAI's timelines — the actual
 * thing a superadmin would want to browse). Task.creatorId references
 * Membership.id, not the platform user id, so only tasks with a resolvable
 * creator membership are returned — a task whose creator membership was
 * deleted has no owner to attach and is simply omitted, not shown with a
 * fabricated owner.
 */
export const dynamic = "force-dynamic";

const MAX_LIMIT = 100;

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
  const limit = Math.min(Number(url.searchParams.get("limit")) || 25, MAX_LIMIT);
  const cursor = url.searchParams.get("cursor");

  const base = process.env.NEXT_PUBLIC_TASKSAI_URL ?? "http://localhost:3013";
  const db = getTasksAiDb();

  const rows = await db.task.findMany({
    where: {
      creatorId: { not: null },
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    select: {
      id: true,
      title: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
      workspace: { select: { slug: true } },
      project: { select: { key: true } },
      creator: { select: { platformUserId: true } },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return NextResponse.json({
    entries: page.map((task) => ({
      id: task.id,
      type: "task",
      title: task.title,
      status: task.completedAt ? "completed" : "open",
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      href: `${base}/w/${task.workspace.slug}/projects/${task.project.key}`,
      metadata: { completedAt: task.completedAt?.toISOString() ?? null },
      ownerUserId: task.creator!.platformUserId,
    })),
    nextCursor: hasMore ? page[page.length - 1]!.createdAt.toISOString() : null,
  });
}
