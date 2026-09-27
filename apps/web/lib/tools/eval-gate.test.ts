import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { toolFailures } from "../../../../benchmarks/ai-tools/src/thresholds";
import type { EvalReport } from "../../../../benchmarks/ai-tools/src/evaluate";
import { toolCatalogue } from "../../content/tools";
import { toolAdapters } from "./server/adapters";

/**
 * Charter §4 + #679: a tool can't serve live AI results, or be beta/stable,
 * unless the committed eval report covers its current tool and schema
 * versions and passes every gate. Regenerate the report with
 * `pnpm --filter @asafarim/ai-tools-benchmark bench:generate`.
 */
const report = JSON.parse(readFileSync(path.resolve(__dirname, "../../../../benchmarks/ai-tools/reports/fixture-report.json"), "utf8")) as EvalReport;

describe("eval gate for live and promoted tools", () => {
  const gated = toolCatalogue.filter((t) => !t.internal && (t.liveGeneration || t.lifecycle === "beta" || t.lifecycle === "stable"));

  it.each(gated.map((t) => [t.slug, t] as const))("%s has a passing eval report for its current versions", (slug) => {
    const entry = report.tools.find((t) => t.slug === slug);
    expect(entry, `${slug} is missing from the eval report`).toBeDefined();
    expect(entry!.toolVersion).toBe(toolAdapters[slug].version);
    expect(entry!.schemaVersion).toBe(toolAdapters[slug].schemaVersion);
    expect(toolFailures(entry!)).toEqual([]);
  });

  it("covers every public (non-internal) tool, even while experimental", () => {
    const missing = toolCatalogue.filter((t) => !t.internal && !report.tools.some((r) => r.slug === t.slug)).map((t) => t.slug);
    expect(missing).toEqual([]);
  });
});
