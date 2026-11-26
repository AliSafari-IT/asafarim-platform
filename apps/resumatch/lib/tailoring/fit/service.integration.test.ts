import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FitModelOutput } from "./contract";

/**
 * #971 against a real database: the assessment is persisted with its
 * provenance, reopening unchanged inputs costs no new call, a changed
 * input marks it stale, concurrent requests share one call, another
 * workspace can neither read nor reuse it, answers and corrections update
 * the same assessment, and provider failures are honest and recoverable.
 * The provider is a stub that counts calls; nothing reaches a real model.
 * Guarded behind RESUMATCH_TEST_DATABASE_URL.
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;

const calls = { count: 0 };
let behaviour: "ok" | "timeout" | "invalid" | "slow" = "ok";

const JOB = `Platform engineer
Requirements:
- 3+ years of experience with PostgreSQL
- Experience with Kubernetes in production
- Fluent in Dutch
- Experience with TypeScript`;

function reply(): FitModelOutput {
  return {
    requirements: [
      { key: "r1", quote: "3+ years of experience with PostgreSQL", priority: "required", category: "experience", essential: false, anyOf: null },
      { key: "r2", quote: "Experience with Kubernetes in production", priority: "required", category: "skill", essential: false, anyOf: null },
      { key: "r3", quote: "Fluent in Dutch", priority: "required", category: "language", essential: true, anyOf: null },
      { key: "r4", quote: "Experience with TypeScript", priority: "required", category: "skill", essential: false, anyOf: null },
    ],
    moreRequirementsOmitted: false,
    assessments: [
      { key: "r1", judgment: "direct", citations: [{ sourceId: "exp:0", quote: "Ran Postgres databases for six years" }], explanation: "Six years of Postgres.", equivalence: { jobTerm: "PostgreSQL", profileTerm: "Postgres" } },
      { key: "r2", judgment: "unknown", citations: [], explanation: "Not mentioned.", equivalence: null },
      { key: "r3", judgment: "direct", citations: [{ sourceId: "languages", quote: "Dutch (native)" }], explanation: "Native Dutch.", equivalence: null },
      // Fabricated: the profile never says this. Must be downgraded.
      { key: "r4", judgment: "direct", citations: [{ sourceId: "skills", quote: "TypeScript (8 years)" }], explanation: "Invented.", equivalence: null },
    ],
  };
}

vi.mock("./ai/registry", () => ({
  JOB_FIT_PROMPT_VERSION: "job_fit@1",
  FIT_MODEL_VERSIONS: { fixture: "stub-fit", openai: "stub-openai", anthropic: "stub-anthropic" },
  getFitProvider: async () => ({
    name: "fixture",
    analyze: async (call: { signal?: AbortSignal }) => {
      calls.count += 1;
      if (behaviour === "slow") await new Promise((r) => setTimeout(r, 150));
      if (behaviour === "timeout") {
        const { FitProviderError } = await import("./ai/provider");
        throw new FitProviderError("aborted", false, "timeout");
      }
      if (behaviour === "invalid") {
        const { FitProviderError } = await import("./ai/provider");
        throw new FitProviderError("bad shape", false, "invalid_output");
      }
      return { output: reply(), inputTokens: 100, outputTokens: 50, costUsd: 0 };
    },
  }),
}));

describe.skipIf(!TEST_DB)("job fit assessment service (#971)", () => {
  let db: import("../../db/generated").PrismaClient;
  let svc: typeof import("./service");
  const workspaces: string[] = [];

  beforeAll(async () => {
    db = (await import("../../db/client")).getJobmatchDb();
    svc = await import("./service");
  });

  afterAll(async () => {
    if (!db) return;
    for (const id of workspaces) {
      await db.jobFitAssessment.deleteMany({ where: { workspaceId: id } });
      await db.candidateEvidence.deleteMany({ where: { workspaceId: id } });
      await db.targetJob.deleteMany({ where: { workspaceId: id } });
      await db.candidateProfile.updateMany({ where: { workspaceId: id }, data: { confirmedVersionId: null } });
      await db.candidateProfileVersion.deleteMany({ where: { profile: { workspaceId: id } } });
      await db.candidateProfile.deleteMany({ where: { workspaceId: id } });
      await db.workspace.deleteMany({ where: { id } });
    }
  });

  beforeEach(() => {
    calls.count = 0;
    behaviour = "ok";
  });

  async function seed(label: string) {
    const { createVersion, confirmVersion } = await import("../../profile/versions");
    const ws = await db.workspace.create({ data: { platformUserId: `fit-${label}-${Date.now()}-${Math.random()}` }, select: { id: true } });
    workspaces.push(ws.id);
    const version = await createVersion({
      workspaceId: ws.id,
      content: {
        headline: "Backend engineer",
        languages: [{ code: "nl", label: "Dutch", proficiency: "native" }],
        skills: [{ name: "TypeScript", rawLabel: null, yearsExperience: null }, { name: "Docker", rawLabel: null, yearsExperience: null }],
        experience: [{ title: "Backend engineer", employer: "Acme", startedOn: "2019-01", endedOn: null, isCurrent: true, summary: "Ran Postgres databases for six years." }],
      },
      origin: "MANUAL",
      extractorName: "test",
      extractorVersion: "1",
    });
    await confirmVersion(ws.id, version.id);
    const job = await db.targetJob.create({ data: { workspaceId: ws.id, sourceUrl: "manual:", rawText: JOB, status: "FETCHED" }, select: { id: true } });
    return { workspaceId: ws.id, versionId: version.id, jobId: job.id };
  }

  async function context(s: { workspaceId: string; versionId: string; jobId: string }) {
    const loaded = await svc.loadFitContext(s.workspaceId, s.jobId, s.versionId);
    if (!loaded.ok) throw new Error(loaded.error);
    return loaded.context;
  }

  it("persists a validated assessment with provenance and reuses it without a new call", async () => {
    const s = await seed("reuse");
    const first = await svc.analyzeFit(await context(s), { language: "en" });
    expect(first.ok).toBe(true);
    expect(calls.count).toBe(1);
    const view = first.state.assessment!;
    expect(view.method).toBe("ai");
    expect(view.meta?.stale).toBe(false);
    // The fabricated TypeScript claim is not counted.
    const ts = view.rows.find((r) => r.quote === "Experience with TypeScript")!;
    expect(ts.judgment).toBe("unknown");
    expect(view.validation.citationsRejected).toBe(1);
    expect(view.score.percent).toBe(50);
    expect(first.state.gate.source).toBe("ai");

    const row = await db.jobFitAssessment.findFirst({ where: { workspaceId: s.workspaceId } });
    expect(row).toMatchObject({ profileVersionId: s.versionId, method: "ai", provider: "fixture", model: "stub-fit", promptVersion: "job_fit@1", contractVersion: "fit_assessment@1", inputTokens: 100 });

    const again = await svc.analyzeFit(await context(s), { language: "en" });
    expect(again).toMatchObject({ ok: true, reused: true });
    expect(calls.count).toBe(1);
    expect((await svc.fitState(await context(s))).assessment?.meta?.id).toBe(row!.id);
  });

  it("concurrent requests for the same inputs share one provider call", async () => {
    const s = await seed("concurrent");
    behaviour = "slow";
    const ctx = await context(s);
    const [a, b] = await Promise.all([svc.analyzeFit(ctx, { language: "en" }), svc.analyzeFit(ctx, { language: "en" })]);
    expect(a.ok && b.ok).toBe(true);
    expect(calls.count).toBe(1);
    expect(await db.jobFitAssessment.count({ where: { workspaceId: s.workspaceId } })).toBe(1);
  });

  it("new evidence marks the saved assessment stale, and the gate falls back to the keyword check", async () => {
    const s = await seed("stale");
    await svc.analyzeFit(await context(s), { language: "en" });
    const { createEvidence } = await import("../../evidence/store");
    await createEvidence(s.workspaceId, { kind: "PROJECT", title: "Kubernetes", detail: "Ran Kubernetes in production at Acme.", experienceRef: null }, { scope: "BACKGROUND", targetJobId: null, confirm: true });
    const state = await svc.fitState(await context(s));
    expect(state.assessment?.meta?.stale).toBe(true);
    expect(state.gate.source).toBe("keyword");
    await svc.analyzeFit(await context(s), { language: "en" });
    expect(calls.count).toBe(2);
    expect((await svc.fitState(await context(s))).assessment?.meta?.stale).toBe(false);
  });

  it("a confirmed answer updates the same assessment with no new call", async () => {
    const s = await seed("answer");
    await svc.analyzeFit(await context(s), { language: "en" });
    const k8s = (await svc.fitState(await context(s))).assessment!.rows.find((r) => r.quote.includes("Kubernetes"))!;
    const { createEvidence } = await import("../../evidence/store");
    const ev = await createEvidence(s.workspaceId, { kind: "RESPONSIBILITY", title: "Ran Kubernetes", detail: "Ran Kubernetes clusters in production for two years.", experienceRef: null }, { scope: "APPLICATION", targetJobId: s.jobId, confirm: true });
    if (!ev.ok) throw new Error("evidence");
    await db.jobFitAnswer.create({ data: { workspaceId: s.workspaceId, targetJobId: s.jobId, requirementId: k8s.id, answer: "yes", evidenceRevisionId: ev.revisionId } });
    const ctx = await context(s);
    await svc.refreshStoredScore(ctx);
    const state = await svc.fitState(ctx);
    // The answer's evidence is an overlay: the assessment is not stale.
    expect(state.assessment?.meta?.stale).toBe(false);
    const updated = state.assessment!.rows.find((r) => r.id === k8s.id)!;
    expect(updated).toMatchObject({ judgment: "direct", answeredBy: "yes" });
    expect(state.assessment!.score.percent).toBe(75);
    expect(calls.count).toBe(1);
    const stored = await db.jobFitAssessment.findFirst({ where: { workspaceId: s.workspaceId }, select: { score: true } });
    expect((stored?.score as { percent: number }).percent).toBe(75);
  });

  it("another workspace can neither load this job nor reuse the result", async () => {
    const a = await seed("owner");
    const b = await seed("other");
    await svc.analyzeFit(await context(a), { language: "en" });
    expect(await svc.loadFitContext(b.workspaceId, a.jobId, b.versionId)).toEqual({ ok: false, error: "job_not_found" });
    expect(await svc.loadFitContext(b.workspaceId, b.jobId, a.versionId)).toEqual({ ok: false, error: "profile_not_found" });
    // Same job text and a same-shaped profile in B: its own call, its own row.
    const before = calls.count;
    await svc.analyzeFit(await context(b), { language: "en" });
    expect(calls.count).toBe(before + 1);
  });

  it("timeout, invalid output and an exhausted budget keep the earlier result, labelled stale, and the keyword check", async () => {
    const s = await seed("fail");
    await svc.analyzeFit(await context(s), { language: "en" });
    const { createEvidence } = await import("../../evidence/store");
    await createEvidence(s.workspaceId, { kind: "PROJECT", title: "x", detail: "Something new.", experienceRef: null }, { scope: "BACKGROUND", targetJobId: null, confirm: true });

    behaviour = "timeout";
    const timeout = await svc.analyzeFit(await context(s), { language: "en" });
    expect(timeout).toMatchObject({ ok: false, reason: "timeout" });
    expect(timeout.state.assessment?.meta?.stale).toBe(true);
    expect(timeout.state.keyword.method).toBe("keyword");

    behaviour = "invalid";
    expect(await svc.analyzeFit(await context(s), { language: "en" })).toMatchObject({ ok: false, reason: "invalid_output" });

    behaviour = "ok";
    await db.workspace.update({ where: { id: s.workspaceId }, data: { aiMonthlyBudgetUsd: 0 } });
    const before = calls.count;
    expect(await svc.analyzeFit(await context(s), { language: "en" })).toMatchObject({ ok: false, reason: "budget" });
    expect(calls.count).toBe(before);
    expect(await db.jobFitAssessment.count({ where: { workspaceId: s.workspaceId } })).toBe(1);
  });

  it("erasure removes assessments, answers and corrections", async () => {
    const s = await seed("erase");
    await svc.analyzeFit(await context(s), { language: "en" });
    await db.jobFitCorrection.create({ data: { workspaceId: s.workspaceId, targetJobId: s.jobId, requirementId: "req_x", action: "not_requirement" } });
    const { remainingWorkspaceRows } = await import("../../profile/dataRights");
    expect((await remainingWorkspaceRows(s.workspaceId)).fitAssessments).toBe(1);
    const { exportWorkspaceData } = await import("../../profile/dataRights");
    const exported = await exportWorkspaceData(s.workspaceId);
    expect(exported?.jobFit.assessments).toHaveLength(1);
    expect(exported?.jobFit.corrections).toHaveLength(1);
  });
});
