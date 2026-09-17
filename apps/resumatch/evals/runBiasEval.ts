import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { JobMatchAiProvider } from "../lib/env";
import { getEvaluationProvider } from "../lib/matching/ai/registry";
import { DEFAULT_BIAS_THRESHOLD, runBiasSuite, type BiasEvalReport } from "./biasHarness";

/**
 * `pnpm --filter @asafarim/jobmatch ai:eval:bias` — runs the JM-046 bias &
 * consistency perturbation-pair suite against the fixture provider (or
 * `JOBMATCH_AI_EVAL_PROVIDER=openai` / `=anthropic` to hit a real one, which
 * costs money and is NEVER done in CI — biasHarness.test.ts is the only
 * suite CI exercises, and only against the fixture provider). Mirrors
 * evals/run.ts's CLI structure and report-writing pattern.
 *
 * Kept as a separate script rather than a flag on the existing `ai:eval`
 * because the two suites answer genuinely different questions (label
 * accuracy vs. pairwise score stability under perturbation) and produce
 * differently-shaped report artifacts — folding them into one script/flag
 * would make both harder to read for no real benefit.
 */

interface BiasReportArtifact {
  generatedAt: string;
  /** First-draft proposal, same posture as evals/run.ts's own
   *  "jm-045-report-draft-1": no JM-005 sign-off exists yet for this report
   *  shape or its threshold. */
  formatVersion: "jm-046-bias-report-draft-1";
  provider: string;
  promptVersion: string;
  threshold: number;
  thresholdStatus: string;
  dimensionsTested: string[];
  totalPairs: number;
  flaggedPairs: number;
  pairs: {
    id: string;
    dimension: string;
    description: string;
    variantA: { suitabilityScore: number; confidence: number };
    variantB: { suitabilityScore: number; confidence: number };
    deltaSuitabilityScore: number;
    deltaConfidence: number;
    flagged: boolean;
  }[];
}

function buildReportArtifact(report: BiasEvalReport): BiasReportArtifact {
  const dimensionsTested = [...new Set(report.results.map((r) => r.dimension))];
  return {
    generatedAt: new Date().toISOString(),
    formatVersion: "jm-046-bias-report-draft-1",
    provider: report.provider,
    promptVersion: report.promptVersion,
    threshold: report.threshold,
    thresholdStatus: report.thresholdStatus,
    dimensionsTested,
    totalPairs: report.totalPairs,
    flaggedPairs: report.flaggedPairs,
    pairs: report.results.map((r) => ({
      id: r.id,
      dimension: r.dimension,
      description: r.description,
      variantA: r.variantA,
      variantB: r.variantB,
      deltaSuitabilityScore: r.deltaSuitabilityScore,
      deltaConfidence: r.deltaConfidence,
      flagged: r.flagged,
    })),
  };
}

function buildHumanSummary(report: BiasEvalReport): string {
  const lines: string[] = [];
  lines.push(`# JM-046 Bias & Consistency Evaluation`);
  lines.push("");
  lines.push(`- Provider: ${report.provider}`);
  lines.push(`- Prompt version: ${report.promptVersion}`);
  lines.push(`- Threshold: |Δ suitabilityScore| / |Δ confidence| <= ${report.threshold}`);
  lines.push(
    `  - **Status: ${report.thresholdStatus}.** This threshold is a reasonable default proposed by this ` +
      `harness, not an approved compliance value — it is pending sign-off by the JM-005 owner as adequate ` +
      `for the AI Act classification file, per JM-046's own acceptance criteria.`,
  );
  lines.push(`- Pairs evaluated: ${report.totalPairs}`);
  lines.push(`- Pairs flagged: ${report.flaggedPairs}`);
  lines.push("");
  lines.push("## Per-pair results");
  lines.push("");
  for (const r of report.results) {
    const tag = r.flagged ? "FLAGGED" : "ok";
    lines.push(
      `- [${tag}] **${r.dimension}** (\`${r.id}\`) — Δscore=${r.deltaSuitabilityScore.toFixed(3)} ` +
        `Δconfidence=${r.deltaConfidence.toFixed(3)}`,
    );
  }
  lines.push("");
  if (report.flaggedPairs > 0) {
    lines.push(
      "One or more pairs exceeded the threshold above — see the JSON artifact for full detail. A flagged " +
        "pair is a signal for the JM-005 owner to review, not an automatic conclusion of unlawful bias.",
    );
  } else {
    lines.push("No pairs exceeded the threshold on this run.");
  }
  return lines.join("\n");
}

async function main() {
  const provider = (process.env.JOBMATCH_AI_EVAL_PROVIDER ?? "fixture") as JobMatchAiProvider;
  const evaluationProvider = await getEvaluationProvider(provider);
  const report = await runBiasSuite(evaluationProvider, DEFAULT_BIAS_THRESHOLD);

  for (const r of report.results) {
    const tag = r.flagged ? "FLAG" : "ok  ";
    console.log(
      `${tag}  ${r.id.padEnd(32)} [${r.dimension.padEnd(28)}] ` +
        `Δscore=${r.deltaSuitabilityScore.toFixed(3)} Δconf=${r.deltaConfidence.toFixed(3)}`,
    );
  }
  console.log(`\n${report.flaggedPairs}/${report.totalPairs} pairs flagged  (provider=${report.provider})`);
  console.log(`prompt version: ${report.promptVersion}`);
  console.log(`threshold: ${report.threshold} (${report.thresholdStatus})`);

  // A report artifact is only useful for the compliance record when produced
  // by a real (billable) provider run — the fixture-only run is what CI
  // already gates on via biasHarness.test.ts's negative control, and writing
  // one on every local fixture invocation would just be noise.
  if (provider !== "fixture") {
    const artifact = buildReportArtifact(report);
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const outDir = path.join(dir, "reports");
    await mkdir(outDir, { recursive: true });
    const jsonPath = path.join(outDir, `bias-${report.promptVersion}.json`);
    await writeFile(jsonPath, JSON.stringify(artifact, null, 2), "utf8");
    const summaryPath = path.join(outDir, `bias-${report.promptVersion}.md`);
    await writeFile(summaryPath, buildHumanSummary(report), "utf8");
    console.log(`\nreport artifact written: ${jsonPath}`);
    console.log(`human-readable summary written: ${summaryPath}`);
    console.log(
      'NOTE: this report format (formatVersion: "jm-046-bias-report-draft-1") and threshold are a first-draft',
    );
    console.log("proposal, pending sign-off by the JM-005 owner per JM-046's acceptance criteria.");
  }

  if (report.flaggedPairs > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
