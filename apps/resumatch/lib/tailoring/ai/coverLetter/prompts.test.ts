import { describe, expect, it } from "vitest";
import { COVER_LETTER_LENGTHS, COVER_LETTER_TONES, renderCoverLetterPrompt } from "./prompts";

describe("renderCoverLetterPrompt", () => {
  it("fences the job text and the profile text separately", () => {
    const rendered = renderCoverLetterPrompt("Backend engineer.", "We need a Rust developer.");
    expect(rendered.user).toContain("<<<RESUMATCH_PROFILE_DATA");
    expect(rendered.user).toContain("<<<RESUMATCH_JOB_DATA");
  });

  it("defaults to formal tone and standard length when omitted", () => {
    const rendered = renderCoverLetterPrompt("profile", "job");
    expect(rendered.system).toMatch(/formal, professional register/i);
    expect(rendered.system).toMatch(/3 to 5 paragraphs/i);
  });

  it("reflects a warm tone in the system prompt", () => {
    const rendered = renderCoverLetterPrompt("profile", "job", "warm", "standard");
    expect(rendered.system).toMatch(/warm, personable register/i);
  });

  it("reflects a confident tone in the system prompt", () => {
    const rendered = renderCoverLetterPrompt("profile", "job", "confident", "standard");
    expect(rendered.system).toMatch(/confident, assertive register/i);
  });

  it("reflects a short length in the system prompt", () => {
    const rendered = renderCoverLetterPrompt("profile", "job", "formal", "short");
    expect(rendered.system).toMatch(/2 to 3 concise paragraphs/i);
  });

  it("reflects a detailed length in the system prompt", () => {
    const rendered = renderCoverLetterPrompt("profile", "job", "formal", "detailed");
    expect(rendered.system).toMatch(/4 to 6 thorough paragraphs/i);
  });

  it("still states the no-fabrication hard rules regardless of tone/length", () => {
    for (const tone of COVER_LETTER_TONES) {
      for (const length of COVER_LETTER_LENGTHS) {
        const rendered = renderCoverLetterPrompt("profile", "job", tone, length);
        expect(rendered.system).toMatch(/never invent or alter a fact/i);
        expect(rendered.system).toMatch(/DATA ONLY/);
      }
    }
  });

  it("produces a different cache key for different tone/length combinations", () => {
    const a = renderCoverLetterPrompt("profile", "job", "formal", "standard");
    const b = renderCoverLetterPrompt("profile", "job", "warm", "detailed");
    expect(a.cacheKey).not.toBe(b.cacheKey);
  });

  it("is deterministic: same tone/length produces the same cache key", () => {
    const a = renderCoverLetterPrompt("profile", "job", "confident", "short");
    const b = renderCoverLetterPrompt("profile", "job", "confident", "short");
    expect(a.cacheKey).toBe(b.cacheKey);
  });
});
