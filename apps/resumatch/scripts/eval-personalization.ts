/**
 * Personalization evaluation runner (#934). See
 * evals/personalization/README.md for the procedure.
 *
 *   pnpm --filter @asafarim/resumatch eval:personalization deterministic
 *   RESUMATCH_EVAL_ALLOW_PROVIDER=1 pnpm --filter @asafarim/resumatch \
 *     eval:personalization provider --provider openai --max-cases 10 --max-cost 2
 *   pnpm --filter @asafarim/resumatch eval:personalization decide \
 *     --provider-report evals/personalization/out/provider-report.json \
 *     --review evals/personalization/out/review.json
 *
 * Synthetic cases only. Reports carry ids, versions and numbers; the
 * review sheet (synthetic replies) is written under evals/personalization/out/,
 * which git ignores.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { EVAL_CASES } from "../evals/personalization/cases";
import { decide } from "../evals/personalization/decision";
import { DEFAULT_PROVIDER_CASES, MAX_PROVIDER_CASES, runProviderComparison, type ProviderRunReport, type ReviewItem } from "../evals/personalization/provider";
import { runDeterministic } from "../evals/personalization/run";

const OUT = path.join(process.cwd(), "evals/personalization/out");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function write(file: string, value: unknown): string {
  mkdirSync(OUT, { recursive: true });
  const target = path.join(OUT, file);
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  return target;
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "deterministic";
  const { report } = runDeterministic(EVAL_CASES);

  if (command === "deterministic") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.deterministicGo ? 0 : 1;
    return;
  }

  if (command === "provider") {
    if (process.env.RESUMATCH_EVAL_ALLOW_PROVIDER !== "1") {
      throw new Error("Real-provider runs cost money. Set RESUMATCH_EVAL_ALLOW_PROVIDER=1 to confirm.");
    }
    const providerName = (arg("provider") ?? "openai") as "openai" | "anthropic";
    if (providerName !== "openai" && providerName !== "anthropic") throw new Error("--provider must be openai or anthropic.");
    const maxCases = Math.min(Number(arg("max-cases") ?? DEFAULT_PROVIDER_CASES), MAX_PROVIDER_CASES);
    const maxCostUsd = Number(arg("max-cost") ?? "2");
    if (!Number.isFinite(maxCases) || maxCases < 1 || !Number.isFinite(maxCostUsd) || maxCostUsd <= 0) throw new Error("Invalid --max-cases or --max-cost.");
    const { getTailorProvider, tailorModelVersionFor, TAILOR_PROMPT_VERSION } = await import("../lib/tailoring/ai/registry");
    const model = arg("model") ?? tailorModelVersionFor(providerName);
    const provider = await getTailorProvider(providerName);
    const { report: providerReport, review } = await runProviderComparison({ provider, providerName, model, promptVersion: TAILOR_PROMPT_VERSION, cases: EVAL_CASES, maxCases, maxCostUsd });
    const reportPath = write("provider-report.json", providerReport);
    const reviewPath = write("review.json", review);
    process.stdout.write(`Provider report: ${reportPath}\nReview sheet (fill in, see rubric.md): ${reviewPath}\n`);
    process.stdout.write(`${JSON.stringify({ ...providerReport, records: undefined }, null, 2)}\n`);
    return;
  }

  if (command === "decide") {
    const providerPath = arg("provider-report");
    const reviewPath = arg("review");
    const providerReport = providerPath ? (JSON.parse(readFileSync(providerPath, "utf8")) as ProviderRunReport) : null;
    const review = reviewPath ? (JSON.parse(readFileSync(reviewPath, "utf8")) as ReviewItem[]) : null;
    const decision = decide(report, providerReport, review);
    const summary = {
      deterministic: report,
      provider: providerReport ? { ...providerReport, records: undefined } : null,
      decision,
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    process.exitCode = decision.decision === "go" ? 0 : 1;
    return;
  }

  throw new Error(`Unknown command ${command}. Use deterministic, provider or decide.`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
