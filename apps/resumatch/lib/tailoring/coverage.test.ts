import { describe, expect, it } from "vitest";
import { computeCoverage } from "./coverage";

describe("computeCoverage", () => {
  const jobText = "Looking for a backend engineer with strong Node.js, PostgreSQL, and Kubernetes experience.";

  it("matches a profile skill that the job text also mentions", () => {
    const report = computeCoverage(["Node.js", "React"], jobText, "Node.js React");
    expect(report.matchedSkills).toEqual(["Node.js"]);
  });

  it("lists a frequent job keyword not covered anywhere in the resume text", () => {
    const report = computeCoverage(["Node.js"], jobText, "Node.js developer");
    expect(report.missingKeywords).toContain("kubernetes");
    expect(report.missingKeywords).toContain("postgresql");
  });

  it("does not flag a keyword that appears in the resume even outside skills", () => {
    const report = computeCoverage(["Node.js"], jobText, "Node.js developer with Kubernetes deployment experience");
    expect(report.missingKeywords).not.toContain("kubernetes");
  });

  it("computes matchPercent from the profile's own skill count", () => {
    const report = computeCoverage(["Node.js", "React", "Vue"], jobText, "Node.js");
    expect(report.matchPercent).toBe(33);
  });

  it("returns 0% and no matches when the profile has no skills at all", () => {
    const report = computeCoverage([], jobText, "");
    expect(report.matchPercent).toBe(0);
    expect(report.matchedSkills).toEqual([]);
  });

  it("ignores stopwords and generic words as missing keywords", () => {
    const report = computeCoverage([], "This role requires experience with the team and your skills.", "");
    expect(report.missingKeywords).not.toContain("role");
    expect(report.missingKeywords).not.toContain("with");
    expect(report.missingKeywords).not.toContain("your");
    expect(report.missingKeywords).not.toContain("skills");
    expect(report.missingKeywords).not.toContain("team");
  });
});
