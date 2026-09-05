import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The showcase source, end to end against a real database (issue #208):
 * load → idempotent reload → deduplication → confirmed-profile → search →
 * eligibility reasons.
 *
 * Guarded behind `JOBMATCH_TEST_DATABASE_URL` and named `*.integration.test.ts`
 * so `pnpm test` never touches a database — the dev database must never be a
 * test target (see the AppBuilder incident in docs/threat-model.md). Run it
 * explicitly against a throwaway database:
 *
 *   JOBMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/jobmatch exec vitest run lib/ingestion/showcaseSource.integration.test.ts
 */

const TEST_DB = process.env.JOBMATCH_TEST_DATABASE_URL;

// Point JobMatch's env contract at the throwaway database before any module
// that calls getJobmatchDb() is imported.
if (TEST_DB) process.env.JOBMATCH_DATABASE_URL = TEST_DB;

describe.skipIf(!TEST_DB)("showcase source — database flow", () => {
  let loadShowcaseSource: typeof import("./showcaseSource").loadShowcaseSource;
  let getShowcaseStatus: typeof import("./showcaseSource").getShowcaseStatus;
  let SHOWCASE_SOURCE_KEY: string;
  let SHOWCASE_ACTIVE_COUNT: number;
  let db: import("../db/generated").PrismaClient;
  let searchJobs: typeof import("../search/service").searchJobs;
  let createVersion: typeof import("../profile/versions").createVersion;
  let confirmVersion: typeof import("../profile/versions").confirmVersion;
  let workspaceId: string;

  beforeAll(async () => {
    ({ loadShowcaseSource, getShowcaseStatus, SHOWCASE_SOURCE_KEY, SHOWCASE_ACTIVE_COUNT } =
      await import("./showcaseSource"));
    db = (await import("../db/client")).getJobmatchDb();
    ({ searchJobs } = await import("../search/service"));
    ({ createVersion, confirmVersion } = await import("../profile/versions"));

    // Clean slate for the source under test.
    const existing = await db.jobSource.findUnique({ where: { key: SHOWCASE_SOURCE_KEY } });
    if (existing) {
      await db.jobPosting.deleteMany({ where: { sourceId: existing.id } });
      await db.jobSnapshot.deleteMany({ where: { sourceId: existing.id } });
      await db.ingestionRun.deleteMany({ where: { sourceId: existing.id } });
    }

    const workspace = await db.workspace.create({
      data: { platformUserId: `test-${Date.now()}` },
      select: { id: true },
    });
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    if (!db) return;
    await db.workspace.deleteMany({ where: { id: workspaceId } });
  });

  it("loads every fixture record, collapsing the deliberate duplicate", async () => {
    const result = await loadShowcaseSource({ reset: true });
    expect(result.outcome).toBe("SUCCEEDED");
    expect(result.recordsAdded).toBe(SHOWCASE_ACTIVE_COUNT);
    expect(result.duplicatesFound).toBe(1);

    const status = await getShowcaseStatus();
    expect(status).toMatchObject({ configured: true, synced: true });
    expect(status.activePostings).toBe(SHOWCASE_ACTIVE_COUNT);
  });

  it("is idempotent — a second load adds and changes nothing", async () => {
    const again = await loadShowcaseSource();
    expect(again.outcome).toBe("SUCCEEDED");
    expect(again.recordsAdded).toBe(0);
    expect(again.recordsUpdated).toBe(0);

    const status = await getShowcaseStatus();
    expect(status.activePostings).toBe(SHOWCASE_ACTIVE_COUNT);
  });

  it("every displayed posting carries its synthetic source attribution", async () => {
    const search = await searchJobs(workspaceId, { page: 1, pageSize: 20, sort: "newest" });

    expect(search.items.length).toBeGreaterThan(0);
    for (const item of search.items) {
      expect(item.attributionText?.toLowerCase()).toContain("synthetic");
    }
  });

  it("after profile confirmation, search returns deterministic eligibility reasons", async () => {
    const version = await createVersion({
      workspaceId,
      origin: "MANUAL",
      extractorName: "test",
      extractorVersion: "0",
      content: {
        workAuthorization: "requires_sponsorship",
        languages: [{ code: "en", label: "English", proficiency: "native" }],
      },
    });
    expect(await confirmVersion(workspaceId, version.id)).toBe(true);

    const search = await searchJobs(workspaceId, { page: 1, pageSize: 20, sort: "newest" });

    expect(search.eligibilityAvailable).toBe(true);
    // A candidate needing sponsorship is excluded from the roles that
    // explicitly do not offer it, with a stated reason.
    const excluded = search.items.filter((item) => item.eligibility?.eligible === false);
    expect(excluded.length).toBeGreaterThan(0);
    expect(
      excluded.flatMap((item) => item.eligibility!.reasons.map((reason) => reason.code)),
    ).toContain("REQUIRES_SPONSORSHIP_NOT_OFFERED");
  });
});
