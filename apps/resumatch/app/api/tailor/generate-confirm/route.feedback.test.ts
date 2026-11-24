import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseProfileContent } from "../../../../lib/profile/contract";
import { resolveTailoringContext } from "../../../../lib/tailoring/context";
import { EMPTY_WRITING_PREFERENCES } from "../../../../lib/writingPreferences/contract";

/**
 * #932: generate-confirm records feedback against the preview's own copy
 * of the suggestions, in the same write as the CV, and runs the explicit
 * "remember" choices once. Database-free: Prisma and the stores are stubs.
 * Synthetic data only.
 */

const profile = parseProfileContent({
  fullName: "Sam Example",
  headline: "Backend developer",
  summary: "Builds Node.js services on PostgreSQL.",
  skills: [{ name: "Node.js" }, { name: "PostgreSQL" }],
  experience: [{ title: "Backend developer", employer: "Acme", startedOn: "2021-01", summary: "Built Node.js APIs." }],
});
const jobText = "Backend engineer. Node.js and PostgreSQL.";
const context = resolveTailoringContext({
  workspaceId: "ws_1",
  profileVersionId: "pv_1",
  targetJobId: "job_1",
  jobRawText: jobText,
  instructions: null,
  lowFit: false,
  cvLanguage: "en",
  coverLetter: null,
});
const storedSuggestions = {
  headline: "Backend engineer for payments",
  summary: "Builds reliable Node.js services.",
  skillsOrder: ["PostgreSQL", "Node.js"],
  experienceBullets: [["Built payment APIs in Node.js.", "Ran PostgreSQL migrations."]],
};

const targetJobFindFirst = vi.fn();
const previewFindFirst = vi.fn();
const previewUpdateMany = vi.fn();
const previewFindFirstOrThrow = vi.fn();
const resumeCreate = vi.fn();
const feedbackUpdate = vi.fn();
const evidenceCount = vi.fn();
const createEvidence = vi.fn();
const getWritingPreferences = vi.fn();
const saveWritingPreferences = vi.fn();
const audit = vi.fn();
const logged: unknown[][] = [];

vi.mock("../../../../lib/workspace", () => ({
  getCurrentWorkspace: async () => ({ id: "ws_1" }),
  recordAuditEvent: (...args: unknown[]) => audit(...args),
}));
vi.mock("../../../../lib/observability/logger", () => ({ logError: (...args: unknown[]) => logged.push(args) }));
vi.mock("../../../../lib/profile/versions", () => ({ getVersion: async () => ({ content: profile, isConfirmed: true }) }));
vi.mock("../../../../lib/evidence/store", () => ({
  loadGenerationEvidence: async () => ({ professional: [], motivation: [], revisionIds: [] }),
  createEvidence: (...args: unknown[]) => createEvidence(...args),
}));
vi.mock("../../../../lib/writingPreferences/store", () => ({
  getWritingPreferences: (...args: unknown[]) => getWritingPreferences(...args),
  saveWritingPreferences: (...args: unknown[]) => saveWritingPreferences(...args),
}));
vi.mock("../../../../lib/db/client", () => ({
  getJobmatchDb: () => ({
    targetJob: { findFirst: targetJobFindFirst },
    tailorPreview: { findFirst: previewFindFirst, updateMany: previewUpdateMany, findFirstOrThrow: previewFindFirstOrThrow },
    tailoredResume: { create: resumeCreate },
    tailoringFeedback: { update: feedbackUpdate },
    candidateEvidence: { count: evidenceCount },
    coverLetter: { create: vi.fn() },
  }),
}));

const { POST } = await import("./route");
const approved = {
  headline: "Backend engineer for payments",
  summary: "Builds reliable Node.js services for card payments.",
  skillsOrder: [],
  experienceBullets: [["Built payment APIs in Node.js.", "Ran the on-call rota."]],
};
const confirm = (body: Record<string, unknown> = {}) =>
  POST(
    new Request("http://localhost/api/tailor/generate-confirm", {
      method: "POST",
      body: JSON.stringify({ profileVersionId: "pv_1", targetJobId: "job_1", previewId: "prev_1", approved, bulletOrigins: [[0, null]], ...body }),
    }),
  );

