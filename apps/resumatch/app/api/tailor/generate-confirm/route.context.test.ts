import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseProfileContent } from "../../../../lib/profile/contract";
import { resolveTailoringContext } from "../../../../lib/tailoring/context";

/**
 * #928: generate-confirm only saves from a preview whose request context
 * still holds, takes the note from that snapshot (not the client), keeps a
 * copy of it on the CV, and still confirms legacy previews (no snapshot).
 * Database-free: Prisma is a stub.
 */

const profile = parseProfileContent({
  fullName: "Sam Example",
  headline: "Backend developer",
  summary: "Builds Node.js services on PostgreSQL.",
  skills: [{ name: "Node.js" }, { name: "PostgreSQL" }],
  experience: [{ title: "Backend developer", employer: "Acme", summary: "Built Node.js APIs on PostgreSQL." }],
});
const jobText = "Backend engineer. Node.js and PostgreSQL.";
const NOTE = "Lead with PostgreSQL.";

const context = resolveTailoringContext({
  workspaceId: "ws_1",
  profileVersionId: "pv_1",
  targetJobId: "job_1",
  jobRawText: jobText,
  instructions: NOTE,
  lowFit: false,
  cvLanguage: "en",
  coverLetter: { tone: "warm", length: "short" },
});

let isConfirmed = true;
const targetJobFindFirst = vi.fn();
const previewFindFirst = vi.fn();
const previewUpdateMany = vi.fn();
const previewFindFirstOrThrow = vi.fn();
const resumeCreate = vi.fn();
const evidenceFindMany = vi.fn();

vi.mock("../../../../lib/workspace", () => ({
  getCurrentWorkspace: async () => ({ id: "ws_1" }),
  recordAuditEvent: async () => undefined,
}));
vi.mock("../../../../lib/profile/versions", () => ({ getVersion: async () => ({ content: profile, isConfirmed }) }));
vi.mock("../../../../lib/db/client", () => ({
  getJobmatchDb: () => ({
    targetJob: { findFirst: targetJobFindFirst },
    tailorPreview: { findFirst: previewFindFirst, updateMany: previewUpdateMany, findFirstOrThrow: previewFindFirstOrThrow },
    tailoredResume: { create: resumeCreate },
    candidateEvidence: { findMany: evidenceFindMany },
    coverLetter: { create: vi.fn() },
  }),
}));

const { POST } = await import("./route");
const confirm = (body: Record<string, unknown> = {}) =>
  POST(
    new Request("http://localhost/api/tailor/generate-confirm", {
      method: "POST",
      body: JSON.stringify({ profileVersionId: "pv_1", targetJobId: "job_1", previewId: "prev_1", approved: null, ...body }),
    }),
  );

const previewRow = (stored: unknown) => ({
  id: "prev_1",
  promptVersion: "tailor_resume@6",
  modelVersion: "fixture-tailor-1",
  degraded: false,
  outputLanguage: "en",
  coverLetterPromptVersion: null,
  coverLetterModelVersion: null,
  coverLetterDegraded: null,
  coverLetterOutputLanguage: null,
  context: stored,
});

