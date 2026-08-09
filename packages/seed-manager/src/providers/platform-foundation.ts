// Platform foundation provider — RBAC permissions, system roles and the
// role→permission grid on the shared Prisma database.
//
// This provider is PROTECTED. `supports.remove` is false and safety.ts
// refuses removal structurally, so there is no configuration, permission or
// role that makes the foundation deletable through this feature.

import bcrypt from "bcryptjs";

import { PLAN_TTL_MS, definitionChecksum, planChecksum } from "../checksums";
import type {
  SeedEntityCounts,
  SeedIssue,
  SeedPlan,
  SeedPlanChange,
  SeedProvider,
  SeedProviderContext,
  SeedResult,
  SeedStatus,
  ValidationResult,
} from "../contracts";
import { requiredEnvVars } from "../environments";
import { sanitizeError } from "../redaction";
import { withPrisma, type SeedPrismaClient } from "../prisma-client";
import {
  FOUNDATION_DEFINITIONS,
  FOUNDATION_DEFINITION_VERSION,
  FOUNDATION_PERMISSIONS,
  FOUNDATION_ROLES,
} from "../definitions/foundation";

const PROVIDER_ID = "platform-foundation";
const DEFINITION_CHECKSUM = definitionChecksum(FOUNDATION_DEFINITIONS);

const KEY_PERMISSIONS = "foundation.permissions";
const KEY_ROLES = "foundation.roles";
const KEY_ROLE_PERMISSIONS = "foundation.role-permissions";
const KEY_ADMIN_USER = "foundation.initial-admin";

// ─── Definition-level validation ─────────────────────────────────────────

/** Checks that need no database. Also runs as a unit test. */
export function validateFoundationDefinitions(): SeedIssue[] {
  const issues: SeedIssue[] = [];

  const permissionNames = FOUNDATION_PERMISSIONS.map((p) => p.name);
  for (const duplicate of findDuplicates(permissionNames)) {
    issues.push({
      code: "DUPLICATE_PERMISSION",
      severity: "error",
      seedKey: KEY_PERMISSIONS,
      message: `Permission "${duplicate}" is defined more than once.`,
    });
  }

  for (const duplicate of findDuplicates(FOUNDATION_ROLES.map((r) => r.name))) {
    issues.push({
      code: "DUPLICATE_ROLE",
      severity: "error",
      seedKey: KEY_ROLES,
      message: `Role "${duplicate}" is defined more than once.`,
    });
  }

  const known = new Set(permissionNames);
  for (const role of FOUNDATION_ROLES) {
    for (const permission of role.permissions) {
      if (!known.has(permission)) {
        issues.push({
          code: "UNKNOWN_PERMISSION_REFERENCE",
          severity: "error",
          seedKey: KEY_ROLE_PERMISSIONS,
          message: `Role "${role.name}" grants unknown permission "${permission}".`,
        });
      }
    }
    for (const duplicate of findDuplicates(role.permissions)) {
      issues.push({
        code: "DUPLICATE_ROLE_PERMISSION",
        severity: "warning",
        seedKey: KEY_ROLE_PERMISSIONS,
        message: `Role "${role.name}" lists "${duplicate}" twice.`,
      });
    }
  }

  const defaults = FOUNDATION_ROLES.filter((r) => r.isDefault);
  if (defaults.length !== 1) {
    issues.push({
      code: "DEFAULT_ROLE_CARDINALITY",
      severity: "error",
      seedKey: KEY_ROLES,
      message: `Exactly one role must be the default; found ${defaults.length}.`,
    });
  }

  return issues;
}

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

// ─── Reusable mutation functions (shared with the CLI) ───────────────────

export async function applyPermissions(prisma: SeedPrismaClient) {
  let inserted = 0;
  let updated = 0;
  for (const permission of FOUNDATION_PERMISSIONS) {
    const existing = await prisma.permission.findUnique({
      where: { name: permission.name },
      select: { displayName: true, description: true, group: true },
    });
    if (!existing) {
      await prisma.permission.create({ data: permission });
      inserted += 1;
      continue;
    }
    if (
      existing.displayName !== permission.displayName ||
      existing.description !== permission.description ||
      existing.group !== permission.group
    ) {
      await prisma.permission.update({
        where: { name: permission.name },
        data: {
          displayName: permission.displayName,
          description: permission.description,
          group: permission.group,
        },
      });
      updated += 1;
    }
  }
  return { inserted, updated };
}

