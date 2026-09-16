import { describe, expect, it } from "vitest";
import { EVALUATE_PROMPT_VERSION, MAX_POSTING_CHARS, renderEvaluatePrompt } from "./prompts";

describe("renderEvaluatePrompt", () => {
  it("carries the versioned match_evaluate@1 prompt id", () => {
    const prompt = renderEvaluatePrompt("profile text", "posting text");
    expect(prompt.version).toBe("match_evaluate@1");
    expect(prompt.version).toBe(EVALUATE_PROMPT_VERSION);
  });

  it("fences the posting text between sentinel markers", () => {
    const prompt = renderEvaluatePrompt("profile text", "posting text with SENTINEL_CANARY");
    expect(prompt.user).toContain("<<<JOBMATCH_POSTING_DATA");
    expect(prompt.user).toContain("JOBMATCH_POSTING_DATA>>>");
    expect(prompt.user).toContain("posting text with SENTINEL_CANARY");
  });

  it("states in the system prompt that fenced content is data, not instructions, and output is JSON-only", () => {
    const prompt = renderEvaluatePrompt("profile text", "posting text");
    expect(prompt.system).toMatch(/DATA ONLY/i);
    expect(prompt.system).toMatch(/no tools/i);
    expect(prompt.system).toMatch(/MatchResult/);
  });

  it("caps posting text at MAX_POSTING_CHARS", () => {
    const longPosting = "x".repeat(MAX_POSTING_CHARS + 5000);
    const prompt = renderEvaluatePrompt("profile text", longPosting);
    expect(prompt.postingTextUsed.length).toBeLessThanOrEqual(MAX_POSTING_CHARS + 100);
    expect(prompt.postingTextUsed).toContain("truncated");
  });

  it("never includes an uncapped posting body in the rendered user prompt", () => {
    const longPosting = "y".repeat(MAX_POSTING_CHARS + 5000);
    const prompt = renderEvaluatePrompt("profile text", longPosting);
    expect(prompt.user.length).toBeLessThan(longPosting.length);
  });

  it("is a pure function — identical inputs produce identical cacheKey", () => {
    const a = renderEvaluatePrompt("profile A", "posting B");
    const b = renderEvaluatePrompt("profile A", "posting B");
    expect(a.cacheKey).toBe(b.cacheKey);
  });
});
