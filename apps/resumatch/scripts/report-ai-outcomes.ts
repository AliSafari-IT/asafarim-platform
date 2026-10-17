/**
 * Operator report: AI provider-call reliability per call kind over the last
 * 24 hours and 7 days (issue #512). Read-only; prints JSON to stdout.
 *
 *   pnpm --filter @asafarim/resumatch report:ai-outcomes
 *
 * The output carries call kinds, counts, rates and average attempts. Never
 * workspace ids, prompts, responses or error messages.
 */
import { buildOutcomeReport } from "../lib/ai/callOutcomeReport";
import { getJobmatchDb } from "../lib/db/client";

async function main(): Promise<void> {
  const db = getJobmatchDb();
  try {
    const report = await buildOutcomeReport(db, new Date());
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  // The error name only: a database error can echo connection details.
  process.stderr.write(`report:ai-outcomes failed: ${error instanceof Error ? error.name : "unknown error"}\n`);
  process.exitCode = 1;
});
