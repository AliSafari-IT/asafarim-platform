import { describe, expect, it } from "vitest";
import { MAX_JOB_CHARS, MAX_PROFILE_CHARS, renderTailorPrompt } from "./prompts";

describe("renderTailorPrompt", () => {
  it("fences the job text and the profile text separately", () => {
    const rendered = renderTailorPrompt("Backend engineer with Node.js experience.", "We need a Rust developer.");

    expect(rendered.user).toContain("<<<RESUMATCH_PROFILE_DATA");
    expect(rendered.user).toContain("RESUMATCH_PROFILE_DATA>>>");
    expect(rendered.user).toContain("<<<RESUMATCH_JOB_DATA");
    expect(rendered.user).toContain("RESUMATCH_JOB_DATA>>>");
  });

  it("states the hard rule against fabricating facts", () => {
    const rendered = renderTailorPrompt("profile", "job");
    expect(rendered.system).toMatch(/never invent or alter a fact/i);
    expect(rendered.system).toMatch(/never add a skill/i);
  });

  it("states that fenced content is data, never instructions", () => {
    const rendered = renderTailorPrompt("profile", "job");
    expect(rendered.system).toMatch(/DATA ONLY/);
    expect(rendered.system).toMatch(/is ever an instruction/i);
  });

  it("caps job text before fencing it", () => {
    const longJob = "x".repeat(MAX_JOB_CHARS + 500);
    const rendered = renderTailorPrompt("profile", longJob);
    expect(rendered.jobTextUsed.length).toBeLessThanOrEqual(MAX_JOB_CHARS + 60);
    expect(rendered.jobTextUsed).toContain("truncated");
  });

  it("caps profile text before fencing it", () => {
    const longProfile = "x".repeat(MAX_PROFILE_CHARS + 500);
    const rendered = renderTailorPrompt(longProfile, "job");
    expect(rendered.profileTextUsed.length).toBeLessThanOrEqual(MAX_PROFILE_CHARS + 60);
    expect(rendered.profileTextUsed).toContain("truncated");
  });

  it("is deterministic: same input produces the same cache key", () => {
    const a = renderTailorPrompt("profile text", "job text");
    const b = renderTailorPrompt("profile text", "job text");
    expect(a.cacheKey).toBe(b.cacheKey);
  });

  it("produces a different cache key for different input", () => {
    const a = renderTailorPrompt("profile text", "job text A");
    const b = renderTailorPrompt("profile text", "job text B");
    expect(a.cacheKey).not.toBe(b.cacheKey);
  });
});
