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

// ─── CLI guard ───────────────────────────────────────────────────────────

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"]);

export type TasksaiIdentitiesGuardDecision =
  | { ok: true; production: boolean; identities: TasksaiIdentityDefinition[] }
  | { ok: false; reason: string };

/**
 * Decide whether the CLI may write synthetic accounts to this database.
 * Judges the RAW DATABASE_URL (before the CLI's docker-host rewrite turns the
 * production compose host `postgres` into `localhost`).
 *   - Production (NODE_ENV=production, or the compose host `postgres`): refused
 *     unless `--allow-production-baseline` — an owner-only flag — and then only
 *     the remote-smoke baseline identity, never the rest.
 *   - Any other non-local host (a remote test environment): refused unless
 *     `--confirm-host=<that host>` names it.
 *   - Local: everything.
 */
export function tasksaiIdentitiesGuard(input: {
  rawDatabaseUrl: string;
  nodeEnv?: string;
  allowProductionBaseline?: boolean;
  confirmHost?: string;
}): TasksaiIdentitiesGuardDecision {
  let host: string;
  try {
    host = new URL(input.rawDatabaseUrl).hostname;
  } catch {
    return { ok: false, reason: "DATABASE_URL is not a valid URL." };
  }
  const production = input.nodeEnv === "production" || host === "postgres";
  if (production) {
    if (!input.allowProductionBaseline) {
      return {
        ok: false,
        reason:
          "This looks like the PRODUCTION platform database. Refusing. Only the owner may create the remote-smoke baseline account there, with --allow-production-baseline.",
      };
    }
    return { ok: true, production: true, identities: TASKSAI_IDENTITIES.filter((i) => i.productionBaseline) };
  }
  if (input.allowProductionBaseline) {
    return { ok: false, reason: "--allow-production-baseline is only for the production database; this one isn't." };
  }
  if (!LOCAL_HOSTS.has(host) && input.confirmHost !== host) {
    return { ok: false, reason: `Database host "${host}" is not local. Re-run with --confirm-host=${host} if it is a test environment.` };
  }
  return { ok: true, production: false, identities: TASKSAI_IDENTITIES };
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
