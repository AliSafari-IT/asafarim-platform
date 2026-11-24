import { describe, expect, it } from "vitest";
import {
  countFeedback,
  deriveFeedback,
  readFeedbackItems,
  readOriginalSuggestions,
  reconstructFeedback,
  type FeedbackInput,
  type OriginalSuggestions,
} from "./feedback";

/** #932: decisions derived from the server's suggestions and the approved review. */

const original: OriginalSuggestions = {
  cv: {
    headline: "Backend engineer for payments",
    summary: "Builds reliable Node.js services.",
    skillsOrder: ["PostgreSQL", "Node.js"],
    experienceBullets: [["Built payment APIs in Node.js.", "Ran PostgreSQL migrations.", "Mentored two juniors."]],
  },
  coverLetter: { greeting: "Dear team,", paragraphs: ["First.", "Second.", "Third."], signOff: "Kind regards," },
};

const base = (overrides: Partial<FeedbackInput> = {}): FeedbackInput => ({
  original,
  profile: { headline: "Backend developer", summary: "Profile summary.", skills: ["Node.js", "PostgreSQL"], roles: 1 },
  approved: {
    headline: "Backend engineer for payments",
    summary: "Builds reliable Node.js services.",
    skillsOrder: ["PostgreSQL", "Node.js"],
    experienceBullets: [["Built payment APIs in Node.js.", "Ran PostgreSQL migrations.", "Mentored two juniors."]],
  },
  bulletOrigins: [[0, 1, 2]],
  letter: { included: true, approved: original.coverLetter, paragraphOrigins: [0, 1, 2] },
  ...overrides,
});

const byKey = (items: ReturnType<typeof deriveFeedback>) => Object.fromEntries(items.map((i) => [i.key, i]));

