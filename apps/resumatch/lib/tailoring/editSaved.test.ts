import { describe, expect, it } from "vitest";
import { buildSavedReviewSeed, ownSummaryOf, type EditSourceRow } from "./editSaved";

const PROFILE = {
  fullName: "Jordan Example",
  headline: "Developer",
  summary: "My own profile summary.",
  skills: ["React", "TypeScript", "Docker", "SQL"].map((name) => ({ name })),
  experience: [
    { title: "Developer", employer: "Acme", startedOn: "2020-01", summary: "Built things at Acme." },
    { title: "Tester", employer: "Beta", startedOn: "2018-01", summary: "Tested things at Beta." },
  ],
};

function row(overrides: Partial<EditSourceRow> = {}): EditSourceRow {
  return {
    id: "cv1",
    instructions: "keep it short",
    outputLanguage: "en",
    content: {
      headline: "AI headline",
      summary: "AI summary.",
      skills: ["TypeScript", "React", "SQL", "GraphQL"],
      experience: [{ bullets: ["AI bullet one.", "My own bullet."] }, { bullets: ["Tested things at Beta."] }],
    },
    candidateEdits: {
      addedSkills: ["GraphQL"],
      removedSkills: ["Docker"],
      ownBullets: [{ title: "Developer", employer: "Acme", startedOn: "2020-01", bullets: ["My own bullet."] }],
    },
    profileContent: PROFILE,
    targetJob: { id: "job1", title: "Frontend", employer: "Shop", rawText: "x".repeat(600) },
    coverLetter: {
      id: "cl1",
      outputLanguage: "nl",
      content: { greeting: "Beste,", paragraphs: ["Een.", "Twee."], signOff: "Groet," },
    },
    ...overrides,
  };
}

describe("buildSavedReviewSeed", () => {
  it("fills the review in exactly as the CV was saved", () => {
    const seed = buildSavedReviewSeed(row());
    expect(seed.headline).toBe("AI headline");
    expect(seed.summary).toBe("AI summary.");
    expect(seed.aiSummary).toBe("AI summary.");
    expect(seed.profileSummary).toBe("My own profile summary.");
    expect(seed.job.snippet).toHaveLength(400);
    expect(seed.instructions).toBe("keep it short");
    expect(seed.coverLetter).toEqual({ greeting: "Beste,", paragraphs: ["Een.", "Twee."], signOff: "Groet,", outputLanguage: "nl" });
    expect(seed.coverLetterId).toBe("cl1");
  });

  it("gives back the chosen skill order with removed and added skills", () => {
    const seed = buildSavedReviewSeed(row());
    expect(seed.originalSkillsOrder).toEqual(["React", "TypeScript", "Docker", "SQL"]);
    // Saved order first, the removed profile skill at the end.
    expect(seed.suggestedSkillsOrder).toEqual(["TypeScript", "React", "SQL", "Docker"]);
    expect(seed.keepOriginalSkillOrder).toBe(false);
    expect(seed.addedSkills).toEqual(["GraphQL"]);
    expect(seed.removedSkills).toEqual(["Docker"]);
  });

  it("keeps the profile's order when the saved CV did", () => {
    const seed = buildSavedReviewSeed(
      row({
        content: { headline: null, summary: null, skills: ["React", "TypeScript", "Docker", "SQL"], experience: [] },
        candidateEdits: null,
      }),
    );
    expect(seed.keepOriginalSkillOrder).toBe(true);
    expect(seed.addedSkills).toEqual([]);
    expect(seed.removedSkills).toEqual([]);
    expect(seed.headline).toBe("");
  });

  it("marks the candidate's own bullets and the profile's role summary", () => {
    const seed = buildSavedReviewSeed(row());
    expect(seed.experience[0].bullets).toEqual([
      { text: "AI bullet one.", aiText: "AI bullet one.", fromProfile: false },
      { text: "My own bullet.", aiText: null, fromProfile: false },
    ]);
    expect(seed.experience[1].bullets).toEqual([
      { text: "Tested things at Beta.", aiText: "Tested things at Beta.", fromProfile: true },
    ]);
  });

  it("treats only a stored own summary as the candidate's own", () => {
    const own = buildSavedReviewSeed(
      row({
        content: { ...row().content, summary: "Written by me." },
        candidateEdits: { ownSummary: "Written by me." },
      }),
    );
    expect(own.summary).toBe("Written by me.");
    expect(own.aiSummary).toBeNull();
    const profile = buildSavedReviewSeed(row({ content: { ...row().content, summary: "My own profile summary." } }));
    // Filled in from the profile because the AI wrote none: not typed.
    expect(profile.aiSummary).toBe("My own profile summary.");
  });

  it("has no letter when the CV has none", () => {
    const seed = buildSavedReviewSeed(row({ coverLetter: null }));
    expect(seed.coverLetter).toBeNull();
    expect(seed.coverLetterId).toBeNull();
  });
});

describe("ownSummaryOf", () => {
  it("is null for the AI's own wording or an empty summary", () => {
    expect(ownSummaryOf("AI summary.", "AI summary.")).toBeNull();
    expect(ownSummaryOf("  AI summary. ", "AI summary.")).toBeNull();
    expect(ownSummaryOf("   ", "AI summary.")).toBeNull();
  });
  it("is the text when the candidate wrote or changed it", () => {
    expect(ownSummaryOf("Mine.", "AI summary.")).toBe("Mine.");
    expect(ownSummaryOf(" Mine. ", null)).toBe("Mine.");
  });
});
