/**
 * Job fit benchmark runner (#971). See evals/jobFit/README.md.
 *
 *   pnpm --filter @asafarim/resumatch eval:job-fit deterministic
 *   RESUMATCH_EVAL_ALLOW_PROVIDER=1 pnpm --filter @asafarim/resumatch \
 *     eval:job-fit provider --provider openai --max-cases 18 --max-cost 0.5
 *
 * Synthetic cases only. Reports carry ids, versions and numbers; the
 * review sheet (synthetic replies) is written under evals/jobFit/out/,
 * which git ignores.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FIT_EVAL_CASES } from "../evals/jobFit/cases";
import { MAX_PROVIDER_CASES, runFitProvider } from "../evals/jobFit/provider";
import { runDeterministic } from "../evals/jobFit/run";

const OUT = path.join(process.cwd(), "evals/jobFit/out");

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
  if (command === "deterministic") {
    process.stdout.write(`${JSON.stringify(runDeterministic(FIT_EVAL_CASES).report, null, 2)}\n`);
    return;
  }
  if (command === "provider") {
    if (process.env.RESUMATCH_EVAL_ALLOW_PROVIDER !== "1") {
      throw new Error("Real-provider runs cost money. Set RESUMATCH_EVAL_ALLOW_PROVIDER=1 to confirm.");
    }
    const providerName = (arg("provider") ?? "openai") as "openai" | "anthropic";
    if (providerName !== "openai" && providerName !== "anthropic") throw new Error("--provider must be openai or anthropic.");
    const maxCases = Math.min(Number(arg("max-cases") ?? MAX_PROVIDER_CASES), MAX_PROVIDER_CASES);
    const maxCostUsd = Number(arg("max-cost") ?? "0.5");
    if (!Number.isFinite(maxCases) || maxCases < 1 || !Number.isFinite(maxCostUsd) || maxCostUsd <= 0) throw new Error("Invalid --max-cases or --max-cost.");
    const { getFitProvider, FIT_MODEL_VERSIONS } = await import("../lib/tailoring/fit/ai/registry");
    const model = arg("model") ?? FIT_MODEL_VERSIONS[providerName];
    const provider = await getFitProvider(providerName);
    const { report, review } = await runFitProvider({ provider, providerName, model, cases: FIT_EVAL_CASES, maxCases, maxCostUsd });
    const reportPath = write("provider-report.json", report);
    const reviewPath = write("review.json", review);
    process.stdout.write(`Provider report: ${reportPath}\nReview sheet: ${reviewPath}\n`);
    process.stdout.write(`${JSON.stringify({ ...report, records: undefined }, null, 2)}\n`);
    process.exitCode = report.releaseGo ? 0 : 1;
    return;
  }
  throw new Error(`Unknown command "${command}". Use deterministic or provider.`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
