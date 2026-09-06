import { describe, expect, it } from "vitest";
import { runEvals } from "./harness";

/**
 * The eval set must pass against the fixture provider in CI, with no
 * billable call. This is the M06 exit gate for "fixture mode runs in CI".
 */
describe("offline evals (fixture)", () => {
  it("all cases pass against the fixture provider", async () => {
    const report = await runEvals("fixture");
    const failed = report.results.filter((r) => !r.pass);
    expect(failed, JSON.stringify(failed, null, 2)).toHaveLength(0);
    expect(report.passed).toBe(report.total);
  });

  it("every case costs $0 and is deterministic", async () => {
    const report = await runEvals("fixture");
    for (const r of report.results) {
      expect(r.metrics.costUsd).toBe(0);
      expect(r.metrics.consistent).toBe(true);
    }
  });

  it("reports the prompt version for each kind", async () => {
    const report = await runEvals("fixture");
    expect(report.promptVersions.extract_plan).toMatch(/^extract_plan@\d+$/);
  });
});
