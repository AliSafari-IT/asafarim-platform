import { describe, expect, it } from "vitest";
import { aiExtractionSchema, mergeAiExtraction, parseAiExtractionOutput } from "./schema";

describe("AI extraction output contract", () => {
  it("accepts a well-formed extraction and merges it into a full profile", () => {
    const output = parseAiExtractionOutput({
      fullName: "Ada Lovelace",
      email: "ada@example.test",
      experience: [
        {
          title: "ICT Developer",
          employer: "Unlimit-IT",
          startedOn: "2020-12",
          endedOn: "2023-12",
          isCurrent: false,
          summary: "Built full-stack ASP.NET Core/React applications and led three internal platform projects.",
        },
      ],
    });
    const profile = mergeAiExtraction(output);

    expect(profile.fullName).toBe("Ada Lovelace");
    expect(profile.experience[0].employer).toBe("Unlimit-IT");
    expect(profile.experience[0].title).toBe("ICT Developer");
  });

  it("never infers preferences or work authorization — they stay at empty-profile defaults", () => {
    const output = parseAiExtractionOutput({ fullName: "Ada Lovelace" });
    const profile = mergeAiExtraction(output);

    expect(profile.workAuthorization).toBeNull();
    expect(profile.preferences.remote).toBeNull();
  });

  it("rejects an unknown top-level field outright — a model cannot smuggle in a protected attribute by name", () => {
    expect(() => aiExtractionSchema.parse({ age: 46 })).toThrow();
    expect(() => aiExtractionSchema.parse({ gender: "f" })).toThrow();
    expect(() => aiExtractionSchema.parse({ nationality: "Belgian" })).toThrow();
  });

  it("silently drops an unlisted key inside a nested entry rather than persisting it", () => {
    // experienceSchema (from lib/profile/contract.ts) is not itself .strict(),
    // so zod strips unknown keys here rather than throwing — the hostile key
    // never reaches mergeAiExtraction's output either way.
    const output = parseAiExtractionOutput({
      experience: [{ title: "Dev", disabilityAccommodation: "yes" }],
    });
    expect(output.experience[0]).not.toHaveProperty("disabilityAccommodation");

    const profile = mergeAiExtraction(output);
    expect(profile.experience[0]).not.toHaveProperty("disabilityAccommodation");
  });

  it("rejects a malformed date instead of coercing it", () => {
    expect(() =>
      parseAiExtractionOutput({
        experience: [{ title: "Dev", startedOn: "March 2021" }],
      }),
    ).toThrow();
  });

  it("treats an empty extraction as valid — absence is a first-class value, not an error", () => {
    const output = parseAiExtractionOutput({});
    const profile = mergeAiExtraction(output);
    expect(profile.fullName).toBeNull();
    expect(profile.experience).toEqual([]);
  });
});
