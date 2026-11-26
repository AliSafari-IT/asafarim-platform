import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #933 against a real database: two workspaces, each with every kind of
 * personalization record (profile, job, evidence, writing preferences,
 * preview with context and suggestions, saved CV with review feedback,
 * cover letter, application, Tailor draft). Covers the negative paths across workspaces
 * (list, read, write, generate, confirm, export, delete, cache reuse),
 * retention expiry, evidence deletion and erasure with verified counts.
 * Synthetic fixtures only. Guarded behind RESUMATCH_TEST_DATABASE_URL.
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;

const state = vi.hoisted(() => ({ workspaceId: null as string | null, providerCalls: 0 }));

vi.mock("../workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../workspace")>();
  return {
    ...actual,
    getCurrentWorkspace: async () => (state.workspaceId ? { id: state.workspaceId } : null),
  };
});
// Any provider call in these tests is a failure: ownership must be refused first.
vi.mock("../tailoring/ai/generate", () => ({
  runTailorProviderCall: async () => {
    state.providerCalls += 1;
    throw new Error("provider must not be called");
  },
}));
vi.mock("../tailoring/ai/coverLetter/generate", () => ({
  runCoverLetterProviderCall: async () => {
    state.providerCalls += 1;
    throw new Error("provider must not be called");
  },
}));

const DRAFT_OPTIONS = {
  cvLanguage: "en",
  instructions: "",
  includeCoverLetter: false,
  coverLetterTone: "formal",
  coverLetterLength: "standard",
  coverLetterLanguage: null,
  savedNotesOff: false,
  lowFitConfirmed: false,
  unmetRequirementIds: [],
};

/** Distinctive text per workspace, so a leak is a string match. */
const SECRET = { a: "ALPHA-ONLY-led the Zephyr migration", b: "BRAVO-ONLY-ran the Quasar rollout" };

