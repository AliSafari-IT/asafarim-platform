/**
 * Which TasksAI databases the test-data script may write (#742 slice 2b).
 * Fail closed: three independent signals, and any production-like one
 * refuses (same model as the platform-side identities CLI, #745 review).
 *
 *  1. The URL. "Local" is proven positively: loopback AND the development port
 *     from docker-compose.yml. Production publishes TasksAI's Postgres on the
 *     production host's loopback (docker-compose.prod.yml: 127.0.0.1:5438), so
 *     loopback on any other port — the default included — is production
 *     (on that host, or through an SSH tunnel to it). The compose host
 *     `tasksai-postgres` and NODE_ENV=production are production too.
 *  2. The machine. Hostname "asafarim" or a checkout under
 *     /var/repos/asafarim-com (the deploy layout) is production.
 *  3. The database (checked by the CLI before any write, see
 *     checkDatabaseMarker): COMMENT ON DATABASE 'asafarim-env=development' (or
 *     test), set once with --mark-database. Production never has it.
 *
 * The platform database (equal to DATABASE_URL) is always refused.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
/** TasksAI's development port (docker-compose.yml "127.0.0.1:55438:5432"); pinned by a test. */
export const DEV_TASKSAI_DB_PORTS = ["55438"] as const;
export const PRODUCTION_HOST = "tasksai-postgres";
const PRODUCTION_HOSTNAMES = new Set(["asafarim"]);
const PRODUCTION_CHECKOUT = "/var/repos/asafarim-com";

export type TestDataMode = "full" | "production-baseline";
export type DatabaseEnvironment = "development" | "test" | "production";

export type GuardDecision =
  | { ok: true; mode: TestDataMode; environment: DatabaseEnvironment; host: string }
  | { ok: false; reason: string };

export function testDataGuard(input: {
  rawDatabaseUrl: string;
  platformDatabaseUrl?: string;
  nodeEnv?: string;
  allowProductionBaseline?: boolean;
  confirmHost?: string;
  /** os.hostname() */
  machineHostname?: string;
  /** process.cwd() */
  cwd?: string;
}): GuardDecision {
  let url: URL;
  try {
    url = new URL(input.rawDatabaseUrl);
  } catch {
    return { ok: false, reason: "TASKSAI_DATABASE_URL is not a valid URL." };
  }
  const host = url.hostname;
  const port = url.port || "5432";
  if (input.platformDatabaseUrl && sameDatabase(url, input.platformDatabaseUrl)) {
    return { ok: false, reason: "TASKSAI_DATABASE_URL points at the platform database. Refusing." };
  }
  const loopback = LOOPBACK_HOSTS.has(host);
  const devLoopback = loopback && (DEV_TASKSAI_DB_PORTS as readonly string[]).includes(port);
  const productionMachine =
    (input.machineHostname !== undefined && PRODUCTION_HOSTNAMES.has(input.machineHostname)) ||
    (input.cwd !== undefined && input.cwd.replace(/\\/g, "/").startsWith(PRODUCTION_CHECKOUT));

  const why: string[] = [];
  if (input.nodeEnv === "production") why.push("NODE_ENV=production");
  if (host === PRODUCTION_HOST) why.push(`the production compose host "${PRODUCTION_HOST}"`);
  if (loopback && !devLoopback) why.push(`loopback on port ${port}, not a development port (${DEV_TASKSAI_DB_PORTS.join(", ")})`);
  if (productionMachine) why.push("running on the production host");

  if (why.length) {
    if (!input.allowProductionBaseline) {
      return {
        ok: false,
        reason: `Treating this as the PRODUCTION TasksAI database (${why.join("; ")}). Refusing. Only the owner may create the read-only remote-smoke baseline there, with --allow-production-baseline.`,
      };
    }
    return { ok: true, mode: "production-baseline", environment: "production", host };
  }
  if (input.allowProductionBaseline) {
    return { ok: false, reason: "--allow-production-baseline is only for the production database; this one isn't." };
  }
  if (devLoopback) return { ok: true, mode: "full", environment: "development", host };
  if (input.confirmHost !== host) {
    return { ok: false, reason: `Database host "${host}" is not the local development database. Re-run with --confirm-host=${host} if it is a test environment.` };
  }
  return { ok: true, mode: "full", environment: "test", host };
}

export const DATABASE_MARKER_PREFIX = "asafarim-env=";

/** Parse the environment out of a database comment ("asafarim-env=<x>"). */
export function parseDatabaseMarker(comment: string | null | undefined): string | null {
  return new RegExp(`${DATABASE_MARKER_PREFIX}([a-z]+)`).exec(comment ?? "")?.[1] ?? null;
}

/**
 * Signal 3: the database must agree with the static decision. development and
 * test require their marker; production refuses a database marked dev/test.
 */
export function checkDatabaseMarker(expected: DatabaseEnvironment, marker: string | null): { ok: true } | { ok: false; reason: string } {
  // The deploy stamps production databases positively (#747): that wins over
  // anything the URL suggests (e.g. a tunnel onto a development port).
  if (marker === "production" && expected !== "production") {
    return { ok: false, reason: 'This database is marked "production" (stamped by the deploy). Refusing, whatever the URL looks like.' };
  }
  if (expected === "production") {
    return marker === "development" || marker === "test"
      ? { ok: false, reason: `The URL looks like production but the database is marked "${marker}". Signals disagree; refusing.` }
      : { ok: true };
  }
  if (marker === expected) return { ok: true };
  return {
    ok: false,
    reason:
      marker === null
        ? `This database has no "${DATABASE_MARKER_PREFIX}${expected}" marker, so it can't be proven to be a ${expected} database. If it is, mark it once: --mark-database=${expected}`
        : `This database is marked "${marker}", not "${expected}". Refusing.`,
  };
}

/** --mark-database must never overwrite the deploy's production stamp (#747). */
export function checkCanMarkDatabase(current: string | null): { ok: true } | { ok: false; reason: string } {
  return current === "production"
    ? { ok: false, reason: 'This database is marked "production" (stamped by the deploy); --mark-database will not overwrite that.' }
    : { ok: true };
}

function sameDatabase(a: URL, raw: string): boolean {
  try {
    const b = new URL(raw);
    return a.hostname === b.hostname && (a.port || "5432") === (b.port || "5432") && a.pathname === b.pathname;
  } catch {
    return false;
  }
}
