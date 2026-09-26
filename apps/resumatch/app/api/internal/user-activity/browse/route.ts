import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getJobmatchDb } from "@/lib/db/client";

/**
 * Read-only, superadmin console-facing "browse everyone's tailored resumes
 * and cover letters" feed for the Platform Activity view — cross-user,
 * unlike the per-user ../route.ts. Same bearer-gated machine-endpoint
 * pattern; covered by proxy.ts's "/api/internal/user-activity" publicRoutes
 * prefix match.
 *
 * Tailored resumes and cover letters are the flagship content here (closest
 * analog to Vionto's exports / TimelineAI's timelines / TasksAI's tasks —
 * the actual generated output a superadmin would want to browse).
 * Workspace.platformUserId is the join point back to the platform's own
 * user table, resolved by the console after this call — ResuMatch holds no
 * copy of that table itself (issue #301).
 *
 * Two content types are merged into one newest-first feed. Each type is
 * paginated independently (its own `limit+1` fetch, its own cursor), then
 * interleaved by createdAt and cut to `limit` — the same "acceptable
 * imprecision at a page boundary" tradeoff already documented and used by
 * listPlatformActivity's cross-*app* merge in packages/activity/src/
 * registry.ts, one level up. The cursor this route hands back is opaque to
 * its caller (createRemoteAdapter just round-trips it as `?cursor=`) — only
 * this route ever parses it, so encoding it as a small per-type JSON object
 * is safe.
 */
export const dynamic = "force-dynamic";

const MAX_LIMIT = 100;

interface Cursors {
  resume?: string;
  letter?: string;
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return false;
  const presented = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const presentedBuf = Buffer.from(presented);
  const secretBuf = Buffer.from(secret);
  if (presentedBuf.length !== secretBuf.length) return false;
  return timingSafeEqual(presentedBuf, secretBuf);
}

function parseCursor(raw: string | null): Cursors {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const { resume, letter } = parsed as Record<string, unknown>;
    return {
      resume: typeof resume === "string" ? resume : undefined,
      letter: typeof letter === "string" ? letter : undefined,
    };
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 25, MAX_LIMIT);
  const cursors = parseCursor(url.searchParams.get("cursor"));

  const base = process.env.NEXT_PUBLIC_RESUMATCH_URL ?? "http://localhost:3012";
  const db = getJobmatchDb();

  const [resumeRows, letterRows] = await Promise.all([
    db.tailoredResume.findMany({
      where: cursors.resume ? { createdAt: { lt: new Date(cursors.resume) } } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      select: {
        id: true,
        createdAt: true,
        targetJob: { select: { title: true, employer: true } },
        workspace: { select: { platformUserId: true } },
      },
    }),
    db.coverLetter.findMany({
      where: cursors.letter ? { createdAt: { lt: new Date(cursors.letter) } } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      select: {
        id: true,
        createdAt: true,
        targetJob: { select: { title: true, employer: true } },
        workspace: { select: { platformUserId: true } },
      },
    }),
  ]);

  const resumeHasMore = resumeRows.length > limit;
  const letterHasMore = letterRows.length > limit;
  const resumePage = resumeHasMore ? resumeRows.slice(0, limit) : resumeRows;
  const letterPage = letterHasMore ? letterRows.slice(0, limit) : letterRows;

  function titleFor(row: { targetJob: { title: string | null; employer: string | null } }, fallback: string): string {
    return `${row.targetJob.title ?? fallback}${row.targetJob.employer ? ` · ${row.targetJob.employer}` : ""}`;
  }

  const resumeEntries = resumePage.map((row) => ({
    id: row.id,
    type: "tailored_resume" as const,
    title: titleFor(row, "Tailored CV"),
    status: "generated",
    createdAt: row.createdAt,
    href: `${base}/tailor`,
    metadata: {},
    ownerUserId: row.workspace.platformUserId,
  }));
  const letterEntries = letterPage.map((row) => ({
    id: row.id,
    type: "cover_letter" as const,
    title: titleFor(row, "Cover letter"),
    status: "generated",
    createdAt: row.createdAt,
    href: `${base}/tailor`,
    metadata: {},
    ownerUserId: row.workspace.platformUserId,
  }));

  const merged = [...resumeEntries, ...letterEntries]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);

  const nextCursors: Cursors = {};
  if (resumeHasMore) nextCursors.resume = resumePage[resumePage.length - 1]!.createdAt.toISOString();
  if (letterHasMore) nextCursors.letter = letterPage[letterPage.length - 1]!.createdAt.toISOString();
  const hasMore = Object.keys(nextCursors).length > 0;

  return NextResponse.json({
    entries: merged.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? JSON.stringify(nextCursors) : null,
  });
}
