// TasksAI test identities provider (#742 slice 2a) — synthetic Hub accounts on
// the shared Prisma database, one per TasksAI role, for Testora's TasksAI
// catalog.
//
// The Admin Console gets validate + status only. Creating accounts sets a
// password the operator must copy into Testora's target secrets, and the
// console has no safe place to show one, so seed/rotate/remove are CLI-only
// (packages/db/prisma/seed-tasksai-identities.ts). That also keeps bulk
// actions away from the production smoke account.
//
// Ownership is provable: a row belongs to this seed only when its id AND its
// email both carry the synthetic markers (definitions/tasksai-identities.ts).

import bcrypt from "bcryptjs";
import { definitionChecksum } from "../checksums";
import type {
  SeedEntityCounts,
  SeedIssue,
  SeedPlan,
  SeedProvider,
  SeedStatus,
  ValidationResult,
} from "../contracts";
import { requiredEnvVars } from "../environments";
import { sanitizeError } from "../redaction";
import { withPrisma, type SeedPrismaClient } from "../prisma-client";
import { buildPlan, unavailableStatus } from "./platform-foundation";
import {
  TASKSAI_IDENTITIES,
  TASKSAI_IDENTITIES_DEFINITION_VERSION,
  TASKSAI_IDENTITY_DEFINITIONS,
  TASKSAI_IDENTITY_ID_PREFIX,
  tasksaiIdentityEmail,
  tasksaiIdentityId,
  type TasksaiIdentityDefinition,
} from "../definitions/tasksai-identities";

const PROVIDER_ID = "tasksai-test-identities";
const KEY_USERS = "tasksai.test-identities";
const DEFINITION_CHECKSUM = definitionChecksum(TASKSAI_IDENTITY_DEFINITIONS);
const DEFINITION = { version: TASKSAI_IDENTITIES_DEFINITION_VERSION, checksum: DEFINITION_CHECKSUM };

// ─── Validation ──────────────────────────────────────────────────────────

export function validateTasksaiIdentityDefinitions(): SeedIssue[] {
  const issues: SeedIssue[] = [];
  const keys = TASKSAI_IDENTITIES.map((identity) => identity.key);
  if (new Set(keys).size !== keys.length) {
    issues.push({ code: "DUPLICATE_KEY", severity: "error", seedKey: KEY_USERS, message: "An identity key is defined twice." });
  }
  for (const key of keys) {
    if (!/^[a-z0-9]+$/.test(key)) {
      issues.push({ code: "BAD_KEY", severity: "error", seedKey: KEY_USERS, message: `Identity key "${key}" must be lowercase letters/digits.` });
    }
  }
  for (const role of ["owner", "admin", "member", "guest", "outsider"] as const) {
    if (!TASKSAI_IDENTITIES.some((identity) => identity.role === role)) {
      issues.push({ code: "ROLE_MISSING", severity: "error", seedKey: KEY_USERS, message: `No identity for role "${role}".` });
    }
  }
  return issues;
}

// ─── Mutations (CLI) ─────────────────────────────────────────────────────

export interface EnsuredIdentity {
  key: string;
  role: TasksaiIdentityDefinition["role"];
  /** The opaque platform user id TasksAI stores on its memberships. */
  platformUserId: string;
  email: string;
  created: boolean;
  /** A new password was set on this run (returned only then, never stored). */
  password?: string;
}

/**
 * Create the selected identities if missing and set a password where there is
 * none (or on every one with `rotate`). Existing passwords are never changed
 * otherwise, so re-running is a no-op. An email that exists WITHOUT the
 * synthetic id belongs to someone else: refused, never touched.
 */
