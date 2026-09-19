import { describe, expect, it } from "vitest";
import { diffExperience, diffSkills, diffTailoredResumes } from "./diff";
import type { TailoredResumeContent } from "./ai/schema";

function content(overrides: Partial<TailoredResumeContent> = {}): TailoredResumeContent {
  return {
    contractVersion: "1.0.0",
    fullName: "Jane Doe",
    email: "jane@example.com",
    phone: null,
    headline: "Backend Engineer",
    summary: "Backend engineer with 6 years of experience.",
    skills: ["Node.js", "PostgreSQL"],
    experience: [
      { title: "Engineer", employer: "Acme", startedOn: null, endedOn: null, isCurrent: true, bullets: ["Shipped the API."] },
    ],
    education: [],
    certifications: [],
    ...overrides,
  };
}

describe("diffSkills", () => {
  it("finds added, removed, and common skills", () => {
    const diff = diffSkills(["Node.js", "PostgreSQL"], ["Node.js", "Kubernetes"]);
    expect(diff.added).toEqual(["Kubernetes"]);
    expect(diff.removed).toEqual(["PostgreSQL"]);
    expect(diff.common).toEqual(["Node.js"]);
  });

  it("returns empty diffs for identical lists", () => {
    const diff = diffSkills(["Node.js"], ["Node.js"]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.common).toEqual(["Node.js"]);
  });
});

describe("diffExperience", () => {
  it("marks an entry changed when bullets differ", () => {
    const a = [{ title: "Engineer", employer: "Acme", startedOn: null, endedOn: null, isCurrent: true, bullets: ["A."] }];
    const b = [{ title: "Engineer", employer: "Acme", startedOn: null, endedOn: null, isCurrent: true, bullets: ["B."] }];
    const rows = diffExperience(a, b);
    expect(rows[0].changed).toBe(true);
  });

  it("marks an entry unchanged when bullets are identical", () => {
    const a = [{ title: "Engineer", employer: "Acme", startedOn: null, endedOn: null, isCurrent: true, bullets: ["A."] }];
    const rows = diffExperience(a, a);
    expect(rows[0].changed).toBe(false);
  });

  it("handles a trailing entry present only on one side", () => {
    const a = [{ title: "Engineer", employer: "Acme", startedOn: null, endedOn: null, isCurrent: true, bullets: ["A."] }];
    const b = [
      ...a,
      { title: "Intern", employer: "Beta", startedOn: null, endedOn: null, isCurrent: false, bullets: ["Interned."] },
    ];
    const rows = diffExperience(a, b);
    expect(rows).toHaveLength(2);
    expect(rows[1].bulletsA).toEqual([]);
    expect(rows[1].bulletsB).toEqual(["Interned."]);
  });
});

describe("diffTailoredResumes", () => {
  it("detects a changed headline and summary", () => {
    const a = content();
    const b = content({ headline: "Staff Engineer" });
    const diff = diffTailoredResumes(a, b);
    expect(diff.headlineChanged).toBe(true);
    expect(diff.summaryChanged).toBe(false);
  });

  it("reports no changes for two identical versions", () => {
    const a = content();
    const diff = diffTailoredResumes(a, a);
    expect(diff.headlineChanged).toBe(false);
    expect(diff.summaryChanged).toBe(false);
    expect(diff.skills.added).toEqual([]);
    expect(diff.skills.removed).toEqual([]);
  });
});
