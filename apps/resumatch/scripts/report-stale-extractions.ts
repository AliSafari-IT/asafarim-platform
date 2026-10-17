/**
 * Operator report: profile versions extracted by older extractor code
 * (issue #523). Read-only; prints JSON to stdout.
 *
 *   pnpm --filter @asafarim/resumatch report:stale-extractions
 *
 * The output carries ids, version stamps, dates and whether the source
 * document can still be re-read. Never profile content or file names.
 * Nothing is re-extracted: re-extraction is opt-in only (see
 * lib/extraction/staleVersions.ts).
 */
import { getJobmatchDb } from "../lib/db/client";
import { listStaleProfileVersions, summarizeStaleVersions } from "../lib/extraction/staleVersions";

async function main(): Promise<void> {
  const db = getJobmatchDb();
  try {
    const now = new Date();
    const versions = await listStaleProfileVersions(db, { now });
    process.stdout.write(`${JSON.stringify(summarizeStaleVersions(versions, now), null, 2)}\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  // The error name only: a database error can echo connection details.
  process.stderr.write(`report:stale-extractions failed: ${error instanceof Error ? error.name : "unknown error"}\n`);
  process.exitCode = 1;
});
