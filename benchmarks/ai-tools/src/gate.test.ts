import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { distill } from "./distill";
import { evaluate } from "./evaluate";
import { REPORT_PATH, serialize, SHOWCASE_REPORT_PATH } from "./paths";
import { gateFailures } from "./thresholds";

/**
 * The CI gate. Reads committed reports; never writes them. To accept a
 * change in scores, run `pnpm --filter @asafarim/ai-tools-benchmark
 * bench:generate` and commit the diff.
 */
const report = await evaluate();

describe("AI Workbench eval gate (fixture mode)", () => {
  it("meets every threshold for every tool", () => {
    expect(gateFailures(report)).toEqual([]);
  });

  it("is deterministic", async () => {
    expect(serialize(await evaluate())).toBe(serialize(report));
  });

  it("matches the committed report (run bench:generate to update it intentionally)", () => {
    expect(readFileSync(REPORT_PATH, "utf8")).toBe(serialize(report));
  });

  it("matches the committed Showcase report, which holds no raw content", () => {
    const committed = readFileSync(SHOWCASE_REPORT_PATH, "utf8");
    expect(committed).toBe(serialize(distill(report)));
    expect(committed).not.toMatch(/"(?:input|output|prompt|text|requirement|notes)"\s*:/);
  });

  it("labels itself as a fixture run everywhere", () => {
    expect(report.mode).toBe("fixture");
    expect(report.notice).toMatch(/Not production telemetry/);
  });
});
