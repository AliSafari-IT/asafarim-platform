// AppBuilder platform-fixtures provider — read-only for now.
//
// Scope is deliberately narrow: the local-development fixtures from
// `apps/appbuilder/lib/db/seedDatabase.ts` (two seed owners, four apps).
// AppBuilder's *per-generated-app* runtime demo-data reset is a different
// mechanism entirely and is explicitly NOT centralised here — it is never
// touched by "Seed all" or "Remove all seeded data". See the external link
// below for where that lives.
//
// Seeding runs through AppBuilder's repository layer, which this package must
// not import (Admin never reaches into `apps/*`). Until that is extracted,
// this provider reports status only.

import { definitionChecksum } from "../checksums";
import type {
  SeedEntityCounts,
  SeedIssue,
  SeedPlan,
  SeedProvider,
  SeedResult,
  SeedStatus,
  ValidationResult,
} from "../contracts";
import { requiredEnvVars } from "../environments";
import { sanitizeError } from "../redaction";
import { countWhere, tableExists, withSql, type SqlRunner } from "../sql";
import { unavailableStatus } from "./platform-foundation";

const PROVIDER_ID = "appbuilder";
export const APPBUILDER_DEFINITION_VERSION = "0.1.0-read-only";

/** Deterministic owner principals the fixture seed creates apps under. */
export const APPBUILDER_SEED_OWNERS = ["seed-owner-a", "seed-owner-b"];
/** Deterministic idempotency keys the fixture seed writes. */
export const APPBUILDER_SEED_IDEMPOTENCY_KEYS = [
  "seed-app-a1",
  "seed-app-a2",
  "seed-app-b1",
  "seed-app-b2",
  "seed-app-a1-op1",
];

const DEFINITION_CHECKSUM = definitionChecksum({
  version: APPBUILDER_DEFINITION_VERSION,
  owners: APPBUILDER_SEED_OWNERS,
  idempotencyKeys: APPBUILDER_SEED_IDEMPOTENCY_KEYS,
});
const DEFINITION = { version: APPBUILDER_DEFINITION_VERSION, checksum: DEFINITION_CHECKSUM };

const KEY_APPS = "appbuilder.fixture-apps";
const KEY_COLLABORATORS = "appbuilder.fixture-collaborators";
const KEY_OPERATIONS = "appbuilder.fixture-operations";

const REQUIRED_TABLES = ["apps", "collaborators", "applied_operations", "idempotency_keys"];

const EXPECTED_APPS = 4;

async function snapshot(sql: SqlRunner): Promise<{
  entities: SeedEntityCounts[];
  issues: SeedIssue[];
  seedOwnedCount: number;
  missingCount: number;
}> {
  const issues: SeedIssue[] = [];
  for (const table of REQUIRED_TABLES) {
    if (!(await tableExists(sql, table))) {
      issues.push({
        code: "SCHEMA_MISMATCH",
        severity: "error",
        message: `AppBuilder table "${table}" is missing — run its Drizzle migrations.`,
      });
    }
  }
  if (issues.length > 0) {
    return { entities: [], issues, seedOwnedCount: 0, missingCount: 0 };
  }

  const [fixtureApps, tenantApps, collaborators, operations] = await Promise.all([
    countWhere(sql, "SELECT count(*) AS count FROM apps WHERE owner_principal_id = ANY($1)", [
      APPBUILDER_SEED_OWNERS,
    ]),
    countWhere(sql, "SELECT count(*) AS count FROM apps WHERE NOT (owner_principal_id = ANY($1))", [
      APPBUILDER_SEED_OWNERS,
    ]),
    countWhere(
      sql,
      "SELECT count(*) AS count FROM collaborators c JOIN apps a ON a.id = c.app_id WHERE a.owner_principal_id = ANY($1)",
      [APPBUILDER_SEED_OWNERS]
    ),
    countWhere(
      sql,
      "SELECT count(*) AS count FROM applied_operations o JOIN apps a ON a.id = o.app_id WHERE a.owner_principal_id = ANY($1)",
      [APPBUILDER_SEED_OWNERS]
    ),
  ]);

  const entities: SeedEntityCounts[] = [
    {
      entity: "Fixture apps",
      seedKey: KEY_APPS,
      present: fixtureApps,
      missing: Math.max(0, EXPECTED_APPS - fixtureApps),
      drifted: 0,
      orphaned: 0,
    },
    { entity: "Fixture collaborators", seedKey: KEY_COLLABORATORS, present: collaborators, missing: 0, drifted: 0, orphaned: 0 },
    { entity: "Fixture operations", seedKey: KEY_OPERATIONS, present: operations, missing: 0, drifted: 0, orphaned: 0 },
  ];

  issues.push({
    code: "TENANT_DATA_EXCLUDED",
    severity: "info",
    message: `${tenantApps} generated app(s) belong to real owners. They are outside this provider's scope and are never included in bulk actions.`,
  });
  issues.push({
    code: "READ_ONLY_PROVIDER",
    severity: "info",
    message:
      "Seeding runs through AppBuilder's own repository layer, so centralised mutations are not offered here yet.",
  });

  return {
    entities,
    issues,
    seedOwnedCount: entities.reduce((total, e) => total + e.present, 0),
    missingCount: entities.reduce((total, e) => total + e.missing, 0),
  };
}

