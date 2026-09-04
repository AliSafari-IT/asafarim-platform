import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOW_CONFIDENCE_THRESHOLD, assertNoProtectedAttributes } from "../profile/contract";
import {
  collapseLetterSpacing,
  extractProfileFromText,
  looksLikeSkill,
  pickOwnEmail,
} from "./profileExtractor";

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

describe("profile extraction — multi-column designed CV", () => {
  // Reproduces, with invented details, the structure of a real two-column CV
  // that this extractor got badly wrong: PDF text comes out in draw order,
  // so skills content precedes the SKILLS heading, headings are letter-
  // spaced ("E D U C A T I O N"), some are glued to the next column
  // ("E X P E R I E N C EBE-0000 ..."), and a referee's email sits above the
  // candidate's own. The fixture is synthetic — a real CV is exactly the
  // special-category data this milestone exists to keep out of a repository.
  const { content, confidence } = extractProfileFromText(fixture("two-column-designed"));

  it("reports the layout as unreliable instead of guessing", () => {
    expect(extractProfileFromText(fixture("two-column-designed")).layoutReliable).toBe(false);
  });

  it("leaves section-derived fields empty rather than filling them with the wrong text", () => {
    // The failure this replaced: the entire CV, headings and prose and URLs,
    // pasted into the candidate's skills list.
    expect(content.skills).toEqual([]);
    expect(content.experience).toEqual([]);
    expect(content.education).toEqual([]);
  });

  it("still reads the candidate's own email, not the referee's", () => {
    // info@example-refs.test appears first in the text, inside a references
    // block. Taking the first email on the page produced exactly that.
    expect(content.email).toBe("sam.devries@example.test");
  });

  it("still reads languages, which do not depend on section order", () => {
    const byCode = Object.fromEntries(content.languages.map((l) => [l.code, l.proficiency]));
    expect(byCode.en).toBe("professional");
    // "good (B2 level)": B2 is the level job ads treat as professional
    // working proficiency, and the stronger marker on the line wins.
    expect(byCode.nl).toBe("professional");
    expect(byCode.fa).toBe("native");
  });

  it("does not present a skills column heading as the candidate's name", () => {
    // "MongoDB, SQL Server" was offered as a full name, because the skills
    // column is drawn first and looked like a short line near the top.
    // Null is the right answer here and is what it now returns: the name is
    // set in letter-spaced capitals with no recoverable word boundaries, so
    // there is nothing honest to offer. An empty field the candidate fills
    // in beats a confident wrong one.
    expect(content.fullName ?? "").not.toMatch(/MongoDB|SQL Server/);
  });

  it("emits confidence only for what it actually read", () => {
    expect(confidence.skills).toBeUndefined();
    expect(confidence.experience).toBeUndefined();
    expect(confidence.email).toBeGreaterThan(LOW_CONFIDENCE_THRESHOLD);
  });
});

describe("layout-ordering detection", () => {
  it("accepts a well-ordered single-column CV", () => {
    expect(extractProfileFromText(fixture("en-standard")).layoutReliable).toBe(true);
    expect(extractProfileFromText(fixture("nl-standard")).layoutReliable).toBe(true);
    expect(extractProfileFromText(fixture("fr-standard")).layoutReliable).toBe(true);
  });

  it("does not punish a short, unstructured note", () => {
    expect(extractProfileFromText(fixture("sparse")).layoutReliable).toBe(true);
  });
});

describe("letter-spaced headings", () => {
  it("collapses tracking so a designed heading is still a heading", () => {
    expect(collapseLetterSpacing("E D U C A T I O N")).toBe("EDUCATION");
    expect(collapseLetterSpacing("E X P E R I E N C E")).toBe("EXPERIENCE");
  });

  it("leaves ordinary prose alone", () => {
    const prose = "I work with a team of 5 and I enjoy it";
    expect(collapseLetterSpacing(prose)).toBe(prose);
  });
});

describe("skill plausibility", () => {
  it("accepts short technology names", () => {
    for (const skill of ["TypeScript", "SQL Server", "Power BI", "Ruby on Rails", ".NET Core"]) {
      expect(looksLikeSkill(skill)).toBe(true);
    }
  });

  it("rejects prose, contact details, and dates", () => {
    for (const notSkill of [
      "Used MongoDB and SQL Server to design and query databases",
      "Database Management:",
      "sam@example.test",
      "www.example.test",
      "2018-2020",
      "Project Highlights:",
    ]) {
      expect(looksLikeSkill(notSkill)).toBe(false);
    }
  });
});

