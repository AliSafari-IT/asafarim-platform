/**
 * Worker smoke test (#787): runs ONE cycle of every periodic worker job, with
 * the exact loader the production worker uses
 * (`tsx --import ./worker/server-only-noop.mjs`, see package.json
 * `worker:smoke` and the Dockerfile `worker` stage), against the throwaway
 * test database. Exits non-zero if any job throws, e.g. a module that can't be
 * resolved outside Next.js (#363, #787).
 *
 * Only the test database: it refuses to run without TASKSAI_TEST_DATABASE_URL
 * and points TASKSAI_DATABASE_URL at it before anything reads the env.
 */
import { requireTestDatabaseUrl } from "../lib/db/test-database";

async function main() {
  process.env.TASKSAI_DATABASE_URL = requireTestDatabaseUrl();
  const { WORKER_JOBS } = await import("./jobs");

  const failures: string[] = [];
  for (const job of WORKER_JOBS) {
    try {
      await job.run();
      console.log(`ok    ${job.name}`);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      failures.push(job.name);
      console.log(`FAIL  ${job.name}: ${e.code ?? ""} ${String(e.message ?? err).split("\n")[0]}`);
    }
  }

  const { getTasksAiDb } = await import("../lib/db/client");
  await getTasksAiDb().$disconnect();

  if (failures.length) {
    console.log(`\n${failures.length} of ${WORKER_JOBS.length} worker jobs failed: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log(`\nall ${WORKER_JOBS.length} worker jobs ran one cycle`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
