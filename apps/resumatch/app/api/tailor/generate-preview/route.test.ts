import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseProfileContent } from "../../../../lib/profile/contract";

/**
 * The low-fit guard: no AI is spent on a job the fit check rates low until
 * the candidate explicitly confirms it, and a confirmed run asks for the
 * LOW-FIT prompt rule. Database-free: workspace, profile version, Prisma
 * and the provider call are stubs.
 */

const runTailorProviderCall = vi.fn();
const findFirst = vi.fn();
const previewCreate = vi.fn();

const profile = parseProfileContent({
  headline: "Full-stack developer · React · TypeScript",
  summary: "Builds web applications with React, TypeScript and Node.js; writes Playwright tests.",
  skills: [{ name: "React" }, { name: "TypeScript" }, { name: "Node.js" }, { name: "Playwright" }],
  experience: [{ title: "Full-stack developer", employer: "Probex", summary: "Develops React and Node.js features." }],
});

const truckJob = `Truck driver C/E – international transport
We are hiring a truck driver with a valid C/E driving licence and code 95.
You drive international routes across Benelux, France and Germany, load and unload freight,
secure cargo, keep the tachograph up to date and inspect the truck before every trip.
Requirements: driving licence C/E, code 95, ADR certificate, experience with trailers and freight.`;

const reactJob = `Frontend developer (React / TypeScript). You build React applications in TypeScript,
use Node.js tooling and write Playwright tests. You develop features for our web applications,
review code and improve test coverage. Requirements: React, TypeScript, Node.js, Playwright, REST APIs.`;

vi.mock("../../../../lib/workspace", () => ({
  getCurrentWorkspace: async () => ({ id: "ws_1" }),
}));
vi.mock("../../../../lib/profile/versions", () => ({
  getVersion: async () => ({ content: profile }),
}));
vi.mock("../../../../lib/db/client", () => ({
  getJobmatchDb: () => ({ targetJob: { findFirst }, tailorPreview: { create: previewCreate }, candidateEvidence: { findMany: async () => [] }, writingPreferenceRevision: { findFirst: async () => null } }),
}));
vi.mock("../../../../lib/tailoring/ai/generate", () => ({
  runTailorProviderCall: (...args: unknown[]) => runTailorProviderCall(...args),
}));
vi.mock("../../../../lib/tailoring/ai/coverLetter/generate", () => ({
  runCoverLetterProviderCall: vi.fn(),
}));

const generatePreview = (await import("./route")).POST;
const jobFit = (await import("../job-fit/route")).POST;

const post = (body: unknown) =>
  new Request("http://localhost/api/tailor/generate-preview", { method: "POST", body: JSON.stringify(body) });

