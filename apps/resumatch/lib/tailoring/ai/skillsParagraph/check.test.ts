import { describe, expect, it } from "vitest";
import { SKILL_CATEGORIES } from "../../../profile/skillCategories";
import { templateLabels } from "../../language";
import { checkSkillsParagraph } from "./check";

const skills = ["TypeScript", "React.js component design", "Next.js", "ASP.NET Core", "PostgreSQL", "Docker", "CI", "CD", "Playwright"];
const categoryLabels = SKILL_CATEGORIES.map((c) => templateLabels("en").skillCategories[c]);
const base = { skills, categoryLabels, profileText: "Skills: TypeScript, React", language: "en" as const };

describe("checkSkillsParagraph", () => {
  it("keeps sentences that only name listed skills", () => {
    const text =
      "Web development with React.js, Next.js and TypeScript. Back-end services in ASP.NET Core with PostgreSQL. Delivery through Docker and CI/CD, tested with Playwright.";
    expect(checkSkillsParagraph(text, base)).toEqual({ paragraph: text, removedSentences: 0, reasons: [] });
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
});
