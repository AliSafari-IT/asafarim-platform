#!/usr/bin/env -S node
/**
 * M12 AppBuilder restore rehearsal script.
 *
 * Restores the most recent successful database backup into a SEPARATE,
 * explicitly non-production database and verifies row counts across the
 * tables that matter most for recovery (app metadata, specifications,
 * generated data, release manifests) — this is the concrete evidence
 * behind the M12 acceptance criterion "restore from backup is rehearsed in
 * a non-production environment and evidence is recorded."
 *
 * SAFETY: this script refuses to run if the resolved rehearsal target
 * connection string is identical to APPBUILDER_DATABASE_URL, or if their
 * database names match — it must never restore over the real database.
 *
 * Usage: `pnpm --filter appbuilder backup:restore-rehearsal` (see
 * package.json). See docs/appbuilder-m12-backup-restore-runbook.md for the
 * full recovery runbook this script is one step of.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { getObjectBytes } from "@asafarim/storage";
import { getDb, closeDb } from "../db/client";
import {
  completeRestoreRehearsal,
  failRestoreRehearsal,
  getLatestBackupRun,
  startRestoreRehearsal,
} from "./repository";
import {
  assertNotProduction,
  resolveSourceUrl,
  resolveTargetUrl,
} from "./safety";

const execFileAsync = promisify(execFile);

/** Tables whose restored row counts constitute the rehearsal's evidence — spans metadata, specs, generated data, and release manifests per the issue's explicit recovery-scope list. */
const VERIFICATION_TABLES = [
  "apps",
  "specifications",
  "specification_versions",
  "collaborators",
  "releases",
  "app_domains",
  "deployments",
  "generated_records",
  "generated_files",
  "validation_runs",
  "audit_events",
] as const;

async function recreateTargetDatabase(targetUrl: string): Promise<void> {
  const parsed = new URL(targetUrl);
  const dbName = parsed.pathname.replace(/^\//, "");
  const maintenanceUrl = new URL(targetUrl);
  maintenanceUrl.pathname = "/postgres";

  const client = new Client({ connectionString: maintenanceUrl.toString() });
  await client.connect();
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName]
    );
    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    await client.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await client.end();
  }
}

async function countRows(targetUrl: string): Promise<Record<string, number>> {
  const client = new Client({ connectionString: targetUrl });
  await client.connect();
  const counts: Record<string, number> = {};
  try {
    for (const table of VERIFICATION_TABLES) {
      try {
        const result = await client.query(
          `SELECT count(*)::int AS count FROM "${table}"`
        );
        counts[table] = result.rows[0].count;
      } catch {
        // A table that doesn't exist in the restored snapshot (e.g. an
        // older backup predating a later migration) is recorded as -1
        // rather than silently omitted, so the discrepancy is visible in
        // the rehearsal's evidence rather than swept under the rug.
        counts[table] = -1;
      }
    }
  } finally {
    await client.end();
  }
  return counts;
}

async function main(): Promise<void> {
  const sourceUrl = resolveSourceUrl();
  const targetUrl = resolveTargetUrl(sourceUrl);
  assertNotProduction(sourceUrl, targetUrl);

  const db = getDb();
  const latestBackup = await getLatestBackupRun(db, "database");
  if (!latestBackup || latestBackup.status !== "succeeded") {
    console.error(
      "[restore-rehearsal] No succeeded database backup found to rehearse against. Run `pnpm --filter appbuilder backup:run` first."
    );
    process.exitCode = 1;
    await closeDb();
    return;
  }

  const rehearsal = await startRestoreRehearsal(db, {
    backupRunId: latestBackup.id,
    targetDescription: `scratch database at ${new URL(targetUrl).pathname.replace(/^\//, "")} (non-production)`,
  });
  console.log(
    `[restore-rehearsal] started ${rehearsal.id} against backup ${latestBackup.id} (${latestBackup.location})`
  );

  const tmpFile = join(
    tmpdir(),
    `appbuilder-restore-rehearsal-${rehearsal.id}.dump`
  );

  try {
    const object = await getObjectBytes(latestBackup.location);
    if (!object)
      throw new Error(
        `Backup artifact not found in storage: ${latestBackup.location}`
      );
    await writeFile(tmpFile, object.body);

    await recreateTargetDatabase(targetUrl);
    await execFileAsync("pg_restore", [
      "--no-owner",
      "--no-acl",
      "--dbname",
      targetUrl,
      tmpFile,
    ]);

    const verifiedCounts = await countRows(targetUrl);
    const missingOrEmpty = Object.entries(verifiedCounts).filter(
      ([, count]) => count <= 0
    );

    const completed = await completeRestoreRehearsal(db, rehearsal.id, {
      verifiedCounts,
      findings: {
        backupRunId: latestBackup.id,
        backupLocation: latestBackup.location,
        tablesVerified: VERIFICATION_TABLES.length,
        tablesMissingOrEmpty: missingOrEmpty.map(([table]) => table),
      },
    });

    console.log(`[restore-rehearsal] succeeded: ${completed.id}`);
    console.log(
      `[restore-rehearsal] verified counts: ${JSON.stringify(verifiedCounts, null, 2)}`
    );
    if (missingOrEmpty.length > 0) {
      console.warn(
        `[restore-rehearsal] NOTE: ${missingOrEmpty.length} table(s) restored empty or missing — expected if the source database had no rows there: ${missingOrEmpty.map(([t]) => t).join(", ")}`
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failRestoreRehearsal(db, rehearsal.id, message.slice(0, 2000));
    console.error(`[restore-rehearsal] FAILED: ${message}`);
    process.exitCode = 1;
  } finally {
    await unlink(tmpFile).catch(() => undefined);
    await closeDb();
  }
}

main();
