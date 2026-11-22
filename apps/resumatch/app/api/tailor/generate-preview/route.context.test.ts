import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseProfileContent } from "../../../../lib/profile/contract";
import { fingerprintJobText, tailoringContextFingerprint } from "../../../../lib/tailoring/context";

/**
 * #928: generate-preview resolves one request context, gives the CV and the
 * letter the same note from it, and stores it on the preview. Database-free.
 */

const runTailorProviderCall = vi.fn();
const runCoverLetterProviderCall = vi.fn();
const findFirst = vi.fn();
const previewCreate = vi.fn();
const evidenceFindMany = vi.fn();

const profile = parseProfileContent({
  headline: "Backend developer · Node.js · PostgreSQL",
  summary: "Builds Node.js services on PostgreSQL.",
  skills: [{ name: "Node.js" }, { name: "PostgreSQL" }],
  experience: [{ title: "Backend developer", employer: "Acme", summary: "Built Node.js APIs on PostgreSQL." }],
});
const jobText = "Backend engineer (Node.js, PostgreSQL). You build Node.js services and PostgreSQL schemas.";

vi.mock("../../../../lib/workspace", () => ({ getCurrentWorkspace: async () => ({ id: "ws_1" }) }));
vi.mock("../../../../lib/profile/versions", () => ({ getVersion: async () => ({ content: profile }) }));
vi.mock("../../../../lib/db/client", () => ({
  getJobmatchDb: () => ({ targetJob: { findFirst }, tailorPreview: { create: previewCreate }, candidateEvidence: { findMany: evidenceFindMany } }),
}));
vi.mock("../../../../lib/tailoring/ai/generate", () => ({
  runTailorProviderCall: (...args: unknown[]) => runTailorProviderCall(...args),
}));
vi.mock("../../../../lib/tailoring/ai/coverLetter/generate", () => ({
  runCoverLetterProviderCall: (...args: unknown[]) => runCoverLetterProviderCall(...args),
}));

const { POST } = await import("./route");
const post = (body: unknown) =>
  new Request("http://localhost/api/tailor/generate-preview", { method: "POST", body: JSON.stringify(body) });

