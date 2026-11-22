import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parseProfileContent } from "../profile/contract";

/**
 * #929 against a real database: add → confirm → use, revisions that keep
 * their lineage, stale edits, and workspace/job isolation. Guarded behind
 * RESUMATCH_TEST_DATABASE_URL like the other integration suites.
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;

vi.mock("../workspace", () => ({ recordAuditEvent: async () => undefined }));

const profile = parseProfileContent({
  headline: "Backend developer",
  skills: [{ name: "Node.js" }],
  experience: [{ title: "Backend developer", employer: "Acme", startedOn: "2021-03", summary: "Built APIs." }],
});

describe.skipIf(!TEST_DB)("background evidence store (#929)", () => {
  let db: import("../db/generated").PrismaClient;
  let store: typeof import("./store");
  const workspaceIds: string[] = [];
  let ws: string;
  let other: string;
  let job: string;
  let otherJob: string;

  async function workspaceWithJob(): Promise<[string, string]> {
    const w = await db.workspace.create({ data: { platformUserId: `evidence-test-${Date.now()}-${Math.random()}` } });
    workspaceIds.push(w.id);
    const j = await db.targetJob.create({
      data: { workspaceId: w.id, sourceUrl: "https://example.test/job", rawText: "Node.js role", status: "FETCHED" },
    });
    return [w.id, j.id];
  }

  beforeAll(async () => {
    db = (await import("../db/client")).getJobmatchDb();
    store = await import("./store");
    [ws, job] = await workspaceWithJob();
    otherJob = (await db.targetJob.create({ data: { workspaceId: ws, sourceUrl: "https://example.test/2", rawText: "x", status: "FETCHED" } })).id;
    [other] = await workspaceWithJob();
  });

  afterAll(async () => {
    if (db) await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  });

  const input = (detail: string, extra: Partial<import("./contract").EvidenceInput> = {}) => ({
    kind: "ACHIEVEMENT" as const,
    title: "Faster checkout",
    detail,
    experienceRef: null,
    ...extra,
  });

  it("uses only confirmed evidence for this job or background, never drafts, other jobs or other workspaces", async () => {
    const draft = await store.createEvidence(ws, input("Draft text."), { scope: "APPLICATION", targetJobId: job, confirm: false });
    const forJob = await store.createEvidence(ws, input("Cut checkout time by 30%."), { scope: "APPLICATION", targetJobId: job, confirm: true });
    const background = await store.createEvidence(ws, input("Ran the on-call rota.", { kind: "RESPONSIBILITY" }), {
      scope: "BACKGROUND",
      targetJobId: null,
      confirm: true,
    });
    const elsewhere = await store.createEvidence(ws, input("For the other job."), { scope: "APPLICATION", targetJobId: otherJob, confirm: true });
    const foreign = await store.createEvidence(other, input("Someone else's."), { scope: "BACKGROUND", targetJobId: null, confirm: true });
    for (const r of [draft, forJob, background, elsewhere, foreign]) expect(r.ok).toBe(true);

    const used = await store.loadGenerationEvidence(ws, job, profile);
    expect(used.revisionIds).toEqual([(forJob as { revisionId: string }).revisionId, (background as { revisionId: string }).revisionId]);

    // Add → confirm → use.
    const confirmed = await store.confirmEvidence(ws, (draft as { id: string }).id, (draft as { revisionId: string }).revisionId);
    expect(confirmed.ok).toBe(true);
    expect((await store.loadGenerationEvidence(ws, job, profile)).revisionIds).toContain((draft as { revisionId: string }).revisionId);

    // Another workspace cannot see, confirm, edit or delete it.
    expect(await store.listEvidence(other, job, profile)).toHaveLength(1);
    expect((await store.confirmEvidence(other, (draft as { id: string }).id, (draft as { revisionId: string }).revisionId)).ok).toBe(false);
    expect(await store.deleteEvidence(other, (forJob as { id: string }).id)).toBe(false);
    // Nor attach it to its job.
    expect(await store.createEvidence(other, input("x"), { scope: "APPLICATION", targetJobId: job, confirm: true })).toEqual({ ok: false, error: "job_not_found" });
  });

  it("an edit adds a revision, keeps the old one for lineage, and refuses a stale base", async () => {
    const created = await store.createEvidence(ws, input("First wording."), { scope: "BACKGROUND", targetJobId: null, confirm: true });
    if (!created.ok) throw new Error("create failed");
    const edited = await store.reviseEvidence(ws, created.id, created.revisionId, input("Second wording."), {
      scope: "BACKGROUND",
      targetJobId: null,
      confirm: false,
    });
    if (!edited.ok) throw new Error("edit failed");
    expect(edited.revisionId).not.toBe(created.revisionId);

    const revisions = await db.candidateEvidenceRevision.findMany({ where: { evidenceId: created.id }, orderBy: { revisionNumber: "asc" } });
    expect(revisions.map((r) => [r.revisionNumber, r.detail, r.status])).toEqual([
      [1, "First wording.", "CONFIRMED"],
      [2, "Second wording.", "DRAFT"],
    ]);
    // The latest is a draft, so the item is not used until confirmed again.
    expect((await store.loadGenerationEvidence(ws, job, profile)).revisionIds).not.toContain(created.revisionId);
    expect((await store.loadGenerationEvidence(ws, job, profile)).revisionIds).not.toContain(edited.revisionId);

    // A save from a tab that still shows revision 1 is refused.
    const stale = await store.reviseEvidence(ws, created.id, created.revisionId, input("Third."), { scope: "BACKGROUND", targetJobId: null, confirm: true });
    expect(stale).toEqual({ ok: false, error: "stale" });
    expect(await store.confirmEvidence(ws, created.id, created.revisionId)).toEqual({ ok: false, error: "stale" });
  });

  it("moves an item to background only when asked, and leaves out a role the profile no longer has", async () => {
    const created = await store.createEvidence(
      ws,
      input("Led the API migration.", { kind: "PROJECT", experienceRef: { title: "Backend developer", employer: "Acme", startedOn: "2021-03" } }),
      { scope: "APPLICATION", targetJobId: otherJob, confirm: true },
    );
    if (!created.ok) throw new Error("create failed");
    expect((await store.loadGenerationEvidence(ws, job, profile)).revisionIds).not.toContain(created.revisionId);

    const promoted = await store.reviseEvidence(
      ws,
      created.id,
      created.revisionId,
      input("Led the API migration.", { kind: "PROJECT", experienceRef: { title: "Backend developer", employer: "Acme", startedOn: "2021-03" } }),
      { scope: "BACKGROUND", targetJobId: null, confirm: true },
    );
    // Same content: no new revision, just the new scope.
    expect(promoted).toEqual({ ok: true, id: created.id, revisionId: created.revisionId });
    expect((await store.loadGenerationEvidence(ws, job, profile)).revisionIds).toContain(created.revisionId);

    const otherProfile = parseProfileContent({ headline: "x", experience: [{ title: "Designer", employer: "Elsewhere" }] });
    expect((await store.loadGenerationEvidence(ws, job, otherProfile)).revisionIds).not.toContain(created.revisionId);
    const view = (await store.listEvidence(ws, job, otherProfile)).find((v) => v.id === created.id);
    expect(view?.excludedBecause).toBe("experience_missing");
  });

  it("deleting an item removes every revision", async () => {
    const created = await store.createEvidence(ws, input("To delete."), { scope: "BACKGROUND", targetJobId: null, confirm: true });
    if (!created.ok) throw new Error("create failed");
    expect(await store.deleteEvidence(ws, created.id)).toBe(true);
    expect(await db.candidateEvidenceRevision.count({ where: { evidenceId: created.id } })).toBe(0);
  });
});