export async function ensureTasksaiIdentities(
  prisma: SeedPrismaClient,
  options: { identities?: TasksaiIdentityDefinition[]; rotate?: boolean; generatePassword: () => string },
): Promise<EnsuredIdentity[]> {
  const out: EnsuredIdentity[] = [];
  for (const identity of options.identities ?? TASKSAI_IDENTITIES) {
    const id = tasksaiIdentityId(identity.key);
    const email = tasksaiIdentityEmail(identity.key);
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, password: true } });
    if (existing && existing.id !== id) {
      throw new Error(`${email} exists with a non-synthetic id — refusing to touch it.`);
    }
    const needsPassword = !existing || !existing.password || options.rotate === true;
    const password = needsPassword ? options.generatePassword() : undefined;
    const hash = password ? await bcrypt.hash(password, 12) : undefined;
    if (existing) {
      if (hash) await prisma.user.update({ where: { id }, data: { password: hash } });
    } else {
      await prisma.user.create({
        data: {
          id,
          email,
          name: identity.name,
          username: `tasksai-test-${identity.key}`,
          emailVerified: new Date(),
          isActive: true,
          password: hash,
        },
      });
    }
    out.push({ key: identity.key, role: identity.role, platformUserId: id, email, created: !existing, ...(password ? { password } : {}) });
  }
  return out;
}

/**
 * Delete synthetic identities: only rows whose id AND email carry the markers.
 * A row with linked sign-in accounts or role grants is retained (someone
 * attached something real to it).
 */
export async function removeTasksaiIdentities(
  prisma: SeedPrismaClient,
  options: { identities?: TasksaiIdentityDefinition[] } = {},
): Promise<{ deleted: string[]; retained: { key: string; reason: string }[] }> {
  const deleted: string[] = [];
  const retained: { key: string; reason: string }[] = [];
  for (const identity of options.identities ?? TASKSAI_IDENTITIES) {
    const id = tasksaiIdentityId(identity.key);
    const email = tasksaiIdentityEmail(identity.key);
    const user = await prisma.user.findFirst({ where: { id, email }, select: { id: true } });
    if (!user) continue;
    const [accounts, roles] = await Promise.all([
      prisma.account.count({ where: { userId: id } }),
      prisma.userRole.count({ where: { userId: id } }),
    ]);
    if (accounts > 0 || roles > 0) {
      retained.push({ key: identity.key, reason: accounts > 0 ? "has linked sign-in accounts" : "has role grants" });
      continue;
    }
    const result = await prisma.user.deleteMany({ where: { id, email } });
    if (result.count > 0) deleted.push(identity.key);
  }
  return { deleted, retained };
}

// ─── CLI guard (fail closed) ─────────────────────────────────────────────
//
// Three independent signals; any production-like one refuses (#745 review):
//  1. The URL. "Local" is proven positively: loopback AND a development port
//     from docker-compose.yml. Production publishes its Postgres on the
//     loopback of the production host (docker-compose.prod.yml: 127.0.0.1:5432),
//     so loopback on any other port — the default included — is production
//     (on that host, or through an SSH tunnel to it).
//  2. The machine. The production host (hostname "asafarim", checkout under
//     /var/repos/asafarim-com — see infra/scripts/vps-deploy.sh) is production.
//  3. The database itself (checked by the CLI before any write): a dev/test
//     database carries an explicit marker, COMMENT ON DATABASE … IS
//     'asafarim-env=development' (or test), set once with --mark-database.
//     Production never has it, so a missing or mismatched marker refuses.

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
/** The platform DB's development port (docker-compose.yml "55435:5432"); pinned by a test. */
export const DEV_PLATFORM_DB_PORTS = ["55435"] as const;
const PRODUCTION_HOSTNAMES = new Set(["asafarim"]);
const PRODUCTION_CHECKOUT = "/var/repos/asafarim-com";

export type DatabaseEnvironment = "development" | "test" | "production";

export type TasksaiIdentitiesGuardDecision =
  | { ok: true; environment: DatabaseEnvironment; production: boolean; identities: TasksaiIdentityDefinition[] }
  | { ok: false; reason: string };

