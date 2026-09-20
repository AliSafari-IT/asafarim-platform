import { describe, expect, it } from "vitest";
import { looksLikeSkill, parseSkillLines, parseSkillsFreeText } from "./parseSkillsText";

describe("looksLikeSkill", () => {
  it("accepts short technology names", () => {
    for (const skill of ["TypeScript", "SQL Server", "Power BI", "Ruby on Rails", ".NET Core"]) {
      expect(looksLikeSkill(skill)).toBe(true);
    }
  });

  it("rejects prose, contact details, and dates", () => {
    for (const notSkill of [
      "Used MongoDB and SQL Server to design and query databases",
      "Database Management:",
      "sam@example.test",
      "2018-2020",
    ]) {
      expect(looksLikeSkill(notSkill)).toBe(false);
    }
  });
});

describe("parseSkillLines", () => {
  it("splits a flat comma-separated line exactly as before", () => {
    const parsed = parseSkillLines(["React, Node.js, PostgreSQL"]);
    expect(parsed.map((p) => p.name)).toEqual(["React", "Node.js", "PostgreSQL"]);
    expect(parsed.every((p) => p.category === null)).toBe(true);
  });

  it("recovers a category heading and tags following skills with it", () => {
    const parsed = parseSkillLines([
      "Software Development:",
      ".NET and C#: Proficient in .NET and C# environments, including extensive experience.",
      "PHP and Laravel: PHP and the Laravel framework for web application development.",
    ]);
    expect(parsed).toEqual([
      { name: ".NET and C#", category: "Software Development" },
      { name: "PHP and Laravel", category: "Software Development" },
    ]);
  });

  it("never stores a bare heading or lone bullet glyph as a skill", () => {
    const parsed = parseSkillLines(["❖", "Software Development:", "➢", ".NET and C#: A short line."]);
    const names = parsed.map((p) => p.name);
    expect(names).not.toContain("❖");
    expect(names).not.toContain("➢");
    expect(names).not.toContain("Software Development");
  });

  it("switches category at the next heading", () => {
    const parsed = parseSkillLines([
      "Software Development:",
      ".NET and C#: Proficient in .NET and C# environments, including extensive experience.",
      "Version Control:",
      "Git and GitHub: Used daily for source control and collaboration across teams.",
    ]);
    expect(parsed.find((p) => p.name === ".NET and C#")?.category).toBe("Software Development");
    expect(parsed.find((p) => p.name === "Git and GitHub")?.category).toBe("Version Control");
  });

  it("deduplicates by name, case-insensitively, keeping the first occurrence's category", () => {
    const parsed = parseSkillLines([
      "Backend:",
      "React: used for building interactive front-end interfaces across projects.",
      "react, React",
    ]);
    expect(parsed.filter((p) => p.name.toLowerCase() === "react")).toHaveLength(1);
    expect(parsed[0]).toEqual({ name: "React", category: "Backend" });
  });

  it("recovers a compound lead-in name containing a connective word", () => {
    // "React and Angular TypeScript" would fail looksLikeSkill's own
    // prose-fragment rejection (>3 words with "and") if reused here — a
    // lead-in confirmed by its colon structure needs a lighter check.
    const parsed = parseSkillLines([
      "React and Angular TypeScript: for building interactive web interfaces.",
    ]);
    expect(parsed).toEqual([{ name: "React and Angular TypeScript", category: null }]);
  });

  it("caps at 200 skills", () => {
    const lines = Array.from({ length: 250 }, (_, i) => `Skill${i}`);
    expect(parseSkillLines(lines)).toHaveLength(200);
  });
});

describe("parseSkillsFreeText", () => {
  it("parses the exact pasted format from the reported CV", () => {
    const raw = [
      "Skills",
      "❖",
      "Software Development:",
      "➢",
      ".NET and C#: Proficient in .NET and C# environments, including extensive experience with ASP.NET Core (WebAPI, MVC), Entity Framework Core for data access.",
      "➢",
      "PHP and Laravel: PHP and the Laravel framework for web application development.",
      "❖",
      "Frontend Development:",
      "➢",
      "React and Angular TypeScript: for building interactive web interfaces.",
      "➢",
      "UI Styling: Familiar with Syncfusion and various popular CSS frameworks for styling and UI design.",
      "❖",
      "Version Control:",
      "➢",
      "Proficient in using Git, GitHub, and Azure DevOps for source code management and team collaboration.",
    ].join("\n");

    const parsed = parseSkillsFreeText(raw);
    const byName = Object.fromEntries(parsed.map((p) => [p.name, p.category]));

    expect(byName[".NET and C#"]).toBe("Software Development");
    expect(byName["PHP and Laravel"]).toBe("Software Development");
    expect(byName["React and Angular TypeScript"]).toBe("Frontend Development");
    expect(byName["UI Styling"]).toBe("Frontend Development");

    // No garbage entries: bullet glyphs, bare "Skills"/heading lines, or the
    // one prose bullet with no recoverable lead-in term (Version Control's
    // "Proficient in using Git, GitHub, ..." sentence).
    const names = parsed.map((p) => p.name);
    expect(names).not.toContain("Skills");
    expect(names).not.toContain("❖");
    expect(names).not.toContain("➢");
    expect(names).not.toContain("Software Development");
    expect(names.some((n) => n.startsWith("Proficient in using"))).toBe(false);

    // Nothing exceeds skillSchema's 80-char cap — the whole point of this
    // fix is that pasting this text must not 422 the profile save.
    for (const name of names) expect(name.length).toBeLessThanOrEqual(80);
  });

  it("still works for the simple, most common case: a plain comma list", () => {
    const parsed = parseSkillsFreeText("React, Node.js, PostgreSQL");
    expect(parsed.map((p) => p.name)).toEqual(["React", "Node.js", "PostgreSQL"]);
  });
});
