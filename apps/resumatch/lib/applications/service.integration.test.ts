import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Application updates against a real database (issue #895): workspace
 * scoping, omitted vs. null fields, no write for an unchanged PATCH, and
 * audit events that carry field names, never note text. Guarded behind
 * `RESUMATCH_TEST_DATABASE_URL`; `pnpm test` never touches a database.
 *
 *   RESUMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/resumatch exec vitest run --config vitest.integration.config.ts lib/applications/service.integration.test.ts
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;

const NOTE = "Recruiter said salary band is 90-95k";

describe.skipIf(!TEST_DB)("updateApplication", () => {
  let db: import("../db/generated").PrismaClient;
  let service: typeof import("./service");
  const workspaceIds: string[] = [];

  async function seed() {
    const ws = await db.workspace.create({
      data: { platformUserId: `applications-test-${Date.now()}-${Math.random()}` },
      select: { id: true },
    });
    workspaceIds.push(ws.id);
    const job = await db.targetJob.create({
      data: { workspaceId: ws.id, sourceUrl: "https://example.test/jobs/1", title: "Engineer", status: "FETCHED" },
      select: { id: true },
    });
    const application = await service.createApplication(ws.id, { targetJobId: job.id, notes: "first note" });
    return { workspaceId: ws.id, applicationId: application.id };
  }

  beforeAll(async () => {
    service = await import("./service");
    db = (await import("../db/client")).getJobmatchDb();
  });

  afterAll(async () => {
    if (!db || workspaceIds.length === 0) return;
    await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  });

  it("cannot update or read another workspace's application", async () => {
    const mine = await seed();
    const theirs = await seed();
    await expect(
      service.updateApplication(theirs.workspaceId, mine.applicationId, { notes: "overwritten" }),
    ).rejects.toBeInstanceOf(service.ApplicationNotFoundError);
    const listed = await service.listApplications(theirs.workspaceId);
    expect(listed.map((a) => a.id)).not.toContain(mine.applicationId);
    const row = await db.application.findUniqueOrThrow({ where: { id: mine.applicationId } });
    expect(row.notes).toBe("first note");
  });

  it("leaves omitted fields unchanged and clears a field sent as null", async () => {
    const { workspaceId, applicationId } = await seed();
    await service.updateApplication(workspaceId, applicationId, { followUpDate: new Date("2026-12-01T00:00:00Z") });
    await service.updateApplication(workspaceId, applicationId, { status: "APPLIED" });
    let row = await db.application.findUniqueOrThrow({ where: { id: applicationId } });
    expect(row).toMatchObject({ status: "APPLIED", notes: "first note", followUpDate: new Date("2026-12-01T00:00:00Z") });

    await service.updateApplication(workspaceId, applicationId, { notes: null });
    row = await db.application.findUniqueOrThrow({ where: { id: applicationId } });
    expect(row).toMatchObject({ status: "APPLIED", notes: null, followUpDate: new Date("2026-12-01T00:00:00Z") });
  });

  it("sets, changes and clears a follow-up date, auditing only the field name", async () => {
    const { workspaceId, applicationId } = await seed();
    const { parseFollowUpDate } = await import("./patch");
    const { followUpDateToDay } = await import("./followUp");
    for (const day of ["2026-12-31", "2027-01-01"]) {
      await service.updateApplication(workspaceId, applicationId, { followUpDate: parseFollowUpDate(day) });
      const row = await db.application.findUniqueOrThrow({ where: { id: applicationId } });
      expect(followUpDateToDay(row.followUpDate)).toBe(day);
    }
    await service.updateApplication(workspaceId, applicationId, { followUpDate: null });
    const row = await db.application.findUniqueOrThrow({ where: { id: applicationId } });
    expect(row.followUpDate).toBeNull();

    const updates = await db.auditEvent.findMany({ where: { workspaceId, action: "application.updated" } });
    expect(updates).toHaveLength(3);
    for (const event of updates) {
      expect(event.metadata).toMatchObject({ changedFields: "followUpDate" });
      expect(JSON.stringify(event.metadata)).not.toMatch(/2026|2027/);
    }
  });

  it("writes nothing for an unchanged update", async () => {
    const { workspaceId, applicationId } = await seed();
    const before = await db.application.findUniqueOrThrow({ where: { id: applicationId } });
    const eventsBefore = await db.auditEvent.count({ where: { workspaceId } });
    await service.updateApplication(workspaceId, applicationId, { notes: "first note", status: "SAVED" });
    const after = await db.application.findUniqueOrThrow({ where: { id: applicationId } });
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(await db.auditEvent.count({ where: { workspaceId } })).toBe(eventsBefore);
  });

  it("records which fields changed, never the note text", async () => {
    const { workspaceId, applicationId } = await seed();
    await service.updateApplication(workspaceId, applicationId, { notes: NOTE, status: "INTERVIEWING" });
    const events = await db.auditEvent.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.action)).toEqual(
      expect.arrayContaining(["application.created", "application.status_changed", "application.updated"]),
    );
    expect(JSON.stringify(events)).not.toContain(NOTE);
    expect(JSON.stringify(events)).not.toContain("first note");
  });
});
