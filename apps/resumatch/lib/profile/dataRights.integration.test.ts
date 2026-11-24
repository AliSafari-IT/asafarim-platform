import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * GDPR export/erase coverage for TargetJob/TailoredResume, against a real
 * database. Guarded behind `RESUMATCH_TEST_DATABASE_URL`, mirroring the
 * other integration suites in this app — `pnpm test` never touches a
 * database. Run explicitly:
 *
 *   RESUMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/resumatch exec vitest run lib/profile/dataRights.integration.test.ts
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;

describe.skipIf(!TEST_DB)("data rights — TargetJob/TailoredResume coverage", () => {
  let db: import("../db/generated").PrismaClient;
  let exportWorkspaceData: typeof import("./dataRights").exportWorkspaceData;
  let eraseWorkspaceData: typeof import("./dataRights").eraseWorkspaceData;
  let createVersion: typeof import("./versions").createVersion;
  let confirmVersion: typeof import("./versions").confirmVersion;

  let workspaceId: string;

  beforeAll(async () => {
    ({ exportWorkspaceData, eraseWorkspaceData } = await import("./dataRights"));
    ({ createVersion, confirmVersion } = await import("./versions"));
    db = (await import("../db/client")).getJobmatchDb();
  });

  afterAll(async () => {
    if (!db || !workspaceId) return;
    await db.tailorPreview.deleteMany({ where: { workspaceId } });
    await db.tailoredResume.deleteMany({ where: { workspaceId } });
    await db.targetJob.deleteMany({ where: { workspaceId } });
    await db.candidateProfileVersion.deleteMany({ where: { profile: { workspaceId } } });
    await db.candidateProfile.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
  });

  it("includes target jobs and tailored resumes in the export, then erases both", async () => {
    const ws = await db.workspace.create({
      data: { platformUserId: `datarights-tailor-test-${Date.now()}` },
      select: { id: true },
    });
    workspaceId = ws.id;

    const version = await createVersion({
      workspaceId,
      content: { headline: "Backend engineer", skills: [{ name: "TypeScript", rawLabel: null, yearsExperience: 5 }] },
      origin: "MANUAL",
      extractorName: "test",
      extractorVersion: "1",
    });
    await confirmVersion(workspaceId, version.id);

    const targetJob = await db.targetJob.create({
      data: {
        workspaceId,
        sourceUrl: "https://example.test/jobs/1",
        rawText: "We need a TypeScript engineer.",
        title: "Backend Engineer",
        employer: "Example Corp",
        status: "FETCHED",
      },
      select: { id: true },
    });

    const savedCv = await db.tailoredResume.create({
      data: {
        workspaceId,
        profileVersionId: version.id,
        targetJobId: targetJob.id,
        content: { skills: ["TypeScript"], experience: [], education: [], certifications: [] },
        templateKey: "classic",
        promptVersion: "tailor_resume@2",
        modelVersion: "fixture-tailor-1",
        degraded: false,
        // A saved paragraph that is not the active layout is still exported.
        skillsLayout: "grouped",
        skillsParagraph: "Front-end work with TypeScript.",
        // Review feedback (#932), written in the same statement as the CV.
        feedback: {
          create: {
            workspaceId,
            previewId: `prev-${Date.now()}`,
            feedbackVersion: "tailoring_feedback@1",
            original: { cv: { headline: "TypeScript lead", summary: null, skillsOrder: [], experienceBullets: [] }, coverLetter: null },
            decisions: [{ key: "headline", decision: "edited", final: "TypeScript engineer", scope: "application" }],
          },
        },
      },
      select: { id: true },
    });

    // An unconfirmed preview with a request context (#928): its note and job
    // text copy must not survive erasure.
    await db.tailorPreview.create({
      data: {
        workspaceId,
        profileVersionId: version.id,
        targetJobId: targetJob.id,
        promptVersion: "tailor_resume@6",
        modelVersion: "fixture-tailor-1",
        degraded: false,
        contextVersion: "tailoring_context@1",
        context: { instructions: "Please leave out my former employer.", jobTextUsed: "We need a TypeScript engineer." },
      },
    });

    // Background evidence (#929): exported with every revision, then erased.
    await db.candidateEvidence.create({
      data: {
        workspaceId,
        scope: "BACKGROUND",
        revisions: {
          create: [
            { workspaceId, revisionNumber: 1, kind: "PROJECT", title: "Billing rewrite", detail: "Moved billing to TypeScript.", status: "CONFIRMED", confirmedAt: new Date() },
            { workspaceId, revisionNumber: 2, kind: "PROJECT", title: "Billing rewrite", detail: "Moved billing to TypeScript in 2024." },
          ],
        },
      },
    });

    // Writing preferences (#931): every revision exported, then erased.
    await db.writingPreferenceRevision.createMany({
      data: [
        { workspaceId, revisionNumber: 1, content: { cv: { outputLanguage: "nl", styleNote: "Short sentences." }, coverLetter: {} } },
        { workspaceId, revisionNumber: 2, content: { cv: {}, coverLetter: {} } },
      ],
    });

    const exported = await exportWorkspaceData(workspaceId);
    expect(exported).not.toBeNull();
    expect(exported!.tailoringFeedback).toHaveLength(1);
    expect(exported!.tailoringFeedback[0]).toMatchObject({ tailoredResumeId: savedCv.id, feedbackVersion: "tailoring_feedback@1" });
    expect(JSON.stringify(exported!.tailoringFeedback[0]!.decisions)).toContain("TypeScript engineer");
    expect(exported!.writingPreferences.map((r) => r.revisionNumber)).toEqual([1, 2]);
    expect(JSON.stringify(exported!.writingPreferences[0]!.content)).toContain("Short sentences.");
    expect(exported!.targetJobs).toHaveLength(1);
    expect(exported!.targetJobs[0]).toMatchObject({ sourceUrl: "https://example.test/jobs/1", title: "Backend Engineer" });
    expect(exported!.tailoredResumes).toHaveLength(1);
    expect(exported!.tailoredResumes[0]).toMatchObject({
      targetJobId: targetJob.id,
      templateKey: "classic",
      skillsLayout: "grouped",
      skillsParagraph: "Front-end work with TypeScript.",
    });
    // A CV saved without a context exports a null one (#931 keeps notes there).
    expect(exported!.tailoredResumes[0]!.tailoringContext).toBeNull();

    expect(exported!.evidence).toHaveLength(1);
    expect(exported!.evidence[0]!.revisions.map((r) => [r.revisionNumber, r.status, r.detail])).toEqual([
      [1, "CONFIRMED", "Moved billing to TypeScript."],
      [2, "DRAFT", "Moved billing to TypeScript in 2024."],
    ]);

    const erasure = await eraseWorkspaceData(workspaceId);
    expect(erasure.targetJobsDeleted).toBe(1);
    expect(erasure.tailoredResumesDeleted).toBe(1);

    const remainingJobs = await db.targetJob.count({ where: { workspaceId } });
    const remainingResumes = await db.tailoredResume.count({ where: { workspaceId } });
    expect(remainingJobs).toBe(0);
    expect(remainingResumes).toBe(0);
    expect(await db.tailorPreview.count({ where: { workspaceId } })).toBe(0);
    expect(await db.candidateEvidence.count({ where: { workspaceId } })).toBe(0);
    expect(await db.candidateEvidenceRevision.count({ where: { workspaceId } })).toBe(0);
    expect(await db.writingPreferenceRevision.count({ where: { workspaceId } })).toBe(0);
    expect(await db.tailoringFeedback.count({ where: { workspaceId } })).toBe(0);
    expect(await db.workspace.count({ where: { id: workspaceId } })).toBe(1);
  });
});