describe("deriveFeedback (#932)", () => {
  it("records every suggestion kept as written as accepted, scoped to this application", () => {
    const items = deriveFeedback(base());
    expect(items.map((i) => i.key)).toEqual([
      "headline",
      "summary",
      "skills",
      "bullet:0:0",
      "bullet:0:1",
      "bullet:0:2",
      "letter.greeting",
      "letter.paragraph:0",
      "letter.paragraph:1",
      "letter.paragraph:2",
      "letter.signOff",
    ]);
    expect(items.every((i) => i.decision === "accepted" && i.scope === "application")).toBe(true);
    expect(countFeedback(items)).toEqual({ accepted: 11, edited: 0, rejected: 0 });
  });

  it("tells an accepted suggestion, an edited sentence and a rejected section apart, and reconstructs them", () => {
    const input = base({
      approved: {
        headline: "Backend engineer for payments",
        summary: "Builds reliable Node.js services for card payments.",
        skillsOrder: [],
        experienceBullets: [["Mentored two junior developers.", "Built payment APIs in Node.js."]],
      },
      bulletOrigins: [[2, 0]],
      letter: { included: false, approved: null },
    });
    const items = byKey(deriveFeedback(input));
    expect(items.headline!.decision).toBe("accepted");
    expect(items.summary).toMatchObject({ decision: "edited", final: "Builds reliable Node.js services for card payments." });
    expect(items.skills!.decision).toBe("rejected");
    expect(items["bullet:0:0"]!.decision).toBe("accepted");
    expect(items["bullet:0:1"]!.decision).toBe("rejected");
    expect(items["bullet:0:2"]).toMatchObject({ decision: "edited", final: "Mentored two junior developers." });
    expect(items.letter!.decision).toBe("rejected");
    expect(items["letter.greeting"]).toBeUndefined();

    const rebuilt = Object.fromEntries(reconstructFeedback(original, deriveFeedback(input)).map((i) => [i.key, i]));
    expect(rebuilt.headline).toMatchObject({ original: "Backend engineer for payments", saved: "Backend engineer for payments" });
    expect(rebuilt["bullet:0:2"]).toMatchObject({ original: "Mentored two juniors.", saved: "Mentored two junior developers." });
    expect(rebuilt["bullet:0:1"]).toMatchObject({ original: "Ran PostgreSQL migrations.", saved: null });
    expect(rebuilt.letter!.original).toContain("Second.");
  });

  it("reconstructs the full saved skill order, including profile skills the suggestion left out", () => {
    const input = base({
      original: { ...original, cv: { ...original.cv!, skillsOrder: ["PostgreSQL"] } },
      approved: { ...base().approved!, skillsOrder: ["PostgreSQL"] },
    });
    const items = deriveFeedback(input);
    expect(byKey(items).skills).toMatchObject({ decision: "accepted", final: "PostgreSQL, Node.js" });
    const skills = reconstructFeedback(input.original, items).find((i) => i.key === "skills")!;
    expect(skills).toMatchObject({ original: "PostgreSQL", saved: "PostgreSQL, Node.js" });
  });

  it("keeps line breaks in a saved edit and counts a whitespace-only change as an edit", () => {
    const items = byKey(deriveFeedback(base({ approved: { ...base().approved!, summary: "Builds reliable\nNode.js services." } })));
    expect(items.summary).toMatchObject({ decision: "edited", final: "Builds reliable\nNode.js services." });
  });

  it("counts a field put back to the profile's own value as rejected, not edited", () => {
    const items = byKey(
      deriveFeedback(base({ approved: { ...base().approved!, headline: "Backend developer", summary: "Profile summary." } })),
    );
    expect(items.headline!.decision).toBe("rejected");
    expect(items.summary!.decision).toBe("rejected");
  });

  it("treats tampered origins as the candidate's own text: out of range, repeated or not numbers", () => {
    const items = byKey(
      deriveFeedback(
        base({
          approved: { ...base().approved!, experienceBullets: [["Built payment APIs in Node.js.", "Something else.", "x"]] },
          bulletOrigins: [[0, 0, 99 as number]],
        }),
      ),
    );
    expect(items["bullet:0:0"]!.decision).toBe("accepted");
    expect(items["bullet:0:1"]!.decision).toBe("rejected");
    expect(items["bullet:0:2"]!.decision).toBe("rejected");
  });

  it("ignores suggestions for roles the profile does not have", () => {
    const items = deriveFeedback(
      base({ original: { ...original, cv: { ...original.cv!, experienceBullets: [["a"], ["ghost role"]] } }, bulletOrigins: [[0]] }),
    );
    expect(items.some((i) => i.key.startsWith("bullet:1:"))).toBe(false);
  });

  it("skips a skill order that changes nothing, and records nothing when there were no suggestions", () => {
    const same = deriveFeedback(base({ original: { ...original, cv: { ...original.cv!, skillsOrder: ["Node.js", "PostgreSQL"] } } }));
    expect(same.some((i) => i.key === "skills")).toBe(false);
    expect(deriveFeedback(base({ original: { cv: null, coverLetter: null } }))).toEqual([]);
  });

  it("keeps only known reason codes, and only on changed items", () => {
    const items = byKey(
      deriveFeedback(
        base({
          approved: { ...base().approved!, headline: null },
          reasons: { headline: "not_relevant", summary: "inaccurate", skills: "made up" },
        }),
      ),
    );
    expect(items.headline!.reason).toBe("not_relevant");
    expect(items.summary!.reason).toBeUndefined();
    expect(items.skills!.reason).toBeUndefined();
  });

  it("marks only an edited bullet the candidate added to their background as background scope", () => {
    const input = base({
      approved: { ...base().approved!, experienceBullets: [["Built payment APIs in Node.js and Go.", "Ran PostgreSQL migrations."]] },
      bulletOrigins: [[0, 1]],
      backgroundKeys: new Set(["bullet:0:0", "bullet:0:1", "summary"]),
    });
    const items = byKey(deriveFeedback(input));
    expect(items["bullet:0:0"]!.scope).toBe("background");
    expect(items["bullet:0:1"]!.scope).toBe("application");
    expect(items.summary!.scope).toBe("application");
  });

  it("pairs letter paragraphs by origin when one was cleared", () => {
    const items = byKey(
      deriveFeedback(
        base({
          letter: {
            included: true,
            approved: { greeting: "Hello,", paragraphs: ["First.", "Third, rewritten."], signOff: "Kind regards," },
            paragraphOrigins: [0, 2],
          },
        }),
      ),
    );
    expect(items["letter.greeting"]).toMatchObject({ decision: "edited", final: "Hello," });
    expect(items["letter.paragraph:0"]!.decision).toBe("accepted");
    expect(items["letter.paragraph:1"]!.decision).toBe("rejected");
    expect(items["letter.paragraph:2"]).toMatchObject({ decision: "edited", final: "Third, rewritten." });
  });

  it("reads stored records leniently", () => {
    expect(readOriginalSuggestions(null)).toEqual({ cv: null, coverLetter: null });
    expect(readOriginalSuggestions({ cv: { headline: 3, experienceBullets: [["a", 1]] } }).cv).toEqual({
      headline: null,
      summary: null,
      skillsOrder: [],
      experienceBullets: [["a"]],
    });
    expect(
      readFeedbackItems([{ key: "headline", decision: "edited", final: "x", reason: "nope", scope: "weird" }, { key: 1 }, "junk"]),
    ).toEqual([{ key: "headline", decision: "edited", final: "x", scope: "application" }]);
  });
});
