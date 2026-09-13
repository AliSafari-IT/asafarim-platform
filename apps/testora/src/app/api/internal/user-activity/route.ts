import { timingSafeEqual } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { projects } from "@/db/schema";

/**
 * Read-only, superadmin console-facing activity feed for one platform
 * user's Testora footprint. Carries no session — authenticates its own
 * bearer token in constant time and 404s when the secret is unset, matching
 * the platform's machine-endpoint pattern.
 *
 * Testora's data model (projects, test cases, results, issues) has no
 * per-user activity history — projects are team-scoped, not user-scoped, and
 * nothing records who ran a test or filed an issue. The one honest signal
 * available is `projects.createdByUserId`, set when an app is created while
 * signed in (see src/app/api/projects/route.ts) — this reports exactly that:
 * which apps this user created, not a full activity trail. Rows created
 * before that column existed, or created anonymously, simply have no
 * creator and won't appear here (graceful degradation, issue #301).
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

  const createdProjects = await db.query.projects.findMany({
    where: eq(projects.createdByUserId, userId),
    orderBy: [desc(projects.createdAt)],
    limit: 50,
  });

  return NextResponse.json({
    entries: createdProjects.map((project) => ({
      id: project.id,
      type: "project_created",
      title: project.name,
      status: project.visibility,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      href: project.baseUrl || null,
      metadata: { visibility: project.visibility, seeded: project.seeded },
    })),
    summary: {
      note: "Only apps this user created are tracked — Testora has no broader per-user activity history (test runs, issues, etc. are team-scoped, not attributed to a user).",
    },
  });
}
