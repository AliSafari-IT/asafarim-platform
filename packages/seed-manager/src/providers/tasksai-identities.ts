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
import {
  CURRENT_DATABASE_SQL,
  PLATFORM_DATABASE,
  READ_DATABASE_COMMENT_SQL,
  decideDatabaseEnvironment,
  markDatabaseSql,
  parseDatabaseMarker,
  type DatabaseEnvironment,
  type GuardInput,
  type MarkableEnvironment,
} from "@asafarim/db-env-guard";
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
// The rules (URL, machine, the database's own asafarim-env marker) live in
// @asafarim/db-env-guard (#749), shared with TasksAI's test-data CLI. This
// section maps the decision onto the identities to seed and runs the marker
// SQL through Prisma.

/** The platform DB's development port (docker-compose.yml "55435:5432"); pinned by @asafarim/db-env-guard's tests. */
export const DEV_PLATFORM_DB_PORTS = PLATFORM_DATABASE.devPorts;

export {
  DATABASE_MARKER_PREFIX,
  checkCanMarkDatabase,
  checkDatabaseMarker,
  checkMarkRequest,
  type DatabaseEnvironment,
} from "@asafarim/db-env-guard";

export type TasksaiIdentitiesGuardDecision =
  | { ok: true; environment: DatabaseEnvironment; production: boolean; identities: TasksaiIdentityDefinition[] }
  | { ok: false; reason: string };

/** Static signals (1 and 2). The CLI then requires the database marker (3). Production gets the baseline identities only. */
export function tasksaiIdentitiesGuard(input: Omit<GuardInput, "platformDatabaseUrl">): TasksaiIdentitiesGuardDecision {
  const decision = decideDatabaseEnvironment(PLATFORM_DATABASE, input);
  if (!decision.ok) return decision;
  const production = decision.environment === "production";
  return {
    ok: true,
    environment: decision.environment,
    production,
    identities: production ? TASKSAI_IDENTITIES.filter((i) => i.productionBaseline) : TASKSAI_IDENTITIES,
  };
}

/** The environment marker on the connected database (COMMENT ON DATABASE), or null. */
export async function readDatabaseMarker(prisma: SeedPrismaClient): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<{ comment: string | null }[]>(READ_DATABASE_COMMENT_SQL);
  return parseDatabaseMarker(rows[0]?.comment);
}

/** Set the marker. Only ever for development/test, and only where the static guard agreed. */
export async function markDatabase(prisma: SeedPrismaClient, environment: MarkableEnvironment): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<{ db: string }[]>(CURRENT_DATABASE_SQL);
  await prisma.$executeRawUnsafe(markDatabaseSql(rows[0]!.db, environment));
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