describe("generate-preview request context (#928)", () => {
  beforeEach(() => {
    findFirst.mockReset().mockResolvedValue({ rawText: jobText, status: "FETCHED" });
    evidenceFindMany.mockReset().mockResolvedValue([]);
    previewCreate.mockReset().mockImplementation(async ({ data }: { data: { id: string } }) => ({ id: data.id }));
    runTailorProviderCall.mockReset().mockResolvedValue({
      suggestions: null,
      degraded: true,
      promptVersion: "tailor_resume@6",
      modelVersion: "fixture-tailor-1",
      providerName: "fixture",
    });
    runCoverLetterProviderCall.mockReset().mockResolvedValue({
      suggestion: null,
      degraded: true,
      promptVersion: "cover_letter@5",
      modelVersion: "fixture-cover-letter-1",
      providerName: "fixture",
      removedSentences: 0,
      droppedParagraphs: 0,
    });
  });

  it("sends the same trimmed note to the CV and the letter and stores the snapshot", async () => {
    const res = await POST(
      post({
        profileVersionId: "pv_1",
        targetJobId: "job_1",
        instructions: "  Lead with PostgreSQL; leave out the bakery.  ",
        outputLanguage: "en",
        includeCoverLetter: true,
        coverLetterTone: "confident",
        coverLetterLength: "detailed",
        coverLetterOutputLanguage: "nl",
      }),
    );
    expect(res.status).toBe(200);
    const note = "Lead with PostgreSQL; leave out the bakery.";
    expect(runTailorProviderCall.mock.calls[0]![4]).toBe(note);
    const letterArgs = runCoverLetterProviderCall.mock.calls[0]!;
    expect(letterArgs.slice(4, 6)).toEqual(["confident", "detailed"]);
    expect(letterArgs[8]).toBe("nl");
    expect(letterArgs[9]).toBe(note);

    const data = previewCreate.mock.calls[0]![0].data;
    expect(data.contextVersion).toBe("tailoring_context@1");
    expect(data.context).toMatchObject({
      workspaceId: "ws_1",
      profileVersionId: "pv_1",
      targetJobId: "job_1",
      jobTextFingerprint: fingerprintJobText(jobText),
      jobTextUsed: jobText,
      instructions: note,
      cv: { outputLanguage: "en" },
      coverLetter: { outputLanguage: "nl", tone: "confident", length: "detailed" },
    });
    expect(data.contextFingerprint).toBe(tailoringContextFingerprint(data.context));
    // The existing provenance columns are still written the same way.
    expect(data.outputLanguage).toBe("en");
    expect(data.coverLetterOutputLanguage).toBe("nl");
    expect((await res.json()).instructions).toBe(note);
  });

  it("gives both calls the same confirmed evidence and records its revisions in the context (#929)", async () => {
    const row = (id: string, scope: "APPLICATION" | "BACKGROUND", kind: string, status: string, extra: Record<string, unknown> = {}) => ({
      id,
      workspaceId: "ws_1",
      scope,
      targetJobId: scope === "APPLICATION" ? "job_1" : null,
      createdAt: new Date("2026-11-01T00:00:00Z"),
      updatedAt: new Date("2026-11-01T00:00:00Z"),
      revisions: [{ id: `${id}_r1`, revisionNumber: 1, kind, title: `${id} title`, detail: `${id} detail`, experienceRef: null, status, ...extra }],
    });
    evidenceFindMany.mockResolvedValue([
      row("bg", "BACKGROUND", "ACHIEVEMENT", "CONFIRMED"),
      row("app", "APPLICATION", "PROJECT", "CONFIRMED", { experienceRef: { title: "Backend developer", employer: "Acme", startedOn: null } }),
      row("draft", "BACKGROUND", "PROJECT", "DRAFT"),
      row("why", "APPLICATION", "MOTIVATION", "CONFIRMED"),
      row("gone", "BACKGROUND", "PROJECT", "CONFIRMED", { experienceRef: { title: "Chef", employer: "Bakery", startedOn: null } }),
    ]);
    const res = await POST(post({ profileVersionId: "pv_1", targetJobId: "job_1", includeCoverLetter: true }));
    expect(res.status).toBe(200);
    // The query itself is workspace-scoped and limited to this job or background.
    expect(evidenceFindMany.mock.calls[0]![0].where).toEqual({
      workspaceId: "ws_1",
      OR: [{ scope: "BACKGROUND" }, { scope: "APPLICATION", targetJobId: "job_1" }],
    });
    const cvEvidence = runTailorProviderCall.mock.calls[0]![9] as string;
    const letterEvidence = runCoverLetterProviderCall.mock.calls[0]![10] as { evidence: string; motivation: string };
    expect(letterEvidence.evidence).toBe(cvEvidence);
    // This job's item first, then background; no draft, no role the profile lacks.
    expect(cvEvidence.split("\n")).toEqual([
      "- Project: app title. app detail [role: Backend developer at Acme]",
      "- Achievement: bg title. bg detail [no single role]",
    ]);
    // Motivation goes to the letter only.
    expect(cvEvidence).not.toContain("why");
    expect(letterEvidence.motivation).toBe("- Motivation: why title. why detail");
    const data = previewCreate.mock.calls[0]![0].data;
    expect(data.context.evidenceRevisionIds).toEqual(["app_r1", "bg_r1", "why_r1"]);
    expect((await res.json()).evidenceUsed).toBe(3);
  });

  it("without a letter: no letter call, no letter block, the letter defaults untouched", async () => {
    const res = await POST(post({ profileVersionId: "pv_1", targetJobId: "job_1" }));
    expect(res.status).toBe(200);
    expect(runCoverLetterProviderCall).not.toHaveBeenCalled();
    expect(runTailorProviderCall.mock.calls[0]![4]).toBeNull();
    const data = previewCreate.mock.calls[0]![0].data;
    expect(data.context.coverLetter).toBeNull();
    expect(data.context.instructions).toBeNull();
    expect(data.coverLetterOutputLanguage).toBeNull();
  });

  it("a letter without its own language follows the CV's", async () => {
    await POST(post({ profileVersionId: "pv_1", targetJobId: "job_1", outputLanguage: "fr", includeCoverLetter: true }));
    expect(runCoverLetterProviderCall.mock.calls[0]!.slice(4, 6)).toEqual(["formal", "standard"]);
    expect(runCoverLetterProviderCall.mock.calls[0]![8]).toBe("fr");
  });

  it("only looks the job up in the caller's workspace", async () => {
    findFirst.mockResolvedValue(null);
    const res = await POST(post({ profileVersionId: "pv_1", targetJobId: "job_other" }));
    expect(res.status).toBe(400);
    expect(findFirst.mock.calls[0]![0].where).toEqual({ id: "job_other", workspaceId: "ws_1" });
    expect(runTailorProviderCall).not.toHaveBeenCalled();
  });
});
