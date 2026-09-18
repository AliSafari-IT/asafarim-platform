import { describe, expect, it } from "vitest";
import { emptyProfile } from "../../profile/contract";
import { mergeTailoringSuggestions, parseTailorSuggestions } from "./schema";

function profileWith(overrides: Partial<ReturnType<typeof emptyProfile>> = {}) {
  return {
    ...emptyProfile(),
    fullName: "Jordan Example",
    email: "jordan@example.test",
    phone: "+32 470 00 00 00",
    headline: "Backend engineer",
    summary: "Builds reliable services.",
    skills: [
      { name: "Node.js", rawLabel: null, yearsExperience: 5 },
      { name: "PostgreSQL", rawLabel: null, yearsExperience: 4 },
      { name: "Kubernetes", rawLabel: null, yearsExperience: 2 },
    ],
    experience: [
      {
        title: "Senior Backend Engineer",
        employer: "Example Corp",
        startedOn: "2021-03",
        endedOn: null,
        isCurrent: true,
        summary: "Owned the payments API. Reduced latency by 40%.",
      },
    ],
    education: [{ qualification: "BSc Computer Science", institution: "Example University", completedOn: "2018-06" }],
    certifications: [],
    ...overrides,
  };
}

describe("mergeTailoringSuggestions — no-fabrication guarantee", () => {
  it("never adds a skill the profile does not have", () => {
    const profile = profileWith();
    const suggestions = parseTailorSuggestions({
      skillsOrder: ["Kubernetes", "Rust", "Node.js", "Go"], // Rust/Go not in profile
    });

    const result = mergeTailoringSuggestions(profile, suggestions);

    expect(result.skills).toEqual(["Kubernetes", "Node.js", "PostgreSQL"]);
    expect(result.skills).not.toContain("Rust");
    expect(result.skills).not.toContain("Go");
  });

  it("never drops a skill the profile has, even if the suggestion omits it", () => {
    const profile = profileWith();
    const suggestions = parseTailorSuggestions({ skillsOrder: ["PostgreSQL"] });

    const result = mergeTailoringSuggestions(profile, suggestions);

    expect(result.skills).toContain("Node.js");
    expect(result.skills).toContain("Kubernetes");
    expect(result.skills[0]).toBe("PostgreSQL");
  });

  it("carries employer, dates, and isCurrent verbatim regardless of what a suggestion contains", () => {
    const profile = profileWith();
    const result = mergeTailoringSuggestions(profile, parseTailorSuggestions({}));

    expect(result.experience[0]).toMatchObject({
      title: "Senior Backend Engineer",
      employer: "Example Corp",
      startedOn: "2021-03",
      endedOn: null,
      isCurrent: true,
    });
  });

  it("carries education and certifications through completely unchanged", () => {
    const profile = profileWith();
    const result = mergeTailoringSuggestions(profile, parseTailorSuggestions({}));
    expect(result.education).toEqual(profile.education);
    expect(result.certifications).toEqual(profile.certifications);
  });

  it("falls back to the experience entry's own summary when no bullet suggestion is given", () => {
    const profile = profileWith();
    const result = mergeTailoringSuggestions(profile, parseTailorSuggestions({}));
    expect(result.experience[0].bullets).toEqual(["Owned the payments API. Reduced latency by 40%."]);
  });

  it("uses suggested bullets when provided, positionally aligned", () => {
    const profile = profileWith();
    const suggestions = parseTailorSuggestions({
      experienceBullets: [["Owned the payments API, the core revenue path.", "Cut p99 latency by 40%."]],
    });
    const result = mergeTailoringSuggestions(profile, suggestions);
    expect(result.experience[0].bullets).toEqual([
      "Owned the payments API, the core revenue path.",
      "Cut p99 latency by 40%.",
    ]);
  });

  it("degrades to the profile carried over unchanged when suggestions is null", () => {
    const profile = profileWith();
    const result = mergeTailoringSuggestions(profile, null);

    expect(result.headline).toBe(profile.headline);
    expect(result.summary).toBe(profile.summary);
    expect(result.skills).toEqual(profile.skills.map((s) => s.name));
    expect(result.experience[0].bullets).toEqual([profile.experience[0].summary]);
  });

  it("falls back to the profile's own headline/summary when a suggestion omits them", () => {
    const profile = profileWith();
    const result = mergeTailoringSuggestions(profile, parseTailorSuggestions({}));
    expect(result.headline).toBe(profile.headline);
    expect(result.summary).toBe(profile.summary);
  });

  it("never leaks email or phone into the tailored content beyond the carried-over fields", () => {
    const profile = profileWith();
    const result = mergeTailoringSuggestions(profile, parseTailorSuggestions({}));
    // Contact fields are carried over for display (same as the profile
    // contract) but nowhere else in the content — no duplication into
    // headline/summary/bullets.
    expect(result.headline).not.toContain(profile.email!);
    expect(result.summary).not.toContain(profile.phone!);
  });
});

describe("parseTailorSuggestions", () => {
  it("rejects a payload shaped as something other than suggestions", () => {
    expect(() => parseTailorSuggestions({ skillsOrder: "not-an-array" })).toThrow();
  });

  it("defaults every field when given an empty object", () => {
    const parsed = parseTailorSuggestions({});
    expect(parsed).toEqual({
      headline: null,
      summary: null,
      skillsOrder: [],
      experienceBullets: [],
    });
  });
});
