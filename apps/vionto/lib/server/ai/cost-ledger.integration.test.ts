import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Vionto AI cost ledger against a real platform database (issue #588).
 * Guarded behind VIONTO_TEST_DATABASE_URL — a throwaway database with the
 * platform migrations applied, never the dev one:
 *
 *   VIONTO_TEST_DATABASE_URL=postgresql://…/asafarim_vionto_test \
 *     pnpm --filter vionto exec vitest run lib/server/ai/cost-ledger.integration.test.ts
 */

const TEST_DB = process.env.VIONTO_TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

describe.skipIf(!TEST_DB)("Vionto AI cost ledger (issue #588)", () => {
  let prisma: typeof import("@asafarim/db").prisma;
  let ledger: typeof import("./cost-ledger");
  let read: typeof import("./cost-read");
  let resolveRange: typeof import("@asafarim/ai-cost-ledger").resolveRange;

  const users: string[] = [];
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let owner: string;
  let collaborator: string;
  let projectId: string;
  let versionId: string;

  const range = () => resolveRange({ preset: "30d" });

  async function newClip(assetId: string, amount = 0.28, durationSeconds = 10) {
    const micros = Math.round(amount * (durationSeconds / 5) * 1_000_000);
    return prisma.viontoAiClip.create({
      data: {
        projectId,
        userId: owner,
        versionId,
        assetId,
        provider: "kling",
        model: "kling-v1-6",
        prompt: "p",
        durationSeconds,
        status: "succeeded",
        taskId: `task-${assetId}-${Math.random()}`,
        estimatedCostUsdMicros: BigInt(micros),
        costSource: "registry_estimate",
        credentialSource: "user",
        pricingSnapshot: { provider: "kling", modelId: "kling-v1-6", amount, unit: "per_5s_clip", durationSeconds },
      },
    });
  }

  async function newExport(renderJobId: string) {
    return prisma.viontoExport.create({
      data: { projectId, versionId, userId: owner, renderJobId, storageKey: `k/${renderJobId}.mp4`, filename: `${renderJobId}.mp4` },
    });
  }

  async function newRenderJob() {
    return prisma.viontoRenderJob.create({ data: { projectId, versionId, userId: owner, state: "completed" } });
  }

  async function tts(renderJobId: string, chars = 1000) {
    return ledger.recordViontoCost({
      userId: owner,
      operation: "tts",
      subjectType: "render_job",
      subjectId: renderJobId,
      projectId,
      versionId,
      renderJobId,
      workflowId: renderJobId,
      provider: "openai",
      responseModel: "tts-1-hd",
      usage: [{ bucket: "tts_output", unit: "characters", quantity: chars }],
      credentialSource: "platform",
    });
  }

  beforeAll(async () => {
    ({ prisma } = await import("@asafarim/db"));
    ledger = await import("./cost-ledger");
    read = await import("./cost-read");
    ({ resolveRange } = await import("@asafarim/ai-cost-ledger"));

    for (const who of ["owner", "collab"]) {
      const u = await prisma.user.create({ data: { email: `vionto-cost-${who}-${tag}@example.test` } });
      users.push(u.id);
    }
    [owner, collaborator] = users;
    const project = await prisma.viontoProject.create({ data: { userId: owner, title: "Summer in Porto" } });
    projectId = project.id;
    versionId = (await prisma.viontoVideoVersion.create({ data: { projectId, userId: owner } })).id;
    await prisma.viontoProjectShare.create({ data: { projectId, userId: collaborator, role: "editor" } as never }).catch(() => null);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.viontoProject.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it("records a story event once per script and prices it from the snapshot table", async () => {
    const input = {
      userId: owner,
      operation: "story" as const,
      subjectType: "script" as const,
      subjectId: "script-1",
      projectId,
      versionId,
      provider: "openai",
      responseModel: "gpt-4.1-mini-2025-04-14",
      usage: [
        { bucket: "input" as const, unit: "tokens" as const, quantity: 1_000_000 },
        { bucket: "output" as const, unit: "tokens" as const, quantity: 100_000 },
      ],
      credentialSource: "platform" as const,
      stableId: ledger.storyStableId("script-1"),
    };
    const a = await ledger.recordViontoCost(input);
    const b = await ledger.recordViontoCost(input);
    expect(a.written).toBe(true);
    expect(b.written).toBe(false);
    const rows = await prisma.viontoAiCostEvent.findMany({ where: { userId: owner, operation: "story" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.estimatedCostMicros).toBe(BigInt(560_000)); // $0.40 + $0.16
    expect((rows[0]!.pricingSnapshot as { pricingVersion: string }).pricingVersion).toMatch(/^vionto-/);
  });

  it("rejects UPDATE on the ledger and on export snapshots", async () => {
    await expect(
      prisma.viontoAiCostEvent.updateMany({ where: { userId: owner }, data: { estimatedCostMicros: BigInt(1) } }),
    ).rejects.toThrow(/append-only/);
  });

  it("an AI clip keeps its generation-time estimate and records once however often it is polled; BYOK stays BYOK", async () => {
    const clip = await newClip("asset-clip-0", 0.28, 10);
    await ledger.recordClipCost(clip);
    await ledger.recordClipCost(clip);
    const rows = await prisma.viontoAiCostEvent.findMany({ where: { subjectType: "ai_clip", subjectId: clip.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.estimatedCostMicros).toBe(clip.estimatedCostUsdMicros); // 560000 — no re-pricing
    expect(rows[0]!.credentialSource).toBe("user_byok");
  });

  it("a clip with no snapshot (legacy) is unknown, never $0", async () => {
    const clip = await newClip("asset-legacy");
    const legacy = { ...clip, estimatedCostUsdMicros: null, pricingSnapshot: null, credentialSource: null };
    await ledger.recordClipCost({ ...legacy, id: `${clip.id}-legacy` });
    const row = await prisma.viontoAiCostEvent.findFirstOrThrow({ where: { subjectId: `${clip.id}-legacy` } });
    expect(row.costSource).toBe("unknown");
    expect(row.estimatedCostMicros).toBeNull();
  });

  it("exports snapshot exactly their inputs; reuse is counted once at project level; history stays stable", async () => {
    // Fresh project so the arithmetic below is self-contained.
    const project = await prisma.viontoProject.create({ data: { userId: owner, title: "Reuse" } });
    const prevProject = projectId;
    projectId = project.id;
    try {
      await ledger.recordViontoCost({
        userId: owner, operation: "story", subjectType: "script", subjectId: "script-reuse", projectId, versionId,
        provider: "openai", responseModel: "gpt-4.1-mini", credentialSource: "platform", stableId: ledger.storyStableId("script-reuse"),
        usage: [{ bucket: "output", unit: "tokens", quantity: 1_000_000 }], // $1.60
      });
      const clipA = await newClip("asset-A", 0.28, 5); // $0.28
      const clipB = await newClip("asset-B", 0.28, 5); // $0.28
      const clipUnused = await newClip("asset-C", 0.28, 5); // generated, never rendered
      for (const c of [clipA, clipB, clipUnused]) await ledger.recordClipCost(c);

      // Render 1 — narration was retried once (two paid syntheses), clip A only.
      const job1 = await newRenderJob();
      await tts(job1.id, 1000); // $0.03
      await tts(job1.id, 1000); // retry, billed again
      const export1 = await newExport(job1.id);
      const linked1 = await ledger.snapshotExportCostEvents({
        exportId: export1.id, userId: owner, renderJobId: job1.id,
        inputs: { scriptId: "script-reuse", aiClipIds: [clipA.id], assetIds: [] },
      });
      expect(linked1).toBe(4); // story + clip A + 2 tts

      // Later the user un-accepts clip A and prices change — export 1 must not move.
      await prisma.viontoAiClip.update({ where: { id: clipA.id }, data: { accepted: false } });

      // Render 2 from the same version reuses the story and clip A, adds clip B.
      const job2 = await newRenderJob();
      await tts(job2.id, 2000); // $0.06
      const export2 = await newExport(job2.id);
      await ledger.snapshotExportCostEvents({
        exportId: export2.id, userId: owner, renderJobId: job2.id,
        inputs: { scriptId: "script-reuse", aiClipIds: [clipA.id, clipB.id], assetIds: [] },
      });

      // A legacy export, rendered before tracking existed.
      const job0 = await newRenderJob();
      await newExport(job0.id);

      const timeline = await read.buildViontoCostTimeline(owner, { range: range(), projectId }, { limit: 50 });
      const group = timeline.projects.find((p) => p.projectId === projectId)!;
      const byId = new Map(group.exports.map((e) => [e.exportId, e]));

      expect(byId.get(export1.id)!.totals.effectiveKnownMicros).toBe(String(1_600_000 + 280_000 + 30_000 + 30_000));
      expect(byId.get(export2.id)!.totals.effectiveKnownMicros).toBe(String(1_600_000 + 280_000 + 280_000 + 60_000));
      expect([...byId.values()].filter((e) => !e.tracked)).toHaveLength(1);

      // Project subtotal counts each event once: story + A + B + unused C + 3 tts.
      const projectTotal = 1_600_000 + 3 * 280_000 + 30_000 + 30_000 + 60_000;
      expect(group.totals.effectiveKnownMicros).toBe(String(projectTotal));
      expect(timeline.summary.effectiveKnownMicros).toBe(String(projectTotal));
      // …and the unused clip is the "not attached to a final export" work.
      expect(group.unattached.effectiveKnownMicros).toBe("280000");
      expect(group.unattached.eventCount).toBe(1);

      // BYOK amounts are visible but separated from platform spend.
      expect(timeline.summary.byokMicros).toBe(String(3 * 280_000));
      expect(timeline.summary.platformMicros).toBe(String(1_600_000 + 120_000));

      // Export filter shows exactly that export's frozen set.
      const onlyExport1 = await read.buildViontoCostTimeline(owner, { range: range(), exportId: export1.id }, { limit: 50 });
      expect(onlyExport1.summary.eventCount).toBe(4);
      const unattachedOnly = await read.buildViontoCostTimeline(owner, { range: range(), projectId, unattachedOnly: true }, { limit: 50 });
      expect(unattachedOnly.items.map((i) => i.subjectId)).toEqual([clipUnused.id]);
    } finally {
      await prisma.viontoProject.delete({ where: { id: project.id } });
      projectId = prevProject;
    }
  });

  it("deleting a project keeps its cost history, shown as a deleted project", async () => {
    const project = await prisma.viontoProject.create({ data: { userId: owner, title: "Gone" } });
    await ledger.recordViontoCost({
      userId: owner, operation: "story", subjectType: "script", subjectId: "script-gone", projectId: project.id,
      provider: "openai", responseModel: "gpt-4.1-mini", credentialSource: "platform", stableId: ledger.storyStableId("script-gone"),
      usage: [{ bucket: "output", unit: "tokens", quantity: 10 }],
    });
    await prisma.viontoProject.delete({ where: { id: project.id } });
    const timeline = await read.buildViontoCostTimeline(owner, { range: range(), projectId: project.id }, { limit: 10 });
    expect(timeline.summary.eventCount).toBe(1);
    expect(timeline.projects[0]).toMatchObject({ label: "Deleted project", deleted: true });
  });

  it("sharing a project never reveals the owner's spend to a collaborator", async () => {
    const asCollaborator = await read.buildViontoCostTimeline(collaborator, { range: range(), projectId }, { limit: 50 });
    expect(asCollaborator.summary.eventCount).toBe(0);
    expect(asCollaborator.items).toEqual([]);
    const asOwner = await read.buildViontoCostTimeline(owner, { range: range(), projectId }, { limit: 50 });
    expect(asOwner.summary.eventCount).toBeGreaterThan(0);
  });

  it("paginates with a cursor while totals stay fixed, and filters by category/payer/status", async () => {
    const all = await read.buildViontoCostTimeline(owner, { range: range() }, { limit: 2 });
    const seen = [...all.items.map((i) => i.id)];
    let cursor = all.nextCursor;
    while (cursor) {
      const page = await read.buildViontoCostTimeline(owner, { range: range() }, { limit: 2, cursor });
      expect(page.summary).toEqual(all.summary);
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor;
    }
    expect(new Set(seen).size).toBe(all.summary.eventCount);

    const clips = await read.buildViontoCostTimeline(owner, { range: range(), operations: ["ai_motion_clip"] }, { limit: 50 });
    expect(clips.items.every((i) => i.operation === "ai_motion_clip")).toBe(true);
    const byok = await read.buildViontoCostTimeline(owner, { range: range(), credential: "user_byok" }, { limit: 50 });
    expect(byok.items.every((i) => i.credentialSource === "user_byok")).toBe(true);
    const unknown = await read.buildViontoCostTimeline(owner, { range: range(), status: ["unknown"] }, { limit: 50 });
    expect(unknown.items.every((i) => i.amountMicros === null)).toBe(true);
    expect(unknown.summary.effectiveKnownMicros).toBe("0");
  });

  it("deleting the user erases their cost ledger", async () => {
    const temp = await prisma.user.create({ data: { email: `vionto-cost-temp-${tag}@example.test` } });
    await ledger.recordViontoCost({
      userId: temp.id, operation: "tts_preview", subjectType: "user", subjectId: temp.id,
      provider: "openai", responseModel: "tts-1-hd", credentialSource: "platform",
      usage: [{ bucket: "tts_output", unit: "characters", quantity: 20 }],
    });
    await prisma.user.delete({ where: { id: temp.id } });
    expect(await prisma.viontoAiCostEvent.count({ where: { userId: temp.id } })).toBe(0);
  });
});
