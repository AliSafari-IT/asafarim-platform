import { describe, expect, it, vi } from "vitest";
import { JobFetchFixtureProvider } from "./fixture";

vi.mock("../../fetchJob", () => ({
  fetchJobPosting: vi.fn(),
}));

const { fetchJobPosting } = await import("../../fetchJob");

const provider = new JobFetchFixtureProvider();

describe("JobFetchFixtureProvider", () => {
  it("delegates to the existing raw fetch and costs nothing", async () => {
    vi.mocked(fetchJobPosting).mockResolvedValue({
      ok: true,
      rawText: "Some job description text.",
      title: "Backend Engineer",
      employer: "Acme Corp",
    });

    const output = await provider.fetch({
      url: "https://example.test/jobs/1",
      system: "system",
      user: "user",
      promptVersion: "fetch_job@1",
      model: "fixture-fetch-job-1",
    });

    expect(output.title).toBe("Backend Engineer");
    expect(output.employer).toBe("Acme Corp");
    expect(output.rawText).toBe("Some job description text.");
    expect(output.costUsd).toBe(0);
  });

  it("throws a non-retryable error when the raw fetch itself fails", async () => {
    vi.mocked(fetchJobPosting).mockResolvedValue({ ok: false, reasonCode: "NO_READABLE_TEXT" });

    await expect(
      provider.fetch({
        url: "https://example.test/jobs/1",
        system: "system",
        user: "user",
        promptVersion: "fetch_job@1",
        model: "fixture-fetch-job-1",
      }),
    ).rejects.toMatchObject({ retryable: false });
  });
});