const storedPreview = (overrides: Record<string, unknown> = {}) => ({
  context: JSON.parse(JSON.stringify(context)),
  suggestions: storedSuggestions,
  coverLetterSuggestion: null,
  promptVersion: "tailor_resume@9",
  modelVersion: "fixture-tailor-1",
  coverLetterPromptVersion: null,
  coverLetterModelVersion: null,
  ...overrides,
});

const ownBullet = { experienceIndex: 0, bulletIndex: 1, kind: "RESPONSIBILITY", title: "On-call rota", detail: "Ran the on-call rota." };

describe("generate-confirm review feedback (#932)", () => {
  beforeEach(() => {
    logged.length = 0;
    targetJobFindFirst.mockReset().mockResolvedValue({ id: "job_1", rawText: jobText });
    previewFindFirst.mockReset().mockResolvedValue(storedPreview());
    previewUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    previewFindFirstOrThrow.mockReset().mockResolvedValue({
      id: "prev_1",
      promptVersion: "tailor_resume@9",
      modelVersion: "fixture-tailor-1",
      degraded: false,
      outputLanguage: "en",
      coverLetterPromptVersion: null,
      coverLetterModelVersion: null,
      coverLetterDegraded: null,
      coverLetterOutputLanguage: null,
      context,
    });
    resumeCreate.mockReset().mockResolvedValue({ id: "cv_1", outputLanguage: "en" });
    feedbackUpdate.mockReset().mockResolvedValue({});
    evidenceCount.mockReset().mockResolvedValue(0);
    createEvidence.mockReset().mockResolvedValue({ ok: true, id: "ev_1", revisionId: "ev_1_r1" });
    getWritingPreferences.mockReset().mockResolvedValue({ revisionId: "rev_1", revisionNumber: 1, savedAt: "", preferences: EMPTY_WRITING_PREFERENCES });
    saveWritingPreferences.mockReset().mockResolvedValue({ ok: true, changed: true, current: { revisionNumber: 2 } });
    audit.mockReset().mockResolvedValue(undefined);
  });

  it("writes the feedback with the CV, from the preview's copy, and leaves preferences and background alone by default", async () => {
    const res = await confirm({ feedbackReasons: { "bullet:0:1": "not_relevant", headline: "too_long" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "cv_1", feedbackRecorded: true, promotionFailed: false });
    const feedback = resumeCreate.mock.calls[0]![0].data.feedback.create;
    expect(feedback).toMatchObject({ workspaceId: "ws_1", previewId: "prev_1", feedbackVersion: "tailoring_feedback@1" });
    expect(feedback.original).toMatchObject({ cv: storedSuggestions, promptVersion: "tailor_resume@9" });
    const decisions = Object.fromEntries((feedback.decisions as { key: string }[]).map((d) => [d.key, d]));
    expect(decisions.headline).toMatchObject({ decision: "accepted", scope: "application" });
    expect(decisions.headline).not.toHaveProperty("reason");
    expect(decisions.summary).toMatchObject({ decision: "edited", final: approved.summary });
    expect(decisions.skills).toMatchObject({ decision: "rejected" });
    expect(decisions["bullet:0:0"]).toMatchObject({ decision: "accepted" });
    expect(decisions["bullet:0:1"]).toMatchObject({ decision: "rejected", reason: "not_relevant" });
    expect(createEvidence).not.toHaveBeenCalled();
    expect(saveWritingPreferences).not.toHaveBeenCalled();
    expect(getWritingPreferences).not.toHaveBeenCalled();
    expect(feedbackUpdate).not.toHaveBeenCalled();
    const auditCall = audit.mock.calls.find((c) => c[1] === "tailoring.feedback.recorded")!;
    expect(auditCall[2]).toEqual({ tailoringId: "cv_1", accepted: 2, edited: 1, rejected: 2, preference: "none", background: 0 });
  });

  it("never takes the original suggestions from the client", async () => {
    await confirm({ original: { cv: { headline: "Injected" } }, suggestions: { headline: "Injected" } });
    expect(resumeCreate.mock.calls[0]![0].data.feedback.create.original.cv.headline).toBe(storedSuggestions.headline);
  });

  it("records nothing for a legacy preview without stored suggestions", async () => {
    previewFindFirst.mockResolvedValue(storedPreview({ suggestions: null }));
    const res = await confirm();
    expect(res.status).toBe(200);
    expect(resumeCreate.mock.calls[0]![0].data.feedback).toBeUndefined();
  });

  it("cannot record or promote anything for a preview that is used up or another workspace's", async () => {
    previewUpdateMany.mockResolvedValue({ count: 0 });
    const res = await confirm({ promotions: { background: [ownBullet] } });
    expect(res.status).toBe(409);
    expect(resumeCreate).not.toHaveBeenCalled();
    expect(createEvidence).not.toHaveBeenCalled();
  });

  it("adds a reviewed own bullet to the confirmed background once, after the CV is saved", async () => {
    const res = await confirm({ promotions: { background: [ownBullet] } });
    expect(res.status).toBe(200);
    expect(createEvidence).toHaveBeenCalledTimes(1);
    expect(createEvidence.mock.calls[0]).toEqual([
      "ws_1",
      { kind: "RESPONSIBILITY", title: "On-call rota", detail: "Ran the on-call rota.", experienceRef: { title: "Backend developer", employer: "Acme", startedOn: "2021-01" } },
      { scope: "BACKGROUND", targetJobId: null, confirm: true },
    ]);
    expect(resumeCreate.mock.invocationCallOrder[0]!).toBeLessThan(createEvidence.mock.invocationCallOrder[0]!);
    expect(feedbackUpdate.mock.calls[0]![0]).toMatchObject({
      where: { tailoredResumeId: "cv_1" },
      data: { promotions: { preference: null, background: [{ status: "saved", evidenceId: "ev_1", feedbackKey: null }] } },
    });
  });

  it("refuses to promote an AI bullet kept as written, before claiming the preview", async () => {
    const res = await confirm({ promotions: { background: [{ ...ownBullet, bulletIndex: 0 }] } });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "PROMOTION_INVALID" });
    expect(previewUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a full evidence list before claiming, and reports a failed promotion after the save without undoing it", async () => {
    evidenceCount.mockResolvedValue(40);
    expect((await confirm({ promotions: { background: [ownBullet] } })).status).toBe(422);
    expect(previewUpdateMany).not.toHaveBeenCalled();

    evidenceCount.mockResolvedValue(0);
    createEvidence.mockRejectedValue(new Error("db down: Ran the on-call rota."));
    const res = await confirm({ promotions: { background: [ownBullet] } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "cv_1", promotionFailed: true });
    // Logged by id only: the bullet text never reaches the log arguments.
    for (const args of logged) expect(JSON.stringify(args.slice(2))).not.toContain("on-call");
  });

  it("saves a reviewed style note on top of the revision the candidate saw, and refuses a stale one before claiming", async () => {
    const ok = await confirm({ promotions: { preference: { baseRevisionId: "rev_1", cvStyleNote: "Short sentences." } } });
    expect(ok.status).toBe(200);
    expect(saveWritingPreferences.mock.calls[0]![1]).toMatchObject({ cv: { styleNote: "Short sentences." } });
    expect(saveWritingPreferences.mock.calls[0]![2]).toBe("rev_1");

    previewUpdateMany.mockClear();
    const stale = await confirm({ promotions: { preference: { baseRevisionId: "rev_0", cvStyleNote: "Short sentences." } } });
    expect(stale.status).toBe(422);
    expect(await stale.json()).toMatchObject({ code: "PREFERENCES_STALE", current: { revisionId: "rev_1" } });
    expect(previewUpdateMany).not.toHaveBeenCalled();
  });

  it("keeps the preview usable when the CV write fails, so nothing is half-recorded", async () => {
    resumeCreate.mockRejectedValue(new Error("write failed"));
    const res = await confirm({ promotions: { background: [ownBullet] } });
    expect(res.status).toBe(500);
    expect(previewUpdateMany).toHaveBeenLastCalledWith({ where: { id: "prev_1", workspaceId: "ws_1" }, data: { consumedAt: null } });
    expect(createEvidence).not.toHaveBeenCalled();
  });
});
