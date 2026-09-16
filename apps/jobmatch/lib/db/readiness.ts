import { getJobmatchDb } from "./client";

/**
 * Allow-listed liveness probe. Returns up/down and latency only — never a
 * hostname, port, database name, or driver error message, since
 * `/api/health` is unauthenticated by design (the showcase proof board and
 * the Docker healthcheck both call it without a session).
 *
 * No `import "server-only"` — this module is imported directly by
 * `worker/index.ts` (plain Node/tsx, not bundled by Next.js), and that
 * package's resolution fails outside a Next.js build. See client.ts's doc
 * comment; same root cause as TasksAI's production incident (issue #363).
 */
export async function pingJobMatchDb(): Promise<{ ok: boolean; latencyMs: number }> {
  const started = Date.now();
  try {
    await getJobmatchDb().$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - started };
  } catch {
    return { ok: false, latencyMs: Date.now() - started };
  }
}