export async function applyRoles(prisma: SeedPrismaClient) {
  let inserted = 0;
  let updated = 0;
  let grantsInserted = 0;

  for (const role of FOUNDATION_ROLES) {
    const { permissions, ...roleData } = role;
    const existing = await prisma.role.findUnique({ where: { name: role.name } });

    const dbRole = existing
      ? await prisma.role.update({ where: { name: role.name }, data: roleData })
      : await prisma.role.create({ data: roleData });
    if (existing) {
      if (
        existing.displayName !== role.displayName ||
        existing.description !== role.description ||
        existing.isSystem !== role.isSystem ||
        existing.isDefault !== role.isDefault
      ) {
        updated += 1;
      }
    } else {
      inserted += 1;
    }

    for (const permissionName of permissions) {
      const permission = await prisma.permission.findUnique({
        where: { name: permissionName },
        select: { id: true },
      });
      if (!permission) continue;
      const grant = await prisma.rolePermission.findUnique({
        where: {
          roleId_permissionId: { roleId: dbRole.id, permissionId: permission.id },
        },
        select: { roleId: true },
      });
      if (!grant) {
        await prisma.rolePermission.create({
          data: { roleId: dbRole.id, permissionId: permission.id },
        });
        grantsInserted += 1;
      }
    }
  }
  return { inserted, updated, grantsInserted };
}

/**
 * Optional first admin. Only ever created, never updated or removed — an
 * existing admin's password must not be reset by re-running the seed.
 */
export async function applyInitialAdmin(
  prisma: SeedPrismaClient,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ inserted: number; skipped: boolean }> {
  const email = env.SEED_ADMIN_EMAIL;
  const password = env.SEED_ADMIN_PASSWORD;
  if (!email || !password) return { inserted: 0, skipped: true };

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  const user =
    existing ??
    (await prisma.user.create({
      data: {
        email,
        name: "Platform Admin",
        username: "admin",
        emailVerified: new Date(),
        password: await bcrypt.hash(password, 12),
      },
      select: { id: true },
    }));

  const superadmin = await prisma.role.findUnique({
    where: { name: "superadmin" },
    select: { id: true },
  });
  if (superadmin) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: superadmin.id } },
      update: {},
      create: { userId: user.id, roleId: superadmin.id },
    });
  }
  return { inserted: existing ? 0 : 1, skipped: false };
}

/** The whole foundation seed, as the CLI runs it. */
export async function seedFoundation(
  prisma: SeedPrismaClient,
  env: NodeJS.ProcessEnv = process.env
) {
  const permissions = await applyPermissions(prisma);
  const roles = await applyRoles(prisma);
  const admin = await applyInitialAdmin(prisma, env);
  return { permissions, roles, admin };
}

// ─── Inspection ──────────────────────────────────────────────────────────

interface FoundationSnapshot {
  entities: SeedEntityCounts[];
  seedOwnedCount: number;
  missingCount: number;
  driftedCount: number;
}

