import { describe, expect, it } from "vitest";
import { emptyProfile, type CandidateProfileContent } from "../profile/contract";
import { evaluateEligibility, isOptedOut, type PostingForEligibility } from "./evaluate";

function posting(overrides: Partial<PostingForEligibility> = {}): PostingForEligibility {
  return {
    employer: "Example NV",
    locationRaw: "Hasselt, Belgium",
    isRemote: false,
    contractType: "Permanent",
    salaryMin: 45000,
    salaryMax: 60000,
    salaryCurrency: "EUR",
    requiresSponsorship: null,
    languageRequired: [],
    requiredCertifications: [],
    ...overrides,
  };
}

function profile(overrides: Partial<CandidateProfileContent> = {}): CandidateProfileContent {
  return { ...emptyProfile(), ...overrides };
}

describe("absence never excludes", () => {
  it("finds an empty profile eligible for anything, since it states no preferences", () => {
    const result = evaluateEligibility(emptyProfile(), posting());
    expect(result).toEqual({ eligible: true, reasons: [], rulesVersion: result.rulesVersion });
  });

  it("does not exclude on work authorisation when the posting is silent", () => {
    const result = evaluateEligibility(
      profile({ workAuthorization: "requires_sponsorship" }),
      posting({ requiresSponsorship: null }),
    );
    expect(result.eligible).toBe(true);
  });

  it("does not exclude on language when the candidate left it blank", () => {
    const result = evaluateEligibility(profile(), posting({ languageRequired: ["nl"] }));
    expect(result.eligible).toBe(true);
  });

  it("does not exclude on salary when the posting states none", () => {
    const result = evaluateEligibility(
      profile({ preferences: { ...emptyProfile().preferences, salaryFloor: 60000, salaryCurrency: "EUR" } }),
      posting({ salaryMax: null }),
    );
    expect(result.eligible).toBe(true);
  });

  it("does not exclude on contract type it cannot confidently normalise", () => {
    const result = evaluateEligibility(
      profile({ preferences: { ...emptyProfile().preferences, contractTypes: ["permanent"] } }),
      posting({ contractType: "Something unusual" }),
    );
    expect(result.eligible).toBe(true);
  });
});

describe("work authorisation", () => {
  it("excludes only an explicit no-sponsorship role for a candidate who needs one", () => {
    const result = evaluateEligibility(
      profile({ workAuthorization: "requires_sponsorship" }),
      posting({ requiresSponsorship: false }),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons.map((r) => r.code)).toEqual(["REQUIRES_SPONSORSHIP_NOT_OFFERED"]);
  });

  it("does not exclude a candidate who does not need sponsorship", () => {
    const result = evaluateEligibility(
      profile({ workAuthorization: "eea_unrestricted" }),
      posting({ requiresSponsorship: false }),
    );
    expect(result.eligible).toBe(true);
  });
});

describe("language", () => {
  it("excludes when none of the candidate's languages meet the requirement", () => {
    const result = evaluateEligibility(
      profile({ languages: [{ code: "fr", label: "French", proficiency: "native" }] }),
      posting({ languageRequired: ["nl", "en"] }),
    );
    expect(result.reasons.map((r) => r.code)).toContain("LANGUAGE_NOT_MET");
  });

  it("does not exclude when any stated language meets it", () => {
    const result = evaluateEligibility(
      profile({
        languages: [
          { code: "fr", label: "French", proficiency: "native" },
          { code: "nl", label: "Dutch", proficiency: "professional" },
        ],
      }),
      posting({ languageRequired: ["nl", "en"] }),
    );
    expect(result.eligible).toBe(true);
  });
});

describe("certification", () => {
  it("excludes when the required certification is not on the profile at all", () => {
    const result = evaluateEligibility(profile(), posting({ requiredCertifications: ["AWS-SA"] }));
    expect(result.reasons.map((r) => r.code)).toContain("CERTIFICATION_NOT_MET");
  });

  it("excludes when the matching certification has expired", () => {
    const result = evaluateEligibility(
      profile({
        certifications: [{ name: "AWS-SA", issuer: null, issuedOn: null, expiresOn: "2020-01" }],
      }),
      posting({ requiredCertifications: ["AWS-SA"] }),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons[0].message).toContain("expired");
  });

  it("does not exclude when the certification is current", () => {
    const result = evaluateEligibility(
      profile({
        certifications: [{ name: "AWS-SA", issuer: null, issuedOn: null, expiresOn: "2099-01" }],
      }),
      posting({ requiredCertifications: ["AWS-SA"] }),
    );
    expect(result.eligible).toBe(true);
  });

  it("does not exclude when the certification has no stated expiry", () => {
    // No expiry is never guessed at — see lib/profile/profileExtractor.ts.
    const result = evaluateEligibility(
      profile({ certifications: [{ name: "AWS-SA", issuer: null, issuedOn: null, expiresOn: null }] }),
      posting({ requiredCertifications: ["AWS-SA"] }),
    );
    expect(result.eligible).toBe(true);
  });
});

