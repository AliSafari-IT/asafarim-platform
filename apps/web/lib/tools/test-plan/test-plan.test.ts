import { describe, expect, it } from "vitest";
import { testPlanExampleOutput } from "../../../content/tool-fixtures/requirements-to-test-plan";
import { applyScenarioEdit, draftFrom } from "./edit";
import { escapeMd, plannedCounts, toExportJson, toMarkdown, type EditableScenario } from "./export";
import { testPlanInputSchema, testPlanSchema, TEST_CATEGORIES, type TestPlan } from "./schema";
import { MAX_SOURCE_UNITS, splitSources } from "./sources";

describe("splitSources", () => {
  it("numbers requirement lines then acceptance criteria, stripping list markers", () => {
    const units = splitSources("As a user I want X.", "- first\r\n2) second\n\n* [x] third");
    expect(units).toEqual([
      { id: "R1", text: "As a user I want X.", field: "requirement" },
      { id: "R2", text: "first", field: "acceptanceCriteria" },
      { id: "R3", text: "second", field: "acceptanceCriteria" },
      { id: "R4", text: "third", field: "acceptanceCriteria" },
    ]);
  });

  it("splits long multi-sentence lines into one unit per sentence", () => {
    const long = `${"The first sentence is fairly long and describes a behaviour. ".repeat(3)}And a final one!`;
    const units = splitSources(long);
    expect(units.length).toBe(4);
    expect(units[3].text).toBe("And a final one!");
  });

  it("caps the number of units", () => {
    expect(splitSources(Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n"))).toHaveLength(MAX_SOURCE_UNITS);
  });

  it("is deterministic", () => {
    expect(splitSources("a line\nanother line")).toEqual(splitSources("a line\nanother line"));
  });
});

describe("input schema", () => {
  it("trims text and drops empty optional fields", () => {
    expect(testPlanInputSchema.parse({ requirement: `  ${"x".repeat(40)}  `, title: "   ", acceptanceCriteria: "" })).toEqual({
      requirement: "x".repeat(40),
      title: undefined,
      acceptanceCriteria: undefined,
      context: undefined,
      platforms: undefined,
    });
  });

  it.each([
    [{ requirement: "too short" }, /at least 40/],
    [{ requirement: "x".repeat(8_001) }, /8,000-character limit/],
    [{ requirement: "x".repeat(50), title: "t".repeat(121) }, /title is over/],
    [{ requirement: "x".repeat(50), url: "https://example.com" }, /unrecognized|Unrecognized/],
  ])("rejects %j with a UI-safe message", (input, message) => {
    const result = testPlanInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message).join(" ")).toMatch(message);
  });
});

describe("output schema", () => {
  const plan = testPlanExampleOutput;

  it("accepts the example, which shows ambiguity, contradiction, traceability, and several categories", () => {
    expect(testPlanSchema.parse(plan)).toEqual(plan);
    expect(plan.questions.map((q) => q.kind)).toEqual(expect.arrayContaining(["ambiguity", "contradiction", "missing"]));
    expect(new Set(plan.scenarios.map((s) => s.category)).size).toBeGreaterThanOrEqual(6);
    for (const s of plan.scenarios) {
      if (s.basis === "requirement") expect(s.sourceIds.length).toBeGreaterThan(0);
      else expect(s.assumption).toBeTruthy();
    }
  });

  it("has no execution-status field and rejects one", () => {
    const withStatus = { ...plan, scenarios: [{ ...plan.scenarios[0], status: "passed" }] };
    expect(testPlanSchema.safeParse(withStatus).success).toBe(false);
    expect(JSON.stringify(testPlanSchema.toJSONSchema?.() ?? {})).not.toMatch(/"status"|"passed"|"coverage"/);
  });

  it("rejects untraceable and unknown-source scenarios", () => {
    const base = plan.scenarios[0];
    const variants = [
      { ...base, sourceIds: [] },
      { ...base, basis: "inferred" as const, assumption: undefined },
      { ...base, sourceIds: ["R99"] },
    ];
    for (const s of variants) expect(testPlanSchema.safeParse({ ...plan, scenarios: [s] }).success).toBe(false);
  });
});

const editable = (plan: TestPlan): EditableScenario[] => plan.scenarios.map((s) => ({ ...s, origin: "fixture" }));