describe("choosing the candidate's own email", () => {
  it("prefers an address matching the name over one that appears earlier", () => {
    const text = "REFERENCES\ninfo@agency.test\n\nJane Vermeulen\njane.vermeulen@example.test";
    expect(pickOwnEmail(text, "Jane Vermeulen")).toBe("jane.vermeulen@example.test");
  });

  it("prefers a personal address over a generic one when there is no name", () => {
    const text = "info@agency.test and s.devries@example.test";
    expect(pickOwnEmail(text, null)).toBe("s.devries@example.test");
  });

  it("still returns something when only a generic address exists", () => {
    expect(pickOwnEmail("contact@example.test", null)).toBe("contact@example.test");
  });
});

describe("review regressions — layout ordering", () => {
  it("recognises a heading whose last letter is glued to the next column", () => {
    // collapseLetterSpacing alone leaves "EXPERIENC EBE-0000", because the
    // run of single letters ends one letter early. Matching with spaces
    // ignored is what makes this heading findable at all.
    const cv = [
      "S A M P L E   N A M E",
      "sample@example.test",
      "E X P E R I E N C EBE-0000 Somewhere, Belgium",
      "Engineer at Example  2020 - present",
    ].join("\n");
    expect(() => extractProfileFromText(cv)).not.toThrow();
    expect(extractProfileFromText(cv).content.email).toBe("sample@example.test");
  });

  it("does not call an experience-heavy single-column CV unreadable", () => {
    // A senior CV really is mostly work history. Treating that as unordered
    // would discard the section the candidate most needs.
    const lines = [
      "Jane Vermeulen",
      "jane.vermeulen@example.test",
      "SKILLS",
      "TypeScript, PostgreSQL",
      "EXPERIENCE",
    ];
    for (let i = 0; i < 16; i += 1) {
      lines.push(`Senior Engineer at Employer${i}  ${2000 + i} - ${2001 + i}`);
    }
    const result = extractProfileFromText(lines.join("\n"));
    expect(result.layoutReliable).toBe(true);
    expect(result.content.experience.length).toBeGreaterThan(10);
    expect(result.content.skills.map((s) => s.name)).toContain("TypeScript");
  });
});

describe("review regressions — languages", () => {
  it("gives each language on a line its own level", () => {
    // One marker used to be applied to every language on the line, so
    // "French basic" was recorded as native.
    const { content } = extractProfileFromText(
      ["Someone Example", "someone@example.test", "LANGUAGES", "English native, French basic"].join("\n"),
    );
    const byCode = Object.fromEntries(content.languages.map((l) => [l.code, l.proficiency]));
    expect(byCode.en).toBe("native");
    expect(byCode.fr).toBe("basic");
  });

  it("does not invent a language claim from ordinary work prose", () => {
    // "Professional" and "Russian" both appear, but this is a sentence about
    // clients, not a statement about what the candidate speaks.
    const { content } = extractProfileFromText(
      [
        "Someone Example",
        "someone@example.test",
        "EXPERIENCE",
        "Consultant at Example  2019 - 2024",
        "Professional experience supporting Russian clients across the region",
      ].join("\n"),
    );
    expect(content.languages.map((l) => l.code)).not.toContain("ru");
  });

  it("still reads an adjacent language and level", () => {
    const { content } = extractProfileFromText(
      ["Someone Example", "someone@example.test", "LANGUAGES", "Russian - fluent"].join("\n"),
    );
    expect(content.languages.map((l) => l.code)).toContain("ru");
  });
});

describe("review regressions — email selection", () => {
  it("avoids a referee's personal address even when no name was found", () => {
    // The generic-local check alone does not catch this: a referee's work
    // address is a personal one.
    const text = [
      "REFERENCES",
      "maaike.debruin@agency.test",
      "Director at Agency",
      "",
      "CONTACT",
      "s.devries@example.test",
    ].join("\n");
    expect(pickOwnEmail(text, null)).toBe("s.devries@example.test");
  });

  it("handles a references heading that follows the address, as column order produces", () => {
    // In draw order the referee's address is emitted just *before* its own
    // heading, which is why the window looks in both directions. The
    // candidate's own address turns up much later in the stream.
    const text = [
      "maaike.debruin@agency.test",
      "R E F E R E N C E S",
      "SKILLS",
      "TypeScript, PostgreSQL",
      "EDUCATION",
      "MSc Example  2016",
      "EXPERIENCE",
      "Engineer at Example  2019 - present",
      "s.devries@example.test",
    ].join("\n");
    expect(pickOwnEmail(text, null)).toBe("s.devries@example.test");
  });
});
