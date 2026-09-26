import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * ResuMatch's cross-user "browse everyone's tailored resumes and cover
 * letters" feed, backing the admin console's Platform Activity view. Calls
 * the route handler
 * directly against a real database, guarded behind
 * RESUMATCH_TEST_DATABASE_URL like the rest of this app's
 * *.integration.test.ts files.
 *
 *   INTERNAL_API_SECRET=test-secret RESUMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/resumatch exec vitest run app/api/internal/user-activity/browse/route.integration.test.ts
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;
if (TEST_DB && !process.env.INTERNAL_API_SECRET) {
  process.env.INTERNAL_API_SECRET = "browse-test-secret";
}

describe.skipIf(!TEST_DB)("GET /api/internal/user-activity/browse", () => {
  let db: import("../../../../../lib/db/generated").PrismaClient;
  let GET: typeof import("./route").GET;
  let workspaceIds: string[];
  let platformUserIdA: string;
  let platformUserIdB: string;
  let applicationId: string;
  let statusChangeId: string;
  let fixtureIdsNewestFirst: string[];

  beforeAll(async () => {
    ({ GET } = await import("./route"));
    db = (await import("../../../../../lib/db/client")).getJobmatchDb();

    const base = Date.now();
    platformUserIdA = `browse-test-a-${base}`;
    platformUserIdB = `browse-test-b-${base}`;
    const ws1 = await db.workspace.create({
      data: { platformUserId: platformUserIdA },
      select: { id: true },
    });
    const ws2 = await db.workspace.create({
      data: { platformUserId: platformUserIdB },
      select: { id: true },
    });
    workspaceIds = [ws1.id, ws2.id];

    const job1 = await db.targetJob.create({
      data: {
        workspaceId: ws1.id,
        sourceUrl: "https://example.com/job-1",
        title: "Engineer",
        employer: "Acme",
        status: "FETCHED",
      },
      select: { id: true },
    });
    const job2 = await db.targetJob.create({
      data: {
        workspaceId: ws2.id,
        sourceUrl: "https://example.com/job-2",
        title: "Designer",
        employer: "Globex",
        status: "FETCHED",
      },
      select: { id: true },
    });
    const profile1 = await db.candidateProfile.create({ data: { workspaceId: ws1.id }, select: { id: true } });
    const profile2 = await db.candidateProfile.create({ data: { workspaceId: ws2.id }, select: { id: true } });
    const version1 = await db.candidateProfileVersion.create({
      data: {
        profileId: profile1.id,
        versionNumber: 1,
        origin: "MANUAL",
        extractorName: "test",
        extractorVersion: "1",
        content: {},
      },
      select: { id: true },
    });
    const version2 = await db.candidateProfileVersion.create({
      data: {
        profileId: profile2.id,
        versionNumber: 1,
        origin: "MANUAL",
        extractorName: "test",
        extractorVersion: "1",
        content: {},
      },
      select: { id: true },
    });

    const resume1 = await db.tailoredResume.create({
      data: {
        workspaceId: ws1.id,
        targetJobId: job1.id,
        profileVersionId: version1.id,
        content: {},
        templateKey: "default",
        promptVersion: "1",
        modelVersion: "test",
        createdAt: new Date(base - 1000),
      },
      select: { id: true },
    });
    const resume2 = await db.tailoredResume.create({
      data: {
        workspaceId: ws2.id,
        targetJobId: job2.id,
        profileVersionId: version2.id,
        content: {},
        templateKey: "default",
        promptVersion: "1",
        modelVersion: "test",
        createdAt: new Date(base),
      },
      select: { id: true },
    });
    // Newest of all the fixtures — should sort first in the merged feed.
    const letter = await db.coverLetter.create({
      data: {
        workspaceId: ws1.id,
        targetJobId: job1.id,
        profileVersionId: version1.id,
        content: {},
        promptVersion: "1",
        modelVersion: "test",
        createdAt: new Date(base + 1000),
      },
      select: { id: true },
    });
    // An application saved before the CVs, then moved to OFFER in between.
    const application = await db.application.create({
      data: { workspaceId: ws2.id, targetJobId: job2.id, status: "OFFER", createdAt: new Date(base - 2000) },
      select: { id: true },
    });
    const statusChange = await db.auditEvent.create({
      data: {
        workspaceId: ws2.id,
        action: "application.status_changed",
        metadata: { applicationId: application.id, targetJobId: job2.id, fromStatus: "INTERVIEWING", toStatus: "OFFER" },
        createdAt: new Date(base - 500),
      },
      select: { id: true },
    });
    applicationId = application.id;
    statusChangeId = statusChange.id;
    fixtureIdsNewestFirst = [letter.id, resume2.id, statusChange.id, resume1.id, application.id];
  });

  afterAll(async () => {
    if (!db) return;
    for (const workspaceId of workspaceIds) {
      // TailoredResume/CoverLetter.profileVersion are onDelete: Restrict,
      // so both must go first; everything else cascades from the workspace
      // delete.
      await db.coverLetter.deleteMany({ where: { workspaceId } });
      await db.tailoredResume.deleteMany({ where: { workspaceId } });
      await db.workspace.deleteMany({ where: { id: workspaceId } });
    }
  });

  it("404s without a valid bearer token", async () => {
    const res = await GET(new Request("http://localhost/api/internal/user-activity/browse"));
    expect(res.status).toBe(404);
  });

  it("lists tailored resumes and cover letters across workspaces, merged newest first, each tagged with its owner", async () => {
    const res = await GET(
      new Request("http://localhost/api/internal/user-activity/browse?limit=50", {
        headers: { authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    const owners = body.entries.map((e: { ownerUserId: string }) => e.ownerUserId);
    expect(owners).toEqual(expect.arrayContaining([platformUserIdA, platformUserIdB]));

    const types = body.entries.map((e: { type: string }) => e.type);
    expect(types).toEqual(expect.arrayContaining(["tailored_resume", "cover_letter"]));

    // The cover letter was created newest of the three fixtures.
    expect(body.entries[0].type).toBe("cover_letter");
    expect(body.entries[0].title).toContain("Engineer");
    expect(body.entries[0].title).toContain("Acme");
    expect(body.entries[0].status).toBe("generated");

    const resumeEntry = body.entries.find((e: { type: string }) => e.type === "tailored_resume");
    expect(resumeEntry.title).toContain("Designer");
    expect(resumeEntry.title).toContain("Globex");
  });

  it("paginates with a cursor when more rows exist than the limit", async () => {
    const res = await GET(
      new Request("http://localhost/api/internal/user-activity/browse?limit=1", {
        headers: { authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` },
      }),
    );
    const body = await res.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].type).toBe("cover_letter");
    expect(body.nextCursor).not.toBeNull();

    const nextRes = await GET(
      new Request(
        `http://localhost/api/internal/user-activity/browse?limit=1&cursor=${encodeURIComponent(body.nextCursor)}`,
        { headers: { authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` } },
      ),
    );
    const nextBody = await nextRes.json();
    expect(nextBody.entries).toHaveLength(1);
    expect(nextBody.entries[0].id).not.toBe(body.entries[0].id);
  });

  it("lists applications and their status changes with their owner", async () => {
    const res = await GET(
      new Request("http://localhost/api/internal/user-activity/browse?limit=50", {
        headers: { authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` },
      }),
    );
    const body = await res.json();
    const application = body.entries.find((e: { id: string }) => e.id === applicationId);
    expect(application).toMatchObject({
      type: "application",
      title: "Designer · Globex",
      status: "offer",
      ownerUserId: platformUserIdB,
    });
    const change = body.entries.find((e: { id: string }) => e.id === statusChangeId);
    expect(change).toMatchObject({
      type: "application_status_change",
      title: "Designer · Globex: interviewing → offer",
      status: "offer",
      ownerUserId: platformUserIdB,
    });
  });

  it.each([1, 2, 3])("walks the whole feed at limit %i without repeating or dropping a row", async (limit) => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 500; guard++) {
      const query = new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) });
      const res = await GET(
        new Request(`http://localhost/api/internal/user-activity/browse?${query}`, {
          headers: { authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` },
        }),
      );
      const body = (await res.json()) as { entries: { id: string }[]; nextCursor: string | null };
      seen.push(...body.entries.map((e) => e.id));
      cursor = body.nextCursor;
      if (!cursor) break;
    }
    expect(cursor).toBeNull();
    expect(new Set(seen).size).toBe(seen.length);
    // Other test files share this database, so check this file's own rows
    // appear exactly once and in newest-first order among whatever else is there.
    expect(seen.filter((id) => fixtureIdsNewestFirst.includes(id))).toEqual(fixtureIdsNewestFirst);
  });
});
