import { describe, expect, it } from "vitest";
import { buildRegenerateSeed, type RegenerateSourceRow } from "./regenerate";
import { contextForSavedCv, resolveTailoringContext } from "./context";

const base: RegenerateSourceRow = {
  id: "cv_1",
  instructions: "Lead with backend work",
  outputLanguage: "nl",
  targetJob: { id: "job_1", title: "Developer", employer: "Acme", rawText: "x".repeat(900) },
  coverLetter: null,
};

describe("buildRegenerateSeed", () => {
  it("reopens the same job with the CV's own choices", () => {
    const seed = buildRegenerateSeed(base, false);
    expect(seed).toMatchObject({
      fromResumeId: "cv_1",
      job: { targetJobId: "job_1", title: "Developer", employer: "Acme" },
      cvLanguage: "nl",
      instructions: "Lead with backend work",
      includeCoverLetter: false,
      coverLetterLanguage: null,
    });
    expect(seed.job.snippet).toHaveLength(400);
  });

  it("ticks the letter when the CV had one, or when asked to add one", () => {
    expect(buildRegenerateSeed({ ...base, coverLetter: { outputLanguage: "nl" } }, false).includeCoverLetter).toBe(true);
    expect(buildRegenerateSeed(base, true).includeCoverLetter).toBe(true);
  });

  it("keeps a letter language only when it differed from the CV", () => {
    expect(buildRegenerateSeed({ ...base, coverLetter: { outputLanguage: "nl" } }, false).coverLetterLanguage).toBeNull();
    expect(buildRegenerateSeed({ ...base, coverLetter: { outputLanguage: "fr" } }, false).coverLetterLanguage).toBe("fr");
  });

  it("restores the letter's tone and length from the CV's stored context (#928)", () => {
    const tailoringContext = contextForSavedCv(
      resolveTailoringContext({
        workspaceId: "ws_1",
        profileVersionId: "pv_1",
        targetJobId: "job_1",
        jobRawText: "job",
        instructions: "Lead with backend work",
        lowFit: false,
        cvLanguage: "nl",
        coverLetter: { tone: "confident", length: "short" },
      }),
    );
    const seed = buildRegenerateSeed({ ...base, coverLetter: { outputLanguage: "nl" }, tailoringContext }, false);
    expect(seed.coverLetterTone).toBe("confident");
    expect(seed.coverLetterLength).toBe("short");
  });

  it("leaves tone and length to the flow's defaults for a CV saved before 0.6.0", () => {
    const seed = buildRegenerateSeed({ ...base, tailoringContext: null }, false);
    expect(seed.coverLetterTone).toBeNull();
    expect(seed.coverLetterLength).toBeNull();
  });

  it("ignores unknown or missing stored values", () => {
    const seed = buildRegenerateSeed(
      { ...base, instructions: null, outputLanguage: "xx", targetJob: { ...base.targetJob, rawText: null } },
      false,
    );
    expect(seed.cvLanguage).toBeNull();
    expect(seed.instructions).toBe("");
    expect(seed.job.snippet).toBe("");
  });
});

describe("buildRegenerateSeed candidate edits", () => {
  it("carries the saved CV's hand edits, and none when unreadable", () => {
    const edits = { addedSkills: ["Go"], removedSkills: ["SQL"], ownBullets: [{ title: "Dev", employer: "Acme", startedOn: "2024-01", bullets: ["Mine."] }] };
    expect(buildRegenerateSeed({ ...base, candidateEdits: edits }, false).candidateEdits).toEqual({ ...edits, ownSummary: null });
    expect(
      buildRegenerateSeed({ ...base, candidateEdits: { ...edits, ownSummary: "My summary." } }, false).candidateEdits.ownSummary,
    ).toBe("My summary.");
    expect(buildRegenerateSeed({ ...base, candidateEdits: { nope: 1 } }, false).candidateEdits.addedSkills).toEqual([]);
    expect(buildRegenerateSeed(base, false).candidateEdits.ownBullets).toEqual([]);
  });
});
