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
  const base = process.env.NEXT_PUBLIC_APPBUILDER_URL ?? "http://localhost:3006";

  const [apps, generationJobs, modificationJobs, deployments, collaborations] = await Promise.all([
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
    db
      .select({
        id: schema.modificationJobs.id,
        appId: schema.modificationJobs.appId,
        status: schema.modificationJobs.status,
        phase: schema.modificationJobs.phase,
        attemptCount: schema.modificationJobs.attemptCount,
        createdAt: schema.modificationJobs.createdAt,
        updatedAt: schema.modificationJobs.updatedAt,
      })
      .from(schema.modificationJobs)
      .where(eq(schema.modificationJobs.initiatedByPrincipalId, userId))
      .orderBy(desc(schema.modificationJobs.createdAt)),
    // Deployments this user triggered, on any app (not just their own) —
    // deploying a release someone else's app doesn't require ownership,
    // just a collaborator grant.
    db
      .select({
        id: schema.deployments.id,
        appId: schema.deployments.appId,
        environment: schema.deployments.environment,
        status: schema.deployments.status,
        phase: schema.deployments.phase,
        isRollback: schema.deployments.isRollback,
        createdAt: schema.deployments.createdAt,
        updatedAt: schema.deployments.updatedAt,
      })
      .from(schema.deployments)
      .where(eq(schema.deployments.deployedByPrincipalId, userId))
      .orderBy(desc(schema.deployments.createdAt)),
    // Apps this user was added to as a collaborator (not apps they own —
    // that's already covered by `apps` above).
    db
      .select({
        id: schema.collaborators.id,
        appId: schema.collaborators.appId,
        role: schema.collaborators.role,
        status: schema.collaborators.status,
        createdAt: schema.collaborators.createdAt,
        updatedAt: schema.collaborators.updatedAt,
      })
      .from(schema.collaborators)
      .where(eq(schema.collaborators.principalId, userId))
      .orderBy(desc(schema.collaborators.createdAt)),
  ]);

  const entries = [
    ...apps.map((app) => ({
      id: app.id,
      type: "app",
      title: app.name,
      status: app.status,
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
      href: `${base}/apps/${app.id}`,
      metadata: {},
    })),
    ...generationJobs.map((job) => ({
      id: job.id,
      type: "generation_job",
      title: `Generation job (${job.phase})`,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      href: `${base}/apps/${job.appId}`,
      metadata: { attemptCount: job.attemptCount },
    })),
    ...modificationJobs.map((job) => ({
      id: job.id,
      type: "modification_job",
      title: `Modification job (${job.phase})`,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      href: `${base}/apps/${job.appId}`,
      metadata: { attemptCount: job.attemptCount },
    })),
    ...deployments.map((d) => ({
      id: d.id,
      type: "deployment",
      title: `Deployment to ${d.environment}${d.isRollback ? " (rollback)" : ""}`,
      status: d.status,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      href: `${base}/apps/${d.appId}`,
      metadata: { environment: d.environment, phase: d.phase, isRollback: d.isRollback },
    })),
    ...collaborations.map((c) => ({
      id: c.id,
      type: "collaboration",
      title: `Collaborator (${c.role})`,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      href: `${base}/apps/${c.appId}`,
      metadata: { role: c.role },
    })),
  ];

  return NextResponse.json({ entries });
}
