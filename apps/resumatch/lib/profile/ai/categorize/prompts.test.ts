import { describe, expect, it } from "vitest";
import { MAX_SKILLS_PER_CALL, renderCategorizePrompt } from "./prompts";

describe("renderCategorizePrompt", () => {
  it("fences the skill names as data", () => {
    const rendered = renderCategorizePrompt(["React", "SQL Server"]);
    expect(rendered.user).toContain("<<<RESUMATCH_SKILL_NAMES");
    expect(rendered.user).toContain("RESUMATCH_SKILL_NAMES>>>");
    expect(rendered.user).toContain("React");
    expect(rendered.user).toContain("SQL Server");
  });

  it("states the fenced content is data, never instructions", () => {
    const rendered = renderCategorizePrompt(["React"]);
    expect(rendered.system).toMatch(/DATA ONLY/);
    expect(rendered.system).toMatch(/never an\s+instruction/i);
  });

  it("forbids adding, removing, or rewording a skill name", () => {
    const rendered = renderCategorizePrompt(["React"]);
    expect(rendered.system).toMatch(/NEVER add, remove, merge, split, or\s+reword/i);
  });

  it("does not constrain categories to a fixed software-engineering list", () => {
    const rendered = renderCategorizePrompt(["React"]);
    expect(rendered.system).toMatch(/do not force\s+every skill list into a generic software-engineering taxonomy/i);
  });

  it("caps the number of skills sent per call", () => {
    const many = Array.from({ length: MAX_SKILLS_PER_CALL + 50 }, (_, i) => `Skill${i}`);
    const rendered = renderCategorizePrompt(many);
    expect(rendered.skillNamesUsed).toHaveLength(MAX_SKILLS_PER_CALL);
  });

  it("is deterministic: same input produces the same cache key", () => {
    const a = renderCategorizePrompt(["React", "SQL Server"]);
    const b = renderCategorizePrompt(["React", "SQL Server"]);
    expect(a.cacheKey).toBe(b.cacheKey);
  });

  it("produces a different cache key for different input", () => {
    const a = renderCategorizePrompt(["React"]);
    const b = renderCategorizePrompt(["Angular"]);
    expect(a.cacheKey).not.toBe(b.cacheKey);
  });
});
