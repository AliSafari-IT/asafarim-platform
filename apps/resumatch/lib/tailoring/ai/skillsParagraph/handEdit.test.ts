import { describe, expect, it } from "vitest";
import { reviewSkillsParagraph } from "./check";
import { reviewHandEditedParagraph } from "./advice";
import { handEditProblem, MAX_SKILLS_PARAGRAPH_LENGTH, normalizeHandEditedParagraph } from "./handEditRules";

const skills = ["TypeScript", "Next.js", "ASP.NET Core", "PostgreSQL", "Docker", "Playwright"];
const base = { skills, categoryLabels: [], profileText: "Skills: TypeScript", language: "en" as const };

describe("hand-edit limits", () => {
  it("keeps one paragraph: line breaks and runs of spaces become one space", () => {
    expect(normalizeHandEditedParagraph("  Builds web apps\n\nwith  Next.js.\t ")).toBe("Builds web apps with Next.js.");
  });

  it("refuses an empty or whitespace-only paragraph", () => {
    expect(handEditProblem("")).toBe("empty");
    expect(handEditProblem(" \n\t ")).toBe("empty");
  });

  it("measures the tidied text against the shared limit", () => {
    expect(handEditProblem("a".repeat(MAX_SKILLS_PARAGRAPH_LENGTH))).toBeNull();
    expect(handEditProblem("a".repeat(MAX_SKILLS_PARAGRAPH_LENGTH + 1))).toBe("too_long");
    // Spaces that tidying removes don't count against it.
    expect(handEditProblem(`${"a".repeat(MAX_SKILLS_PARAGRAPH_LENGTH)}\n\n   `)).toBeNull();
  });
});

describe("reviewSkillsParagraph (advice for a hand edit)", () => {
  it("returns nothing for sentences the AI check would keep", () => {
    expect(
      reviewSkillsParagraph("Builds web apps in TypeScript with Next.js. Ships with Docker and tests with Playwright.", base),
    ).toEqual([]);
  });

  it("points at each sentence the AI check would remove, keeping the text as written", () => {
    expect(
      reviewSkillsParagraph(
        "Builds web apps in TypeScript with Next.js. Hosts them on Kubernetes. Expert in PostgreSQL.",
        base,
      ),
    ).toEqual([
      { sentence: "Hosts them on Kubernetes.", reasons: ["unlisted_name"] },
      { sentence: "Expert in PostgreSQL.", reasons: ["rating"] },
    ]);
  });
});

describe("reviewHandEditedParagraph", () => {
  it("names each concern in the preview's words, one entry per sentence", () => {
    const advice = reviewHandEditedParagraph({
      paragraph: "Builds APIs with ASP.NET Core. Mentors developers on Next.js for over 5 years. Deploys to AWS.",
      skills,
      outputLanguage: "en",
      profileContent: null,
    });
    expect(advice).toEqual([
      {
        sentence: "Mentors developers on Next.js for over 5 years.",
        concerns: expect.arrayContaining(["unlisted", "rating", "claim"]),
      },
      { sentence: "Deploys to AWS.", concerns: ["unlisted"] },
    ]);
  });

  it("flags a skill that is no longer on the CV's list", () => {
    const paragraph = "Stores data in PostgreSQL and ships with Docker.";
    expect(reviewHandEditedParagraph({ paragraph, skills, outputLanguage: "en", profileContent: null })).toEqual([]);
    expect(
      reviewHandEditedParagraph({
        paragraph,
        skills: skills.filter((skill) => skill !== "PostgreSQL"),
        outputLanguage: "en",
        profileContent: null,
      }),
    ).toEqual([{ sentence: paragraph, concerns: ["unlisted"] }]);
  });
});