describe("export", () => {
  const all = editable(testPlanExampleOutput);

  it("Markdown carries the planning notice, only the selected scenarios, their traces, and origins", () => {
    const md = toMarkdown(testPlanExampleOutput, [all[0], all[7]]);
    expect(md).toContain("> Planning assistance only");
    expect(md).toContain("### TC-01");
    expect(md).toContain("### TC-08");
    expect(md).not.toContain("### TC-02");
    expect(md).toContain('R1 "As a registered user');
    expect(md).toContain("**Inferred risk — assumption:**");
    expect(md).toContain("**Origin:** sample");
    expect(md).toContain("## Open questions");
    expect(md).not.toMatch(/\b(passed|verified)\b/i);
  });

  it("neutralizes pasted Markdown and HTML so exports can't carry links, images, or markup", () => {
    const hostile = { ...all[0], title: "[click](https://evil.test) <img src=x onerror=alert(1)> **bold**" };
    const md = toMarkdown(testPlanExampleOutput, [hostile]);
    expect(md).not.toContain("[click](https://evil.test)");
    // Every "<" is backslash-escaped, so Markdown renders it as literal text.
    expect(md).not.toMatch(/(^|[^\\])<img/);
    expect(md).toContain("\\<img");
    expect(escapeMd("<b>")).toBe("\\<b\\>");
  });

  it("JSON is versioned, round-trips, and keeps per-scenario origin", () => {
    const json = toExportJson(testPlanExampleOutput, [{ ...all[0], origin: "edited" }], new Date("2026-09-27T00:00:00Z"));
    const parsed = JSON.parse(JSON.stringify(json));
    expect(parsed).toMatchObject({ schemaVersion: "test-plan/1", exportedAt: "2026-09-27T00:00:00.000Z" });
    expect(parsed.notice).toMatch(/not been executed/);
    expect(parsed.plan.scenarios).toHaveLength(1);
    expect(parsed.plan.scenarios[0].origin).toBe("edited");
    const { origin: _o, ...scenario } = parsed.plan.scenarios[0];
    expect(testPlanSchema.safeParse({ ...parsed.plan, scenarios: [scenario] }).success).toBe(true);
  });

  it("counts planned scenarios per category", () => {
    const counts = plannedCounts(all);
    expect(Object.keys(counts)).toEqual([...TEST_CATEGORIES]);
    expect(counts.permissions_security).toBe(3);
    expect(counts.boundary).toBe(2);
  });
});

describe("applyScenarioEdit", () => {
  const scenario: EditableScenario = { ...testPlanExampleOutput.scenarios[0], origin: "ai" };
  const inferred: EditableScenario = { ...testPlanExampleOutput.scenarios[7], origin: "ai" };

  it("applies edits, trims lines, and marks the scenario as edited", () => {
    const draft = { ...draftFrom(scenario), title: "  New title ", steps: "one\n\n  two  \n", priority: "low" as const };
    const result = applyScenarioEdit(scenario, draft);
    expect(result.ok && result.scenario).toMatchObject({ id: "TC-01", title: "New title", steps: ["one", "two"], priority: "low", origin: "edited" });
  });

  it("keeps id, basis, and sources — an edit can't turn an assumption into a traced requirement", () => {
    const result = applyScenarioEdit(inferred, { ...draftFrom(inferred), title: "Changed" });
    expect(result.ok && result.scenario).toMatchObject({ id: inferred.id, basis: "inferred", sourceIds: inferred.sourceIds });
  });

  it("returns errors instead of saving an incomplete scenario", () => {
    const result = applyScenarioEdit(inferred, { ...draftFrom(inferred), title: "", steps: " ", expected: "", assumption: "" });
    expect(result).toEqual({
      ok: false,
      errors: ["Add a title.", "Add at least one step.", "Add an expected result.", "Inferred scenarios need their assumption."],
    });
  });

  it("an edited plan still validates", () => {
    const result = applyScenarioEdit(scenario, { ...draftFrom(scenario), steps: "x".repeat(400) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { origin: _o, ...plain } = result.scenario;
    expect(testPlanSchema.safeParse({ ...testPlanExampleOutput, scenarios: [plain] }).success).toBe(true);
  });
});