describe("generate-confirm request context (#928)", () => {
  beforeEach(() => {
    isConfirmed = true;
    targetJobFindFirst.mockReset().mockResolvedValue({ id: "job_1", rawText: jobText });
    previewFindFirst.mockReset().mockResolvedValue({ context: JSON.parse(JSON.stringify(context)) });
    previewUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    previewFindFirstOrThrow.mockReset().mockResolvedValue(previewRow(context));
    resumeCreate.mockReset().mockResolvedValue({ id: "cv_1", outputLanguage: null });
    evidenceFindMany.mockReset().mockResolvedValue([]);
  });

  it("saves with the snapshot's note, not the client's echo, and keeps the context without the job text", async () => {
    const res = await confirm({ instructions: `  ${NOTE}  ` });
    expect(res.status).toBe(200);
    const data = resumeCreate.mock.calls[0]![0].data;
    expect(data.instructions).toBe(NOTE);
    expect(data.tailoringContext).toMatchObject({ instructions: NOTE, jobTextUsed: null, coverLetter: { tone: "warm", length: "short" } });
    expect(data.promptVersion).toBe("tailor_resume@6");
  });

  it("does not need the client to echo the note at all", async () => {
    const res = await confirm();
    expect(res.status).toBe(200);
    expect(resumeCreate.mock.calls[0]![0].data.instructions).toBe(NOTE);
  });

  it("refuses a preview whose job text changed, without using it up", async () => {
    targetJobFindFirst.mockResolvedValue({ id: "job_1", rawText: `${jobText} Now also Kubernetes.` });
    const res = await confirm({ instructions: NOTE });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "PREVIEW_CONTEXT_STALE", reason: "job_text" });
    expect(previewUpdateMany).not.toHaveBeenCalled();
    expect(resumeCreate).not.toHaveBeenCalled();
  });

  it("refuses a note that differs from the one the suggestions were made with", async () => {
    const res = await confirm({ instructions: "Lead with frontend." });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: "instructions" });
    expect(previewUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a snapshot made for another profile version", async () => {
    previewFindFirst.mockResolvedValue({ context: { ...context, profileVersionId: "pv_old" } });
    const res = await confirm();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: "profile_version" });
  });

  it("refuses a preview made before the candidate confirmed a newer profile, even when the client echoes the old version", async () => {
    isConfirmed = false;
    const res = await confirm();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "PREVIEW_CONTEXT_STALE", reason: "profile_version" });
    expect(previewUpdateMany).not.toHaveBeenCalled();
  });

  it("looks the preview up in the caller's workspace only; another workspace's id cannot be claimed", async () => {
    previewFindFirst.mockResolvedValue(null);
    previewUpdateMany.mockResolvedValue({ count: 0 });
    const res = await confirm();
    expect(previewFindFirst.mock.calls[0]![0].where).toEqual({ id: "prev_1", workspaceId: "ws_1" });
    expect(previewUpdateMany.mock.calls[0]![0].where).toMatchObject({ id: "prev_1", workspaceId: "ws_1" });
    expect(res.status).toBe(409);
    expect(resumeCreate).not.toHaveBeenCalled();
  });

  it("refuses a preview when evidence was added, confirmed or edited since, without using it up (#929)", async () => {
    evidenceFindMany.mockResolvedValue([
      {
        id: "ev_1",
        workspaceId: "ws_1",
        scope: "BACKGROUND",
        targetJobId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        revisions: [{ id: "ev_1_r1", revisionNumber: 1, kind: "PROJECT", title: "t", detail: "d", experienceRef: null, status: "CONFIRMED" }],
      },
    ]);
    const res = await confirm();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "PREVIEW_CONTEXT_STALE", reason: "evidence" });
    expect(previewUpdateMany).not.toHaveBeenCalled();
  });

  it("saves when the evidence is still the evidence the preview used, and keeps its revision ids on the CV (#929)", async () => {
    const withEvidence = { ...context, evidenceRevisionIds: ["ev_1_r1"] };
    previewFindFirst.mockResolvedValue({ context: JSON.parse(JSON.stringify(withEvidence)) });
    previewFindFirstOrThrow.mockResolvedValue(previewRow(withEvidence));
    evidenceFindMany.mockResolvedValue([
      {
        id: "ev_1",
        workspaceId: "ws_1",
        scope: "BACKGROUND",
        targetJobId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        revisions: [{ id: "ev_1_r1", revisionNumber: 1, kind: "PROJECT", title: "t", detail: "d", experienceRef: null, status: "CONFIRMED" }],
      },
    ]);
    const res = await confirm();
    expect(res.status).toBe(200);
    expect(resumeCreate.mock.calls[0]![0].data.tailoringContext).toMatchObject({ evidenceRevisionIds: ["ev_1_r1"] });
  });

  it("still confirms a legacy preview (no snapshot) the old way", async () => {
    previewFindFirst.mockResolvedValue({ context: null });
    previewFindFirstOrThrow.mockResolvedValue(previewRow(null));
    targetJobFindFirst.mockResolvedValue({ id: "job_1", rawText: "changed text is not checked for legacy previews" });
    const res = await confirm({ instructions: "  Legacy note  " });
    expect(res.status).toBe(200);
    const data = resumeCreate.mock.calls[0]![0].data;
    expect(data.instructions).toBe("Legacy note");
    expect(data.tailoringContext).toBeUndefined();
  });
});
