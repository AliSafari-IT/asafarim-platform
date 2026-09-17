import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getJobmatchDb } from "@/lib/db/client";

/**
 * Read-only, superadmin console-facing "browse everyone's tracked jobs"
 * feed for the Platform Activity view (issue #349) — cross-user, unlike the
 * per-user ../route.ts. Same bearer-gated machine-endpoint pattern; listed
 * in proxy.ts publicRoutes as a "/api/internal/user-activity" prefix match.
 *
 * Tracked jobs, not candidate documents, are the flagship content here —
 * resumes are more sensitive to surface cross-user in an admin browse feed
 * than "this user is tracking job X at company Y" (privacy-conscious
 * default). Workspace.platformUserId is always set (schema-required,
 * unique), so every row has a resolvable owner.
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

  const base = process.env.NEXT_PUBLIC_JOBMATCH_URL ?? "http://localhost:3012";
  const db = getJobmatchDb();

  const rows = await db.trackedJob.findMany({
    where: cursor ? { createdAt: { lt: new Date(cursor) } } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    select: {
      id: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      jobPosting: { select: { title: true, employer: true } },
      workspace: { select: { platformUserId: true } },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return NextResponse.json({
    entries: page.map((job) => ({
      id: job.id,
      type: "tracked_job",
      title: `${job.jobPosting.title} · ${job.jobPosting.employer}`,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      href: `${base}/jobs`,
      metadata: {},
      ownerUserId: job.workspace.platformUserId,
    })),
    nextCursor: hasMore ? page[page.length - 1]!.createdAt.toISOString() : null,
  });
}
