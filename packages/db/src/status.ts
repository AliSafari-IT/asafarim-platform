import { prisma } from "./client";

/**
 * Minimal, allow-listed liveness check for the shared platform database.
 * Returns only up/down + latency — never a hostname, port, or connection
 * string. Used by each app's app/api/status/route.ts so the public proof
 * board (apps/showcase/app/proof) can report real, current status without
 * exposing anything about how the database is reached.
 */
export async function pingDb(): Promise<{ ok: boolean; latencyMs: number }> {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - started };
  } catch {
    return { ok: false, latencyMs: Date.now() - started };
  }
}
