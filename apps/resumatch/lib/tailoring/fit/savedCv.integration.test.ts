import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FitModelOutput } from "./contract";

/**
 * #973 against a real database: a saved CV's preview shows exactly the
 * assessment its run recorded, scored as of the CV's save time, and never
 * another profile version's or workspace's; later answers and reanalyses
 * show apart as "other"; legacy, keyword-only, deleted and no-text cases
 * get no number. Nothing here reaches a provider: the stub counts calls.
 * Guarded behind RESUMATCH_TEST_DATABASE_URL.
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;

const calls = { count: 0 };

const JOB = `Platform engineer
Requirements:
- 3+ years of experience with PostgreSQL
- Experience with Kubernetes in production
- Fluent in Dutch
- Experience with Docker`;

function reply(): FitModelOutput {
  return {
    requirements: [
      { key: "r1", quote: "3+ years of experience with PostgreSQL", priority: "required", category: "experience", essential: false, anyOf: null },
      { key: "r2", quote: "Experience with Kubernetes in production", priority: "required", category: "skill", essential: false, anyOf: null },
      { key: "r3", quote: "Fluent in Dutch", priority: "required", category: "language", essential: true, anyOf: null },
      { key: "r4", quote: "Experience with Docker", priority: "required", category: "skill", essential: false, anyOf: null },
    ],
    moreRequirementsOmitted: false,
    assessments: [
      { key: "r1", judgment: "direct", citations: [{ sourceId: "exp:0", quote: "Ran Postgres databases for six years" }], explanation: "Six years of Postgres.", equivalence: { jobTerm: "PostgreSQL", profileTerm: "Postgres" } },
      { key: "r2", judgment: "unknown", citations: [], explanation: "Not mentioned.", equivalence: null },
      { key: "r3", judgment: "direct", citations: [{ sourceId: "languages", quote: "Dutch (native)" }], explanation: "Native Dutch.", equivalence: null },
      { key: "r4", judgment: "direct", citations: [{ sourceId: "skills", quote: "Docker" }], explanation: "Listed.", equivalence: null },
    ],
  };
}

vi.mock("./ai/registry", () => ({
  JOB_FIT_PROMPT_VERSION: "job_fit@1",
  FIT_MODEL_VERSIONS: { fixture: "stub-fit", openai: "stub-openai", anthropic: "stub-anthropic" },
  getFitProvider: async () => ({
    name: "fixture",
    analyze: async () => {
      calls.count += 1;
      return { output: reply(), inputTokens: 100, outputTokens: 50, costUsd: 0 };
    },
  }),
}));

describe.skipIf(!TEST_DB)("saved CV job fit (#973)", () => {
  let db: import("../../db/generated").PrismaClient;
  let svc: typeof import("./service");
  let saved: typeof import("./savedCv");
  let ctx: typeof import("../context");
  const workspaces: string[] = [];

  beforeAll(async () => {
    db = (await import("../../db/client")).getJobmatchDb();
    svc = await import("./service");
    saved = await import("./savedCv");
    ctx = await import("../context");
  });

  afterAll(async () => {
    if (!db) return;
    for (const id of workspaces) {
      await db.jobFitAnswer.deleteMany({ where: { workspaceId: id } });
      await db.jobFitAssessment.deleteMany({ where: { workspaceId: id } });
      await db.candidateEvidence.deleteMany({ where: { workspaceId: id } });
      await db.targetJob.deleteMany({ where: { workspaceId: id } });
      await db.candidateProfile.updateMany({ where: { workspaceId: id }, data: { confirmedVersionId: null } });
      await db.candidateProfileVersion.deleteMany({ where: { profile: { workspaceId: id } } });
      await db.candidateProfile.deleteMany({ where: { workspaceId: id } });
      await db.workspace.deleteMany({ where: { id } });
    }
  });

  const CONTENT = {
    headline: "Backend engineer",
    languages: [{ code: "nl", label: "Dutch", proficiency: "native" }],
    skills: [{ name: "TypeScript", rawLabel: null, yearsExperience: null }, { name: "Docker", rawLabel: null, yearsExperience: null }],
    experience: [{ title: "Backend engineer", employer: "Acme", startedOn: "2019-01", endedOn: null, isCurrent: true, summary: "Ran Postgres databases for six years." }],
  };

  async function version(workspaceId: string, headline = CONTENT.headline) {
    const { createVersion, confirmVersion } = await import("../../profile/versions");
    const v = await createVersion({ workspaceId, content: { ...CONTENT, headline }, origin: "MANUAL", extractorName: "test", extractorVersion: "1" });
    await confirmVersion(workspaceId, v.id);
    return v.id;
  }

  async function seed(label: string, rawText: string | null = JOB) {
    const ws = await db.workspace.create({ data: { platformUserId: `cvfit-${label}-${Date.now()}-${Math.random()}` }, select: { id: true } });
    workspaces.push(ws.id);
    const versionId = await version(ws.id);
    const job = await db.targetJob.create({
      data: { workspaceId: ws.id, sourceUrl: "manual:", rawText, status: rawText ? "FETCHED" : "FETCH_FAILED" },
      select: { id: true },
    });
    return { workspaceId: ws.id, versionId, jobId: job.id };
  }

  async function analyze(s: { workspaceId: string; versionId: string; jobId: string }) {
    const loaded = await svc.loadFitContext(s.workspaceId, s.jobId, s.versionId);
    if (!loaded.ok) throw new Error(loaded.error);
    const result = await svc.analyzeFit(loaded.context, { language: "en" });
    if (!result.ok) throw new Error(result.reason);
    return result.state.assessment!.meta!.id;
  }

  function snapshot(s: { workspaceId: string; versionId: string; jobId: string }, fit: unknown) {
    return ctx.parseStoredTailoringContext({
      version: "tailoring_context@1",
      workspaceId: s.workspaceId,
      profileVersionId: s.versionId,
      targetJobId: s.jobId,
      jobTextFingerprint: "x",
      fit,
    });
  }

  const cv = (s: { workspaceId: string; versionId: string; jobId: string }, context: ReturnType<typeof snapshot>, createdAt = new Date()) => ({
    workspaceId: s.workspaceId,
    profileVersionId: s.versionId,
    targetJobId: s.jobId,
    createdAt,
    context,
  });

  it("shows the recorded assessment as of the CV, the same on every reopen, with no provider call", async () => {
    const s = await seed("recorded");
    const id = await analyze(s);
    const before = calls.count;
    const savedAt = new Date();
    const input = cv(s, snapshot(s, { source: "ai", assessmentId: id, rubricVersion: "fit_rubric@1", gaps: [] }), savedAt);

    const first = await saved.savedCvFit(input);
    expect(first.kind).toBe("recorded");
    if (first.kind !== "recorded") throw new Error();
    expect(first.view.meta?.id).toBe(id);
    expect(first.view.method).toBe("ai");
    expect(first.view.score.percent).toBe(75);
    expect(first.inputsChanged).toBe(false);
    expect(first.rubricChanged).toBe(false);
    expect(first.other).toBeNull();

    // A "no" given after the CV was saved changes today's score, not this CV's.
    await new Promise((r) => setTimeout(r, 5));
    const docker = first.view.rows.find((r) => r.quote === "Experience with Docker")!;
    await db.jobFitAnswer.create({ data: { workspaceId: s.workspaceId, targetJobId: s.jobId, requirementId: docker.id, answer: "no" } });
    const loaded = await svc.loadFitContext(s.workspaceId, s.jobId, s.versionId);
    if (!loaded.ok) throw new Error();
    expect((await svc.fitState(loaded.context)).assessment!.score.percent).toBe(50);
    const reopened = await saved.savedCvFit(input);
    if (reopened.kind !== "recorded") throw new Error();
    expect(reopened.view.score.percent).toBe(75);
    expect(reopened.view.meta?.id).toBe(id);

    // A CV saved after that answer counts it.
    const later = await saved.savedCvFit({ ...input, createdAt: new Date() });
    if (later.kind !== "recorded") throw new Error();
    expect(later.view.score.percent).toBe(50);
    expect(calls.count).toBe(before);
  });

  it("keeps the recorded assessment when inputs change, and shows a newer one apart", async () => {
    const s = await seed("newer");
    const id = await analyze(s);
    const input = cv(s, snapshot(s, { source: "ai", assessmentId: id, rubricVersion: "fit_rubric@0", gaps: [] }));
    const { createEvidence } = await import("../../evidence/store");
    await createEvidence(s.workspaceId, { kind: "PROJECT", title: "Cluster work", detail: "Operated Kubernetes clusters in production.", experienceRef: null }, { scope: "BACKGROUND", targetJobId: null, confirm: true });
    const newer = await analyze(s);
    expect(newer).not.toBe(id);

    const fit = await saved.savedCvFit(input);
    if (fit.kind !== "recorded") throw new Error(fit.kind);
    expect(fit.view.meta?.id).toBe(id);
    expect(fit.inputsChanged).toBe(true);
    expect(fit.rubricChanged).toBe(true);
    expect(fit.other).toMatchObject({ id: newer, stale: false });
  });

  it("never attaches another profile version's or workspace's assessment", async () => {
    const s = await seed("isolation");
    const v1 = s.versionId;
    const v2 = await version(s.workspaceId, "Platform engineer");
    const onV2 = await analyze({ ...s, versionId: v2 });

    // A v1 CV whose snapshot names v2's assessment: not this CV's.
    const crossed = await saved.savedCvFit(cv(s, snapshot(s, { source: "ai", assessmentId: onV2, rubricVersion: "fit_rubric@1", gaps: [] })));
    expect(crossed).toMatchObject({ kind: "none", reason: "missing", other: null });
    // A legacy v1 CV: v2's assessment is not offered as "other" either.
    expect(await saved.savedCvFit(cv(s, null))).toMatchObject({ kind: "none", reason: "legacy", other: null });
    // Same job, v2 CV, keyword run: the v2 assessment is shown only as "other".
    const keyword = await saved.savedCvFit(cv({ ...s, versionId: v2 }, snapshot({ ...s, versionId: v2 }, { source: "keyword", assessmentId: null, rubricVersion: "fit_rubric@1", gaps: [] })));
    expect(keyword).toMatchObject({ kind: "none", reason: "keyword", other: { id: onV2 } });

    // Another workspace's CV naming this assessment id.
    const other = await seed("isolation-b");
    const foreign = await saved.savedCvFit(cv(other, snapshot(other, { source: "ai", assessmentId: onV2, rubricVersion: "fit_rubric@1", gaps: [] })));
    expect(foreign).toMatchObject({ kind: "none", reason: "missing", other: null });
    // A snapshot from another CV's inputs is no record at all.
    expect(await saved.savedCvFit({ ...cv(s, snapshot({ ...s, versionId: v2 }, { source: "ai", assessmentId: onV2, rubricVersion: "fit_rubric@1", gaps: [] })), profileVersionId: v1 })).toMatchObject({
      kind: "none",
      reason: "legacy",
    });
  });

  it("a deleted assessment and a job without text are said as they are", async () => {
    const s = await seed("deleted");
    const id = await analyze(s);
    await db.jobFitAssessment.delete({ where: { id } });
    expect(await saved.savedCvFit(cv(s, snapshot(s, { source: "ai", assessmentId: id, rubricVersion: "fit_rubric@1", gaps: [] })))).toMatchObject({
      kind: "none",
      reason: "missing",
      other: null,
    });

    const empty = await seed("no-text", null);
    expect(await saved.savedCvFit(cv(empty, null))).toMatchObject({ kind: "none", reason: "unavailable" });
  });
});
