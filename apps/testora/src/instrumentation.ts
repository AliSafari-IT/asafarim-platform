/**
 * Runs once when the Testora server starts. Boots the durable run queue's
 * worker (#716): runs a previous instance left "running" become
 * `error: "runner lost"`, and runs left queued resume — without waiting for
 * someone to start a new run.
 */
export async function register() {
  // The queue uses node:os/pg — Node.js runtime only (never the edge).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Fail closed (#726): in production, refuse to start without a strong
  // TESTORA_SECRET — it protects target secrets, GitHub tokens and frozen jobs.
  const { testoraSecretProblem } = await import("@/lib/secret-config");
  const problem = testoraSecretProblem(process.env);
  if (problem) {
    throw new Error(`Testora refuses to start: ${problem}. Set a random value of at least 32 characters in .env.production.age.`);
  }
  const { ensureRunWorker } = await import("@/test-engine/executors/runLog");
  // Don't hold up startup on the database; the worker retries on its tick.
  void ensureRunWorker();
}
