import { describe, expect, it } from "vitest";
import { MAX_JOB_TEXT_CHARS, renderJobMetaPrompt } from "./prompts";

describe("renderJobMetaPrompt", () => {
  it("fences the job text as data", () => {
    const rendered = renderJobMetaPrompt("Backend Engineer at Acme Corp. We are looking for...");
    expect(rendered.user).toContain("<<<RESUMATCH_JOB_TEXT");
    expect(rendered.user).toContain("RESUMATCH_JOB_TEXT>>>");
    expect(rendered.user).toContain("Backend Engineer at Acme Corp");
  });

  it("states the fenced content is data, never instructions", () => {
    const rendered = renderJobMetaPrompt("job text");
    expect(rendered.system).toMatch(/DATA ONLY/);
    expect(rendered.system).toMatch(/never an\s+instruction/i);
  });

  it("forbids inventing a title or employer", () => {
    const rendered = renderJobMetaPrompt("job text");
    expect(rendered.system).toMatch(/never invent, guess, or\s+infer/i);
  });

  it("states a job board's own name is never the employer", () => {
    const rendered = renderJobMetaPrompt("job text");
    expect(rendered.system).toMatch(/never the employer/i);
  });

  it("caps job text before fencing it", () => {
    const long = "x".repeat(MAX_JOB_TEXT_CHARS + 500);
    const rendered = renderJobMetaPrompt(long);
    expect(rendered.jobTextUsed.length).toBe(MAX_JOB_TEXT_CHARS);
  });

  it("is deterministic: same input produces the same cache key", () => {
    const a = renderJobMetaPrompt("job text");
    const b = renderJobMetaPrompt("job text");
    expect(a.cacheKey).toBe(b.cacheKey);
  });

  it("produces a different cache key for different input", () => {
    const a = renderJobMetaPrompt("job text A");
    const b = renderJobMetaPrompt("job text B");
    expect(a.cacheKey).not.toBe(b.cacheKey);
  });
});
