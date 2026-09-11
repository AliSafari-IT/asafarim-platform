import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";

/**
 * Read-only, superadmin console-facing activity feed for one platform user's
 * AppBuilder footprint. Carries no session — it authenticates its own
 * bearer token in constant time and 404s outright when the secret is unset,
 * matching the platform's machine-endpoint pattern (see e.g. TasksAI's
 * inbound email webhook). Listed in proxy.ts publicRoutes for that reason.
 * The admin console never holds AppBuilder's own DB credentials — this
 * route is the only door into that data (issue #301).
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

  const db = getDb();
  const [apps, jobs] = await Promise.all([
    db
      .select({
        id: schema.apps.id,
        name: schema.apps.name,
        status: schema.apps.status,
        createdAt: schema.apps.createdAt,
        updatedAt: schema.apps.updatedAt,
      })
      .from(schema.apps)
      .where(eq(schema.apps.ownerPrincipalId, userId))
      .orderBy(desc(schema.apps.createdAt)),
    db
      .select({
        id: schema.generationJobs.id,
        appId: schema.generationJobs.appId,
        status: schema.generationJobs.status,
        phase: schema.generationJobs.phase,
        attemptCount: schema.generationJobs.attemptCount,
        createdAt: schema.generationJobs.createdAt,
        updatedAt: schema.generationJobs.updatedAt,
      })
      .from(schema.generationJobs)
      .where(eq(schema.generationJobs.initiatedByPrincipalId, userId))
      .orderBy(desc(schema.generationJobs.createdAt)),
  ]);

  const entries = [
    ...apps.map((app) => ({
      id: app.id,
      type: "app",
      title: app.name,
      status: app.status,
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
      href: `${process.env.NEXT_PUBLIC_APPBUILDER_URL ?? "http://localhost:3006"}/apps/${app.id}`,
      metadata: {},
    })),
    ...jobs.map((job) => ({
      id: job.id,
      type: "generation_job",
      title: `Generation job (${job.phase})`,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      href: `${process.env.NEXT_PUBLIC_APPBUILDER_URL ?? "http://localhost:3006"}/apps/${job.appId}`,
      metadata: { attemptCount: job.attemptCount },
    })),
  ];

  return NextResponse.json({ entries });
}
