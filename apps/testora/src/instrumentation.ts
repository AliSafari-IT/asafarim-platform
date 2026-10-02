/**
 * Runs once when the Testora server starts. Boots the durable run queue's
 * worker (#716): runs a previous instance left "running" become
 * `error: "runner lost"`, and runs left queued resume — without waiting for
 * someone to start a new run.
 */
export async function register() {
  // The queue uses node:os/pg — Node.js runtime only (never the edge).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureRunWorker } = await import("@/test-engine/executors/runLog");
  // Don't hold up startup on the database; the worker retries on its tick.
  void ensureRunWorker();
}
