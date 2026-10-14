/**
 * @asafarim/db-env-guard — the fail-closed decision on whether a synthetic-data
 * CLI may write a database (#749; extracted from the TasksAI identities CLI,
 * #745 review, and the TasksAI test-data CLI, #742 slice 2b / #747).
 *
 * Three independent signals; any production-like one refuses:
 *
 *  1. The URL. "Local" is proven positively: loopback AND a development port
 *     from docker-compose.yml. Production publishes its Postgres on the
 *     production host's loopback (docker-compose.prod.yml), so loopback on any
 *     other port — the default included — is production (on that host, or
 *     through an SSH tunnel to it). The production compose host and
 *     NODE_ENV=production are production too.
 *  2. The machine. The production host (hostname "asafarim", checkout under
 *     /var/repos/asafarim-com — see infra/scripts/vps-deploy.sh) is production.
 *  3. The database itself (checked by the CLI before any write): a dev/test
 *     database carries COMMENT ON DATABASE … IS 'asafarim-env=development'
 *     (or test), set once with --mark-database. The deploy stamps production
 *     databases 'asafarim-env=production', and that stamp wins over the URL.
 *
 * Source-only and dependency-free: each CLI passes the profile of the database
 * it guards and runs the SQL below through its own client.
 */

export type DatabaseEnvironment = "development" | "test" | "production";
export type MarkableEnvironment = Exclude<DatabaseEnvironment, "production">;

export interface ProductionMachineSignals {
  /** os.hostname() values of the production host. */
  hostnames: readonly string[];
  /** The deploy checkout; a cwd under it is the production host. */
  checkoutPrefix: string;
}

/** The production VPS (infra/scripts/vps-deploy.sh). */
export const PRODUCTION_MACHINE: ProductionMachineSignals = {
  hostnames: ["asafarim"],
  checkoutPrefix: "/var/repos/asafarim-com",
};

export interface DatabaseProfile {
  /** The env var holding the URL, for messages ("DATABASE_URL"). */
  urlEnvVar: string;
  /** How messages name the database ("platform", "TasksAI"). */
  displayName: string;
  /** Host ports docker-compose.yml publishes for development; pinned by a test. */
  devPorts: readonly string[];
  /** The service name production containers reach the database by. */
  productionComposeHost: string;
  /** What --allow-production-baseline creates there, for the refusal message. */
  baselineDescription: string;
  /** Defaults to PRODUCTION_MACHINE. */
  productionMachine?: ProductionMachineSignals;
}

/** The shared platform database (docker-compose.yml "postgres", host port 55435). */
export const PLATFORM_DATABASE: DatabaseProfile = {
  urlEnvVar: "DATABASE_URL",
  displayName: "platform",
  devPorts: ["55435"],
  productionComposeHost: "postgres",
  baselineDescription: "the remote-smoke baseline account",
};

/** TasksAI's own database (docker-compose.yml "tasksai-postgres", host port 55438). */
export const TASKSAI_DATABASE: DatabaseProfile = {
  urlEnvVar: "TASKSAI_DATABASE_URL",
  displayName: "TasksAI",
  devPorts: ["55438"],
  productionComposeHost: "tasksai-postgres",
  baselineDescription: "the read-only remote-smoke baseline",
};

export interface GuardInput {
  rawDatabaseUrl: string;
  /** When set, a URL naming the same database (host, port, path) is always refused. */
  platformDatabaseUrl?: string | undefined;
  nodeEnv?: string | undefined;
  allowProductionBaseline?: boolean | undefined;
  confirmHost?: string | undefined;
  /** os.hostname() of the machine running the CLI */
  machineHostname?: string | undefined;
  /** process.cwd() */
  cwd?: string | undefined;
}

export type Refusal = { ok: false; reason: string };
export type Check = { ok: true } | Refusal;

