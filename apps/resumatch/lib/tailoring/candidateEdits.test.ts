import { describe, expect, it } from "vitest";
import {
  applyCandidateEdits,
  applySkillEdits,
  hasCandidateEdits,
  NO_CANDIDATE_EDITS,
  ownBulletsByRole,
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
      parseCandidateEdits({ ownBullets: [{ title: "Dev", employer: null, bullets: ["x".repeat(2001)] }] }),
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

describe("ownBulletsByRole / hasCandidateEdits", () => {
  const edits = parseCandidateEdits({
    ownBullets: [{ title: "Dev ", employer: "ACME", startedOn: "2024-01", bullets: ["Mine."] }],
  });
  it("matches a role by title, employer and start date, not position", () => {
    expect(
      ownBulletsByRole(edits, [
        { title: "Lead", employer: "Acme", startedOn: "2025-01" },
        { title: "dev", employer: "Acme", startedOn: "2024-01" },
        { title: "Dev", employer: "Acme", startedOn: "2018-01" },
      ]),
    ).toEqual([[], ["Mine."], []]);
  });
  it("gives an ambiguous match to no role rather than to several", () => {
    const roles = [
      { title: "Dev", employer: "Acme", startedOn: "2024-01" },
      { title: "Dev", employer: "Acme", startedOn: "2024-01" },
    ];
    expect(ownBulletsByRole(edits, roles)).toEqual([[], []]);
  });
  it("knows when there is nothing to store", () => {
    expect(hasCandidateEdits(NO_CANDIDATE_EDITS)).toBe(false);
    expect(hasCandidateEdits(edits)).toBe(true);
  });
});

describe("approved review limits", () => {
  it("accepts a kept role summary longer than a provider bullet", async () => {
    const { parseApprovedTailorSuggestions, parseTailorSuggestions } = await import("./ai/schema");
    const long = { experienceBullets: [["x".repeat(1500)]] };
    expect(() => parseTailorSuggestions(long)).toThrow();
    expect(parseApprovedTailorSuggestions(long).experienceBullets[0][0]).toHaveLength(1500);
  });
});