describe("location and remote", () => {
  it("excludes an on-site role when the candidate wants remote only", () => {
    const result = evaluateEligibility(
      profile({ preferences: { ...emptyProfile().preferences, remote: "remote" } }),
      posting({ isRemote: false }),
    );
    expect(result.reasons.map((r) => r.code)).toEqual(["REMOTE_ONLY_PREFERENCE"]);
  });

  it("does not apply the location rule when the role is remote", () => {
    const result = evaluateEligibility(
      profile({ preferences: { ...emptyProfile().preferences, locations: ["Antwerp"] } }),
      posting({ isRemote: true, locationRaw: "Hasselt, Belgium" }),
    );
    expect(result.eligible).toBe(true);
  });

  it("excludes an on-site role outside every preferred location", () => {
    const result = evaluateEligibility(
      profile({ preferences: { ...emptyProfile().preferences, locations: ["Antwerp"] } }),
      posting({ isRemote: false, locationRaw: "Hasselt, Belgium" }),
    );
    expect(result.reasons.map((r) => r.code)).toContain("LOCATION_NOT_MATCHED");
  });

  it("matches across language variants of the same city", () => {
    const result = evaluateEligibility(
      profile({ preferences: { ...emptyProfile().preferences, locations: ["Brussels"] } }),
      posting({ isRemote: false, locationRaw: "Bruxelles, Belgique" }),
    );
    expect(result.eligible).toBe(true);
  });
});

describe("salary floor", () => {
  it("excludes a posting whose maximum is below the floor", () => {
    const result = evaluateEligibility(
      profile({ preferences: { ...emptyProfile().preferences, salaryFloor: 70000, salaryCurrency: "EUR" } }),
      posting({ salaryMax: 60000, salaryCurrency: "EUR" }),
    );
    expect(result.reasons.map((r) => r.code)).toEqual(["BELOW_SALARY_FLOOR"]);
  });

  it("does not compare across mismatched currencies", () => {
    // Comparing without a conversion rate would be a guess dressed up as a
    // fact.
    const result = evaluateEligibility(
      profile({ preferences: { ...emptyProfile().preferences, salaryFloor: 70000, salaryCurrency: "EUR" } }),
      posting({ salaryMax: 60000, salaryCurrency: "USD" }),
    );
    expect(result.eligible).toBe(true);
  });

  it("does not exclude when the posting's maximum clears the floor", () => {
    const result = evaluateEligibility(
      profile({ preferences: { ...emptyProfile().preferences, salaryFloor: 50000, salaryCurrency: "EUR" } }),
      posting({ salaryMax: 60000, salaryCurrency: "EUR" }),
    );
    expect(result.eligible).toBe(true);
  });
});

describe("contract type", () => {
  it("excludes a normalised contract type outside the candidate's list", () => {
    const result = evaluateEligibility(
      profile({ preferences: { ...emptyProfile().preferences, contractTypes: ["permanent"] } }),
      posting({ contractType: "Freelance" }),
    );
    expect(result.reasons.map((r) => r.code)).toEqual(["CONTRACT_TYPE_NOT_WANTED"]);
  });

  it("does not exclude a wanted contract type written differently", () => {
    const result = evaluateEligibility(
      profile({ preferences: { ...emptyProfile().preferences, contractTypes: ["permanent"] } }),
      posting({ contractType: "CDI" }),
    );
    expect(result.eligible).toBe(true);
  });
});

describe("multiple failures reported together", () => {
  it("lists every failed axis, not just the first", () => {
    const result = evaluateEligibility(
      profile({
        workAuthorization: "requires_sponsorship",
        preferences: {
          ...emptyProfile().preferences,
          locations: ["Antwerp"],
          salaryFloor: 90000,
          salaryCurrency: "EUR",
        },
      }),
      posting({
        requiresSponsorship: false,
        isRemote: false,
        locationRaw: "Hasselt",
        salaryMax: 60000,
        salaryCurrency: "EUR",
      }),
    );
    expect(result.reasons.map((r) => r.code).sort()).toEqual(
      ["BELOW_SALARY_FLOOR", "LOCATION_NOT_MATCHED", "REQUIRES_SPONSORSHIP_NOT_OFFERED"].sort(),
    );
  });
});

describe("determinism", () => {
  it("gives the same result for the same inputs", () => {
    const p = profile({ languages: [{ code: "nl", label: "Dutch", proficiency: "native" }] });
    const j = posting({ languageRequired: ["nl"] });
    expect(evaluateEligibility(p, j)).toEqual(evaluateEligibility(p, j));
  });
});

describe("opt-outs", () => {
  it("recognises an excluded employer across a legal-suffix variant", () => {
    const p = profile({ preferences: { ...emptyProfile().preferences, excludedEmployers: ["Example"] } });
    expect(isOptedOut(p, "Example NV")).toBe(true);
  });

  it("does not opt out an employer that was never listed", () => {
    const p = profile({ preferences: { ...emptyProfile().preferences, excludedEmployers: ["Other Corp"] } });
    expect(isOptedOut(p, "Example NV")).toBe(false);
  });

  it("is false with no exclusions at all", () => {
    expect(isOptedOut(emptyProfile(), "Anything NV")).toBe(false);
  });
});
