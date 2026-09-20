import { describe, expect, it } from "vitest";
import { categorizeSkill, groupSkillsByCategory, SKILL_CATEGORIES } from "./skillCategories";

describe("categorizeSkill", () => {
  it("categorizes well-known skills into the expected group", () => {
    expect(categorizeSkill("React")).toBe("Frontend Development");
    expect(categorizeSkill("ASP.NET Core")).toBe("Backend & APIs");
    expect(categorizeSkill("SQL Server")).toBe("Databases");
    expect(categorizeSkill("Git")).toBe("Version Control");
    expect(categorizeSkill("TestCafe")).toBe("Testing & QA");
    expect(categorizeSkill("Visual Studio Code")).toBe("Tools & IDEs");
    expect(categorizeSkill("Azure DevOps")).toBe("Version Control");
    expect(categorizeSkill("Project management")).toBe("Project & Process");
    expect(categorizeSkill("Excel")).toBe("Data & Analytics");
    expect(categorizeSkill("C#")).toBe("Languages & Frameworks");
  });

  it("is case-insensitive", () => {
    expect(categorizeSkill("react")).toBe("Frontend Development");
    expect(categorizeSkill("REACT")).toBe("Frontend Development");
  });

  it("falls back to Other for an unrecognized skill", () => {
    expect(categorizeSkill("Underwater basket weaving")).toBe("Other");
  });

  it("is deterministic across repeated calls", () => {
    expect(categorizeSkill("Kubernetes")).toBe(categorizeSkill("Kubernetes"));
  });
});

describe("groupSkillsByCategory", () => {
  it("groups skills by their default category, in taxonomy order", () => {
    const groups = groupSkillsByCategory(["Git", "React", "SQL Server", ".NET"]);
    expect(groups.map((g) => g.category)).toEqual([
      "Frontend Development",
      "Backend & APIs",
      "Databases",
      "Version Control",
    ]);
  });

  it("drops categories with nothing in them", () => {
    const groups = groupSkillsByCategory(["React"]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual({ category: "Frontend Development", skills: ["React"] });
  });

  it("keeps skills within a category in their original order", () => {
    const groups = groupSkillsByCategory(["Vue", "React", "Angular"]);
    expect(groups[0].skills).toEqual(["Vue", "React", "Angular"]);
  });

  it("honors a manual override over the keyword default", () => {
    const groups = groupSkillsByCategory(["React"], () => "Other");
    expect(groups).toEqual([{ category: "Other", skills: ["React"] }]);
  });

  it("falls back to the keyword default when the override is not a known category", () => {
    const groups = groupSkillsByCategory(["React"], () => "Not A Real Category");
    expect(groups).toEqual([{ category: "Frontend Development", skills: ["React"] }]);
  });

  it("falls back to the keyword default when the override is null or undefined", () => {
    const groups = groupSkillsByCategory(["React"], () => null);
    expect(groups).toEqual([{ category: "Frontend Development", skills: ["React"] }]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupSkillsByCategory([])).toEqual([]);
  });

  it("covers every declared category with at least one keyword", () => {
    // Every category but the fallback should be reachable — otherwise it is
    // dead weight in the taxonomy (or a keyword bug hiding it).
    const reachable = new Set(SKILL_CATEGORIES);
    reachable.delete("Other");
    const sample = [
      "React",
      "ASP.NET Core",
      "SQL Server",
      "Git",
      "TestCafe",
      "Visual Studio",
      "Azure",
      "Excel",
      "C#",
      "Project management",
    ];
    for (const skill of sample) reachable.delete(categorizeSkill(skill));
    expect([...reachable]).toEqual([]);
  });
});
