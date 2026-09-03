import "server-only";
import { getJobmatchDb } from "./client";

/**
 * Allow-listed liveness probe. Returns up/down and latency only — never a
 * hostname, port, database name, or driver error message, since
 * `/api/health` is unauthenticated by design (the showcase proof board and
 * the Docker healthcheck both call it without a session).
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
