import { describe, expect, it } from "vitest";
import { CategorizeSkillsFixtureProvider } from "./fixture";

const provider = new CategorizeSkillsFixtureProvider();

describe("CategorizeSkillsFixtureProvider", () => {
  it("categorizes using the deterministic keyword table, at zero cost", async () => {
    const output = await provider.categorize({
      skillNames: ["React", "SQL Server", "Diplomatic History"],
      system: "system",
      user: "user",
      promptVersion: "categorize_skills@1",
      model: "fixture-categorize-1",
    });
    expect(output.suggestions).toEqual([
      { name: "React", category: "Frontend Development" },
      { name: "SQL Server", category: "Databases" },
      { name: "Diplomatic History", category: "Other" },
    ]);
    expect(output.costUsd).toBe(0);
  });

  it("returns one suggestion per input name, in the same order", async () => {
    const names = ["Git", "Excel", "Project management"];
    const output = await provider.categorize({
      skillNames: names,
      system: "system",
      user: "user",
      promptVersion: "categorize_skills@1",
      model: "fixture-categorize-1",
    });
    expect(output.suggestions.map((s) => s.name)).toEqual(names);
  });
});
