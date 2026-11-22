import { describe, expect, it } from "vitest";
import { checkSkillsParagraph } from "./check";

const skills = ["TypeScript", "React.js component design", "Next.js", "ASP.NET Core", "PostgreSQL", "Docker", "CI", "CD", "Playwright"];
const categoryLabels = ["Frontend Development", "Backend & APIs"];
const base = { skills, categoryLabels, profileText: "Skills: TypeScript, React", language: "en" as const };

describe("checkSkillsParagraph", () => {
  it("keeps sentences that only name listed skills", () => {
    const text =
      "Web development with React.js, Next.js and TypeScript. Back-end services in ASP.NET Core with PostgreSQL. Delivery through Docker and CI/CD, tested with Playwright.";
    expect(checkSkillsParagraph(text, base)).toEqual({ paragraph: text, removedSentences: 0, reasons: [] });
  });

  it("keeps fluent prose that uses generic words like APIs and UI", () => {
    const text =
      "Builds web interfaces in TypeScript with Next.js, using React.js component design for a consistent UI. On the back end, designs APIs with ASP.NET Core and stores data in PostgreSQL. Ships with Docker and tests with Playwright.";
    expect(checkSkillsParagraph(text, { ...base, categoryLabels: [] })).toEqual({ paragraph: text, removedSentences: 0, reasons: [] });
    // Anything that could be a skill of its own still needs the list.
    expect(checkSkillsParagraph("Designs REST APIs with ASP.NET Core.", base).paragraph).toBeNull();
  });

  it("removes a sentence naming an unlisted tool, mid-sentence or (tech-shaped) first", () => {
    const result = checkSkillsParagraph(
      "Web development with React.js and Next.js. AWS hosting with Docker. Orchestration with Kubernetes.",
      base,
    );
    expect(result.paragraph).toBe("Web development with React.js and Next.js.");
    expect(result.removedSentences).toBe(2);
    expect(result.reasons).toContain("unlisted_name");
  });

  it("removes numbers, ratings and unbacked claims", () => {
    const result = checkSkillsParagraph(
      "Expert in TypeScript. Over 8 years with PostgreSQL. Mentors developers on Next.js. Back-end work in ASP.NET Core.",
      base,
    );
    expect(result.paragraph).toBe("Back-end work in ASP.NET Core.");
    expect(result.reasons).toEqual(expect.arrayContaining(["rating", "unlisted_name", "mentoring"]));
  });

  it("fails when nothing is left, and strips wrapping quotes", () => {
    expect(checkSkillsParagraph("Senior engineer with 10 years.", base).paragraph).toBeNull();
    expect(checkSkillsParagraph('"Web work with Next.js."', base).paragraph).toBe("Web work with Next.js.");
  });

  it("in German checks technology-shaped names only, since every noun is capitalized", () => {
    const result = checkSkillsParagraph(
      "Webentwicklung mit Next.js und TypeScript. Betrieb auf AWS.",
      { ...base, language: "de" },
    );
    expect(result.paragraph).toBe("Webentwicklung mit Next.js und TypeScript.");
  });

  it("matches whole words, not substrings, and only headings the prompt showed", () => {
    const js = { ...base, skills: ["JavaScript"], categoryLabels: ["Languages & Frameworks"] };
    expect(checkSkillsParagraph("Web development with JavaScript and Java.", js).paragraph).toBeNull();
    const excel = { ...base, skills: ["Excel"], categoryLabels: ["Data & Analytics"] };
    expect(checkSkillsParagraph("Data analysis with Excel and AI.", excel).paragraph).toBeNull();
    expect(checkSkillsParagraph("Data analysis with Excel.", excel).paragraph).toBe("Data analysis with Excel.");
  });

  it("accepts punctuation-heavy listed names", () => {
    const dotnet = { ...base, skills: ["ASP.NET Core", "C#", "C++", ".NET"], categoryLabels: [] };
    expect(checkSkillsParagraph("Back-end work in C#, C++ and .NET with ASP.NET Core.", dotnet).paragraph).toBe(
      "Back-end work in C#, C++ and .NET with ASP.NET Core.",
    );
  });

  it("does not read a listed skill name as a rating", () => {
    const expert = { ...base, skills: ["Expert Systems"], categoryLabels: ["Other"] };
    expect(checkSkillsParagraph("Other: Expert Systems.", expert).paragraph).toBe("Other: Expert Systems.");
    expect(checkSkillsParagraph("Expert in Expert Systems.", expert).paragraph).toBeNull();
  });

  it("accepts numbers only inside a listed name, and rejects selling words", () => {
    const win = { ...base, skills: ["Windows 11", "Advanced Excel", "testing"], categoryLabels: [] };
    expect(checkSkillsParagraph("Desktop work on Windows 11.", win).paragraph).toBe("Desktop work on Windows 11.");
    expect(checkSkillsParagraph("Delivered 11 projects.", win).paragraph).toBeNull();
    expect(checkSkillsParagraph("Advanced Excel.", win).paragraph).toBe("Advanced Excel.");
    expect(checkSkillsParagraph("Skills include excellent testing.", win).paragraph).toBeNull();
    expect(checkSkillsParagraph("Skills include testing.", win).paragraph).toBe("Skills include testing.");
  });
});
