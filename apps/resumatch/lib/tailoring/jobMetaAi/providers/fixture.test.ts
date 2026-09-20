import { describe, expect, it } from "vitest";
import { JobMetaFixtureProvider } from "./fixture";

const provider = new JobMetaFixtureProvider();

describe("JobMetaFixtureProvider", () => {
  it("always returns null/null, at zero cost", async () => {
    const output = await provider.infer({
      jobText: "Backend Engineer at Acme Corp.",
      system: "system",
      user: "user",
      promptVersion: "job_meta@1",
      model: "fixture-job-meta-1",
    });
    expect(output.title).toBeNull();
    expect(output.employer).toBeNull();
    expect(output.costUsd).toBe(0);
  });
});
