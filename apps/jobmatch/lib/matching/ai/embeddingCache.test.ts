import { describe, expect, it } from "vitest";
import { emptyProfile, type CandidateProfileContent } from "../../profile/contract";
import { buildEmbeddingInput } from "../embeddingInput";
import { embeddingTextForPosting, embeddingTextForProfile } from "./embeddingCache";

function profile(overrides: Partial<CandidateProfileContent> = {}): CandidateProfileContent {
  return { ...emptyProfile(), ...overrides };
}

/**
 * JM-041 acceptance: "No code path passes anything but buildEmbeddingInput
 * output to an embed call." `embeddingTextForProfile` is the one function
 * every profile embed request in embeddingCache.ts funnels its text
 * through (see ensureProfileEmbedding), so proving it is byte-for-byte
 * buildEmbeddingInput's own output — never raw profile content, and never
 * anything re-derived from the profile a different way — is what makes that
 * a proof about the whole compute service rather than about one call site.
 */
describe("embeddingTextForProfile — the only text a profile embed call may receive", () => {
  it("is exactly buildEmbeddingInput(profile).text, nothing more and nothing less", () => {
    const content = profile({
      headline: "Senior Backend Engineer",
      summary: "Builds payment platforms.",
      skills: [{ name: "TypeScript", rawLabel: null, yearsExperience: 5 }],
    });
    expect(embeddingTextForProfile(content)).toBe(buildEmbeddingInput(content).text);
  });

  it("never contains the candidate's name, email, phone, or base location", () => {
    const content = profile({
      fullName: "Jordan Example",
      email: "jordan@example.test",
      phone: "+32 470 00 00 00",
      baseLocation: "Hasselt, Belgium",
      headline: "Backend engineer",
    });
    const text = embeddingTextForProfile(content);
    expect(text).not.toContain("Jordan Example");
    expect(text).not.toContain("jordan@example.test");
    expect(text).not.toContain("+32 470 00 00 00");
    expect(text).not.toContain("Hasselt, Belgium");
  });

  it("is not a JSON serialization of the profile — no raw field dump", () => {
    const content = profile({ headline: "Backend Engineer" });
    const text = embeddingTextForProfile(content);
    expect(text).not.toContain("{");
    expect(text).not.toContain('"headline"');
  });

  it("is empty for a blank profile, matching buildEmbeddingInput", () => {
    expect(embeddingTextForProfile(emptyProfile())).toBe("");
  });
});

describe("embeddingTextForPosting", () => {
  it("collapses whitespace and trims", () => {
    expect(embeddingTextForPosting("  Senior   Engineer\n\nneeded.  ")).toBe(
      "Senior Engineer needed.",
    );
  });

  it("is idempotent", () => {
    const once = embeddingTextForPosting("a  b   c");
    expect(embeddingTextForPosting(once)).toBe(once);
  });
});
