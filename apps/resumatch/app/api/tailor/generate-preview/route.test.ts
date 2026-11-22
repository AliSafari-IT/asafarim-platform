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
  getJobmatchDb: () => ({ targetJob: { findFirst }, tailorPreview: { create: previewCreate } }),
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
