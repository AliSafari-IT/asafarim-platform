import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOW_CONFIDENCE_THRESHOLD, assertNoProtectedAttributes } from "../profile/contract";
import { extractProfileFromText } from "./profileExtractor";

/**
 * Fixtures (JM-024): synthetic Dutch, French, English, mixed-language, and
 * unstructured CVs. Synthetic on purpose — a real CV is exactly the kind of
 * special-category data this milestone exists to keep under control, and it
 * has no business in a git repository.
 */
function fixture(name: string): string {
  return readFileSync(path.join(__dirname, "..", "..", "fixtures", "cv", `${name}.txt`), "utf8");
}

describe("profile extraction — English CV", () => {
  const { content, confidence } = extractProfileFromText(fixture("en-standard"));

  it("reads contact details a regex can be sure about", () => {
    expect(content.email).toBe("alexandra.moreau@example.test");
    expect(confidence.email).toBeGreaterThan(LOW_CONFIDENCE_THRESHOLD);
  });

  it("flags the name as needing review rather than trusting a positional guess", () => {
    expect(content.fullName).toBe("Alexandra Moreau");
    expect(confidence.fullName).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
  });

  it("reads skills from the section, splitting on the separators CVs use", () => {
    const names = content.skills.map((s) => s.name);
    expect(names).toContain("TypeScript");
    expect(names).toContain("PostgreSQL");
    expect(names).toContain("GitHub Actions");
  });

  it("keeps the raw label alongside the name so M4 cannot erase the original", () => {
    expect(content.skills[0].rawLabel).toBe(content.skills[0].name);
  });

  it("reads roles with their date ranges and marks the current one", () => {
    expect(content.experience.length).toBeGreaterThanOrEqual(3);
    const current = content.experience.find((e) => e.isCurrent);
    expect(current?.title).toBe("Senior Software Engineer");
    expect(current?.employer).toBe("Probex");
    expect(current?.startedOn).toBe("2022-03");
    expect(current?.endedOn).toBeNull();
  });

  it("reads languages with proficiency", () => {
    const byCode = Object.fromEntries(content.languages.map((l) => [l.code, l.proficiency]));
    expect(byCode.nl).toBe("native");
    expect(byCode.en).toBe("professional");
    expect(byCode.fr).toBe("conversational");
  });

  it("never guesses a certification expiry, because M4 excludes on it", () => {
    expect(content.certifications.length).toBeGreaterThan(0);
    for (const cert of content.certifications) expect(cert.expiresOn).toBeNull();
  });
});

describe("profile extraction — Dutch CV", () => {
  const { content } = extractProfileFromText(fixture("nl-standard"));

  it("recognises Dutch section headings", () => {
    expect(content.skills.map((s) => s.name)).toContain("SAP");
    expect(content.experience.length).toBeGreaterThanOrEqual(2);
  });

  it("understands 'heden' as an open-ended current role", () => {
    const current = content.experience.find((e) => e.isCurrent);
    expect(current?.employer).toBe("Vanderlande");
    expect(current?.endedOn).toBeNull();
  });

  it("maps Dutch language names to ISO codes", () => {
    const codes = content.languages.map((l) => l.code).sort();
    expect(codes).toEqual(["en", "fr", "nl"]);
  });

  it("reads Dutch proficiency words", () => {
    const nl = content.languages.find((l) => l.code === "nl");
    expect(nl?.proficiency).toBe("native");
  });
});

describe("profile extraction — French CV", () => {
  const { content } = extractProfileFromText(fixture("fr-standard"));

  it("recognises French section headings", () => {
    expect(content.skills.map((s) => s.name)).toContain("Power BI");
    expect(content.education.length).toBeGreaterThan(0);
  });

  it("reads French roles and employers", () => {
    const current = content.experience.find((e) => e.isCurrent);
    expect(current?.title).toBe("Chef de projet");
    expect(current?.employer).toBe("Ores");
  });

  it("maps French language names and proficiency words", () => {
    const fr = content.languages.find((l) => l.code === "fr");
    expect(fr?.proficiency).toBe("native");
  });
});

describe("profile extraction — mixed-language CV", () => {
  const { content } = extractProfileFromText(fixture("mixed-language"));

  it("handles headings in one language and content in another", () => {
    // Dutch heading "TALEN", entries naming languages in English and French.
    const codes = content.languages.map((l) => l.code).sort();
    expect(codes).toEqual(["en", "fr", "nl"]);
    expect(content.skills.map((s) => s.name)).toContain("Python");
  });
});

describe("profile extraction — unstructured CV", () => {
  const { content, confidence } = extractProfileFromText(fixture("sparse"));

  it("returns a valid, mostly-empty profile rather than inventing structure", () => {
    expect(content.email).toBe("sam.reyes@example.test");
    expect(content.skills).toEqual([]);
    expect(content.experience).toEqual([]);
  });

  it("emits no confidence for fields it did not attempt", () => {
    expect(confidence.skills).toBeUndefined();
    expect(confidence.experience).toBeUndefined();
  });
});

describe("extraction and protected attributes", () => {
  it("never emits a protected attribute, even from a CV that volunteers them", () => {
    // European CVs frequently include these unprompted. The extractor must
    // read past them, not store them.
    const text = [
      "Marie Janssens",
      "marie.janssens@example.test",
      "Date of birth: 12/04/1979",
      "Nationality: Belgian",
      "Gender: female",
      "Marital status: married, two children",
      "",
      "SKILLS",
      "Nursing, Triage, Electronic patient records",
      "",
      "LANGUAGES",
      "Dutch (native)",
    ].join("\n");

    const { content } = extractProfileFromText(text);
    expect(() => assertNoProtectedAttributes(content)).not.toThrow();

    const serialized = JSON.stringify(content);
    for (const leak of ["1979", "Belgian", "female", "married"]) {
      expect(serialized).not.toContain(leak);
    }
  });
});

describe("extraction determinism", () => {
  it("gives the same result for the same input, which is what makes a match explainable", () => {
    const text = fixture("en-standard");
    expect(extractProfileFromText(text)).toEqual(extractProfileFromText(text));
  });
});