describe("generate-preview low-fit guard", () => {
  beforeEach(() => {
    runTailorProviderCall.mockReset().mockResolvedValue({
      suggestions: null,
      degraded: true,
      promptVersion: "tailor_resume@6",
      modelVersion: "fixture-tailor-1",
      providerName: "fixture",
    });
    previewCreate.mockReset().mockImplementation(async ({ data }: { data: { id: string } }) => ({ id: data.id }));
    findFirst.mockReset();
  });

  it("refuses a low-fit job with 409 and the fit, without calling the provider", async () => {
    findFirst.mockResolvedValue({ rawText: truckJob, status: "FETCHED" });
    const res = await generatePreview(post({ profileVersionId: "v1", targetJobId: "j1" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("LOW_FIT_UNCONFIRMED");
    expect(body.fit.level).toBe("low");
    expect(runTailorProviderCall).not.toHaveBeenCalled();
    expect(previewCreate).not.toHaveBeenCalled();
  });

  it("only a literal true confirms", async () => {
    findFirst.mockResolvedValue({ rawText: truckJob, status: "FETCHED" });
    const res = await generatePreview(post({ profileVersionId: "v1", targetJobId: "j1", proceedDespiteLowFit: "yes" }));
    expect(res.status).toBe(409);
    expect(runTailorProviderCall).not.toHaveBeenCalled();
  });

  it("runs a confirmed low-fit job with the LOW-FIT rule, also on the degraded path", async () => {
    findFirst.mockResolvedValue({ rawText: truckJob, status: "FETCHED" });
    const res = await generatePreview(post({ profileVersionId: "v1", targetJobId: "j1", proceedDespiteLowFit: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lowFit).toBe(true);
    expect(body.degraded).toBe(true);
    expect(runTailorProviderCall).toHaveBeenCalledTimes(1);
    expect(runTailorProviderCall.mock.calls[0]?.[8]).toBe(true);
  });

  it("runs a matching job without asking and without the LOW-FIT rule", async () => {
    findFirst.mockResolvedValue({ rawText: reactJob, status: "FETCHED" });
    const res = await generatePreview(post({ profileVersionId: "v1", targetJobId: "j1" }));
    expect(res.status).toBe(200);
    expect((await res.json()).lowFit).toBe(false);
    expect(runTailorProviderCall.mock.calls[0]?.[8]).toBe(false);
  });
});

describe("job-fit route", () => {
  it("returns the fit for a fetched job", async () => {
    findFirst.mockResolvedValue({ rawText: truckJob, status: "FETCHED" });
    const res = await jobFit(
      new Request("http://localhost/api/tailor/job-fit", {
        method: "POST",
        body: JSON.stringify({ profileVersionId: "v1", targetJobId: "j1" }),
      }),
    );
    expect(res.status).toBe(200);
    const { fit } = await res.json();
    expect(fit.level).toBe("low");
    expect(fit.missingTerms).toContain("truck");
  });

  it("rejects a job with no fetched text", async () => {
    findFirst.mockResolvedValue({ rawText: null, status: "FETCH_FAILED" });
    const res = await jobFit(
      new Request("http://localhost/api/tailor/job-fit", {
        method: "POST",
        body: JSON.stringify({ profileVersionId: "v1", targetJobId: "j1" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("requirement selection and claim checks (#930)", () => {
  const job = ["Frontend developer", "Requirements:", "- Experience with React and TypeScript", "- Experience with Kubernetes", "- Fluent in Dutch"].join("\n");
  const fitRequest = (body: unknown) => new Request("http://localhost/api/tailor/job-fit", { method: "POST", body: JSON.stringify(body) });

  beforeEach(() => {
    runTailorProviderCall.mockReset();
    previewCreate.mockReset().mockImplementation(async ({ data }: { data: { id: string } }) => ({ id: data.id }));
    findFirst.mockReset().mockResolvedValue({ rawText: job, status: "FETCHED" });
  });

  it("job-fit lists requirements and at most three questions, only for unknown ones", async () => {
    const res = await jobFit(fitRequest({ profileVersionId: "v1", targetJobId: "j1" }));
    const body = await res.json();
    expect(body.requirements.map((r: { status: string }) => r.status)).toEqual(["supported", "unknown", "unknown"]);
    expect(body.questions.map((q: { text: string }) => q.text)).toEqual(["Experience with Kubernetes", "Fluent in Dutch"]);
    const k8s = body.requirements[1].id;
    const answered = await (await jobFit(fitRequest({ profileVersionId: "v1", targetJobId: "j1", unmetRequirementIds: [k8s] }))).json();
    expect(answered.requirements[1]).toMatchObject({ status: "unmet", unmetBy: "candidate" });
    expect(answered.questions).toHaveLength(1);
  });

  it("refuses malformed answers", async () => {
    expect((await jobFit(fitRequest({ profileVersionId: "v1", targetJobId: "j1", unmetRequirementIds: "all" }))).status).toBe(400);
    expect((await generatePreview(post({ profileVersionId: "v1", targetJobId: "j1", unmetRequirementIds: [1] }))).status).toBe(400);
  });

  it("sends the tagged selection and the gaps to the CV call, stores the answers, and flags unsupported claims", async () => {
    const fit = await (await jobFit(fitRequest({ profileVersionId: "v1", targetJobId: "j1" }))).json();
    const k8s = fit.requirements[1].id;
    runTailorProviderCall.mockResolvedValue({
      suggestions: {
        headline: "Frontend developer · React",
        summary: null,
        skillsOrder: [],
        experienceBullets: [["Develops React and Node.js features", "Runs Kubernetes clusters"]],
        sources: { headline: ["skills"], summary: [], experienceBullets: [[["exp:0"], ["exp:0"]]] },
      },
      degraded: false,
      promptVersion: "tailor_resume@8",
      modelVersion: "fixture-tailor-1",
      providerName: "fixture",
    });
    // Skipped questions are simply not sent; an unknown id is dropped.
    const res = await generatePreview(post({ profileVersionId: "v1", targetJobId: "j1", unmetRequirementIds: [k8s, "req_not_this_job"] }));
    expect(res.status).toBe(200);
    const body = await res.json();

    const selection = runTailorProviderCall.mock.calls[0]?.[10] as { profileText: string; gapsText: string | null };
    expect(selection.profileText).toContain("[exp:0] Full-stack developer at Probex: Develops React and Node.js features.");
    expect(selection.gapsText).toBe("- Experience with Kubernetes");

    const context = previewCreate.mock.calls[0]?.[0].data.context;
    expect(context.selection).toMatchObject({ version: "evidence_selection@1", unmetRequirementIds: [k8s] });

    const bullets = body.claimCheck.claims.filter((c: { field: string }) => c.field === "bullet");
    expect(bullets[0].flags).toEqual([]);
    expect(bullets[1].flags).toContain("unmet_requirement");
    expect(body.claimCheck.flagged).toBe(1);
    expect(body.sources.find((s: { id: string }) => s.id === "exp:0").label).toBe("Full-stack developer · Probex");
  });

  it("a degraded run has no claims to check and still answers", async () => {
    runTailorProviderCall.mockResolvedValue({ suggestions: null, degraded: true, promptVersion: "tailor_resume@8", modelVersion: "x", providerName: "fixture" });
    const body = await (await generatePreview(post({ profileVersionId: "v1", targetJobId: "j1" }))).json();
    expect(body.claimCheck).toBeNull();
    expect(body.requirements).toHaveLength(3);
  });
});
