import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * #942 round trip against a real database: export account A, import its
 * confirmed profile into account B. Guarded behind
 * `RESUMATCH_TEST_DATABASE_URL` like the other integration suites:
 *
 *   RESUMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/resumatch exec vitest run --config vitest.integration.config.ts lib/profile/exportImport.integration.test.ts
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;

describe.skipIf(!TEST_DB)("profile import — export A, import into B", () => {
  let db: import("../db/generated").PrismaClient;
  let versions: typeof import("./versions");
  let exportWorkspaceData: typeof import("./dataRights").exportWorkspaceData;
  let readProfileExport: typeof import("./exportImport").readProfileExport;
  const workspaceIds: string[] = [];

  beforeAll(async () => {
    ({ exportWorkspaceData } = await import("./dataRights"));
    ({ readProfileExport } = await import("./exportImport"));
    versions = await import("./versions");
    db = (await import("../db/client")).getJobmatchDb();
  });

  afterAll(async () => {
    if (!db) return;
    for (const workspaceId of workspaceIds) {
      await db.candidateProfile.updateMany({ where: { workspaceId }, data: { confirmedVersionId: null } });
      await db.candidateProfileVersion.deleteMany({ where: { profile: { workspaceId } } });
      await db.candidateProfile.deleteMany({ where: { workspaceId } });
      await db.targetJob.deleteMany({ where: { workspaceId } });
      await db.auditEvent.deleteMany({ where: { workspaceId } });
      await db.workspace.deleteMany({ where: { id: workspaceId } });
    }
  });

  const newWorkspace = async (name: string) => {
    const ws = await db.workspace.create({ data: { platformUserId: `import-test-${name}-${Date.now()}` }, select: { id: true } });
    workspaceIds.push(ws.id);
    return ws.id;
  };

  it("restores A's confirmed profile into B as a new unconfirmed version and leaves A untouched", async () => {
    const a = await newWorkspace("a");
    const b = await newWorkspace("b");

    const base = { contractVersion: "1.0.0" };
    const confirmedContent = {
      ...base,
      fullName: "Jordan Example",
      headline: "Developer",
      links: [{ kind: "github", label: null, url: "https://github.example.test/jordan" }],
      skills: [{ name: "TypeScript", category: "Languages" }, { name: "Playwright" }, { name: "PostgreSQL" }],
      experience: [
        { title: "Engineer", employer: "Example Co", startedOn: "2021-03", isCurrent: true },
        { title: "Analyst", employer: "Other Co", startedOn: "2018-01", endedOn: "2021-02" },
      ],
      education: [{ qualification: "MSc", institution: "Example University", completedOn: "2010" }],
    };
    await versions.createVersion({ workspaceId: a, content: { ...base, headline: "First draft" }, origin: "MANUAL", extractorName: "t", extractorVersion: "1" });
    const confirmed = await versions.createVersion({ workspaceId: a, content: confirmedContent, origin: "MANUAL", extractorName: "t", extractorVersion: "1" });
    await versions.confirmVersion(a, confirmed.id);
    // A newer, unconfirmed draft: the import must not take it.
    await versions.createVersion({ workspaceId: a, content: { ...base, headline: "Unconfirmed newer draft" }, origin: "MANUAL", extractorName: "t", extractorVersion: "1" });
    await db.targetJob.create({ data: { workspaceId: a, sourceUrl: "https://jobs.example.test/1", title: "Job", status: "FETCHED", rawText: "Job text" } });

    // B already has its own profile.
    const own = await versions.createVersion({ workspaceId: b, content: { ...base, headline: "B's own" }, origin: "MANUAL", extractorName: "t", extractorVersion: "1" });
    await versions.confirmVersion(b, own.id);

    const exported = await exportWorkspaceData(a);
    const result = readProfileExport(new TextEncoder().encode(JSON.stringify(exported, null, 2)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.source.id).toBe(confirmed.id);
    expect(result.preview.excluded).toEqual(expect.arrayContaining([{ part: "otherVersions", count: 2 }, { part: "targetJobs", count: 1 }]));

    const created = await versions.createVersion({ workspaceId: b, content: result.content, origin: "MANUAL", extractorName: "resumatch-export-import", extractorVersion: "1.0.0" });

    const imported = await versions.getVersion(b, created.id);
    expect(imported?.content).toEqual(confirmed.content);
    expect(imported?.isConfirmed).toBe(false);
    expect(created.versionNumber).toBe(2);
    // B's confirmed version is still its own until B confirms the import.
    expect((await versions.getConfirmedVersion(b))?.id).toBe(own.id);
    // Nothing else came over.
    expect(await db.targetJob.count({ where: { workspaceId: b } })).toBe(0);
    // A is unchanged and cannot see B's version.
    expect(await versions.getVersion(a, created.id)).toBeNull();
    expect((await versions.listVersions(a)).length).toBe(3);
    expect((await versions.getConfirmedVersion(a))?.id).toBe(confirmed.id);
  });
});
