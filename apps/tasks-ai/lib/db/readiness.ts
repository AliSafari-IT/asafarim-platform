import "server-only";

export interface DbReadiness {
  ok: boolean;
  /** Latency of the probe query in milliseconds, when it succeeded. */
  latencyMs?: number;
  /** Error class name only — never the message, which can carry the DSN. */
  error?: string;
}

/**
 * Cheap liveness probe for the dedicated TasksAI database. Used by
 * /api/health and the worker's health endpoint. Imports the client lazily
 * so a health check can still answer when the client fails to construct
 * (e.g. env not resolved).
 */
export async function pingTasksAiDb(): Promise<DbReadiness> {
  const started = Date.now();
  try {
    const { getTasksAiDb } = await import("./client");
    await getTasksAiDb().$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.name : "UnknownError" };
  }
}
