import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getJobmatchDb } from "@/lib/db/client";

/**
 * Read-only, superadmin console-facing activity feed for one platform
 * user's JobMatch footprint. Carries no session — authenticates its own
 * bearer token in constant time and 404s when the secret is unset, matching
 * the platform's machine-endpoint pattern. Listed in proxy.ts publicRoutes
 * for that reason. The admin console never holds JobMatch's own DB
 * credentials — this route is the only door into that data (issue #301).
 *
 * JobMatch stores an opaque platform user id on Workspace.platformUserId,
 * never a copy of the platform user table, so this route is the join point.
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

  const base = process.env.NEXT_PUBLIC_JOBMATCH_URL ?? "http://localhost:3012";
  const db = getJobmatchDb();

  const workspace = await db.workspace.findUnique({
    where: { platformUserId: userId },
    select: { id: true },
  });
  if (!workspace) {
    return NextResponse.json({ entries: [] });
  }

  const [profile, documents, trackedJobs] = await Promise.all([
    db.candidateProfile.findUnique({
      where: { workspaceId: workspace.id },
      select: { id: true, confirmedVersionId: true, createdAt: true, updatedAt: true },
    }),
    db.candidateDocument.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { uploadedAt: "desc" },
      select: {
        id: true,
        originalFilename: true,
        status: true,
        byteSize: true,
        uploadedAt: true,
        // Retention state: when the stored bytes become eligible for
        // deletion, and whether they already were (soft-deleted).
        retainUntil: true,
        deletedAt: true,
      },
    }),
    db.trackedJob.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        jobPosting: { select: { title: true, employer: true } },
      },
    }),
  ]);

  const entries = [
    ...(profile
      ? [
          {
            id: profile.id,
            type: "candidate_profile",
            title: "Candidate profile",
            status: profile.confirmedVersionId ? "confirmed" : "draft",
            createdAt: profile.createdAt.toISOString(),
            updatedAt: profile.updatedAt.toISOString(),
            href: `${base}/profile`,
            metadata: {},
          },
        ]
      : []),
    ...documents.map((doc) => ({
      id: doc.id,
      type: "document",
      title: doc.originalFilename,
      status: doc.deletedAt ? "deleted" : doc.status,
      createdAt: doc.uploadedAt.toISOString(),
      updatedAt: doc.uploadedAt.toISOString(),
      href: `${base}/documents`,
      metadata: {
        byteSize: doc.byteSize,
        retainUntil: doc.retainUntil?.toISOString() ?? null,
        deletedAt: doc.deletedAt?.toISOString() ?? null,
      },
    })),
    ...trackedJobs.map((job) => ({
      id: job.id,
      type: "tracked_job",
      title: `${job.jobPosting.title} · ${job.jobPosting.employer}`,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      href: `${base}/jobs`,
      metadata: {},
    })),
  ];

  return NextResponse.json({ entries });
}
