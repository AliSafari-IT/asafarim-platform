import { sql } from "drizzle-orm";
import { getDb } from "./client";

/** True if a trivial query round-trips. Used by the health endpoint and readiness waits. */
export async function pingDb(): Promise<boolean> {
  try {
    await getDb().execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Polls until the database answers or the timeout elapses. Intended for
 * one-shot scripts/CLI entry points (e.g. a future migrate-and-wait job) —
 * request handlers should call `pingDb()` directly instead of blocking.
 */
export async function waitForDatabase(
  { timeoutMs = 30_000, intervalMs = 500 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await pingDb()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`APPBUILDER_DATABASE_URL unreachable after ${timeoutMs}ms`);
}
