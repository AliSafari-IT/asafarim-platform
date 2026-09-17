import { describe, expect, it } from "vitest";
import { runEvalSuite } from "./harness";

/**
 * The eval set must pass against the fixture provider in CI, with no
 * billable call and no database. This is the JM-045 exit gate: "`pnpm
 * --filter @asafarim/jobmatch ai:eval` green, $0, on the fixture provider."
 * Mirrors apps/tasks-ai/evals/harness.test.ts's assertion style exactly.
 */
describe("offline evals (fixture)", () => {
  it("all cases pass against the fixture provider", async () => {
    const report = await runEvalSuite("fixture");
    const failed = report.results.filter((r) => !r.pass);
    expect(failed, JSON.stringify(failed, null, 2)).toHaveLength(0);
    expect(report.passed).toBe(report.total);
  });

  it("every case costs $0 and is deterministic", async () => {
    const report = await runEvalSuite("fixture");
    expect(report.totalCostUsd).toBe(0);
    for (const r of report.results) {
      expect(r.metrics.costUsd).toBe(0);
      expect(r.metrics.consistent).toBe(true);
    }
  });

  it("covers every required category from the JM-045 acceptance criteria", async () => {
    const report = await runEvalSuite("fixture");
    const categories = new Set(report.results.map((r) => r.category));
    const requiredCategories = [
      "positive",
      "negative",
      "borderline",
      "multilingual-nl",
      "multilingual-fr",
      "sparse-cv",
      "stale-job",
      "missing-requirement",
    ] as const;
    for (const required of requiredCategories) {
      expect(categories.has(required), `missing eval coverage for category "${required}"`).toBe(true);
    }
  });

  it("reports the current evaluation prompt version", async () => {
    const report = await runEvalSuite("fixture");
    expect(report.promptVersion).toMatch(/^match_evaluate@\d+$/);
  });
});