export type GuardDecision = { ok: true; environment: DatabaseEnvironment; host: string } | Refusal;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Static signals (1 and 2). The CLI then requires the database marker (3). */
export function decideDatabaseEnvironment(profile: DatabaseProfile, input: GuardInput): GuardDecision {
  let url: URL;
  try {
    url = new URL(input.rawDatabaseUrl);
  } catch {
    return { ok: false, reason: `${profile.urlEnvVar} is not a valid URL.` };
  }
  const host = url.hostname;
  const port = url.port || "5432";
  if (input.platformDatabaseUrl && sameDatabase(url, input.platformDatabaseUrl)) {
    return { ok: false, reason: `${profile.urlEnvVar} points at the platform database. Refusing.` };
  }
  const machine = profile.productionMachine ?? PRODUCTION_MACHINE;
  const loopback = LOOPBACK_HOSTS.has(host);
  const devLoopback = loopback && profile.devPorts.includes(port);
  const productionMachine =
    (input.machineHostname !== undefined && machine.hostnames.includes(input.machineHostname)) ||
    (input.cwd !== undefined && input.cwd.replace(/\\/g, "/").startsWith(machine.checkoutPrefix));

  const why: string[] = [];
  if (input.nodeEnv === "production") why.push("NODE_ENV=production");
  if (host === profile.productionComposeHost) why.push(`the production compose host "${profile.productionComposeHost}"`);
  if (loopback && !devLoopback) why.push(`loopback on port ${port}, not a development port (${profile.devPorts.join(", ")})`);
  if (productionMachine) why.push("running on the production host");

  if (why.length) {
    if (!input.allowProductionBaseline) {
      return {
        ok: false,
        reason: `Treating this as the PRODUCTION ${profile.displayName} database (${why.join("; ")}). Refusing. Only the owner may create ${profile.baselineDescription} there, with --allow-production-baseline.`,
      };
    }
    return { ok: true, environment: "production", host };
  }
  if (input.allowProductionBaseline) {
    return { ok: false, reason: "--allow-production-baseline is only for the production database; this one isn't." };
  }
  if (devLoopback) return { ok: true, environment: "development", host };
  if (input.confirmHost !== host) {
    return { ok: false, reason: `Database host "${host}" is not the local development database. Re-run with --confirm-host=${host} if it is a test environment.` };
  }
  return { ok: true, environment: "test", host };
}

// ─── Signal 3: the database's own marker ─────────────────────────────────

export const DATABASE_MARKER_PREFIX = "asafarim-env=";

/** Reads the connected database's comment; one row, column `comment`. */
export const READ_DATABASE_COMMENT_SQL =
  "SELECT shobj_description(d.oid, 'pg_database') AS comment FROM pg_database d WHERE d.datname = current_database()";

/** One row, column `db`: the connected database's name, for markDatabaseSql. */
export const CURRENT_DATABASE_SQL = "SELECT current_database() AS db";

/** Parse the environment out of a database comment ("asafarim-env=<x>"). */
export function parseDatabaseMarker(comment: string | null | undefined): string | null {
  return new RegExp(`${DATABASE_MARKER_PREFIX}([a-z]+)`).exec(comment ?? "")?.[1] ?? null;
}

/**
 * The database must agree with the static decision. development and test
 * require their marker; production refuses a database marked dev/test.
 */
export function checkDatabaseMarker(expected: DatabaseEnvironment, marker: string | null): Check {
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

/**
 * --mark-database=<x> is accepted only when the static checks already say the
 * database is <x>, and never for production.
 */
export function checkMarkRequest(requested: string, environment: DatabaseEnvironment): { ok: true; environment: MarkableEnvironment } | Refusal {
  if (environment === "production" || requested !== environment) {
    return { ok: false, reason: `--mark-database=${requested} refused: the URL/machine checks say this is "${environment}".` };
  }
  return { ok: true, environment };
}

/** --mark-database must never overwrite the deploy's production stamp (#747). */
export function checkCanMarkDatabase(current: string | null): Check {
  return current === "production"
    ? { ok: false, reason: 'This database is marked "production" (stamped by the deploy); --mark-database will not overwrite that.' }
    : { ok: true };
}

/**
 * The statement that sets the marker. Only development/test (production is
 * stamped by the deploy, never by a CLI); the name comes from CURRENT_DATABASE_SQL.
 */
export function markDatabaseSql(databaseName: string, environment: MarkableEnvironment): string {
  if (environment !== "development" && environment !== "test") {
    throw new Error(`Refusing to mark a database as "${String(environment)}".`);
  }
  return `COMMENT ON DATABASE "${databaseName.replace(/"/g, '""')}" IS '${DATABASE_MARKER_PREFIX}${environment}'`;
}

function sameDatabase(a: URL, raw: string): boolean {
  try {
    const b = new URL(raw);
    return a.hostname === b.hostname && (a.port || "5432") === (b.port || "5432") && a.pathname === b.pathname;
  } catch {
    return false;
  }
}
