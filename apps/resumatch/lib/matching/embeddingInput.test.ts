import { describe, expect, it } from "vitest";
import { emptyProfile, type CandidateProfileContent } from "../profile/contract";
import { buildEmbeddingInput } from "./embeddingInput";

function profile(overrides: Partial<CandidateProfileContent> = {}): CandidateProfileContent {
  return { ...emptyProfile(), ...overrides };
}

describe("privacy-preserving embedding input", () => {
  it("never includes the candidate's name, email, phone, or base location", () => {
    const { text } = buildEmbeddingInput(
      profile({
        fullName: "Jordan Example",
        email: "jordan@example.test",
        phone: "+32 470 00 00 00",
        baseLocation: "Hasselt, Belgium",
        headline: "Backend engineer",
      }),
    );
    expect(text).not.toContain("Jordan Example");
    expect(text).not.toContain("jordan@example.test");
    expect(text).not.toContain("+32 470 00 00 00");
    expect(text).not.toContain("Hasselt, Belgium");
    expect(text).toContain("Backend engineer");
  });

  it("includes professional facts: headline, summary, languages, skills, experience", () => {
    const { text, includedFields } = buildEmbeddingInput(
      profile({
        headline: "Senior Backend Engineer",
        summary: "Builds payment platforms.",
        languages: [{ code: "en", label: "English", proficiency: "native" }],
        skills: [{ name: "TypeScript", rawLabel: null, yearsExperience: 5 }],
        experience: [
          {
            title: "Backend Engineer",
            employer: "Example NV",
            startedOn: "2021-03",
            endedOn: null,
            isCurrent: true,
            summary: "Owned the payments service.",
          },
        ],
      }),
    );
    expect(text).toContain("Senior Backend Engineer");
    expect(text).toContain("Builds payment platforms.");
    expect(text).toContain("English (native)");
    expect(text).toContain("TypeScript (5 years)");
    expect(text).toContain("Backend Engineer at Example NV");
    expect(includedFields).toContain("headline");
    expect(includedFields).toContain("skills[0]");
    expect(includedFields).toContain("experience[0]");
  });

  it("produces empty text and no included fields for a blank profile", () => {
    const { text, includedFields } = buildEmbeddingInput(emptyProfile());
    expect(text).toBe("");
    expect(includedFields).toEqual([]);
  });

  it("does not include workAuthorization text when unstated", () => {
    const { text } = buildEmbeddingInput(profile());
    expect(text).not.toContain("Work authorisation");
  });

  it("includes work authorisation when stated, since it is a professional fact", () => {
    const { text, includedFields } = buildEmbeddingInput(
      profile({ workAuthorization: "eea_unrestricted" }),
    );
    expect(text).toContain("eea_unrestricted");
    expect(includedFields).toContain("workAuthorization");
  });

  it("does not throw when a city legitimately recurs inside an employer or institution name", () => {
    // A real false-positive risk: the candidate's base location and part of
    // an employer/institution name can coincide without any leak at all.
    expect(() =>
      buildEmbeddingInput(
        profile({
          baseLocation: "Ghent",
          experience: [
            {
              title: "Researcher",
              employer: "Ghent University",
              startedOn: null,
              endedOn: null,
              isCurrent: false,
              summary: null,
            },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it("does not throw when a name legitimately recurs inside professional text", () => {
    expect(() =>
      buildEmbeddingInput(
        profile({
          fullName: "Jordan Example",
          headline: "Worked at Jordan Motors as a mechanic",
        }),
      ),
    ).not.toThrow();
  });

  it("throws when an email address leaks in, ignoring case", () => {
    expect(() =>
      buildEmbeddingInput(
        profile({ email: "jordan@example.test", headline: "Reach me at JORDAN@EXAMPLE.TEST" }),
      ),
    ).toThrow();
  });

  it("throws when a phone number leaks in with different punctuation", () => {
    expect(() =>
      buildEmbeddingInput(
        profile({ phone: "+32 470 00 00 00", headline: "Call +32-470-00-00-00 anytime" }),
      ),
    ).toThrow();
  });
});
