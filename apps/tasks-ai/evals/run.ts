import { runEvals } from "./harness";

/**
 * `pnpm --filter @asafarim/tasks-ai ai:eval` — runs the offline eval set
 * against the fixture provider (or `AI_EVAL_PROVIDER=anthropic` to hit a
 * real one, which costs money and is never done in CI). Exits non-zero on
 * any failure so it can gate a release.
 */
async function main() {
  const provider = process.env.AI_EVAL_PROVIDER ?? "fixture";
  const report = await runEvals(provider);
  for (const r of report.results) {
    const tag = r.pass ? "PASS" : "FAIL";
    console.log(
      `${tag}  ${r.id.padEnd(20)} ops=${r.metrics.ops} grounded=${r.metrics.groundedRatio.toFixed(2)} ` +
        `lat=${r.metrics.latencyMs}ms cost=$${r.metrics.costUsd.toFixed(4)}` +
        (r.failures.length ? `  — ${r.failures.join("; ")}` : ""),
    );
  }
  console.log(`\n${report.passed}/${report.total} passed  (provider=${report.provider})`);
  console.log("prompt versions:", report.promptVersions);
  if (report.passed !== report.total) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
