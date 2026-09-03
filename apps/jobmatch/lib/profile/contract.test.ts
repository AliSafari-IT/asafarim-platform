import { describe, expect, it } from "vitest";
import {
  ProtectedAttributeError,
  assertNoProtectedAttributes,
  emptyProfile,
  parseProfileContent,
} from "./contract";

describe("candidate profile contract", () => {
  it("accepts an empty profile — absence is valid, not an error", () => {
    const profile = emptyProfile();
    expect(profile.skills).toEqual([]);
    expect(profile.baseLocation).toBeNull();
    expect(profile.preferences.remote).toBeNull();
  });

  it("distinguishes 'the CV did not say' from 'the candidate does not have it'", () => {
    // Both are representable; neither is an empty string. M4's eligibility
    // rules depend on being able to tell them apart.
    const profile = parseProfileContent({
      workAuthorization: null,
      languages: [{ code: "nl", label: "Nederlands", proficiency: null }],
    });
    expect(profile.workAuthorization).toBeNull();
    expect(profile.languages[0].proficiency).toBeNull();
  });

  it("rejects protected attributes by name, even plausibly-labelled ones", () => {
    for (const hostile of [
      { dateOfBirth: "1980-04-02" },
      { date_of_birth: "1980-04-02" },
      { age: 46 },
      { gender: "m" },
      { nationality: "Belgian" },
      { maritalStatus: "married" },
      { healthNotes: "none" },
      { photoUrl: "https://example.test/me.jpg" },
      { religion: "none" },
      { experience: [{ title: "Dev", disabilityAccommodation: "yes" }] },
    ]) {
      expect(() => assertNoProtectedAttributes(hostile)).toThrow(ProtectedAttributeError);
    }
  });

  it("does not mistake innocent fields for protected ones", () => {
    // "language", "usage", "percentage" all contain "age"; "average" too.
    expect(() =>
      assertNoProtectedAttributes({
        languages: [{ code: "fr", label: "Français" }],
        averageScore: 0.8,
        usagePercentage: 12,
      }),
    ).not.toThrow();
  });

  it("rejects unknown keys outright, so nothing can be smuggled in unlabelled", () => {
    expect(() => parseProfileContent({ notAField: "x" })).toThrow();
  });

  it("names the offending key so the failure is actionable", () => {
    try {
      parseProfileContent({ dateOfBirth: "1980-04-02" });
      throw new Error("expected a rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ProtectedAttributeError);
      expect((error as ProtectedAttributeError).keys).toEqual(["dateOfBirth"]);
    }
  });

  it("bounds every collection so a hostile document cannot inflate a row", () => {
    expect(() =>
      parseProfileContent({ skills: Array.from({ length: 201 }, (_, i) => ({ name: `s${i}` })) }),
    ).toThrow();
  });

  it("round-trips a realistic profile", () => {
    const parsed = parseProfileContent({
      fullName: "A. Candidate",
      email: "candidate@example.test",
      baseLocation: "Hasselt, Belgium",
      workAuthorization: "eea_unrestricted",
      languages: [
        { code: "nl", label: "Nederlands", proficiency: "native" },
        { code: "en", label: "English", proficiency: "professional" },
      ],
      skills: [{ name: "TypeScript", yearsExperience: 6 }],
      experience: [
        { title: "Software Engineer", employer: "Probex", startedOn: "2026-01", isCurrent: true },
      ],
      certifications: [{ name: "AZ-204", issuer: "Microsoft", expiresOn: "2027-06" }],
      preferences: { remote: "hybrid", locations: ["Genk"], salaryFloor: 55000, salaryCurrency: "EUR" },
    });

    expect(parsed.skills[0].yearsExperience).toBe(6);
    expect(parsed.experience[0].isCurrent).toBe(true);
    expect(parsed.certifications[0].expiresOn).toBe("2027-06");
    expect(parsed.preferences.excludedEmployers).toEqual([]);
  });

  it("rejects a date that is not year or year-month precision", () => {
    // CV dates are rarely accurate to the day; accepting a day would imply
    // a precision the source does not have.
    expect(() =>
      parseProfileContent({ experience: [{ title: "Dev", startedOn: "2021-03-14" }] }),
    ).toThrow();
  });
});

describe("date precision and bounds", () => {
  it("accepts a year or a year-month", () => {
    const parsed = parseProfileContent({
      experience: [{ title: "Dev", startedOn: "2021", endedOn: "2024-12" }],
    });
    expect(parsed.experience[0].startedOn).toBe("2021");
    expect(parsed.experience[0].endedOn).toBe("2024-12");
  });

  it("rejects an impossible month rather than storing it", () => {
    // "2026-99" would otherwise flow into M4's date comparisons as a
    // silently nonsensical value.
    for (const bad of ["2026-99", "2026-00", "2026-13", "2026-1"]) {
      expect(() =>
        parseProfileContent({ experience: [{ title: "Dev", startedOn: bad }] }),
      ).toThrow();
    }
  });

  it("applies the same bound to every date field", () => {
    expect(() => parseProfileContent({ education: [{ qualification: "MSc", completedOn: "2020-13" }] })).toThrow();
    expect(() => parseProfileContent({ certifications: [{ name: "X", expiresOn: "2027-00" }] })).toThrow();
  });
});
