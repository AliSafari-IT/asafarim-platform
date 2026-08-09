// Testora provider — read-only for now.
//
// Testora's seed definitions are its code catalog under
// `apps/testora/src/data/**`, which this package must not import (Admin never
// reaches into `apps/*`). Until that catalog is extracted into a workspace
// package, this provider reports status and validates connectivity/provenance
// but does not offer seed, reconcile or remove — `supports` says so, and
// safety.ts refuses those operations structurally rather than pretending.
//
// The `pnpm --filter @asafarim/testora db:seed` CLI and the in-app "Update
// tests" button are unchanged and remain the way to seed Testora.

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

const PROVIDER_ID = "testora";
export const TESTORA_DEFINITION_VERSION = "0.1.0-read-only";

/**
 * Provenance only — the definitions themselves live in the app, so the
 * checksum covers what this provider actually knows about.
 */
const DEFINITION_CHECKSUM = definitionChecksum({
  version: TESTORA_DEFINITION_VERSION,
  provenance: ["projects.seeded", "target_environments.seeded"],
});
const DEFINITION = { version: TESTORA_DEFINITION_VERSION, checksum: DEFINITION_CHECKSUM };

const KEY_PROJECTS = "testora.projects";
const KEY_TARGETS = "testora.target-environments";
const KEY_CATALOG = "testora.catalog";

const REQUIRED_TABLES = [
  "projects",
  "target_environments",
  "functional_requirements",
  "test_suites",
  "test_fixtures",
  "test_cases",
];

async function snapshot(sql: SqlRunner): Promise<{
  entities: SeedEntityCounts[];
  issues: SeedIssue[];
  seedOwnedCount: number;
}> {
  const issues: SeedIssue[] = [];
  for (const table of REQUIRED_TABLES) {
    if (!(await tableExists(sql, table))) {
      issues.push({
        code: "SCHEMA_MISMATCH",
        severity: "error",
        message: `Testora table "${table}" is missing — run its Drizzle migrations.`,
      });
    }
  }
  if (issues.length > 0) return { entities: [], issues, seedOwnedCount: 0 };

  const [seededProjects, userProjects, seededTargets, userTargets, requirements, suites, fixtures, cases] =
    await Promise.all([
      countWhere(sql, "SELECT count(*) AS count FROM projects WHERE seeded = true"),
      countWhere(sql, "SELECT count(*) AS count FROM projects WHERE seeded = false"),
      countWhere(sql, "SELECT count(*) AS count FROM target_environments WHERE seeded = true"),
      countWhere(sql, "SELECT count(*) AS count FROM target_environments WHERE seeded = false"),
      countWhere(sql, "SELECT count(*) AS count FROM functional_requirements"),
      countWhere(sql, "SELECT count(*) AS count FROM test_suites"),
      countWhere(sql, "SELECT count(*) AS count FROM test_fixtures"),
      countWhere(sql, "SELECT count(*) AS count FROM test_cases"),
    ]);

  const entities: SeedEntityCounts[] = [
    { entity: "Seeded projects", seedKey: KEY_PROJECTS, present: seededProjects, missing: 0, drifted: 0, orphaned: 0 },
    { entity: "Seeded target environments", seedKey: KEY_TARGETS, present: seededTargets, missing: 0, drifted: 0, orphaned: 0 },
    {
      entity: "Catalog rows (requirements / suites / fixtures / cases)",
      seedKey: KEY_CATALOG,
      present: requirements + suites + fixtures + cases,
      missing: 0,
      drifted: 0,
      orphaned: 0,
    },
  ];

  issues.push({
    code: "USER_OWNED_ROWS",
    severity: "info",
    message: `${userProjects} user-created project(s) and ${userTargets} user-added target environment(s) are present and are never touched by this provider.`,
  });

  // Missing/drift cannot be computed without the code catalog, so this
  // provider reports what it can rather than guessing at zero.
  issues.push({
    code: "READ_ONLY_PROVIDER",
    severity: "info",
    message:
      "Drift against the code catalog is not computed here — Testora's seed definitions still live inside the app. Counts are provenance-based.",
  });

  return {
    entities,
    issues,
    seedOwnedCount: entities.reduce((total, e) => total + e.present, 0),
  };
}

export const testoraProvider: SeedProvider = {
  id: PROVIDER_ID,
  appId: "testora",
  displayName: "Testora",
  description:
    "Testora's own Postgres instance. Status is reported from the explicit `seeded` provenance columns; seeding still runs through Testora's own CLI and “Update tests” button.",
  databaseKind: "testora-drizzle",
  availability: "configured",
  protected: false,
  definitionVersion: TESTORA_DEFINITION_VERSION,
  requiredEnv: requiredEnvVars("testora-drizzle"),
  supports: {
    validate: true,
    status: true,
    // Pending extraction of apps/testora/src/data/** into a workspace package.
    seed: false,
    reconcile: false,
    remove: false,
  },
  externalLink: {
    label: "Open Testora",
    href: "https://testora.asafarim.com",
    note: 'Seed and reconcile from Testora\'s own "Update tests" action until its catalog is extracted into a shared package.',
  },
  manifest: [
    {
      seedKey: KEY_PROJECTS,
      entity: "projects",
      identity: "provenance-column",
      ownership: "seed-owned",
      reconcilable: false,
      removable: false,
      userControlledFields: ["visibility", "keyHash"],
      notes:
        "`seeded = true` marks code-defined apps. Visibility and the unlock key hash are user-controlled and survive re-seeding.",
    },
    {
      seedKey: KEY_TARGETS,
      entity: "target_environments",
      identity: "provenance-column",
      ownership: "seed-owned",
      dependsOn: [KEY_PROJECTS],
      reconcilable: false,
      removable: false,
      notes: "`seeded = true` built-ins are reconciled from code; user-added targets are never touched.",
    },
    {
      seedKey: KEY_CATALOG,
      entity: "functional_requirements / test_suites / test_fixtures / test_cases",
      identity: "id",
      ownership: "seed-owned",
      dependsOn: [KEY_PROJECTS],
      reconcilable: false,
      removable: false,
      notes:
        "Code-defined catalog ids. Centralised reconcile/remove is deliberately withheld until the catalog is importable without reaching into apps/testora.",
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
              message: `Testora table "${table}" is missing — run its Drizzle migrations.`,
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
      definitionVersion: TESTORA_DEFINITION_VERSION,
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
        health: failed ? "validation-failed" : snap.seedOwnedCount > 0 ? "clean" : "missing",
        definitionVersion: TESTORA_DEFINITION_VERSION,
        definitionChecksum: DEFINITION_CHECKSUM,
        connection: "ok",
        seedOwnedCount: snap.seedOwnedCount,
        missingCount: 0,
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
      "Testora does not support centralised mutations yet — seed it from its own CLI or “Update tests” action."
    );
  },

  async execute(): Promise<SeedResult> {
    throw new Error(
      "Testora does not support centralised mutations yet — seed it from its own CLI or “Update tests” action."
    );
  },
};