/** Static signals (1 and 2). The CLI then requires the database marker (3). */
export function tasksaiIdentitiesGuard(input: {
  rawDatabaseUrl: string;
  nodeEnv?: string;
  allowProductionBaseline?: boolean;
  confirmHost?: string;
  /** os.hostname() of the machine running the CLI */
  machineHostname?: string;
  /** process.cwd() */
  cwd?: string;
}): TasksaiIdentitiesGuardDecision {
  let url: URL;
  try {
    url = new URL(input.rawDatabaseUrl);
  } catch {
    return { ok: false, reason: "DATABASE_URL is not a valid URL." };
  }
  const host = url.hostname;
  const port = url.port || "5432";
  const loopback = LOOPBACK_HOSTS.has(host);
  const devLoopback = loopback && (DEV_PLATFORM_DB_PORTS as readonly string[]).includes(port);
  const productionMachine =
    (input.machineHostname !== undefined && PRODUCTION_HOSTNAMES.has(input.machineHostname)) ||
    (input.cwd !== undefined && input.cwd.replace(/\\/g, "/").startsWith(PRODUCTION_CHECKOUT));

  const why: string[] = [];
  if (input.nodeEnv === "production") why.push("NODE_ENV=production");
  if (host === "postgres") why.push('the production compose host "postgres"');
  if (loopback && !devLoopback) why.push(`loopback on port ${port}, not a development port (${DEV_PLATFORM_DB_PORTS.join(", ")})`);
  if (productionMachine) why.push("running on the production host");

  if (why.length) {
    if (!input.allowProductionBaseline) {
      return {
        ok: false,
        reason: `Treating this as the PRODUCTION platform database (${why.join("; ")}). Refusing. Only the owner may create the remote-smoke baseline account there, with --allow-production-baseline.`,
      };
    }
    return { ok: true, environment: "production", production: true, identities: TASKSAI_IDENTITIES.filter((i) => i.productionBaseline) };
  }
  if (input.allowProductionBaseline) {
    return { ok: false, reason: "--allow-production-baseline is only for the production database; this one isn't." };
  }
  if (devLoopback) return { ok: true, environment: "development", production: false, identities: TASKSAI_IDENTITIES };
  if (input.confirmHost !== host) {
    return { ok: false, reason: `Database host "${host}" is not the local development database. Re-run with --confirm-host=${host} if it is a test environment.` };
  }
  return { ok: true, environment: "test", production: false, identities: TASKSAI_IDENTITIES };
}

export const DATABASE_MARKER_PREFIX = "asafarim-env=";

/** The environment marker on the connected database (COMMENT ON DATABASE), or null. */
export async function readDatabaseMarker(prisma: SeedPrismaClient): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ comment: string | null }[]>`
    SELECT shobj_description(d.oid, 'pg_database') AS comment
      FROM pg_database d WHERE d.datname = current_database()`;
  const comment = rows[0]?.comment ?? "";
  const match = new RegExp(`${DATABASE_MARKER_PREFIX}([a-z]+)`).exec(comment);
  return match?.[1] ?? null;
}

/**
 * Signal 3: the database must agree with the static decision. development and
 * test require their marker; production refuses a database marked as dev/test
 * (the static signals and the database disagree — stop).
 */
