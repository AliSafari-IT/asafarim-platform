#!/usr/bin/env -S node
/**
 * M12 AppBuilder database backup script.
 *
 * Runs `pg_dump` (custom format, compressed) against APPBUILDER_DATABASE_URL,
 * uploads the resulting artifact through `@asafarim/storage` (S3-compatible;
 * falls back to local-directory storage in dev — see @asafarim/storage's own
 * docstring), and records the outcome as a durable `backup_runs` row so the
 * readiness UI and dashboards.md have real evidence of backup freshness.
 *
 * Usage: `pnpm --filter appbuilder backup:run` (see package.json).
 * Cadence/retention/encryption expectations are documented in
 * docs/appbuilder-m12-backup-restore-runbook.md — this script performs a
 * single on-demand run; production scheduling (cron/CI) is an operational
 * concern outside this repository, described in that same doc.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { putObjectBytes } from "@asafarim/storage";
import { getDb, closeDb } from "../db/client";
import { completeBackupRun, failBackupRun, startBackupRun } from "./repository";

const execFileAsync = promisify(execFile);

const RETENTION_DAYS = 30;

function resolveDatabaseUrl(): string {
  const url =
    process.env.APPBUILDER_DATABASE_URL ??
    "postgres://appbuilder:appbuilder_dev@localhost:55436/appbuilder";
  return url;
}

async function main(): Promise<void> {
  const databaseUrl = resolveDatabaseUrl();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const tmpFile = join(tmpdir(), `appbuilder-backup-${timestamp}.dump`);
  const storageKey = `backups/database/appbuilder-${timestamp}.dump`;
  const trigger = process.argv.includes("--scheduled") ? "scheduled" : "manual";

  const db = getDb();
  const run = await startBackupRun(db, {
    kind: "database",
    trigger,
    location: storageKey,
  });
  console.log(`[backup] started run ${run.id} -> ${storageKey}`);

  try {
    // Custom format (-Fc): compressed, restorable with pg_restore, safe to
    // treat as an opaque binary artifact.
    await execFileAsync("pg_dump", [
      "--format=custom",
      "--file",
      tmpFile,
      databaseUrl,
    ]);

    const bytes = await readFile(tmpFile);
    const checksum = createHash("sha256").update(bytes).digest("hex");

    await putObjectBytes(storageKey, bytes, "application/octet-stream", {
      acl: "private",
    });

    const completed = await completeBackupRun(db, run.id, {
      sizeBytes: bytes.length,
      checksum,
      retentionDays: RETENTION_DAYS,
      metadata: { pgDumpFormat: "custom", retentionDays: RETENTION_DAYS },
    });

    console.log(
      `[backup] succeeded: ${completed.id} (${bytes.length} bytes, sha256 ${checksum.slice(0, 16)}...)`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failBackupRun(db, run.id, message.slice(0, 2000));
    console.error(`[backup] FAILED: ${message}`);
    process.exitCode = 1;
  } finally {
    await unlink(tmpFile).catch(() => undefined);
    await closeDb();
  }
}

main();
