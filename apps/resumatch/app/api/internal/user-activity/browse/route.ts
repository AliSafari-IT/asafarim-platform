import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getJobmatchDb } from "@/lib/db/client";
import {
  applicationEntry,
  statusChangeApplicationIds,
  statusChangeEntry,
  type JobLabel,
} from "@/lib/activity/applicationEntries";
import { STREAM_DONE, mergeFeedPage } from "@/lib/activity/mergeFeed";

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
 * Applications and their status changes (lib/activity/applicationEntries.ts)
 * are merged in too: an application when it is saved, and one entry per
 * `application.status_changed` audit event (applied, interviewing, offer,
 * rejected) at the time it happened.
 *
 * Four content types are merged into one newest-first feed. Each type is
 * paginated independently (its own `limit+1` fetch, its own cursor), then
 * interleaved by createdAt and cut to `limit` by mergeFeedPage
 * (lib/activity/mergeFeed.ts), which advances each cursor only past the
 * rows actually returned and marks a finished type done, so no row repeats
 * or goes missing between pages. The cursor this route hands back is opaque to
 * its caller (createRemoteAdapter just round-trips it as `?cursor=`) — only
 * this route ever parses it, so encoding it as a small per-type JSON object
 * is safe.
 *
 * `href` points at the specific item (/tailor/{id}/preview,
 * /cover-letter/{id}/preview), matching Vionto's adapter's own
 * per-project deep links rather than a generic landing page — same
 * convention, same caveat: those pages are scoped to their owning
 * candidate's own session (getCurrentWorkspace()), so a superadmin
 * clicking through lands on a 404 unless they happen to be signed into
 * ResuMatch as that candidate. There is deliberately no admin bypass for
 * a candidate's private CV/cover-letter content — the link exists for a
 * candidate who reports an issue and can be asked "open this exact URL",
 * not for an admin to read someone else's resume unasked.
 */
export const dynamic = "force-dynamic";

const MAX_LIMIT = 100;

const STREAM_KEYS = ["resume", "letter", "application", "status"] as const;
type StreamKey = (typeof STREAM_KEYS)[number];
type Cursors = Partial<Record<StreamKey, string>>;

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
    const cursors: Cursors = {};
    for (const key of STREAM_KEYS) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === "string") cursors[key] = value;
    }
    return cursors;
  } catch {
    return {};
  }
}

interface FeedEntry {
  id: string;
  type: string;
  title: string;
  status: string;
  createdAt: Date;
  /** Set only by entries that can change after creation (applications). */
  updatedAt?: string;
  href: string;
  metadata: Record<string, unknown>;
  ownerUserId: string;
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

  /** A stream already marked done isn't queried again. */
  const done = (key: StreamKey) => cursors[key] === STREAM_DONE;
  const olderThan = (key: StreamKey) => {
    const cursor = cursors[key];
    return cursor ? { createdAt: { lt: new Date(cursor) } } : {};
  };

  const [resumeRows, letterRows, applicationRows, statusRows] = await Promise.all([
    done("resume")
      ? []
      : db.tailoredResume.findMany({
          where: olderThan("resume"),
          orderBy: { createdAt: "desc" },
          take: limit + 1,
          select: {
            id: true,
            createdAt: true,
            targetJob: { select: { title: true, employer: true } },
            workspace: { select: { platformUserId: true } },
          },
        }),
    done("letter")
      ? []
      : db.coverLetter.findMany({
          where: olderThan("letter"),
          orderBy: { createdAt: "desc" },
          take: limit + 1,
          select: {
            id: true,
            createdAt: true,
            targetJob: { select: { title: true, employer: true } },
            workspace: { select: { platformUserId: true } },
          },
        }),
    done("application")
      ? []
      : db.application.findMany({
          where: olderThan("application"),
          orderBy: { createdAt: "desc" },
          take: limit + 1,
          select: {
            id: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            followUpDate: true,
            tailoredResumeId: true,
            targetJob: { select: { title: true, employer: true } },
            workspace: { select: { platformUserId: true } },
          },
        }),
    done("status")
      ? []
      : db.auditEvent.findMany({
          where: { action: "application.status_changed", workspaceId: { not: null }, ...olderThan("status") },
          orderBy: { createdAt: "desc" },
          take: limit + 1,
          select: {
            id: true,
            createdAt: true,
            metadata: true,
            workspace: { select: { platformUserId: true } },
          },
        }),
  ]);

  const statusPage = statusRows.slice(0, limit);

  // Status-change events name their application by id: one batched lookup
  // for the job labels of every application this page mentions.
  const referencedApplications = await db.application.findMany({
    where: { id: { in: statusChangeApplicationIds(statusPage) } },
    select: { id: true, targetJob: { select: { title: true, employer: true } } },
  });
  const jobByApplication = new Map<string, JobLabel>(referencedApplications.map((a) => [a.id, a.targetJob]));

  function titleFor(row: { targetJob: { title: string | null; employer: string | null } }, fallback: string): string {
    return `${row.targetJob.title ?? fallback}${row.targetJob.employer ? ` · ${row.targetJob.employer}` : ""}`;
  }

  const resumeEntries: FeedEntry[] = resumeRows.slice(0, limit).map((row) => ({
    id: row.id,
    type: "tailored_resume",
    title: titleFor(row, "Tailored CV"),
    status: "generated",
    createdAt: row.createdAt,
    href: `${base}/tailor/${row.id}/preview`,
    metadata: {},
    ownerUserId: row.workspace.platformUserId,
  }));
  const letterEntries: FeedEntry[] = letterRows.slice(0, limit).map((row) => ({
    id: row.id,
    type: "cover_letter",
    title: titleFor(row, "Cover letter"),
    status: "generated",
    createdAt: row.createdAt,
    href: `${base}/cover-letter/${row.id}/preview`,
    metadata: {},
    ownerUserId: row.workspace.platformUserId,
  }));
  const applicationEntries: FeedEntry[] = applicationRows.slice(0, limit).map((row) => ({
    ...applicationEntry(row, base),
    createdAt: row.createdAt,
    ownerUserId: row.workspace.platformUserId,
  }));
  const statusEntries: FeedEntry[] = statusPage.flatMap((row) => {
    const entry = statusChangeEntry(row, jobByApplication, base);
    // workspaceId is filtered non-null above, so workspace is always set.
    if (!entry || !row.workspace) return [];
    return [{ ...entry, createdAt: row.createdAt, ownerUserId: row.workspace.platformUserId }];
  });

  const merged = mergeFeedPage<FeedEntry>(
    [
      { key: "resume", rows: resumeEntries, hasMore: resumeRows.length > limit, cursor: cursors.resume },
      { key: "letter", rows: letterEntries, hasMore: letterRows.length > limit, cursor: cursors.letter },
      {
        key: "application",
        rows: applicationEntries,
        hasMore: applicationRows.length > limit,
        cursor: cursors.application,
      },
      { key: "status", rows: statusEntries, hasMore: statusRows.length > limit, cursor: cursors.status },
    ],
    limit,
  );

  return NextResponse.json({
    entries: merged.entries.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
      // Applications carry their own last-change time; the rest never change.
      updatedAt: entry.updatedAt ?? entry.createdAt.toISOString(),
    })),
    nextCursor: merged.hasMore ? JSON.stringify(merged.cursors) : null,
  });
}