async function snapshot(prisma: SeedPrismaClient): Promise<FoundationSnapshot> {
  const dbPermissions = await prisma.permission.findMany({
    select: { name: true, displayName: true, description: true, group: true },
  });
  const byName = new Map(dbPermissions.map((p) => [p.name, p]));

  let permissionsMissing = 0;
  let permissionsDrifted = 0;
  for (const definition of FOUNDATION_PERMISSIONS) {
    const row = byName.get(definition.name);
    if (!row) {
      permissionsMissing += 1;
      continue;
    }
    if (
      row.displayName !== definition.displayName ||
      row.description !== definition.description ||
      row.group !== definition.group
    ) {
      permissionsDrifted += 1;
    }
  }
  const permissionsPresent = FOUNDATION_PERMISSIONS.length - permissionsMissing;

  const dbRoles = await prisma.role.findMany({
    where: { name: { in: FOUNDATION_ROLES.map((r) => r.name) } },
    select: {
      id: true,
      name: true,
      displayName: true,
      description: true,
      isSystem: true,
      isDefault: true,
      rolePermissions: { select: { permission: { select: { name: true } } } },
    },
  });
  const roleByName = new Map(dbRoles.map((r) => [r.name, r]));

  let rolesMissing = 0;
  let rolesDrifted = 0;
  let grantsMissing = 0;
  let grantsPresent = 0;
  for (const definition of FOUNDATION_ROLES) {
    const row = roleByName.get(definition.name);
    if (!row) {
      rolesMissing += 1;
      grantsMissing += definition.permissions.length;
      continue;
    }
    if (
      row.displayName !== definition.displayName ||
      row.description !== definition.description ||
      row.isSystem !== definition.isSystem ||
      row.isDefault !== definition.isDefault
    ) {
      rolesDrifted += 1;
    }
    const granted = new Set(row.rolePermissions.map((rp) => rp.permission.name));
    for (const permission of definition.permissions) {
      if (granted.has(permission)) grantsPresent += 1;
      else grantsMissing += 1;
    }
  }
  const rolesPresent = FOUNDATION_ROLES.length - rolesMissing;

  const entities: SeedEntityCounts[] = [
    {
      entity: "Permissions",
      seedKey: KEY_PERMISSIONS,
      present: permissionsPresent,
      missing: permissionsMissing,
      drifted: permissionsDrifted,
      // Extra permissions are legitimately created by other features; the
      // foundation never claims ownership of rows it did not define.
      orphaned: 0,
    },
    {
      entity: "System roles",
      seedKey: KEY_ROLES,
      present: rolesPresent,
      missing: rolesMissing,
      drifted: rolesDrifted,
      orphaned: 0,
    },
    {
      entity: "Role permissions",
      seedKey: KEY_ROLE_PERMISSIONS,
      present: grantsPresent,
      missing: grantsMissing,
      drifted: 0,
      orphaned: 0,
    },
  ];

  return {
    entities,
    seedOwnedCount: entities.reduce((total, e) => total + e.present, 0),
    missingCount: entities.reduce((total, e) => total + e.missing, 0),
    driftedCount: entities.reduce((total, e) => total + e.drifted, 0),
  };
}

// ─── Provider ────────────────────────────────────────────────────────────

