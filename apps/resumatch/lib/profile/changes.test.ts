import { describe, expect, it } from "vitest";
import { canonicalProfile, profileHasChanges } from "./changes";
import { candidateProfileSchema, type CandidateProfileContent } from "./contract";

const saved: CandidateProfileContent = candidateProfileSchema.parse({
  fullName: "Ali Safari",
  email: "ali@example.com",
  headline: "Full-stack developer",
  summary: "Builds things.\nTests things.",
  links: [{ kind: "github", url: "https://github.com/example" }],
  languages: [{ code: "en", label: "English", proficiency: "professional" }],
  skills: [
    { name: "TypeScript", rawLabel: "TypeScript (5.x)", category: "Languages" },
    { name: "React", rawLabel: "React" },
  ],
  experience: [
    { title: "Developer", employer: "Probex", startedOn: "2024-01", isCurrent: true },
    { title: "Engineer", employer: "Lab", startedOn: "2018-01", endedOn: "2023-12" },
  ],
  education: [{ qualification: "MSc Hydrology", completedOn: "2016" }],
  preferences: { locations: ["Genk", "Hasselt"], contractTypes: ["permanent", "contract"], remote: "hybrid" },
});

const copy = (): CandidateProfileContent => structuredClone(saved);

describe("profileHasChanges", () => {
  it("is false for the same profile", () => {
    expect(profileHasChanges(saved, copy())).toBe(false);
  });

  it("ignores spacing, line endings and empty strings", () => {
    const edited = copy();
    edited.fullName = "  Ali   Safari ";
    edited.summary = "Builds things.  \r\nTests things.\n";
    edited.experience[0].summary = "   ";
    edited.links[0].label = "";
    expect(profileHasChanges(saved, edited)).toBe(false);
  });

  it("ignores rows added and left empty", () => {
    const edited = copy();
    edited.experience.push({ title: "", employer: null, startedOn: null, endedOn: null, isCurrent: false, summary: null });
    edited.languages.push({ code: "xx", label: " ", proficiency: null });
    edited.links.push({ kind: "website", label: null, url: "  " });
    expect(profileHasChanges(saved, edited)).toBe(false);
  });

  it("compares a link as it will be stored", () => {
    const edited = copy();
    edited.links[0].url = "github.com/example";
    expect(profileHasChanges(saved, edited)).toBe(false);
  });

  it("ignores the order of preferred locations and contract types", () => {
    const edited = copy();
    edited.preferences.locations = ["Hasselt", "Genk"];
    edited.preferences.contractTypes = ["contract", "permanent"];
    expect(profileHasChanges(saved, edited)).toBe(false);
  });

  it("ignores a skill's hidden rawLabel", () => {
    const edited = copy();
    edited.skills[0].rawLabel = "TypeScript";
    expect(profileHasChanges(saved, edited)).toBe(false);
  });

  it("is clean again after an edit is undone", () => {
    const edited = copy();
    edited.headline = "Full-stack developer and tester";
    expect(profileHasChanges(saved, edited)).toBe(true);
    edited.headline = "Full-stack developer";
    expect(profileHasChanges(saved, edited)).toBe(false);
  });

  it("sees real changes", () => {
    const cases: ((p: CandidateProfileContent) => void)[] = [
      (p) => (p.fullName = "Ali R. Safari"),
      (p) => (p.email = "Ali@example.com"),
      (p) => (p.summary = null),
      (p) => (p.experience = [p.experience[1], p.experience[0]]),
      (p) => (p.experience[0].isCurrent = false),
      (p) => (p.skills[1].category = "Frameworks"),
      (p) => (p.skills = [p.skills[1], p.skills[0]]),
      (p) => p.skills.push({ name: "Playwright", rawLabel: "Playwright", yearsExperience: null, category: null }),
      (p) => (p.education[0].completedOn = "2017"),
      (p) => (p.languages[0].proficiency = "native"),
      (p) => (p.links[0].kind = "portfolio"),
      (p) => (p.preferences.remote = "remote"),
      (p) => (p.preferences.salaryFloor = 50000),
      (p) => (p.workAuthorization = "eea_unrestricted"),
    ];
    for (const change of cases) {
      const edited = copy();
      change(edited);
      expect(profileHasChanges(saved, edited), String(change)).toBe(true);
    }
  });

  it("produces a stable canonical form", () => {
    expect(JSON.stringify(canonicalProfile(saved))).toBe(JSON.stringify(canonicalProfile(copy())));
  });
});