describe.skipIf(!TEST_DB)("personalization lifecycle and isolation (#933)", () => {
  let db: import("../db/generated").PrismaClient;
  const created: string[] = [];

  type Seeded = Awaited<ReturnType<typeof seed>>;
  let A: Seeded;
  let B: Seeded;

  beforeAll(async () => {
    db = (await import("../db/client")).getJobmatchDb();
  });

  afterAll(async () => {
    if (!db) return;
    const { eraseWorkspaceData } = await import("../profile/dataRights");
    for (const id of created) {
      await eraseWorkspaceData(id);
      await db.auditEvent.deleteMany({ where: { workspaceId: id } });
      await db.workspace.deleteMany({ where: { id } });
    }
  });

  async function seed(label: "a" | "b", createdAt: Date = new Date()) {
    const { createVersion, confirmVersion } = await import("../profile/versions");
    const { createEvidence } = await import("../evidence/store");
    const { saveWritingPreferences } = await import("../writingPreferences/store");
    const { readWritingPreferences } = await import("../writingPreferences/contract");
    const ws = await db.workspace.create({ data: { platformUserId: `lifecycle-${label}-${Date.now()}-${Math.random()}` }, select: { id: true } });
    created.push(ws.id);
    const version = await createVersion({
      workspaceId: ws.id,
      content: {
        headline: "Backend engineer",
        skills: [{ name: "TypeScript", rawLabel: null, yearsExperience: 5 }],
        experience: [{ title: "Engineer", employer: `Employer ${label}`, startDate: "2020-01", endDate: null, bullets: ["Built APIs."] }],
      },
      origin: "MANUAL",
      extractorName: "test",
      extractorVersion: "1",
    });
    await confirmVersion(ws.id, version.id);
    const job = await db.targetJob.create({
      data: { workspaceId: ws.id, sourceUrl: `https://example.test/${label}`, rawText: "We need TypeScript and migrations.", title: "Engineer", status: "FETCHED" },
      select: { id: true },
    });
    const evidence = await createEvidence(
      ws.id,
      { kind: "ACHIEVEMENT", title: `${label} achievement`, detail: SECRET[label], experienceRef: null },
      { scope: "BACKGROUND", targetJobId: null, confirm: true },
    );
    if (!evidence.ok) throw new Error("seed evidence");
    const prefs = await saveWritingPreferences(ws.id, readWritingPreferences({ cv: { styleNote: `${label} prefers short bullets` } }), null);
    if (!prefs.ok) throw new Error("seed prefs");
    const context = { contextVersion: "tailoring_context@1", workspaceId: ws.id, evidenceRevisionIds: [evidence.revisionId], instructions: SECRET[label] };
    const preview = await db.tailorPreview.create({
      data: {
        workspaceId: ws.id,
        profileVersionId: version.id,
        targetJobId: job.id,
        promptVersion: "tailor_resume@9",
        modelVersion: "fixture",
        degraded: false,
        context: context as never,
        suggestions: { summary: SECRET[label] } as never,
        createdAt,
      },
      select: { id: true },
    });
    const cv = await db.tailoredResume.create({
      data: {
        workspaceId: ws.id,
        profileVersionId: version.id,
        targetJobId: job.id,
        content: { skills: ["TypeScript"], experience: [], education: [], certifications: [] },
        templateKey: "classic",
        promptVersion: "tailor_resume@9",
        modelVersion: "fixture",
        tailoringContext: context as never,
        feedback: {
          create: {
            workspaceId: ws.id,
            previewId: preview.id,
            feedbackVersion: "tailoring_feedback@1",
            original: { cv: { summary: SECRET[label] } } as never,
            decisions: [{ key: "summary", decision: "accepted", scope: "application" }] as never,
            createdAt,
          },
        },
      },
      select: { id: true },
    });
    await db.tailorPreview.update({ where: { id: preview.id }, data: { consumedAt: new Date() } });
    // An unfinished Tailor run on the same job, last changed at `createdAt`.
    const draft = await db.tailorDraft.create({
      data: {
        workspaceId: ws.id,
        targetJobId: job.id,
        step: "review",
        previewId: preview.id,
        options: { ...DRAFT_OPTIONS, instructions: SECRET[label] } as never,
        review: { targetJobId: job.id, previewId: preview.id, summary: SECRET[label] } as never,
      },
      select: { id: true },
    });
    await db.$executeRaw`UPDATE "tailor_drafts" SET "updatedAt" = ${createdAt} WHERE "id" = ${draft.id}`;
    const letter = await db.coverLetter.create({
      data: { workspaceId: ws.id, profileVersionId: version.id, targetJobId: job.id, tailoredResumeId: cv.id, content: { paragraphs: [SECRET[label]] }, promptVersion: "cover_letter@7", modelVersion: "fixture" },
      select: { id: true },
    });
    const application = await db.application.create({
      data: { workspaceId: ws.id, targetJobId: job.id, tailoredResumeId: cv.id, notes: `${label} notes` },
      select: { id: true },
    });
    return {
      workspaceId: ws.id,
      profileVersionId: version.id,
      targetJobId: job.id,
      evidenceId: evidence.id,
      revisionId: evidence.revisionId,
      previewId: preview.id,
      cvId: cv.id,
      letterId: letter.id,
      applicationId: application.id,
      draftId: draft.id,
    };
  }

  beforeEach(async () => {
    state.workspaceId = null;
    state.providerCalls = 0;
    A = await seed("a");
    B = await seed("b");
  });

  describe("across workspaces", () => {
    it("list: B's evidence list never includes A's items", async () => {
      const { listEvidence } = await import("../evidence/store");
      const ids = (await listEvidence(B.workspaceId, B.targetJobId, null)).map((v) => v.id);
      expect(ids).toContain(B.evidenceId);
      expect(ids).not.toContain(A.evidenceId);
    });

    it("generation: B's run for A's job sees none of A's evidence", async () => {
      const { loadGenerationEvidence } = await import("../evidence/store");
      const profile = { headline: "x", skills: [], experience: [] } as never;
      const evidence = await loadGenerationEvidence(B.workspaceId, A.targetJobId, profile);
      expect(evidence.revisionIds).not.toContain(A.revisionId);
      expect(JSON.stringify(evidence)).not.toContain(SECRET.a);
    });

    it("read: A's feedback, evidence impact and preferences are not readable as B", async () => {
      const { evidenceDeletionImpact } = await import("../evidence/store");
      const { getWritingPreferences } = await import("../writingPreferences/store");
      expect(await evidenceDeletionImpact(B.workspaceId, A.evidenceId)).toBeNull();
      expect(JSON.stringify(await getWritingPreferences(B.workspaceId))).not.toContain("a prefers");

      state.workspaceId = B.workspaceId;
      const feedback = await import("../../app/api/tailor/[id]/feedback/route");
      const res = await feedback.GET(new Request("http://localhost"), { params: Promise.resolve({ id: A.cvId }) });
      expect(res.status).toBe(404);
      const evidenceRoute = await import("../../app/api/evidence/[id]/route");
      const impact = await evidenceRoute.GET(new Request("http://localhost"), { params: Promise.resolve({ id: A.evidenceId }) });
      expect(impact.status).toBe(404);
    });

    it("write: B cannot revise, confirm or delete A's evidence", async () => {
      const { confirmEvidence, deleteEvidence, reviseEvidence } = await import("../evidence/store");
      const input = { kind: "ACHIEVEMENT" as const, title: "hijack", detail: "hijack", experienceRef: null };
      expect(await reviseEvidence(B.workspaceId, A.evidenceId, A.revisionId, input, { scope: "BACKGROUND", targetJobId: null, confirm: true })).toEqual({ ok: false, error: "not_found" });
      expect(await confirmEvidence(B.workspaceId, A.evidenceId, A.revisionId)).toEqual({ ok: false, error: "not_found" });
      expect(await deleteEvidence(B.workspaceId, A.evidenceId)).toBeNull();
      expect(await db.candidateEvidence.count({ where: { id: A.evidenceId } })).toBe(1);
      expect(await db.tailoringFeedback.count({ where: { tailoredResumeId: A.cvId } })).toBe(1);
    });

    it("generate: B asking for a preview with A's profile version or job is refused before any provider call", async () => {
      state.workspaceId = B.workspaceId;
      const { POST } = await import("../../app/api/tailor/generate-preview/route");
      const call = (body: Record<string, unknown>) =>
        POST(new Request("http://localhost/api/tailor/generate-preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
      expect((await call({ profileVersionId: A.profileVersionId, targetJobId: B.targetJobId })).status).toBe(404);
      // Another workspace's job reads exactly like one of B's own jobs
      // without fetched text, so the answer does not reveal that it exists.
      const foreignJob = await call({ profileVersionId: B.profileVersionId, targetJobId: A.targetJobId });
      expect(foreignJob.status).toBe(400);
      expect(await foreignJob.json()).toEqual({ error: "That job has no fetched text to tailor toward." });
      expect(state.providerCalls).toBe(0);
    });

    it("confirm: B cannot use A's preview", async () => {
      await db.tailorPreview.update({ where: { id: A.previewId }, data: { consumedAt: null } });
      state.workspaceId = B.workspaceId;
      const { POST } = await import("../../app/api/tailor/generate-confirm/route");
      const res = await POST(
        new Request("http://localhost/api/tailor/generate-confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profileVersionId: B.profileVersionId,
            targetJobId: B.targetJobId,
            previewId: A.previewId,
            approved: { headline: "x", summary: "y", skillsOrder: [], experienceBullets: [] },
          }),
        }),
      );
      expect(res.status).toBe(409);
      const preview = await db.tailorPreview.findUnique({ where: { id: A.previewId }, select: { consumedAt: true } });
      expect(preview?.consumedAt).toBeNull();
      expect(await db.tailoredResume.count({ where: { workspaceId: B.workspaceId } })).toBe(1);
    });

    it("export: B's export holds none of A's records", async () => {
      const { exportWorkspaceData } = await import("../profile/dataRights");
      const text = JSON.stringify(await exportWorkspaceData(B.workspaceId));
      expect(text).toContain(SECRET.b);
      expect(text).not.toContain(SECRET.a);
      for (const id of [A.evidenceId, A.previewId, A.cvId, A.letterId, A.applicationId, A.targetJobId]) expect(text).not.toContain(id);
    });

    it("delete: erasing B leaves every A record in place", async () => {
      const { eraseWorkspaceData, remainingWorkspaceRows } = await import("../profile/dataRights");
      const before = await remainingWorkspaceRows(A.workspaceId);
      const result = await eraseWorkspaceData(B.workspaceId);
      expect(result.verified).toBe(true);
      expect(await remainingWorkspaceRows(A.workspaceId)).toEqual(before);
    });

    it("cache: a dedup result stored for A is never served to B, and B's erasure keeps it", async () => {
      const { getDedupedResult, storeDedupedResult, clearDedupCacheForTests } = await import("../shared/aiDedupCache");
      clearDedupCacheForTests();
      const parts = { kind: "extract" as const, provider: "fixture", model: "m", promptCacheKey: "same-input" };
      storeDedupedResult({ ...parts, workspaceId: A.workspaceId }, { text: SECRET.a });
      expect(getDedupedResult({ ...parts, workspaceId: B.workspaceId })).toBeUndefined();
      const { eraseWorkspaceData } = await import("../profile/dataRights");
      await eraseWorkspaceData(B.workspaceId);
      expect(getDedupedResult({ ...parts, workspaceId: A.workspaceId })).toEqual({ text: SECRET.a });
      const erasedA = await eraseWorkspaceData(A.workspaceId);
      expect(erasedA.cacheEntriesDeleted).toBe(1);
      expect(getDedupedResult({ ...parts, workspaceId: A.workspaceId })).toBeUndefined();
    });
  });

  describe("export and erasure", () => {
    it("export contains every retained personalization record", async () => {
      const { exportWorkspaceData } = await import("../profile/dataRights");
      const data = await exportWorkspaceData(A.workspaceId);
      expect(data?.formatVersion).toBe("1.2.0");
      expect(data?.evidence.map((e) => e.id)).toEqual([A.evidenceId]);
      expect(data?.writingPreferences).toHaveLength(1);
      expect(data?.tailorPreviews.map((p) => p.id)).toEqual([A.previewId]);
      expect(data?.tailoringFeedback.map((f) => f.previewId)).toEqual([A.previewId]);
      expect(data?.coverLetters.map((l) => l.id)).toEqual([A.letterId]);
      expect(data?.applications.map((a) => a.notes)).toEqual(["a notes"]);
      expect(data?.tailorDrafts.map((d) => d.targetJobId)).toEqual([A.targetJobId]);
      expect(JSON.stringify(data?.tailorDrafts)).toContain(SECRET.a);
      expect(data?.retention).toEqual({ previewDays: 30, feedbackDays: 180, draftDays: 30 });
      expect(data?.notes.join(" ")).toMatch(/never used to train/);
    });

    it("erasure removes snapshots, feedback and caches with verified counts, and is idempotent", async () => {
      const { eraseWorkspaceData } = await import("../profile/dataRights");
      const first = await eraseWorkspaceData(A.workspaceId);
      expect(first).toMatchObject({ previewsDeleted: 1, feedbackDeleted: 1, draftsDeleted: 1, evidenceDeleted: 1, writingPreferenceRevisionsDeleted: 1, tailoredResumesDeleted: 1, verified: true });
      expect(Object.values(first.remaining).every((n) => n === 0)).toBe(true);
      const second = await eraseWorkspaceData(A.workspaceId);
      expect(second).toMatchObject({ previewsDeleted: 0, feedbackDeleted: 0, draftsDeleted: 0, evidenceDeleted: 0, tailoredResumesDeleted: 0, verified: true });
      const audits = await db.auditEvent.findMany({ where: { workspaceId: A.workspaceId }, select: { metadata: true } });
      expect(JSON.stringify(audits)).not.toContain(SECRET.a);
    });
  });

  describe("evidence deletion", () => {
    it("reports affected history, then removes previews and feedback that used it but keeps the CV", async () => {
      const { evidenceDeletionImpact, deleteEvidence } = await import("../evidence/store");
      expect(await evidenceDeletionImpact(A.workspaceId, A.evidenceId)).toEqual({ savedCvs: 1, previews: 1 });
      expect(await deleteEvidence(A.workspaceId, A.evidenceId)).toEqual({ savedCvs: 1, previewsDeleted: 1, feedbackDeleted: 1 });
      expect(await db.tailorPreview.count({ where: { id: A.previewId } })).toBe(0);
      expect(await db.tailoringFeedback.count({ where: { tailoredResumeId: A.cvId } })).toBe(0);
      expect(await db.tailoredResume.count({ where: { id: A.cvId } })).toBe(1);
      expect(await db.candidateEvidenceRevision.count({ where: { evidenceId: A.evidenceId } })).toBe(0);
      // Nothing of the item is retrievable any more, and a second delete is a 404.
      const { exportWorkspaceData } = await import("../profile/dataRights");
      const text = JSON.stringify(await exportWorkspaceData(A.workspaceId));
      // The saved cover letter keeps its own text by design; the evidence
      // item, the preview and the feedback are gone from the export.
      const exported = JSON.parse(text) as { evidence: unknown[]; tailorPreviews: unknown[]; tailoringFeedback: unknown[] };
      expect(exported.evidence).toEqual([]);
      expect(exported.tailorPreviews).toEqual([]);
      expect(exported.tailoringFeedback).toEqual([]);
      // The draft on that preview keeps its job and choices, not its review.
      const draft = await db.tailorDraft.findUnique({ where: { id: A.draftId }, select: { step: true, previewId: true, review: true } });
      expect(draft).toEqual({ step: "options", previewId: null, review: null });
      expect(text).not.toContain(A.previewId);
      expect(await deleteEvidence(A.workspaceId, A.evidenceId)).toBeNull();
      // B is untouched.
      expect(await db.tailoringFeedback.count({ where: { tailoredResumeId: B.cvId } })).toBe(1);
      const audits = await db.auditEvent.findMany({ where: { workspaceId: A.workspaceId, action: "evidence.deleted" }, select: { metadata: true } });
      expect(audits).toHaveLength(1);
      expect(JSON.stringify(audits)).not.toContain(SECRET.a);
    });
  });

  describe("Tailor drafts", () => {
    const put = (body: unknown) =>
      new Request("http://localhost/api/tailor/drafts/x", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

    it("B can neither save, discard nor resume A's draft", async () => {
      const { saveDraft, discardDraft, loadDraft, listDrafts } = await import("../tailoring/drafts/store");
      const update = { step: "options" as const, options: { ...DRAFT_OPTIONS, instructions: "hijack" } as never, previewId: null, review: null };
      expect(await saveDraft(B.workspaceId, A.targetJobId, update)).toMatchObject({ ok: false, status: 404 });
      expect(await discardDraft(B.workspaceId, A.targetJobId)).toBe(false);
      expect(await loadDraft(B.workspaceId, A.targetJobId)).toBeNull();
      expect((await listDrafts(B.workspaceId)).map((d) => d.targetJobId)).toEqual([B.targetJobId]);
      const draft = await db.tailorDraft.findUnique({ where: { id: A.draftId }, select: { options: true } });
      expect(JSON.stringify(draft?.options)).toContain(SECRET.a);

      state.workspaceId = B.workspaceId;
      const route = await import("../../app/api/tailor/drafts/[targetJobId]/route");
      const res = await route.PUT(put(update), { params: Promise.resolve({ targetJobId: A.targetJobId }) });
      expect(res.status).toBe(404);
      await route.DELETE(new Request("http://localhost"), { params: Promise.resolve({ targetJobId: A.targetJobId }) });
      expect(await db.tailorDraft.count({ where: { id: A.draftId } })).toBe(1);
    });

    it("a review whose preview was used resumes on the options card", async () => {
      const { loadDraft } = await import("../tailoring/drafts/store");
      const draft = await loadDraft(A.workspaceId);
      expect(draft).toMatchObject({ targetJobId: A.targetJobId, step: "options", review: null, previewId: null, reviewExpired: true });
      expect(draft?.options?.instructions).toBe(SECRET.a);
    });

    it("saves and resumes a review on an unused preview, and refuses a used one", async () => {
      const { saveDraft, loadDraft } = await import("../tailoring/drafts/store");
      const review = { targetJobId: A.targetJobId, previewId: A.previewId, headline: "H", summary: "S", experience: [], suggestedSkillsOrder: [] };
      const update = { step: "review" as const, options: DRAFT_OPTIONS as never, previewId: A.previewId, review };
      expect(await saveDraft(A.workspaceId, A.targetJobId, update)).toMatchObject({ ok: false, status: 409 });
      await db.tailorPreview.update({ where: { id: A.previewId }, data: { consumedAt: null } });
      expect((await saveDraft(A.workspaceId, A.targetJobId, update)).ok).toBe(true);
      expect(await loadDraft(A.workspaceId, A.targetJobId)).toMatchObject({ step: "review", previewId: A.previewId, review, reviewExpired: false });
      // Back to the options card: the stored review is cleared.
      expect((await saveDraft(A.workspaceId, A.targetJobId, { step: "options", options: null, previewId: null, review: null })).ok).toBe(true);
      const row = await db.tailorDraft.findUnique({ where: { id: A.draftId }, select: { step: true, review: true, options: true } });
      expect(row).toEqual({ step: "options", review: null, options: null });
    });

    it("Fetch again moves the old job's choices onto the new job and closes the old draft", async () => {
      const { openDraft, listDrafts } = await import("../tailoring/drafts/store");
      const fresh = await db.targetJob.create({
        data: { workspaceId: A.workspaceId, sourceUrl: "https://example.test/a", rawText: "Updated posting text.", status: "FETCHED" },
        select: { id: true },
      });
      await openDraft(A.workspaceId, fresh.id, A.targetJobId);
      expect(await db.tailorDraft.count({ where: { id: A.draftId } })).toBe(0);
      const moved = await db.tailorDraft.findUnique({ where: { targetJobId: fresh.id }, select: { options: true, review: true, step: true } });
      expect(moved).toMatchObject({ step: "options", review: null });
      expect(JSON.stringify(moved?.options)).toContain(SECRET.a);
      expect((await listDrafts(A.workspaceId)).map((d) => d.targetJobId)).toEqual([fresh.id]);
      // A job of another workspace is never carried from.
      const other = await db.targetJob.create({
        data: { workspaceId: A.workspaceId, sourceUrl: "https://example.test/a2", rawText: "x", status: "FETCHED" },
        select: { id: true },
      });
      await openDraft(A.workspaceId, other.id, B.targetJobId);
      expect(await db.tailorDraft.count({ where: { id: B.draftId } })).toBe(1);
    });

    it("pasting a URL fetched recently reuses that job; an old fetch or another workspace's does not", async () => {
      const { findRecentFetch } = await import("../tailoring/drafts/store");
      expect((await findRecentFetch(A.workspaceId, "https://example.test/a"))?.id).toBe(A.targetJobId);
      expect(await findRecentFetch(B.workspaceId, "https://example.test/a")).toBeNull();
      expect(await findRecentFetch(A.workspaceId, "https://example.test/a", new Date(Date.now() + 8 * 24 * 60 * 60 * 1000))).toBeNull();
    });
  });

  describe("retention", () => {
    it("deletes previews after 30 days and feedback after 180, keeps fresh rows and CVs, and is idempotent", async () => {
      const { sweepExpiredPersonalization } = await import("./retention");
      const now = new Date();
      const old = await seed("a", new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000));
      const midAge = await seed("b", new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000));

      const first = await sweepExpiredPersonalization(now);
      expect(first.previewsDeleted).toBeGreaterThanOrEqual(2);
      // Drafts untouched for 30 days go; fresh ones stay.
      expect(first.draftsDeleted).toBeGreaterThanOrEqual(2);
      expect(await db.tailorDraft.count({ where: { id: { in: [old.draftId, midAge.draftId] } } })).toBe(0);
      expect(await db.tailorDraft.count({ where: { id: { in: [A.draftId, B.draftId] } } })).toBe(2);
      expect(first.feedbackDeleted).toBeGreaterThanOrEqual(1);
      expect(await db.tailorPreview.count({ where: { id: { in: [old.previewId, midAge.previewId] } } })).toBe(0);
      expect(await db.tailoringFeedback.count({ where: { tailoredResumeId: old.cvId } })).toBe(0);
      // 60 days: past the preview window, inside the feedback window.
      expect(await db.tailoringFeedback.count({ where: { tailoredResumeId: midAge.cvId } })).toBe(1);
      // Fresh rows and every CV stay.
      expect(await db.tailorPreview.count({ where: { id: { in: [A.previewId, B.previewId] } } })).toBe(2);
      expect(await db.tailoredResume.count({ where: { id: { in: [old.cvId, midAge.cvId] } } })).toBe(2);

      const second = await sweepExpiredPersonalization(now);
      expect(second).toEqual({ previewsDeleted: 0, feedbackDeleted: 0, draftsDeleted: 0 });

      const audits = await db.auditEvent.findMany({ where: { workspaceId: old.workspaceId, action: "personalization.retention.expired" }, select: { metadata: true } });
      expect(audits).toHaveLength(1);
      expect(JSON.stringify(audits)).not.toContain(SECRET.a);
    });

    it("a confirm against a preview removed by retention gets the expired answer", async () => {
      await db.tailorPreview.delete({ where: { id: A.previewId } });
      state.workspaceId = A.workspaceId;
      const { POST } = await import("../../app/api/tailor/generate-confirm/route");
      const res = await POST(
        new Request("http://localhost/api/tailor/generate-confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ profileVersionId: A.profileVersionId, targetJobId: A.targetJobId, previewId: A.previewId, approved: { headline: "x", summary: "y", skillsOrder: [], experienceBullets: [] } }),
        }),
      );
      expect(res.status).toBe(409);
    });

    it("the sweep tolerates sources already deleted by erasure", async () => {
      const { eraseWorkspaceData } = await import("../profile/dataRights");
      const { sweepExpiredPersonalization } = await import("./retention");
      const old = await seed("a", new Date(Date.now() - 400 * 24 * 60 * 60 * 1000));
      await eraseWorkspaceData(old.workspaceId);
      await expect(sweepExpiredPersonalization()).resolves.toBeDefined();
    });
  });
});