export const platformFoundationProvider: SeedProvider = {
  id: PROVIDER_ID,
  appId: "platform",
  displayName: "Platform foundation",
  description:
    "RBAC permissions, system roles, the role→permission grid, and the optional initial admin user on the shared platform database.",
  databaseKind: "shared-prisma",
  availability: "configured",
  protected: true,
  definitionVersion: FOUNDATION_DEFINITION_VERSION,
  requiredEnv: requiredEnvVars("shared-prisma"),
  supports: {
    validate: true,
    status: true,
    seed: true,
    reconcile: true,
    // Structurally impossible — the foundation is what authorization itself
    // depends on. Also refused in safety.ts, so a registry edit is not enough
    // to make removal reachable.
    remove: false,
  },
  manifest: [
    {
      seedKey: KEY_PERMISSIONS,
      entity: "Permission",
      identity: "unique-key",
      ownership: "seed-owned",
      reconcilable: true,
      removable: false,
      notes: "Recognised by the unique permission name. Never pruned — other features add their own.",
    },
    {
      seedKey: KEY_ROLES,
      entity: "Role",
      identity: "unique-key",
      ownership: "seed-owned",
      reconcilable: true,
      removable: false,
      protectedFields: ["isSystem"],
      notes: "Recognised by the unique role name. Custom roles created in the console are untouched.",
    },
    {
      seedKey: KEY_ROLE_PERMISSIONS,
      entity: "RolePermission",
      identity: "unique-key",
      ownership: "seed-owned",
      dependsOn: [KEY_PERMISSIONS, KEY_ROLES],
      reconcilable: true,
      removable: false,
      notes:
        "Grants are only ever added. Revoking a grant an operator made by hand is out of scope for reconciliation.",
    },
    {
      seedKey: KEY_ADMIN_USER,
      entity: "User",
      identity: "unique-key",
      ownership: "seed-owned-shared",
      dependsOn: [KEY_ROLES],
      reconcilable: false,
      removable: false,
      protectedFields: ["password", "email"],
      notes:
        "Created once from SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD if set. Never updated and never removed.",
    },
  ],

  async validate(context): Promise<ValidationResult> {
    const startedAt = Date.now();
    const issues = validateFoundationDefinitions();

    let connection: ValidationResult["connection"] = "ok";
    try {
      await withPrisma(context.connectionString, async (prisma) => {
        await prisma.$queryRaw`SELECT 1`;
      });
    } catch (error) {
      connection = "unreachable";
      const { code, message } = sanitizeError(error);
      issues.push({ code, severity: "error", message });
    }

    return {
      ok: connection === "ok" && !issues.some((i) => i.severity === "error"),
      definitionVersion: FOUNDATION_DEFINITION_VERSION,
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
      const result = await withPrisma(context.connectionString, snapshot);
      const health =
        result.missingCount > 0
          ? "missing"
          : result.driftedCount > 0
            ? "drifted"
            : "clean";
      return {
        health,
        definitionVersion: FOUNDATION_DEFINITION_VERSION,
        definitionChecksum: DEFINITION_CHECKSUM,
        connection: "ok",
        seedOwnedCount: result.seedOwnedCount,
        missingCount: result.missingCount,
        driftedCount: result.driftedCount,
        orphanedCount: 0,
        entities: result.entities,
        issues: [],
        checkedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const { code, message } = sanitizeError(error);
      return unavailableStatus(code, message, startedAt);
    }
  },

  async plan(context, operation): Promise<SeedPlan> {
    if (operation === "remove") {
      // Unreachable through the registry, but a provider must never rely on
      // its caller for a protection guarantee.
      throw new Error("The platform foundation can never be removed.");
    }
    const createdAt = Date.now();
    const result = await withPrisma(context.connectionString, snapshot);

    const changes: SeedPlanChange[] = [];
    for (const entity of result.entities) {
      if (entity.missing > 0) {
        changes.push({
          seedKey: entity.seedKey,
          entity: entity.entity,
          action: "insert",
          count: entity.missing,
        });
      }
      // "seed" fills gaps only; "reconcile" also refreshes drifted rows.
      if (operation === "reconcile" && entity.drifted > 0) {
        changes.push({
          seedKey: entity.seedKey,
          entity: entity.entity,
          action: "update",
          count: entity.drifted,
        });
      } else if (operation === "seed" && entity.drifted > 0) {
        changes.push({
          seedKey: entity.seedKey,
          entity: entity.entity,
          action: "retain",
          count: entity.drifted,
          reason: "Drifted rows are left alone by “Seed missing”. Use Reconcile to refresh them.",
        });
      }
    }

    return buildPlan({
      providerId: PROVIDER_ID,
      environment: context.environment,
      operation,
      changes,
      blocked: [],
      warnings: [],
      createdAt,
    });
  },

  async execute(context, approvedPlan): Promise<SeedResult> {
    const startedAt = Date.now();
    if (approvedPlan.operation === "remove") {
      throw new Error("The platform foundation can never be removed.");
    }

    try {
      const outcome = await withPrisma(context.connectionString, async (prisma) => {
        context.report?.({ stage: "executing", message: "Applying permissions", percent: 20 });
        const permissions = await applyPermissions(prisma);
        context.report?.({ stage: "executing", message: "Applying roles and grants", percent: 55 });
        const roles = await applyRoles(prisma);
        context.report?.({ stage: "executing", message: "Ensuring initial admin", percent: 80 });
        const admin = await applyInitialAdmin(prisma);
        context.report?.({ stage: "verifying", message: "Re-inspecting", percent: 90 });
        const verified = await snapshot(prisma);
        return { permissions, roles, admin, verified };
      });

      const perEntity: SeedPlanChange[] = ([
        { seedKey: KEY_PERMISSIONS, entity: "Permissions", action: "insert", count: outcome.permissions.inserted },
        { seedKey: KEY_PERMISSIONS, entity: "Permissions", action: "update", count: outcome.permissions.updated },
        { seedKey: KEY_ROLES, entity: "System roles", action: "insert", count: outcome.roles.inserted },
        { seedKey: KEY_ROLES, entity: "System roles", action: "update", count: outcome.roles.updated },
        { seedKey: KEY_ROLE_PERMISSIONS, entity: "Role permissions", action: "insert", count: outcome.roles.grantsInserted },
        { seedKey: KEY_ADMIN_USER, entity: "Initial admin", action: "insert", count: outcome.admin.inserted },
      ] as SeedPlanChange[]).filter((change) => change.count > 0);

      const issues: SeedIssue[] = outcome.admin.skipped
        ? [
            {
              code: "ADMIN_SEED_SKIPPED",
              severity: "info",
              seedKey: KEY_ADMIN_USER,
              message:
                "SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD are not set on the server, so no initial admin was created.",
            },
          ]
        : [];

      const inserted = perEntity
        .filter((c) => c.action === "insert")
        .reduce((total, c) => total + c.count, 0);
      const updated = perEntity
        .filter((c) => c.action === "update")
        .reduce((total, c) => total + c.count, 0);

      return {
        ok: true,
        partial: false,
        inserted,
        updated,
        deleted: 0,
        retained: 0,
        perEntity,
        issues,
        verifiedStatus: {
          health:
            outcome.verified.missingCount > 0
              ? "missing"
              : outcome.verified.driftedCount > 0
                ? "drifted"
                : "clean",
          definitionVersion: FOUNDATION_DEFINITION_VERSION,
          definitionChecksum: DEFINITION_CHECKSUM,
          connection: "ok",
          seedOwnedCount: outcome.verified.seedOwnedCount,
          missingCount: outcome.verified.missingCount,
          driftedCount: outcome.verified.driftedCount,
          orphanedCount: 0,
          entities: outcome.verified.entities,
          issues: [],
          checkedAt: new Date().toISOString(),
          durationMs: 0,
        },
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const { code, message } = sanitizeError(error);
      return {
        ok: false,
        partial: false,
        inserted: 0,
        updated: 0,
        deleted: 0,
        retained: 0,
        perEntity: [],
        issues: [{ code, severity: "error", message }],
        durationMs: Date.now() - startedAt,
      };
    }
  },
};

// ─── Shared helpers used by the other Prisma-backed providers ────────────

export function buildPlan(input: {
  providerId: string;
  environment: SeedPlan["environment"];
  operation: SeedPlan["operation"];
  changes: SeedPlanChange[];
  blocked: SeedIssue[];
  warnings: SeedIssue[];
  createdAt: number;
  definitionVersion?: string;
  definitionChecksum?: string;
}): SeedPlan {
  const version = input.definitionVersion ?? FOUNDATION_DEFINITION_VERSION;
  const checksumOfDefinitions = input.definitionChecksum ?? DEFINITION_CHECKSUM;

  const sum = (action: SeedPlanChange["action"]) =>
    input.changes
      .filter((change) => change.action === action)
      .reduce((total, change) => total + change.count, 0);

  return {
    providerId: input.providerId,
    environment: input.environment,
    operation: input.operation,
    planId: `${input.providerId}:${input.environment}:${input.operation}:${input.createdAt}`,
    checksum: planChecksum({
      providerId: input.providerId,
      environment: input.environment,
      operation: input.operation,
      definitionChecksum: checksumOfDefinitions,
      changes: input.changes,
    }),
    definitionVersion: version,
    definitionChecksum: checksumOfDefinitions,
    changes: input.changes,
    inserts: sum("insert"),
    updates: sum("update"),
    deletes: sum("delete"),
    retained: sum("retain"),
    blocked: input.blocked,
    warnings: input.warnings,
    createdAt: new Date(input.createdAt).toISOString(),
    expiresAt: new Date(input.createdAt + PLAN_TTL_MS).toISOString(),
  };
}

export function unavailableStatus(
  code: string,
  message: string,
  startedAt: number,
  definition: { version: string; checksum: string } = {
    version: FOUNDATION_DEFINITION_VERSION,
    checksum: DEFINITION_CHECKSUM,
  }
): SeedStatus {
  return {
    health: "unavailable",
    definitionVersion: definition.version,
    definitionChecksum: definition.checksum,
    connection: "unreachable",
    seedOwnedCount: 0,
    missingCount: 0,
    driftedCount: 0,
    orphanedCount: 0,
    entities: [],
    issues: [{ code, severity: "error", message }],
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  };
}

export { DEFINITION_CHECKSUM as FOUNDATION_DEFINITION_CHECKSUM };