export function checkDatabaseMarker(expected: DatabaseEnvironment, marker: string | null): { ok: true } | { ok: false; reason: string } {
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

/** Set the marker. Only ever for development/test, and only where the static guard agreed. */
export async function markDatabase(prisma: SeedPrismaClient, environment: "development" | "test"): Promise<void> {
  const rows = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  const name = rows[0]!.db.replace(/"/g, '""');
  await prisma.$executeRawUnsafe(`COMMENT ON DATABASE "${name}" IS '${DATABASE_MARKER_PREFIX}${environment}'`);
}

// ─── Inspection ──────────────────────────────────────────────────────────

async function snapshot(prisma: SeedPrismaClient) {
  const rows = await prisma.user.findMany({
    where: { id: { startsWith: TASKSAI_IDENTITY_ID_PREFIX } },
    select: { id: true, email: true, password: true },
  });
  const known = new Map(TASKSAI_IDENTITIES.map((identity) => [tasksaiIdentityId(identity.key), identity]));
  let present = 0;
  let withoutPassword = 0;
  for (const identity of TASKSAI_IDENTITIES) {
    const row = rows.find((r) => r.id === tasksaiIdentityId(identity.key));
    if (!row) continue;
    present += 1;
    if (!row.password) withoutPassword += 1;
  }
  const orphaned = rows.filter((row) => !known.has(row.id)).length;
  const missing = TASKSAI_IDENTITIES.length - present;
  const entities: SeedEntityCounts[] = [
    { entity: "Synthetic test accounts", seedKey: KEY_USERS, present, missing, drifted: withoutPassword, orphaned },
  ];
  return { entities, present, missing, withoutPassword, orphaned };
}

// ─── Provider ────────────────────────────────────────────────────────────

const CLI_ONLY: SeedIssue = {
  code: "CLI_ONLY",
  severity: "error",
  seedKey: KEY_USERS,
  message:
    "Creating, rotating and removing TasksAI test accounts hands passwords to the operator, so it runs only from the CLI: pnpm --filter @asafarim/db db:seed:tasksai-identities",
};

export const tasksaiIdentitiesProvider: SeedProvider = {
  id: PROVIDER_ID,
  appId: "tasksai",
  displayName: "TasksAI test accounts",
  description:
    "Synthetic Hub accounts (owner, admin, member ×2, guest, outsider) that Testora's TasksAI catalog signs in as. Status only here; create/rotate/remove from the CLI.",
  databaseKind: "shared-prisma",
  availability: "configured",
  protected: false,
  definitionVersion: TASKSAI_IDENTITIES_DEFINITION_VERSION,
  requiredEnv: requiredEnvVars("shared-prisma"),
  supports: { validate: true, status: true, seed: false, reconcile: false, remove: false },
  manifest: [
    {
      seedKey: KEY_USERS,
      entity: "User",
      identity: "id",
      ownership: "seed-owned-shared",
      reconcilable: false,
      removable: false,
      protectedFields: ["password", "email"],
      notes: `Ids "${TASKSAI_IDENTITY_ID_PREFIX}<key>", emails "tasksai-test+<key>@asafarim.test". Removal (CLI) requires both.`,
    },
  ],

  async validate(context): Promise<ValidationResult> {
    const startedAt = Date.now();
    const issues = validateTasksaiIdentityDefinitions();
    let connection: ValidationResult["connection"] = "ok";
    try {
      await withPrisma(context.connectionString, async (prisma) => {
        await prisma.user.count({ where: { id: { startsWith: TASKSAI_IDENTITY_ID_PREFIX } } });
      });
    } catch (error) {
      connection = "unreachable";
      const { code, message } = sanitizeError(error);
      issues.push({ code, severity: "error", message });
    }
    return {
      ok: connection === "ok" && !issues.some((i) => i.severity === "error"),
      definitionVersion: TASKSAI_IDENTITIES_DEFINITION_VERSION,
      definitionChecksum: DEFINITION_CHECKSUM,
      connection,
      issues,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    };
  },

  async inspect(context): Promise<SeedStatus> {
    const startedAt = Date.now();
    try {
      const snap = await withPrisma(context.connectionString, snapshot);
      const issues: SeedIssue[] = [];
      if (snap.withoutPassword > 0) {
        issues.push({ code: "NO_PASSWORD", severity: "warning", seedKey: KEY_USERS, message: `${snap.withoutPassword} account(s) have no password yet; run the CLI.` });
      }
      return {
        health: snap.missing > 0 ? "missing" : snap.withoutPassword > 0 ? "drifted" : snap.orphaned > 0 ? "orphaned" : "clean",
        definitionVersion: TASKSAI_IDENTITIES_DEFINITION_VERSION,
        definitionChecksum: DEFINITION_CHECKSUM,
        connection: "ok",
        seedOwnedCount: snap.present,
        missingCount: snap.missing,
        driftedCount: snap.withoutPassword,
        orphanedCount: snap.orphaned,
        entities: snap.entities,
        issues,
        checkedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const { code, message } = sanitizeError(error);
      return unavailableStatus(code, message, startedAt, DEFINITION);
    }
  },

  async plan(context, operation): Promise<SeedPlan> {
    return buildPlan({
      providerId: PROVIDER_ID,
      environment: context.environment,
      operation,
      changes: [],
      blocked: operation === "validate" || operation === "status" ? [] : [CLI_ONLY],
      warnings: [],
      createdAt: Date.now(),
      definitionVersion: TASKSAI_IDENTITIES_DEFINITION_VERSION,
      definitionChecksum: DEFINITION_CHECKSUM,
    });
  },

  async execute() {
    throw new Error(CLI_ONLY.message);
  },
};

export { DEFINITION_CHECKSUM as TASKSAI_IDENTITIES_DEFINITION_CHECKSUM };
