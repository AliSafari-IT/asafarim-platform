import { describe, expect, it } from "vitest";
import {
  applyCandidateEdits,
  applySkillEdits,
  hasCandidateEdits,
  NO_CANDIDATE_EDITS,
  ownBulletsFor,
  parseCandidateEdits,
  readStoredCandidateEdits,
} from "./candidateEdits";
import { mergeTailoringSuggestions } from "./ai/schema";
import type { CandidateProfileContent } from "../profile/contract";

describe("applySkillEdits", () => {
  it("drops removed skills and appends added ones, case-insensitively and without duplicates", () => {
    expect(
      applySkillEdits(["React", "Node.js", "SQL"], {
        removedSkills: ["node.JS"],
        addedSkills: ["Kubernetes", "react", "  Docker   Compose "],
      }),
    ).toEqual(["React", "SQL", "Kubernetes", "Docker Compose"]);
  });

  it("can leave a CV with no skills", () => {
    expect(applySkillEdits(["React"], { removedSkills: ["React"], addedSkills: [] })).toEqual([]);
  });
});

describe("parseCandidateEdits", () => {
  it("treats a missing body as no edits", () => {
    expect(parseCandidateEdits(undefined)).toEqual(NO_CANDIDATE_EDITS);
    expect(parseCandidateEdits(null)).toEqual(NO_CANDIDATE_EDITS);
  });

  it("rejects oversized or unknown input", () => {
    expect(() => parseCandidateEdits({ addedSkills: ["x".repeat(81)] })).toThrow();
    expect(() => parseCandidateEdits({ addedSkills: Array.from({ length: 31 }, (_, i) => `s${i}`) })).toThrow();
    expect(() =>
      parseCandidateEdits({ ownBullets: [{ title: "Dev", employer: null, bullets: ["x".repeat(401)] }] }),
    ).toThrow();
    expect(() => parseCandidateEdits({ profile: { skills: [] } })).toThrow();
  });

  it("reads stored edits leniently", () => {
    expect(readStoredCandidateEdits(null)).toEqual(NO_CANDIDATE_EDITS);
    expect(readStoredCandidateEdits("garbage")).toEqual(NO_CANDIDATE_EDITS);
    expect(readStoredCandidateEdits({ addedSkills: ["Go"] }).addedSkills).toEqual(["Go"]);
  });
});

describe("applyCandidateEdits", () => {
  const profile = {
    fullName: "Ada",
    email: null,
    phone: null,
    baseLocation: null,
    links: [],
    headline: "Developer",
    summary: "Builds things.",
    skills: [
      { name: "React", level: null },
      { name: "SQL", level: null },
    ],
    experience: [
      { title: "Dev", employer: "Acme", startedOn: null, endedOn: null, isCurrent: true, summary: "Did work." },
    ],
    education: [],
    certifications: [],
    languages: [],
  } as unknown as CandidateProfileContent;

  it("puts added skills on the saved CV and leaves removed ones off", () => {
    const merged = mergeTailoringSuggestions(profile, {
      headline: null,
      summary: null,
      skillsOrder: ["SQL", "React"],
      experienceBullets: [["My own bullet."]],
    });
    const content = applyCandidateEdits(merged, { addedSkills: ["Kubernetes"], removedSkills: ["React"], ownBullets: [] });
    expect(content.skills).toEqual(["SQL", "Kubernetes"]);
    expect(content.experience[0].bullets).toEqual(["My own bullet."]);
  });
});

describe("ownBulletsFor / hasCandidateEdits", () => {
  const edits = parseCandidateEdits({
    ownBullets: [{ title: "Dev ", employer: "ACME", bullets: ["Mine."] }],
  });
  it("matches a role by title and employer, not position", () => {
    expect(ownBulletsFor(edits, "dev", "Acme")).toEqual(["Mine."]);
    expect(ownBulletsFor(edits, "Dev", "Other")).toEqual([]);
  });
  it("knows when there is nothing to store", () => {
    expect(hasCandidateEdits(NO_CANDIDATE_EDITS)).toBe(false);
    expect(hasCandidateEdits(edits)).toBe(true);
  });
});