export const appbuilderProvider: SeedProvider = {
  id: PROVIDER_ID,
  appId: "appbuilder",
  displayName: "AppBuilder platform fixtures",
  description:
    "Local-development fixtures (two seed owners, four apps) on AppBuilder's own Postgres instance. Generated-app tenant data is out of scope and never included in bulk actions.",
  databaseKind: "appbuilder-drizzle",
  availability: "configured",
  protected: false,
  definitionVersion: APPBUILDER_DEFINITION_VERSION,
  requiredEnv: requiredEnvVars("appbuilder-drizzle"),
  supports: {
    validate: true,
    status: true,
    // Pending extraction of AppBuilder's repository layer into a package.
    seed: false,
    reconcile: false,
    remove: false,
  },
  externalLink: {
    label: "AppBuilder app management",
    href: "https://appbuilder.asafarim.com",
    note: "Per-generated-app demo-data resets stay on each app's own management surface — they are deliberately not centralised here.",
  },
  manifest: [
    {
      seedKey: KEY_APPS,
      entity: "apps",
      identity: "unique-key",
      ownership: "seed-owned",
      reconcilable: false,
      removable: false,
      notes: `Recognised by owner_principal_id ∈ {${APPBUILDER_SEED_OWNERS.join(", ")}}. Real owners' apps are never matched.`,
    },
    {
      seedKey: KEY_COLLABORATORS,
      entity: "collaborators",
      identity: "unique-key",
      ownership: "seed-owned",
      dependsOn: [KEY_APPS],
      reconcilable: false,
      removable: false,
    },
    {
      seedKey: KEY_OPERATIONS,
      entity: "applied_operations",
      identity: "unique-key",
      ownership: "seed-owned",
      dependsOn: [KEY_APPS],
      reconcilable: false,
      removable: false,
      notes: `Written under deterministic idempotency keys (${APPBUILDER_SEED_IDEMPOTENCY_KEYS.join(", ")}).`,
    },
  ],

  async validate(context): Promise<ValidationResult> {
    const startedAt = Date.now();
    const issues: SeedIssue[] = [];
    let connection: ValidationResult["connection"] = "ok";
    try {
      await withSql(context.connectionString, context.timeoutMs, async (sql) => {
        for (const table of REQUIRED_TABLES) {
          if (!(await tableExists(sql, table))) {
            issues.push({
              code: "SCHEMA_MISMATCH",
              severity: "error",
              message: `AppBuilder table "${table}" is missing — run its Drizzle migrations.`,
            });
          }
        }
      });
    } catch (error) {
      connection = "unreachable";
      const { code, message } = sanitizeError(error);
      issues.push({ code, severity: "error", message });
    }
    return {
      ok: connection === "ok" && !issues.some((i) => i.severity === "error"),
      definitionVersion: APPBUILDER_DEFINITION_VERSION,
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
      const snap = await withSql(context.connectionString, context.timeoutMs, snapshot);
      const failed = snap.issues.some((i) => i.severity === "error");
      return {
        health: failed ? "validation-failed" : snap.missingCount > 0 ? "missing" : "clean",
        definitionVersion: APPBUILDER_DEFINITION_VERSION,
        definitionChecksum: DEFINITION_CHECKSUM,
        connection: "ok",
        seedOwnedCount: snap.seedOwnedCount,
        missingCount: snap.missingCount,
        driftedCount: 0,
        orphanedCount: 0,
        entities: snap.entities,
        issues: snap.issues,
        checkedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const { code, message } = sanitizeError(error);
      return unavailableStatus(code, message, startedAt, DEFINITION);
    }
  },

  async plan(): Promise<SeedPlan> {
    throw new Error(
      "AppBuilder does not support centralised mutations yet — use its own seed CLI."
    );
  },

  async execute(): Promise<SeedResult> {
    throw new Error(
      "AppBuilder does not support centralised mutations yet — use its own seed CLI."
    );
  },
};
