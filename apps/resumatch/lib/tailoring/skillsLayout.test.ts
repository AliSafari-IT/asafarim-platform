import { describe, expect, it } from "vitest";
import { effectiveSkillsLayout, isSkillsLayout, profileSkillCategories, resolveSkillsDisplay } from "./skillsLayout";

const IT = ["TypeScript", "React", "PostgreSQL", "Docker", "Playwright"];
const NURSING = ["Wound care", "Patient triage", "Medication administration", "Excel"];

describe("resolveSkillsDisplay", () => {
  it("returns null for a CV with no skills", () => {
    expect(resolveSkillsDisplay({ skills: [], layout: "grouped", paragraph: null })).toBeNull();
  });

  it("groups IT skills automatically", () => {
    const display = resolveSkillsDisplay({ skills: IT, layout: null, paragraph: null });
    expect(display?.layout).toBe("grouped");
    if (display?.layout !== "grouped") return;
    // In the CV's (job-tailored) order, not the taxonomy's.
    expect(display.groups.map((g) => g.category)).toEqual([
      "Languages & Frameworks",
      "Frontend Development",
      "Databases",
      "Cloud & DevOps",
      "Testing & QA",
    ]);
    const reordered = resolveSkillsDisplay({ skills: ["Playwright", "Docker", "TypeScript", "Vitest"], layout: "grouped", paragraph: null });
    if (reordered?.layout !== "grouped") throw new Error("expected grouped");
    expect(reordered.groups).toEqual([
      { category: "Testing & QA", skills: ["Playwright", "Vitest"] },
      { category: "Cloud & DevOps", skills: ["Docker"] },
      { category: "Languages & Frameworks", skills: ["TypeScript"] },
    ]);
  });

  it("uses columns automatically when the categories don't fit (no single 'Other' heading)", () => {
    expect(resolveSkillsDisplay({ skills: NURSING, layout: null, paragraph: null })).toEqual({
      layout: "columns",
      skills: NURSING,
    });
  });

  it("an explicit grouped choice always groups, with an Other bucket", () => {
    const display = resolveSkillsDisplay({ skills: NURSING, layout: "grouped", paragraph: null });
    expect(display?.layout).toBe("grouped");
    if (display?.layout !== "grouped") return;
    expect(display.groups.map((g) => g.category)).toEqual(["Data & Analytics", "Other"]);
  });

  it("honours the candidate's own categories", () => {
    const categoryOf = profileSkillCategories({
      skills: [{ name: "Wound care", category: "Project & Process" }],
    });
    const display = resolveSkillsDisplay({ skills: NURSING, layout: "grouped", paragraph: null, categoryOf });
    if (display?.layout !== "grouped") throw new Error("expected grouped");
    expect(display.groups.find((g) => g.category === "Project & Process")?.skills).toEqual(["Wound care"]);
  });

  it("shows the paragraph only when one is stored, else the grouped list", () => {
    expect(resolveSkillsDisplay({ skills: IT, layout: "paragraph", paragraph: " Web work with React. " })).toEqual({
      layout: "paragraph",
      paragraph: "Web work with React.",
    });
    expect(resolveSkillsDisplay({ skills: IT, layout: "paragraph", paragraph: null })?.layout).toBe("grouped");
    expect(effectiveSkillsLayout({ skills: IT, layout: "paragraph", paragraph: "" })).toBe("grouped");
  });

  it("treats an unknown stored value as the automatic choice", () => {
    expect(resolveSkillsDisplay({ skills: NURSING, layout: "fancy", paragraph: null })?.layout).toBe("columns");
    expect(isSkillsLayout("fancy")).toBe(false);
    expect(isSkillsLayout("columns")).toBe(true);
  });
});

describe("profileSkillCategories", () => {
  it("reads odd or missing content without throwing", () => {
    expect(profileSkillCategories(null)("React")).toBeNull();
    expect(profileSkillCategories({ skills: "nope" })("React")).toBeNull();
    expect(profileSkillCategories({ skills: [null, { name: 3 }, { name: "React", category: " " }] })("React")).toBeNull();
    expect(profileSkillCategories({ skills: [{ name: "React ", category: "Other" }] })("react")).toBe("Other");
  });
});
