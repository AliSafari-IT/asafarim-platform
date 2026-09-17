import { describe, expect, it } from "vitest";
import { explainProfileField } from "./explainProfileField";
import { emptyProfile } from "../profile/contract";

function profileWith(overrides: Partial<ReturnType<typeof emptyProfile>>) {
  return { ...emptyProfile(), ...overrides };
}

describe("explainProfileField", () => {
  it("resolves a skill index into a readable fact with years", () => {
    const profile = profileWith({
      skills: [{ name: "TypeScript", rawLabel: null, yearsExperience: 5 }],
    });
    expect(explainProfileField("skills[0]", profile)).toBe("Skills: TypeScript (5 years)");
  });

  it("resolves a skill without a known years figure", () => {
    const profile = profileWith({
      skills: [{ name: "Go", rawLabel: null, yearsExperience: null }],
    });
    expect(explainProfileField("skills[0].name", profile)).toBe("Skills: Go");
  });

  it("resolves an experience title with employer", () => {
    const profile = profileWith({
      experience: [
        { title: "Senior Engineer", employer: "Acme", startedOn: null, endedOn: null, isCurrent: true, summary: null },
      ],
    });
    expect(explainProfileField("experience[0].title", profile)).toBe("Experience: Senior Engineer at Acme");
  });

  it("resolves an education entry", () => {
    const profile = profileWith({
      education: [{ qualification: "BSc Computer Science", institution: "TU Delft", completedOn: null }],
    });
    expect(explainProfileField("education[0]", profile)).toBe("Education: BSc Computer Science — TU Delft");
  });

  it("resolves a certification entry", () => {
    const profile = profileWith({
      certifications: [{ name: "AWS SAA", issuer: "Amazon", issuedOn: null, expiresOn: null }],
    });
    expect(explainProfileField("certifications[0]", profile)).toBe("Certification: AWS SAA (Amazon)");
  });

  it("resolves a language entry with proficiency", () => {
    const profile = profileWith({
      languages: [{ code: "nl", label: "Dutch", proficiency: "professional" }],
    });
    expect(explainProfileField("languages[0]", profile)).toBe("Language: Dutch — professional");
  });

  it("resolves top-level scalar fields", () => {
    const profile = profileWith({ headline: "Backend engineer" });
    expect(explainProfileField("headline", profile)).toBe("Headline: Backend engineer");
  });

  it("resolves preferences fields", () => {
    const profile = profileWith({
      preferences: {
        ...emptyProfile().preferences,
        remote: "hybrid",
      },
    });
    expect(explainProfileField("preferences.remote", profile)).toBe("Working arrangement preference: hybrid");
  });

  it("falls back to the raw reference for an out-of-range index", () => {
    const profile = emptyProfile();
    expect(explainProfileField("skills[3]", profile)).toBe("skills[3]");
  });

  it("falls back to the raw reference for an unrecognised path shape", () => {
    const profile = emptyProfile();
    expect(explainProfileField("embeddingInput.text[token:2]", profile)).toBe("embeddingInput.text[token:2]");
  });

  it("falls back to the raw reference for a field that resolves to nothing", () => {
    const profile = emptyProfile();
    expect(explainProfileField("headline", profile)).toBe("headline");
  });

  it("never throws on garbage input", () => {
    const profile = emptyProfile();
    expect(() => explainProfileField("", profile)).not.toThrow();
    expect(() => explainProfileField("skills[abc]", profile)).not.toThrow();
    expect(() => explainProfileField("../../etc/passwd", profile)).not.toThrow();
  });
});
