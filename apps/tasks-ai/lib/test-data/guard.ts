/**
 * Which TasksAI databases the test-data script may write (#742 slice 2b).
 * Judges the raw TASKSAI_DATABASE_URL.
 *   - Production (NODE_ENV=production, or the compose host `tasksai-postgres`):
 *     refused unless `--allow-production-baseline` (owner only), which then
 *     provisions only the read-only remote-smoke baseline.
 *   - The platform database (equal to DATABASE_URL): always refused.
 *   - Another non-local host (a remote test environment): needs
 *     `--confirm-host=<that host>`.
 *   - Local: full test data.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"]);
export const PRODUCTION_HOST = "tasksai-postgres";

export type TestDataMode = "full" | "production-baseline";

export type GuardDecision = { ok: true; mode: TestDataMode; host: string } | { ok: false; reason: string };

export function testDataGuard(input: {
  rawDatabaseUrl: string;
  platformDatabaseUrl?: string;
  nodeEnv?: string;
  allowProductionBaseline?: boolean;
  confirmHost?: string;
}): GuardDecision {
  let url: URL;
  try {
    url = new URL(input.rawDatabaseUrl);
  } catch {
    return { ok: false, reason: "TASKSAI_DATABASE_URL is not a valid URL." };
  }
  const host = url.hostname;
  if (input.platformDatabaseUrl && sameDatabase(url, input.platformDatabaseUrl)) {
    return { ok: false, reason: "TASKSAI_DATABASE_URL points at the platform database. Refusing." };
  }
  const production = input.nodeEnv === "production" || host === PRODUCTION_HOST;
  if (production) {
    if (!input.allowProductionBaseline) {
      return {
        ok: false,
        reason:
          "This looks like the PRODUCTION TasksAI database. Refusing. Only the owner may create the read-only remote-smoke baseline there, with --allow-production-baseline.",
      };
    }
    return { ok: true, mode: "production-baseline", host };
  }
  if (input.allowProductionBaseline) {
    return { ok: false, reason: "--allow-production-baseline is only for the production database; this one isn't." };
  }
  if (!LOCAL_HOSTS.has(host) && input.confirmHost !== host) {
    return { ok: false, reason: `Database host "${host}" is not local. Re-run with --confirm-host=${host} if it is a test environment.` };
  }
  return { ok: true, mode: "full", host };
}

function sameDatabase(a: URL, raw: string): boolean {
  try {
    const b = new URL(raw);
    return a.hostname === b.hostname && (a.port || "5432") === (b.port || "5432") && a.pathname === b.pathname;
  } catch {
    return false;
  }
}
