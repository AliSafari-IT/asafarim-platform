import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Budget/model resolution reads admin-console overrides; pin them to "no
// override" so a live local Admin cannot change what these tests assert.
vi.mock("../platform-settings", () => ({
  getPlatformSetting: async <T,>(_key: string, fallback: T) => fallback,
}));

/**
 * AI cost attribution against a real database (issue #586). Guarded behind
 * RESUMATCH_TEST_DATABASE_URL like every other integration suite here:
 *
 *   RESUMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/resumatch exec vitest run lib/costs/ledger.integration.test.ts
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) {
  process.env.RESUMATCH_DATABASE_URL = TEST_DB;
  process.env.RESUMATCH_AI_MONTHLY_BUDGET_USD = "50";
}

const PROFILE = {
  headline: "Senior Backend Engineer",
  summary: "Builds payment platforms with TypeScript and PostgreSQL.",
  skills: [{ name: "TypeScript", rawLabel: null, yearsExperience: 6 }],
  experience: [
    {
      title: "Senior Backend Engineer",
      employer: "Example Corp",
      startedOn: "2021-03",
      endedOn: null,
      isCurrent: true,
      summary: "Owned the payments API.",
    },
  ],
};

describe.skipIf(!TEST_DB)("ResuMatch AI cost ledger (issue #586)", () => {
  let db: import("../db/generated").PrismaClient;
  let ledger: typeof import("./ledger");
  let read: typeof import("./read");
  let quota: typeof import("../tailoring/ai/quota");
  let generate: typeof import("../tailoring/ai/generate");
  let coverLetter: typeof import("../tailoring/ai/coverLetter/generate");
  let versions: typeof import("../profile/versions");
  let dataRights: typeof import("../profile/dataRights");
  let resolveRange: typeof import("@asafarim/ai-cost-ledger").resolveRange;

  const workspaces: string[] = [];

  async function newWorkspace(tag: string) {
    const ws = await db.workspace.create({
      data: { platformUserId: `cost-test-${tag}-${Date.now()}-${Math.random()}` },
      select: { id: true },
    });
    workspaces.push(ws.id);
    return ws.id;
  }

  async function newJob(workspaceId: string, title = "Backend Engineer") {
    const job = await db.targetJob.create({
      data: {
        workspaceId,
        sourceUrl: "https://example.test/jobs/1",
        rawText: "We need a backend engineer with TypeScript experience.",
        title,
        employer: "Example Corp",
        status: "FETCHED",
      },
      select: { id: true },
    });
    return job.id;
  }

  const range = () => resolveRange({ preset: "30d" });

  beforeAll(async () => {
    db = (await import("../db/client")).getJobmatchDb();
    ledger = await import("./ledger");
    read = await import("./read");
    quota = await import("../tailoring/ai/quota");
    generate = await import("../tailoring/ai/generate");
    coverLetter = await import("../tailoring/ai/coverLetter/generate");
    versions = await import("../profile/versions");
    dataRights = await import("../profile/dataRights");
    ({ resolveRange } = await import("@asafarim/ai-cost-ledger"));
  });

  afterAll(async () => {
    if (!db) return;
    await db.aiUsageLedger.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await db.tailoredResume.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await db.workspace.deleteMany({ where: { id: { in: workspaces } } });
  });

  it("a retried write with the same idempotency key lands exactly once", async () => {
    const workspaceId = await newWorkspace("idem");
    const input = {
      workspaceId,
      operation: "tailor" as const,
      provider: "openai",
      model: "gpt-4o-mini",
      inputTokens: 1000,
      outputTokens: 500,
      attribution: { subjectType: "target_job" as const, subjectId: "job_x", targetJobId: "job_x" },
      callId: "call-fixed-1",
    };
    const first = await ledger.recordProviderCost(input);
    const second = await ledger.recordProviderCost(input);
    expect(first.written).toBe(true);
    expect(second.written).toBe(false);
    const rows = await db.aiCostEvent.findMany({ where: { workspaceId } });
    expect(rows).toHaveLength(1);
    // 1000 × $0.15/1M + 500 × $0.60/1M = $0.00045 → 450 micros, snapshotted
    expect(rows[0].estimatedCostMicros).toBe(450n);
    expect(rows[0].costSource).toBe("registry_estimate");
    expect((rows[0].pricingSnapshot as { pricingVersion: string }).pricingVersion).toMatch(/^resumatch-/);
  });

  it("the table is append-only: UPDATE is rejected by the database", async () => {
    const workspaceId = await newWorkspace("append");
    await ledger.recordProviderCost({
      workspaceId,
      operation: "rewrite",
      provider: "openai",
      model: "gpt-4o-mini",
      inputTokens: 10,
      outputTokens: 10,
      attribution: { subjectType: "candidate_profile", subjectId: workspaceId },
    });
    await expect(
      db.aiCostEvent.updateMany({ where: { workspaceId }, data: { estimatedCostMicros: 1n } }),
    ).rejects.toThrow(/append-only/);
  });

  it("the database refuses an unknown-cost row that carries a placeholder amount", async () => {
    const workspaceId = await newWorkspace("unknown");
    await expect(
      db.aiCostEvent.create({
        data: {
          idempotencyKey: `resumatch:test:${Date.now()}`,
          workspaceId,
          operation: "tailor",
          subjectType: "target_job",
          subjectId: "x",
          provider: "openai",
          responseModel: "gpt-4o-mini",
          costSource: "unknown",
          credentialSource: "platform",
          estimatedCostMicros: 0n,
          occurredAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("tailor + cover letter in one preview share a workflow but stay separate line items", async () => {
    const workspaceId = await newWorkspace("preview");
    const targetJobId = await newJob(workspaceId);
    const previewId = "preview-wf-1";
    const cost = { subjectType: "tailor_preview" as const, subjectId: previewId, workflowId: previewId };

    const { parseProfileContent } = await import("../profile/contract");
    await generate.runTailorProviderCall(workspaceId, targetJobId, parseProfileContent(PROFILE), "job text", null, "fixture", cost);
    await coverLetter.runCoverLetterProviderCall(workspaceId, targetJobId, "profile", "job text", undefined, undefined, "fixture", cost);

    const rows = await db.aiCostEvent.findMany({ where: { workspaceId }, orderBy: { occurredAt: "asc" } });
    expect(rows.map((r) => r.operation)).toEqual(["tailor", "cover_letter"]);
    expect(new Set(rows.map((r) => r.workflowId))).toEqual(new Set([previewId]));
    expect(new Set(rows.map((r) => r.idempotencyKey)).size).toBe(2);
    for (const row of rows) {
      expect(row).toMatchObject({
        subjectType: "tailor_preview",
        subjectId: previewId,
        parentSubjectType: "target_job",
        parentSubjectId: targetJobId,
        targetJobId,
        fixture: true,
        credentialSource: "none",
        estimatedCostMicros: 0n,
      });
    }
  });

  it("multiple tailoring runs for one job each appear once, under one correct subtotal", async () => {
    const workspaceId = await newWorkspace("multi");
    const targetJobId = await newJob(workspaceId);
    for (let i = 0; i < 3; i++) {
      await ledger.recordProviderCost({
        workspaceId,
        operation: "tailor",
        provider: "openai",
        model: "gpt-4o-mini",
        outputTokens: 1_000_000, // $0.60 each
        attribution: { subjectType: "tailored_resume", subjectId: `tr_${i}`, targetJobId, workflowId: `tr_${i}` },
      });
    }
    const subtotals = await read.jobCostSubtotals(workspaceId, range());
    expect(subtotals).toHaveLength(1);
    expect(subtotals[0].totals.eventCount).toBe(3);
    expect(subtotals[0].totals.effectiveKnownMicros).toBe(1_800_000n);
  });

  it("an application saved after generation resolves through the job without rewriting old events", async () => {
    const workspaceId = await newWorkspace("app");
    const targetJobId = await newJob(workspaceId, "Platform Engineer");
    await ledger.recordProviderCost({
      workspaceId,
      operation: "tailor",
      provider: "openai",
      model: "gpt-4o-mini",
      outputTokens: 1000,
      attribution: { subjectType: "target_job", subjectId: targetJobId, targetJobId },
    });
    const before = await db.aiCostEvent.findFirstOrThrow({ where: { workspaceId } });

    const application = await db.application.create({ data: { workspaceId, targetJobId }, select: { id: true } });

    const timeline = await read.buildCostTimeline(workspaceId, { range: range() }, { limit: 25 });
    const group = timeline.groups.find((g) => g.key === `job:${targetJobId}`);
    expect(group?.application?.id).toBe(application.id);
    expect(group?.label).toBe("Platform Engineer");
    const after = await db.aiCostEvent.findFirstOrThrow({ where: { workspaceId } });
    expect(after).toEqual(before);
  });

  it("job subtotal queries never include another workspace's data, even given its job id", async () => {
    const mine = await newWorkspace("iso-a");
    const theirs = await newWorkspace("iso-b");
    const theirJob = await newJob(theirs);
    await ledger.recordProviderCost({
      workspaceId: theirs,
      operation: "tailor",
      provider: "openai",
      model: "gpt-4o-mini",
      outputTokens: 1000,
      attribution: { subjectType: "target_job", subjectId: theirJob, targetJobId: theirJob },
    });

    const mineFiltered = await read.buildCostTimeline(mine, { range: range(), targetJobId: theirJob }, { limit: 25 });
    expect(mineFiltered.summary.eventCount).toBe(0);
    expect(mineFiltered.items).toHaveLength(0);
    expect(await read.jobCostSubtotals(mine, range())).toEqual([]);
    const labels = await read.loadJobInfo(mine, [theirJob]);
    expect(labels.size).toBe(0);
  });

  it("legacy float rows stay visible as partial, unattributed history and still count toward the budget", async () => {
    const workspaceId = await newWorkspace("legacy");
    await db.aiUsageLedger.create({
      data: { workspaceId, kind: "tailor", provider: "openai", model: "gpt-4o-mini", inputTokens: 100, outputTokens: 50, costUsd: 1.25 },
    });
    await ledger.recordProviderCost({
      workspaceId,
      operation: "cover_letter",
      provider: "openai",
      model: "gpt-4o-mini",
      outputTokens: 1_000_000, // $0.60
      attribution: { subjectType: "target_job", subjectId: "j", targetJobId: "j" },
    });

    const timeline = await read.buildCostTimeline(workspaceId, { range: range() }, { limit: 25 });
    expect(timeline.summary.legacyCount).toBe(1);
    expect(timeline.summary.coverage).toBe("partial");
    expect(timeline.summary.effectiveKnownMicros).toBe("1850000");
    const legacyGroup = timeline.groups.find((g) => g.key === "legacy");
    expect(legacyGroup?.totals.effectiveKnownMicros).toBe("1250000");
    expect(timeline.items.find((i) => i.legacy)?.subjectType).toBe("unattributed");

    const summary = await quota.usageSummary(workspaceId);
    expect(summary.monthUsd).toBeCloseTo(1.85, 6);
  });

  it("an unpriced model is recorded as unknown — excluded from amounts, counted as not tracked", async () => {
    const workspaceId = await newWorkspace("unpriced");
    await ledger.recordProviderCost({
      workspaceId,
      operation: "tailor",
      provider: "mistral",
      model: "mistral-large",
      outputTokens: 1000,
      attribution: { subjectType: "target_job", subjectId: "j", targetJobId: "j" },
    });
    const row = await db.aiCostEvent.findFirstOrThrow({ where: { workspaceId } });
    expect(row.costSource).toBe("unknown");
    expect(row.estimatedCostMicros).toBeNull();
    const timeline = await read.buildCostTimeline(workspaceId, { range: range() }, { limit: 25 });
    expect(timeline.summary.unknownCount).toBe(1);
    expect(timeline.summary.effectiveKnownMicros).toBe("0");
    expect(timeline.items[0].amountMicros).toBeNull();
    expect(timeline.summary.coverage).toBe("unknown");
  });

  it("a billed response that fails validation is recorded as a failed event, then the error propagates", async () => {
    const workspaceId = await newWorkspace("failed");
    await expect(
      quota.settleProviderCall(
        {
          workspaceId,
          kind: "rewrite",
          provider: "openai",
          model: "gpt-4o-mini",
          inputTokens: 100,
          outputTokens: 20,
          attribution: { subjectType: "candidate_profile", subjectId: workspaceId },
        },
        () => {
          throw new Error("malformed");
        },
      ),
    ).rejects.toThrow("malformed");
    const row = await db.aiCostEvent.findFirstOrThrow({ where: { workspaceId } });
    expect(row.outcome).toBe("failed");
    expect(row.estimatedCostMicros).toBe(27n); // 100×0.15 + 20×0.60 = 27 micros
  });

  it("pagination never changes totals", async () => {
    const workspaceId = await newWorkspace("page");
    for (let i = 0; i < 7; i++) {
      await ledger.recordProviderCost({
        workspaceId,
        operation: "job_meta",
        provider: "openai",
        model: "gpt-4o-mini",
        outputTokens: 100_000, // $0.06
        attribution: { subjectType: "target_job", subjectId: `j${i}`, targetJobId: `j${i}` },
        occurredAt: new Date(Date.now() - i * 1000),
      });
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    let totals: string | null = null;
    do {
      const page: Awaited<ReturnType<typeof read.buildCostTimeline>> = await read.buildCostTimeline(
        workspaceId,
        { range: range() },
        { limit: 3, cursor },
      );
      seen.push(...page.items.map((i) => i.id));
      totals ??= page.summary.effectiveKnownMicros;
      expect(page.summary.effectiveKnownMicros).toBe(totals);
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
    expect(totals).toBe("420000");
  });

  it("data-rights erasure removes candidate data but keeps the content-free cost record; the job shows as deleted", async () => {
    const workspaceId = await newWorkspace("erase");
    const version = await versions.createVersion({
      workspaceId,
      content: PROFILE as never,
      origin: "MANUAL",
      extractorName: "test",
      extractorVersion: "1",
    });
    await versions.confirmVersion(workspaceId, version.id);
    const targetJobId = await newJob(workspaceId);
    await generate.generateTailoredResume(workspaceId, version.id, targetJobId, { provider: "fixture" });

    const [event] = await db.aiCostEvent.findMany({ where: { workspaceId } });
    expect(event.subjectType).toBe("tailored_resume");
    // The event holds ids and operational metadata only.
    const serialized = JSON.stringify(event, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    expect(serialized).not.toContain("payments API");
    expect(serialized).not.toContain("backend engineer with TypeScript");

    await dataRights.eraseWorkspaceData(workspaceId);
    expect(await db.targetJob.count({ where: { workspaceId } })).toBe(0);
    expect(await db.aiCostEvent.count({ where: { workspaceId } })).toBe(1);

    const timeline = await read.buildCostTimeline(workspaceId, { range: range() }, { limit: 25 });
    const group = timeline.groups.find((g) => g.key === `job:${targetJobId}`);
    expect(group?.deleted).toBe(true);
    expect(group?.label).toBe("Deleted job");

    // Deleting the workspace itself cascades the ledger away.
    await db.workspace.delete({ where: { id: workspaceId } });
    expect(await db.aiCostEvent.count({ where: { workspaceId } })).toBe(0);
  });
});
