import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { JobMatchAiProvider } from "../lib/env";
import { EVAL_CASES } from "./cases";
import { runEvalSuite, type EvalReport } from "./harness";

/**
 * `pnpm --filter @asafarim/jobmatch ai:eval` — runs the offline eval set
 * against the fixture provider (or `JOBMATCH_AI_EVAL_PROVIDER=openai` /
 * `=anthropic` to hit a real one, which costs money and is NEVER done in
 * CI — the fixture provider is the only one exercised by harness.test.ts).
 * Mirrors apps/tasks-ai/evals/run.ts's CLI structure. Exits non-zero on any
 * failure so it can gate a release.
 */

interface ReportArtifact {
  generatedAt: string;
  /**
   * First-draft proposal (JM-045 acceptance criteria: "Report artifact
   * format agreed with whoever owns the M5 precision threshold — JM-009 KPI
   * dictionary"). No `docs/jm-009*` file exists in this repo yet to agree
   * this shape against, so this is a reasonable default pending real
   * sign-off, not a finalised contract.
   */
  formatVersion: "jm-045-report-draft-1";
  provider: string;
  promptVersion: string;
  totalCases: number;
  passedCases: number;
  totalCostUsd: number;
  determinismFailures: string[];
  perLanguage: Record<string, { cases: number; passed: number; avgSuitabilityScore: number; avgConfidence: number }>;
  perCategory: Record<string, { cases: number; passed: number; avgSuitabilityScore: number }>;
  cases: {
    id: string;
    category: string;
    pass: boolean;
    failures: string[];
    suitabilityScore: number;
    confidence: number;
    recommendedAction: string;
    costUsd: number;
    latencyMs: number;
  }[];
}

function buildReportArtifact(report: EvalReport): ReportArtifact {
  const languageById = new Map(EVAL_CASES.map((c) => [c.id, c.posting.language]));

  const perLanguage: ReportArtifact["perLanguage"] = {};
  const perCategory: ReportArtifact["perCategory"] = {};

  for (const r of report.results) {
    const language = languageById.get(r.id) ?? "unknown";
    perLanguage[language] ??= { cases: 0, passed: 0, avgSuitabilityScore: 0, avgConfidence: 0 };
    perLanguage[language].cases += 1;
    if (r.pass) perLanguage[language].passed += 1;
    perLanguage[language].avgSuitabilityScore += r.metrics.suitabilityScore;
    perLanguage[language].avgConfidence += r.metrics.confidence;

    perCategory[r.category] ??= { cases: 0, passed: 0, avgSuitabilityScore: 0 };
    perCategory[r.category].cases += 1;
    if (r.pass) perCategory[r.category].passed += 1;
    perCategory[r.category].avgSuitabilityScore += r.metrics.suitabilityScore;
  }
  for (const bucket of Object.values(perLanguage)) {
    bucket.avgSuitabilityScore /= bucket.cases;
    bucket.avgConfidence /= bucket.cases;
  }
  for (const bucket of Object.values(perCategory)) {
    bucket.avgSuitabilityScore /= bucket.cases;
  }

  return {
    generatedAt: new Date().toISOString(),
    formatVersion: "jm-045-report-draft-1",
    provider: report.provider,
    promptVersion: report.promptVersion,
    totalCases: report.total,
    passedCases: report.passed,
    totalCostUsd: report.totalCostUsd,
    determinismFailures: report.results.filter((r) => !r.metrics.consistent).map((r) => r.id),
    perLanguage,
    perCategory,
    cases: report.results.map((r) => ({
      id: r.id,
      category: r.category,
      pass: r.pass,
      failures: r.failures,
      suitabilityScore: r.metrics.suitabilityScore,
      confidence: r.metrics.confidence,
      recommendedAction: r.metrics.recommendedAction,
      costUsd: r.metrics.costUsd,
      latencyMs: r.metrics.latencyMs,
    })),
  };
}

async function main() {
  const provider = (process.env.JOBMATCH_AI_EVAL_PROVIDER ?? "fixture") as JobMatchAiProvider;
  const report = await runEvalSuite(provider);

  for (const r of report.results) {
    const tag = r.pass ? "PASS" : "FAIL";
    console.log(
      `${tag}  ${r.id.padEnd(36)} [${r.category.padEnd(20)}] ` +
        `action=${r.metrics.recommendedAction.padEnd(20)} score=${r.metrics.suitabilityScore.toFixed(3)} ` +
        `conf=${r.metrics.confidence.toFixed(2)} lat=${r.metrics.latencyMs}ms cost=$${r.metrics.costUsd.toFixed(4)}` +
        (r.failures.length ? `  — ${r.failures.join("; ")}` : ""),
    );
  }
  console.log(`\n${report.passed}/${report.total} passed  (provider=${report.provider})`);
  console.log(`prompt version: ${report.promptVersion}`);
  console.log(`total cost: $${report.totalCostUsd.toFixed(4)}`);

  // A report artifact is only useful for the M5 exit decision when it was
  // produced by a real (billable) provider run — a fixture-only run is what
  // CI already gates on via harness.test.ts, and writing one on every local
  // `pnpm ai:eval` invocation would just be noise.
  if (provider !== "fixture") {
    const artifact = buildReportArtifact(report);
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const outDir = path.join(dir, "reports");
    await mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, `eval-report-${provider}-${Date.now()}.json`);
    await writeFile(outPath, JSON.stringify(artifact, null, 2), "utf8");
    console.log(`\nreport artifact written: ${outPath}`);
    console.log("NOTE: this report format (formatVersion: \"jm-045-report-draft-1\") is a first-draft proposal,");
    console.log("pending agreement with the JM-009 KPI dictionary owner per JM-045's acceptance criteria.");
  }

  if (report.passed !== report.total) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
